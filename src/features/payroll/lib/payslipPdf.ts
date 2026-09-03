// jspdf é carregado sob demanda dentro da função (dynamic import).
import type { Employee, Payroll, SalaryItem } from "@/types/salary";
import { getPdfBranding } from "@/lib/pdfBranding";
import { formatCPF } from "@/lib/brDocuments";

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const monthName = (yyyymm: string) => {
  const [y, m] = yyyymm.split("-").map(Number);
  const name = new Date(y, (m ?? 1) - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return name.charAt(0).toUpperCase() + name.slice(1);
};

export async function generatePayslipPdf(
  payroll: Payroll,
  employee: Employee,
  opts?: { brandName?: string; logoUrl?: string | null },
) {
  const { jsPDF } = await import("jspdf");
  const branding = await getPdfBranding().catch(() => null);
  const brandName = opts?.brandName ?? branding?.brandName ?? "Empresa";
  const logo = branding?.logoDataUrl ?? null;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 12;
  const contentW = pageW - M * 2;

  // ===== HEADER (employer box) =====
  let y = M;
  doc.setDrawColor(60);
  doc.setLineWidth(0.3);
  doc.rect(M, y, contentW, 22);

  if (logo) {
    try {
      doc.addImage(logo, "PNG", M + 2, y + 2, 18, 18);
    } catch {
      /* ignore */
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text(brandName.toUpperCase(), M + (logo ? 24 : 4), y + 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Recibo de Pagamento de Salário", M + (logo ? 24 : 4), y + 14);
  doc.text(
    "(Conforme art. 464 da CLT)",
    M + (logo ? 24 : 4),
    y + 19,
  );

  // Competence box on the right
  const compW = 55;
  const compX = M + contentW - compW;
  doc.rect(compX, y, compW, 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("REFERÊNCIA", compX + compW / 2, y + 5, { align: "center" });
  doc.setFontSize(11);
  doc.text(monthName(payroll.competence), compX + compW / 2, y + 13, {
    align: "center",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    `Emissão: ${new Date().toLocaleDateString("pt-BR")}`,
    compX + compW / 2,
    y + 19,
    { align: "center" },
  );

  y += 22;

  // ===== EMPLOYEE BOX =====
  const empH = 22;
  doc.rect(M, y, contentW, empH);
  // grid lines
  const col1 = M + contentW * 0.55;
  doc.line(col1, y, col1, y + empH);
  doc.line(M, y + 11, M + contentW, y + 11);

  doc.setFontSize(7);
  doc.setTextColor(90);
  doc.text("NOME DO FUNCIONÁRIO", M + 2, y + 4);
  doc.text("CPF", col1 + 2, y + 4);
  doc.text("CARGO", M + 2, y + 15);
  doc.text("MATRÍCULA", col1 + 2, y + 15);

  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text(employee.name ?? "-", M + 2, y + 9);
  doc.text(employee.cpf ? formatCPF(employee.cpf) : "-", col1 + 2, y + 9);
  doc.setFont("helvetica", "normal");
  doc.text(employee.role ?? "-", M + 2, y + 20);
  doc.text(employee.registration ?? "-", col1 + 2, y + 20);

  y += empH;

  // ===== ITEMS TABLE =====
  const cols = [
    { label: "Cód.", w: 14, align: "left" as const },
    { label: "Descrição", w: contentW - 14 - 22 - 32 - 32, align: "left" as const },
    { label: "Ref.", w: 22, align: "right" as const },
    { label: "Vencimentos", w: 32, align: "right" as const },
    { label: "Descontos", w: 32, align: "right" as const },
  ];

  // header row
  const hH = 7;
  doc.setFillColor(235, 235, 240);
  doc.rect(M, y, contentW, hH, "F");
  doc.rect(M, y, contentW, hH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0);
  let x = M;
  cols.forEach((c) => {
    const tx = c.align === "right" ? x + c.w - 2 : x + 2;
    doc.text(c.label, tx, y + 5, { align: c.align });
    x += c.w;
    if (x < M + contentW - 0.1) doc.line(x, y, x, y + hH);
  });
  y += hH;

  // body rows
  const rowH = 6;
  const earnings: SalaryItem[] = payroll.items?.earnings ?? [];
  const deductions: SalaryItem[] = payroll.items?.deductions ?? [];
  const rows = [
    ...earnings.map((e, i) => ({
      code: String(100 + i).padStart(4, "0"),
      label: e.label,
      ref: "30",
      earn: e.amount,
      ded: undefined as number | undefined,
    })),
    ...deductions.map((d, i) => ({
      code: String(500 + i).padStart(4, "0"),
      label: d.label,
      ref: "-",
      earn: undefined,
      ded: d.amount,
    })),
  ];

  // ensure minimum visual rows (parity with classic payslip)
  const minRows = 12;
  const blankCount = Math.max(0, minRows - rows.length);
  const totalRows = rows.length + blankCount;
  const bodyH = totalRows * rowH;

  doc.rect(M, y, contentW, bodyH);
  // vertical separators
  let vx = M;
  cols.forEach((c, idx) => {
    vx += c.w;
    if (idx < cols.length - 1) doc.line(vx, y, vx, y + bodyH);
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  rows.forEach((r, i) => {
    const ry = y + i * rowH + 4;
    let cx = M;
    doc.text(r.code, cx + 2, ry); cx += cols[0].w;
    doc.text(r.label, cx + 2, ry); cx += cols[1].w;
    doc.text(r.ref, cx + cols[2].w - 2, ry, { align: "right" }); cx += cols[2].w;
    if (r.earn != null) doc.text(BRL(r.earn), cx + cols[3].w - 2, ry, { align: "right" });
    cx += cols[3].w;
    if (r.ded != null) {
      doc.setTextColor(170, 30, 30);
      doc.text(BRL(r.ded), cx + cols[4].w - 2, ry, { align: "right" });
      doc.setTextColor(0);
    }
  });

  y += bodyH;

  // ===== TOTALS ROW =====
  const totH = 9;
  doc.setFillColor(245, 245, 250);
  doc.rect(M, y, contentW, totH, "F");
  doc.rect(M, y, contentW, totH);
  const totalEarn = payroll.grossSalary + payroll.totalBenefits;
  const totalDed = payroll.totalDeductions;
  // separator before last two columns
  const earnX = M + cols[0].w + cols[1].w + cols[2].w;
  const dedX = earnX + cols[3].w;
  doc.line(earnX, y, earnX, y + totH);
  doc.line(dedX, y, dedX, y + totH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("TOTAIS", M + 2, y + 6);
  doc.text(BRL(totalEarn), earnX + cols[3].w - 2, y + 6, { align: "right" });
  doc.setTextColor(170, 30, 30);
  doc.text(BRL(totalDed), dedX + cols[4].w - 2, y + 6, { align: "right" });
  doc.setTextColor(0);
  y += totH;

  // ===== NET / SUMMARY =====
  const sumH = 18;
  doc.rect(M, y, contentW, sumH);
  const halfX = M + contentW / 2;
  doc.line(halfX, y, halfX, y + sumH);

  // left summary cells
  const cellW = (contentW / 2) / 3;
  for (let i = 1; i < 3; i++) doc.line(M + cellW * i, y, M + cellW * i, y + sumH);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(90);
  doc.text("SALÁRIO BASE", M + 2, y + 4);
  doc.text("SAL. CONTR. INSS", M + cellW + 2, y + 4);
  doc.text("BASE CÁLC. FGTS", M + cellW * 2 + 2, y + 4);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(BRL(payroll.grossSalary), M + cellW - 2, y + 11, { align: "right" });
  doc.text(BRL(payroll.grossSalary), M + cellW * 2 - 2, y + 11, { align: "right" });
  doc.text(BRL(payroll.grossSalary), M + cellW * 3 - 2, y + 11, { align: "right" });

  // right: Líquido a receber
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text("VALOR LÍQUIDO", halfX + 4, y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(16, 110, 60);
  doc.text(BRL(payroll.netSalary), M + contentW - 3, y + 13, { align: "right" });
  doc.setTextColor(0);

  y += sumH + 6;

  // ===== DECLARATION / SIGNATURE =====
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(60);
  const decl =
    "Declaro ter recebido a importância líquida discriminada neste recibo, referente ao período acima, dando ao empregador plena e geral quitação pelo valor pago.";
  const lines = doc.splitTextToSize(decl, contentW);
  doc.text(lines, M, y);
  y += lines.length * 4 + 14;

  doc.setDrawColor(0);
  doc.line(M + 10, y, M + contentW / 2 - 10, y);
  doc.line(M + contentW / 2 + 10, y, M + contentW - 10, y);
  doc.setFontSize(8);
  doc.setTextColor(0);
  doc.text("Assinatura do Funcionário", M + contentW / 4, y + 4, { align: "center" });
  doc.text("Assinatura do Empregador", M + (contentW * 3) / 4, y + 4, { align: "center" });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(140);
  doc.text(
    `${brandName} — Autenticador: ${payroll.id.slice(0, 8).toUpperCase()} — Emitido em ${new Date().toLocaleString("pt-BR")}`,
    pageW / 2,
    290,
    { align: "center" },
  );

  const filename = `contracheque-${employee.name.replace(/\s+/g, "_")}-${payroll.competence}.pdf`;
  const blob = doc.output("blob");

  // Detect standalone PWA (iOS/Android) — doc.save() opens a tab that can't be closed
  const isStandalone =
    (typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)").matches ||
        (navigator as any).standalone === true));

  // Try Web Share API with file (best UX on iOS PWA)
  try {
    const nav = navigator as any;
    if (isStandalone && nav.canShare && typeof File !== "undefined") {
      const file = new File([blob], filename, { type: "application/pdf" });
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: filename });
        return;
      }
    }
  } catch {
    /* fall through to download */
  }

  // Fallback: trigger a regular download via anchor
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
