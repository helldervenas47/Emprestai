// jspdf / jspdf-autotable são carregados sob demanda dentro da função abaixo.
import { computeScenario, formatBRL } from "@/features/loans/lib/loanSimulation";
import type { LoanSimulation } from "@/types/loanSimulation";
import { getPdfBranding } from "@/lib/pdfBranding";

const fmtDateBR = (iso?: string | null) => {
  if (!iso) return "-";
  const s = String(iso).split("T")[0];
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
};

interface Args {
  simulation: LoanSimulation;
  clientName?: string | null;
  clientPhone?: string | null;
  /** "save" baixa o arquivo, "blob" retorna { blob, fileName } sem baixar. Padrão: "save". */
  output?: "save" | "blob";
}

export async function generateSimulationPdf({ simulation, clientName, clientPhone, output = "save" }: Args): Promise<{ blob: Blob; fileName: string } | void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const branding = await getPdfBranding();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = 15;

  // Header
  if (branding?.logoDataUrl) {
    try {
      doc.addImage(branding.logoDataUrl, "PNG", 14, y, 20, 20);
    } catch {}
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(branding?.brandName || "Simulação de Empréstimo", branding?.logoDataUrl ? 38 : 14, y + 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Data: ${fmtDateBR(simulation.simulationDate)}`, branding?.logoDataUrl ? 38 : 14, y + 15);
  y += 28;

  // Client block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Dados do Cliente", 14, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Cliente: ${clientName || "Não informado"}`, 14, y);
  if (clientPhone) {
    y += 5;
    doc.text(`Telefone: ${clientPhone}`, 14, y);
  }
  if (simulation.name) {
    y += 5;
    doc.text(`Simulação: ${simulation.name}`, 14, y);
  }
  y += 8;

  // Scenarios summary table (todos os cenários)
  const scenarios = simulation.scenarios.map(computeScenario);
  const chosen = scenarios.find((s) => s.id === simulation.chosenScenarioId);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Cenários Simulados (${scenarios.length})`, 14, y);
  y += 3;

  autoTable(doc, {
    startY: y + 2,
    head: [["#", "Sistema", "Valor", "Taxa/mês", "Parcelas", "Parcela", "Juros total", "Total"]],
    body: scenarios.map((s, i) => [
      String(i + 1) + (s.id === simulation.chosenScenarioId ? " ★" : ""),
      s.interestModel === "simple" ? "Simples" : "Price",
      formatBRL(s.amount),
      `${s.monthlyRate.toFixed(2)}%`,
      String(s.installments),
      formatBRL(s.installmentValue),
      formatBRL(s.totalInterest),
      formatBRL(s.totalPayable),
    ]),
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    didParseCell: (data) => {
      if (data.section === "body" && scenarios[data.row.index]?.id === simulation.chosenScenarioId) {
        data.cell.styles.fillColor = [220, 252, 231];
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Detalhamento individual de cada cenário
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  if (y > pageH - 60) { doc.addPage(); y = 15; }
  doc.text("Detalhamento dos Cenários", 14, y);
  y += 5;

  scenarios.forEach((s, i) => {
    if (y > pageH - 55) { doc.addPage(); y = 15; }
    const isChosen = s.id === simulation.chosenScenarioId;

    // Header bar
    doc.setFillColor(isChosen ? 34 : 240, isChosen ? 197 : 240, isChosen ? 94 : 245);
    doc.rect(14, y, pageW - 28, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(isChosen ? 255 : 30, isChosen ? 255 : 30, isChosen ? 255 : 30);
    doc.text(
      `Cenário ${i + 1}${isChosen ? "  ★ ESCOLHIDO PELO CLIENTE" : ""}`,
      17,
      y + 5,
    );
    doc.setTextColor(0, 0, 0);
    y += 9;

    autoTable(doc, {
      startY: y,
      body: [
        ["Valor emprestado", formatBRL(s.amount), "Taxa mensal", `${s.monthlyRate.toFixed(2)}%`],
        ["Parcelas", String(s.installments), "Valor da parcela", formatBRL(s.installmentValue)],
        ["Sistema de juros", s.interestModel === "simple" ? "Simples" : "Composto (Price)", "Juros mensal", formatBRL(s.monthlyInterestValue)],
        ["Total de juros", formatBRL(s.totalInterest), "Total a pagar", formatBRL(s.totalPayable)],
      ],
      theme: "grid",
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 38, fontStyle: "bold", fillColor: [248, 250, 252] },
        1: { cellWidth: 50 },
        2: { cellWidth: 38, fontStyle: "bold", fillColor: [248, 250, 252] },
        3: { cellWidth: 50 },
      },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  });

  // Resumo do escolhido (se houver)
  if (chosen) {
    if (y > pageH - 60) { doc.addPage(); y = 15; }
    doc.setFillColor(220, 252, 231);
    doc.rect(14, y, pageW - 28, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(22, 101, 52);
    doc.text("Cenário escolhido pelo cliente — resumo final", 17, y + 5);
    doc.setTextColor(0, 0, 0);
    y += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(
      `${chosen.installments}x de ${formatBRL(chosen.installmentValue)} — Total: ${formatBRL(chosen.totalPayable)}`,
      14,
      y,
    );
    y += 8;
  }

  if (simulation.notes) {
    if (y > pageH - 40) {
      doc.addPage();
      y = 15;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Observações", 14, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    const notes = doc.splitTextToSize(simulation.notes, pageW - 28);
    doc.text(notes, 14, y);
    y += notes.length * 5 + 5;
  }

  // Signature area
  if (y > pageH - 40) {
    doc.addPage();
    y = 15;
  }
  y = Math.max(y + 20, pageH - 40);
  doc.setDrawColor(150);
  doc.line(20, y, 90, y);
  doc.line(pageW - 90, y, pageW - 20, y);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Cliente", 45, y + 5);
  doc.text(branding?.brandName || "Responsável", pageW - 70, y + 5);

  const fileName = `simulacao-${(clientName || "cliente").replace(/\s+/g, "_")}-${fmtDateBR(simulation.simulationDate).split("/").join("-")}.pdf`;
  if (output === "blob") {
    const blob = doc.output("blob");
    return { blob, fileName };
  }
  doc.save(fileName);
}
