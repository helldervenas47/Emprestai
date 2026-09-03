// Encode/decode "merchandise as payment" metadata stored inside Sale.notes
// to avoid creating a new database column/table.
//
// Format: notes starts with a single line marker:
//   [MERCADORIA]{"descricao":"...","valor":123.45}
// Optionally followed by user-typed observations on the next lines.

export interface SaleMerchandise {
  descricao: string;
  valor: number;
}

const MARKER = "[MERCADORIA]";

export function encodeNotesWithMerchandise(
  userNotes: string | undefined | null,
  merchandise: SaleMerchandise | null,
): string | undefined {
  const cleanNotes = (userNotes || "").trim();
  if (!merchandise || merchandise.valor <= 0 || !merchandise.descricao.trim()) {
    return cleanNotes ? cleanNotes : undefined;
  }
  const payload = JSON.stringify({
    descricao: merchandise.descricao.trim(),
    valor: Number(merchandise.valor) || 0,
  });
  const header = `${MARKER}${payload}`;
  return cleanNotes ? `${header}\n${cleanNotes}` : header;
}

export function parseNotesWithMerchandise(notes: string | undefined | null): {
  merchandise: SaleMerchandise | null;
  userNotes: string;
} {
  const text = (notes || "").trim();
  if (!text.startsWith(MARKER)) {
    return { merchandise: null, userNotes: text };
  }
  const newlineIdx = text.indexOf("\n");
  const headerLine = newlineIdx === -1 ? text : text.slice(0, newlineIdx);
  const rest = newlineIdx === -1 ? "" : text.slice(newlineIdx + 1).trim();
  const jsonPart = headerLine.slice(MARKER.length).trim();
  try {
    const parsed = JSON.parse(jsonPart);
    const valor = Number(parsed?.valor) || 0;
    const descricao = String(parsed?.descricao || "").trim();
    if (valor > 0 && descricao) {
      return { merchandise: { descricao, valor }, userNotes: rest };
    }
  } catch {
    // ignore parse errors and treat as plain notes
  }
  return { merchandise: null, userNotes: text };
}
