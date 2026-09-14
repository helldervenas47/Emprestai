export function rawFormatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function fmtDateBR(iso?: string | null, fallback?: string | null): string {
  const raw = iso || fallback;
  if (!raw) return "-";
  const clean = String(raw).split("T")[0];
  const parts = clean.split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    const [y, m, d] = parts;
    return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
  }
  const dt = new Date(raw);
  return isNaN(dt.getTime()) ? "-" : dt.toLocaleDateString("pt-BR");
}

