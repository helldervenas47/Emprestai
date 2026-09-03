// Pure helpers extraídos do Index.tsx para permitir testes unitários das
// decisões relacionadas ao prefetch dos formulários primários.
//
// A regra fundamental é: o loader selecionado por `getPrimaryFormLoaderForTab`
// precisa apontar exatamente para o mesmo formulário que `handlePrimaryAction`
// abrirá. Se um clique não abrir nenhum formulário lazy conhecido (ex.: aba
// receitas, que dispara CustomEvent; abas products/vehicles, que abrem outros
// formulários fora do escopo aprovado de prefetch), retorne `null` para
// preservar o mapeamento sem provocar downloads desnecessários.

export type PrimaryFormKind =
  | "loan"
  | "client"
  | "expense"
  | "personal-expense"
  | null;

export type PrimaryFormSelection = {
  tab: string;
  clientSubTab: string;
  incExpTab: string;
  expenseSubTab: string;
};

/**
 * Retorna qual formulário primário será aberto por um clique no FAB para a
 * combinação atual de abas, ou `null` quando a ação primária não abre um
 * formulário que participa da estratégia de prefetch aprovada.
 */
export function getPrimaryFormKindForTab({
  tab,
  clientSubTab,
  incExpTab,
  expenseSubTab,
}: PrimaryFormSelection): PrimaryFormKind {
  if (tab === "dashboard") return "loan";
  if (tab === "clients" && clientSubTab === "clientes") return "client";
  if (tab === "expenses") {
    if (incExpTab === "incomes") return null; // Receita usa CustomEvent
    if (expenseSubTab === "personal") return "personal-expense";
    return "expense";
  }
  return null;
}

// ------- Slow connection / Data Saver decision -------

export type ConnectionLike = {
  saveData?: boolean;
  effectiveType?: string;
} | null | undefined;

/**
 * Decide se o prefetch AUTOMÁTICO em idle é permitido.
 *
 * - Sem API `navigator.connection`: permite (evita quebrar navegadores antigos).
 * - `saveData = true`: bloqueia (Data Saver).
 * - `effectiveType` "slow-2g" ou "2g": bloqueia.
 * - "3g" / "4g" / desconhecido: permite.
 *
 * Cliques, focus e pointerdown NÃO devem consultar essa função — eles refletem
 * intenção explícita do usuário e sempre disparam o carregamento.
 */
export function isAutomaticIdlePrefetchAllowed(conn: ConnectionLike): boolean {
  if (!conn) return true;
  if (conn.saveData === true) return false;
  const et = typeof conn.effectiveType === "string" ? conn.effectiveType : "";
  if (/(^|-)2g$/.test(et)) return false; // matches "2g" and "slow-2g"
  return true;
}
