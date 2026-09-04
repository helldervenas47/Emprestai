import type { MonthlyClosingData } from "./types";
import { getPdfBranding } from "@/lib/pdfBranding";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

export async function exportMonthlyClosingPdf(data: MonthlyClosingData): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const branding = await getPdfBranding();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // 1. Cabeçalho / Logo
  if (branding.logoDataUrl) {
    const sizeMm = Math.max(12, Math.min(30, branding.logoSize * 0.2645));
    try {
      doc.addImage(branding.logoDataUrl, "PNG", pageW - sizeMm - 14, 10, sizeMm, sizeMm, undefined, "FAST");
    } catch {
      /* ignore */
    }
  }

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  if (branding.brandName) doc.text(branding.brandName, 14, 13);

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 30, 50);
  doc.text(`Fechamento Mensal — ${data.monthLabel}`, 14, 21);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(
    `Gerado em: ${new Date().toLocaleString("pt-BR")} | Última atualização: ${data.lastUpdatedAt}`,
    14,
    27
  );

  // 2. Resumo Financeiro & Comparativo
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("1. Resumo Executivo & Comparação Mensal", 14, 36);

  const comp = data.comparison;
  const fin = data.financial;

  const fmtPctDiff = (item: any) => {
    if (item.ppDiff !== undefined) {
      const sign = item.ppDiff > 0 ? "+" : "";
      return `${sign}${item.ppDiff.toFixed(1).replace(".", ",")} p.p.`;
    }
    const sign = item.pctDiff > 0 ? "+" : "";
    return `${sign}${item.pctDiff.toFixed(1).replace(".", ",")}%`;
  };

  const summaryBody = [
    [
      "Faturamento (Novos Empréstimos)",
      fmtBRL(fin.revenue),
      fmtBRL(comp.revenue.previous),
      fmtPctDiff(comp.revenue),
    ],
    [
      "Recebimentos Totais",
      fmtBRL(fin.received),
      fmtBRL(comp.received.previous),
      fmtPctDiff(comp.received),
    ],
    [
      "Despesas Operacionais",
      fmtBRL(fin.expenses),
      fmtBRL(comp.expenses.previous),
      fmtPctDiff(comp.expenses),
    ],
    [
      "Resultado do Período",
      fmtBRL(fin.result),
      fmtBRL(comp.result.previous),
      fmtPctDiff(comp.result),
    ],
    [
      "Capital Ativo em Carteira",
      fmtBRL(fin.activeCapital),
      fmtBRL(comp.activeCapital.previous),
      fmtPctDiff(comp.activeCapital),
    ],
    [
      "Taxa de Inadimplência",
      `${fin.defaultRate.toFixed(1).replace(".", ",")}%`,
      `${comp.defaultRate.previous.toFixed(1).replace(".", ",")}%`,
      fmtPctDiff(comp.defaultRate),
    ],
  ];

  autoTable(doc, {
    startY: 40,
    theme: "striped",
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    styles: { fontSize: 8.5, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 70, fontStyle: "bold" },
      1: { cellWidth: 38, halign: "right" },
      2: { cellWidth: 38, halign: "right" },
      3: { cellWidth: "auto", halign: "center", fontStyle: "bold" },
    },
    head: [["Indicador", `Realizado (${data.monthLabel})`, `Anterior (${data.previousMonthLabel})`, "Variação"]],
    body: summaryBody,
  });

  let nextY = (doc as any).lastAutoTable.finalY + 8;

  // 3. Metas do Mês
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("2. Desempenho das Metas", 14, nextY);

  if (data.goals.length === 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(120);
    doc.text("Nenhuma meta foi cadastrada para este período.", 14, nextY + 6);
    nextY += 12;
  } else {
    const goalsBody = data.goals.map((g) => {
      const statusText =
        g.status === "reached"
          ? "ATINGIDA"
          : g.status === "close"
          ? "PRÓXIMA"
          : "NÃO ATINGIDA";
      return [
        g.label,
        g.formattedTarget,
        g.formattedActual,
        `${g.achievementPct.toFixed(1).replace(".", ",")}%`,
        statusText,
        g.formattedDiff,
      ];
    });

    autoTable(doc, {
      startY: nextY + 3,
      theme: "grid",
      headStyles: {
        fillColor: [79, 70, 229],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8.5,
      },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 55, fontStyle: "bold" },
        1: { cellWidth: 28, halign: "right" },
        2: { cellWidth: 28, halign: "right" },
        3: { cellWidth: 24, halign: "center" },
        4: { cellWidth: 26, halign: "center", fontStyle: "bold" },
        5: { cellWidth: "auto", halign: "right" },
      },
      head: [["Meta", "Objetivo", "Realizado", "% Atingido", "Status", "Diferença"]],
      body: goalsBody,
      didParseCell: (hookData) => {
        if (hookData.section === "body" && hookData.column.index === 4) {
          const val = hookData.cell.raw;
          if (val === "ATINGIDA") hookData.cell.styles.textColor = [22, 101, 52];
          else if (val === "PRÓXIMA") hookData.cell.styles.textColor = [161, 98, 7];
          else if (val === "NÃO ATINGIDA") hookData.cell.styles.textColor = [185, 28, 28];
        }
      },
    });

    nextY = (doc as any).lastAutoTable.finalY + 8;
  }

  // Verifica se cabe na página atual ou necessita nova página
  if (nextY > pageH - 50) {
    doc.addPage();
    nextY = 20;
  }

  // 4. Destaques Positivos e Pontos de Atenção
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("3. Destaques Positivos & Pontos de Atenção", 14, nextY);
  nextY += 6;

  const posHighlights = data.executiveAnalysis.positiveHighlights;
  const attPoints = data.executiveAnalysis.attentionPoints;

  if (posHighlights.length > 0) {
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(22, 101, 52);
    doc.text("Destaques Positivos:", 14, nextY);
    nextY += 5;

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50);
    posHighlights.forEach((h) => {
      const bullet = `* ${h.title}: ${h.description}`;
      const lines = doc.splitTextToSize(bullet, pageW - 28);
      doc.text(lines, 16, nextY);
      nextY += lines.length * 4.2;
    });
    nextY += 3;
  }

  if (attPoints.length > 0) {
    if (nextY > pageH - 40) {
      doc.addPage();
      nextY = 20;
    }
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(185, 28, 28);
    doc.text("Pontos de Atenção:", 14, nextY);
    nextY += 5;

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50);
    attPoints.forEach((p) => {
      const bullet = `* ${p.title}: ${p.description}`;
      const lines = doc.splitTextToSize(bullet, pageW - 28);
      doc.text(lines, 16, nextY);
      nextY += lines.length * 4.2;
    });
    nextY += 3;
  }

  // 5. Análise Executiva e Recomendações
  if (nextY > pageH - 45) {
    doc.addPage();
    nextY = 20;
  }

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("4. Diagnóstico Executivo & Recomendação", 14, nextY);
  nextY += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(40);
  const headlineLines = doc.splitTextToSize(data.executiveAnalysis.headline, pageW - 28);
  doc.text(headlineLines, 14, nextY);
  nextY += headlineLines.length * 4.5;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(70);
  const narrativeLines = doc.splitTextToSize(data.executiveAnalysis.narrative, pageW - 28);
  doc.text(narrativeLines, 14, nextY);
  nextY += narrativeLines.length * 4.5 + 3;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(79, 70, 229);
  doc.text(`Recomendação: ${data.executiveAnalysis.recommendation.title}`, 14, nextY);
  nextY += 5;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(60);
  const recLines = doc.splitTextToSize(data.executiveAnalysis.recommendation.text, pageW - 28);
  doc.text(recLines, 14, nextY);

  // Rodapé em todas as páginas
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `EmprestAI — Fechamento Mensal ${data.monthKey} | Página ${i} de ${totalPages}`,
      pageW / 2,
      pageH - 8,
      { align: "center" }
    );
  }

  const safeFilename = `Fechamento_Mensal_${data.monthKey}.pdf`;
  doc.save(safeFilename);
}
