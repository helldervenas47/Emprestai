// jspdf / jspdf-autotable são carregados sob demanda dentro da função para
// evitar que fiquem no bundle inicial do app.
import { Loan, Payment, InstallmentSchedule, LoanRenegotiation } from "@/types/loan";
import { getLoanRemainingAmount } from "@/features/loans/hooks/useLoans";
import { getPdfBranding } from "@/lib/pdfBranding";

const fmtCurrency = (v: number) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDateBR = (iso?: string | null) => {
  if (!iso) return "-";
  const s = String(iso).split("T")[0];
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
};

const slug = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

interface Args {
  loan: Loan;
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  renegotiations: LoanRenegotiation[];
}

export async function generateLoanReportPdf({
  loan,
  payments,
  installmentSchedules,
  renegotiations,
}: Args): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const branding = await getPdfBranding();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  if (branding.logoDataUrl) {
    const sizeMm = Math.max(12, Math.min(40, branding.logoSize * 0.2645));
    try {
      doc.addImage(branding.logoDataUrl, "PNG", pageW - sizeMm - 14, 10, sizeMm, sizeMm, undefined, "FAST");
    } catch { /* ignore */ }
  }

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  if (branding.brandName) doc.text(branding.brandName, 14, 13);

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text("Relatório de Contrato", 14, 20);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 26);
  doc.setTextColor(0);

  const loanPayments = payments.filter((p) => p.loanId === loan.id);
  const totalPaid = loanPayments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
  const remaining = getLoanRemainingAmount(loan, payments);
  const totalContract = Math.round((totalPaid + remaining) * 100) / 100;
  const renegPenaltyTotal = Number(loan.renegotiationPenaltyTotal || 0);

  const statusLabel =
    loan.status === "paid" ? "Quitado" :
    loan.status === "overdue" ? "Em atraso" : "Ativo";

  autoTable(doc, {
    startY: 32,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: {
      0: { fontStyle: "bold", textColor: 90, cellWidth: 45 },
      1: { cellWidth: 50 },
      2: { fontStyle: "bold", textColor: 90, cellWidth: 45 },
      3: { cellWidth: "auto" },
    },
    body: [
      ["Tomador:", loan.borrowerName, "Status:", statusLabel],
      ["Tipo:", loan.paymentType, "Juros:", `${loan.interestRate}% (${loan.interestType})`],
      ["Data de saída:", fmtDateBR(loan.startDate), "1º vencimento:", fmtDateBR(loan.dueDate)],
      ["Parcelas:", `${loan.paidInstallments} / ${loan.installments}`, "Valor original:", fmtCurrency(loan.amount)],
    ],
  });

  let y = (doc as any).lastAutoTable.finalY + 6;

  doc.setDrawColor(220);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, y, pageW - 28, 26, 2, 2, "FD");

  const cardX = 18;
  const colW = (pageW - 36) / 4;

  const cards = [
    { label: "Total do contrato", value: fmtCurrency(totalContract) },
    { label: "Total recebido", value: fmtCurrency(totalPaid), color: [16, 122, 87] as [number, number, number] },
    { label: "Saldo restante", value: fmtCurrency(remaining), color: [37, 99, 235] as [number, number, number] },
    { label: "Multa renegociação", value: fmtCurrency(renegPenaltyTotal), color: renegPenaltyTotal > 0 ? [180, 83, 9] as [number, number, number] : [110, 110, 110] as [number, number, number] },
  ];

  cards.forEach((c, i) => {
    const x = cardX + i * colW;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110);
    doc.text(c.label, x, y + 7);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    if (c.color) doc.setTextColor(c.color[0], c.color[1], c.color[2]);
    else doc.setTextColor(0);
    doc.text(c.value, x, y + 16);
  });
  doc.setTextColor(0);
  y += 32;

  const scheds = installmentSchedules
    .filter((s) => s.loanId === loan.id)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);

  if (scheds.length > 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Cronograma de Parcelas", 14, y);
    y += 2;

    autoTable(doc, {
      startY: y + 2,
      head: [["#", "Vencimento", "Valor", "Status"]],
      body: scheds.map((s) => {
        const isPaid = s.installmentNumber <= loan.paidInstallments;
        return [
          String(s.installmentNumber),
          fmtDateBR(s.dueDate),
          fmtCurrency(Number(s.amount || 0)),
          isPaid ? "Paga" : "Pendente",
        ];
      }),
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { halign: "center", cellWidth: 14 },
        2: { halign: "right" },
        3: { halign: "center", cellWidth: 28 },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 3) {
          if (data.cell.raw === "Paga") {
            data.cell.styles.textColor = [16, 122, 87];
            data.cell.styles.fontStyle = "bold";
          } else {
            data.cell.styles.textColor = [110, 110, 110];
          }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  if (y > 240) { doc.addPage(); y = 20; }
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Histórico de Pagamentos", 14, y);
  y += 2;

  if (loanPayments.length === 0) {
    autoTable(doc, {
      startY: y + 2,
      body: [["Nenhum pagamento registrado."]],
      styles: { fontSize: 9, textColor: 110, fontStyle: "italic" },
      theme: "plain",
    });
  } else {
    const sortedPayments = [...loanPayments].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    autoTable(doc, {
      startY: y + 2,
      head: [["Data", "Parcela", "Tipo", "Valor"]],
      body: sortedPayments.map((p) => {
        const kind = p.metadata?.kind === "amortization" ? "Amortização" : "Pagamento";
        return [
          fmtDateBR(p.date),
          p.installmentNumber > 0 ? `#${p.installmentNumber}` : "-",
          kind,
          fmtCurrency(Number(p.amount || 0)),
        ];
      }),
      headStyles: { fillColor: [16, 122, 87], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { halign: "center", cellWidth: 22 },
        3: { halign: "right" },
      },
      foot: [["", "", "Total recebido:", fmtCurrency(totalPaid)]],
      footStyles: { fillColor: [240, 244, 248], textColor: 0, fontStyle: "bold", halign: "right" },
    });
  }
  y = (doc as any).lastAutoTable.finalY + 6;

  if (y > 230) { doc.addPage(); y = 20; }
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Histórico de Renegociações", 14, y);
  y += 2;

  const sortedReneg = [...renegotiations].sort((a, b) =>
    (a.renegotiatedAt || "").localeCompare(b.renegotiatedAt || "")
  );

  if (sortedReneg.length === 0) {
    autoTable(doc, {
      startY: y + 2,
      body: [["Nenhuma renegociação registrada."]],
      styles: { fontSize: 9, textColor: 110, fontStyle: "italic" },
      theme: "plain",
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  } else {
    autoTable(doc, {
      startY: y + 2,
      head: [["Data", "Tipo", "Saldo anterior", "Multa", "Novo saldo", "Parcelas", "Observações"]],
      body: sortedReneg.map((r) => [
        fmtDateBR(r.renegotiatedAt),
        r.type === "with_penalty" ? "Com multa" : "Sem juros",
        fmtCurrency(r.previousAmount),
        r.penaltyAmount > 0
          ? `${fmtCurrency(r.penaltyAmount)}${r.penaltyMode === "percentage" && r.penaltyInput ? ` (${r.penaltyInput}%)` : ""}`
          : "-",
        fmtCurrency(r.newAmount),
        r.newInstallments != null ? String(r.newInstallments) : "-",
        r.notes || "-",
      ]),
      headStyles: { fillColor: [180, 83, 9], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 22 },
        2: { halign: "right", cellWidth: 26 },
        3: { halign: "right", cellWidth: 26 },
        4: { halign: "right", cellWidth: 26 },
        5: { halign: "center", cellWidth: 16 },
        6: { cellWidth: "auto" },
      },
      foot: [["", "", "", "Multa acumulada:", fmtCurrency(renegPenaltyTotal), "", ""]],
      footStyles: { fillColor: [253, 246, 236], textColor: [180, 83, 9], fontStyle: "bold", halign: "right", fontSize: 8 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  if (y > 220) { doc.addPage(); y = 20; }
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Evolução do Saldo", 14, y);
  y += 2;

  type Event =
    | { date: string; kind: "payment"; amount: number; label: string }
    | { date: string; kind: "renegotiation"; delta: number; label: string; newBalance?: number };

  const events: Event[] = [
    ...loanPayments.map<Event>((p) => ({
      date: p.date || "",
      kind: "payment",
      amount: Number(p.amount || 0),
      label: p.metadata?.kind === "amortization" ? "Amortização" : `Pagamento parcela ${p.installmentNumber || "-"}`,
    })),
    ...sortedReneg.map<Event>((r) => ({
      date: r.renegotiatedAt || "",
      kind: "renegotiation",
      delta: Number(r.penaltyAmount || 0),
      newBalance: Number(r.newAmount || 0),
      label: r.type === "with_penalty" ? "Renegociação c/ multa" : "Renegociação s/ juros",
    })),
  ].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  let runningBalance = totalContract;
  const evoRows: string[][] = [];
  evoRows.push([fmtDateBR(loan.startDate), "Início do contrato", "-", fmtCurrency(runningBalance)]);

  for (const ev of events) {
    if (ev.kind === "payment") {
      runningBalance = Math.round((runningBalance - ev.amount) * 100) / 100;
      evoRows.push([fmtDateBR(ev.date), ev.label, `- ${fmtCurrency(ev.amount)}`, fmtCurrency(runningBalance)]);
    } else {
      if (ev.delta > 0) {
        runningBalance = Math.round((runningBalance + ev.delta) * 100) / 100;
      }
      evoRows.push([
        fmtDateBR(ev.date),
        ev.label,
        ev.delta > 0 ? `+ ${fmtCurrency(ev.delta)}` : "—",
        fmtCurrency(runningBalance),
      ]);
    }
  }

  autoTable(doc, {
    startY: y + 2,
    head: [["Data", "Evento", "Variação", "Saldo após"]],
    body: evoRows,
    headStyles: { fillColor: [55, 65, 81], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 28 },
      2: { halign: "right", cellWidth: 32 },
      3: { halign: "right", cellWidth: 34 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 2) {
        const raw = String(data.cell.raw || "");
        if (raw.startsWith("-")) data.cell.styles.textColor = [16, 122, 87];
        else if (raw.startsWith("+")) data.cell.styles.textColor = [180, 83, 9];
      }
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(140);
    doc.text(
      `Página ${i} de ${pageCount}`,
      pageW - 14,
      doc.internal.pageSize.getHeight() - 8,
      { align: "right" }
    );
    doc.setTextColor(0);
  }

  doc.save(`contrato-${slug(loan.borrowerName)}-${loan.id.slice(0, 8)}.pdf`);
}
