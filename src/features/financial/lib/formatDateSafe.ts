import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Formatação de datas resiliente.
 *
 * `date-fns.format()` lança `RangeError: Invalid time value` quando recebe uma
 * data inválida (string vazia, `undefined`, `null` ou fora do padrão
 * "YYYY-MM-DD"). Em listas financeiras isso derrubava o módulo inteiro.
 * Aqui o valor inválido apenas resulta no placeholder.
 */
export function formatDateBR(
  value: string | Date | null | undefined,
  pattern = "dd/MM/yyyy",
  fallback = "—",
): string {
  if (!value) return fallback;
  const date =
    value instanceof Date
      ? value
      : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return fallback;
  try {
    return format(date, pattern, { locale: ptBR });
  } catch {
    return fallback;
  }
}
