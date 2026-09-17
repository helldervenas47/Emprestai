/**
 * Utilitários centralizados de busca e filtragem insensíveis a acentos e maiúsculas/minúsculas.
 */

/**
 * Normaliza um texto para busca:
 * - Remove acentos e caracteres diacríticos (ex: "João" -> "joao", "Crédito" -> "credito", "Ação" -> "acao")
 * - Converte para minúsculas
 * - Remove espaços extras nas bordas
 */
export function normalizeSearchText(v?: string | number | null): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Normaliza um texto mantendo apenas dígitos numéricos (para busca de CPF, CNPJ, telefones e códigos).
 */
export function normalizeDigits(v?: string | number | null): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\D/g, "");
}

/**
 * Verifica se o texto alvo contém a query informada (sem diferenciar acentos ou maiúsculas).
 */
export function matchesSearch(target?: string | number | null, query?: string | number | null): boolean {
  if (!query || String(query).trim() === "") return true;
  if (target === null || target === undefined) return false;
  return normalizeSearchText(target).includes(normalizeSearchText(query));
}

/**
 * Verifica se QUALQUER um dos campos alvo contém o termo de busca pesquisado.
 * Também suporta comparação automática de dígitos para campos numéricos/documentos.
 */
export function matchesAnySearch(
  targets: Array<string | number | null | undefined>,
  query?: string | number | null
): boolean {
  if (!query || String(query).trim() === "") return true;
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const queryDigits = normalizeDigits(query);

  return targets.some((t) => {
    if (t === null || t === undefined) return false;
    const str = String(t);
    const norm = normalizeSearchText(str);
    if (norm.includes(normalizedQuery)) return true;
    if (queryDigits.length > 0) {
      const targetDigits = normalizeDigits(str);
      if (targetDigits.length > 0 && targetDigits.includes(queryDigits)) return true;
    }
    return false;
  });
}
