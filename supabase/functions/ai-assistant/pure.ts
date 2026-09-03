/**
 * Lógica PURA do assistente EmprestAI.
 *
 * Este módulo não importa Deno, Supabase nem rede — é a única superfície
 * testável por Vitest (ver src/features/ai/__tests__/aiAssistantPure.test.ts).
 * Nenhuma regra financeira nova vive aqui: apenas seleção de domínios,
 * resolução de período, formatação e sanitização.
 */

/* ---------------------------------------------------------------------------
 * 1. Domínios de conhecimento
 * ------------------------------------------------------------------------- */

export type KnowledgeDomain =
  | "architecture"
  | "dashboard"
  | "loans"
  | "loan-payments"
  | "sales"
  | "income"
  | "expenses"
  | "payroll"
  | "goals"
  | "reports"
  | "telegram"
  | "piggy-banks"
  | "calendar"
  | "subscriptions"
  | "admin"
  | "faq";

/** Aba aberta no app → domínio prioritário. */
export const TAB_TO_DOMAIN: Record<string, KnowledgeDomain> = {
  overview: "dashboard",
  dashboard: "loans",
  products: "sales",
  vehicles: "dashboard",
  calendar: "calendar",
  clients: "loans",
  expenses: "expenses",
  boletos: "expenses",
  salary: "payroll",
  accountant: "reports",
  overdue: "reports",
  settings: "subscriptions",
  system: "admin",
  ajuda: "faq",
};

const DOMAIN_KEYWORDS: Record<KnowledgeDomain, string[]> = {
  architecture: ["arquitetura", "tabela", "banco", "tecnico", "sistema", "origem do dado"],
  dashboard: ["dashboard", "visao geral", "capital ativo", "patrimonio", "indicador", "resumo", "saldo em conta", "a receber", "receber"],
  loans: ["emprestimo", "contrato", "cliente", "principal", "inadimplencia", "atrasado", "carteira", "quitado", "renegocia"],
  "loan-payments": ["pagamento", "quitar", "quitacao", "amortiza", "parcial", "juros", "multa", "parcela", "baixa"],
  sales: ["venda", "vendi", "produto", "estoque", "faturamento", "lucro"],
  income: ["receita", "recebi", "entrada", "recorrente"],
  expenses: ["despesa", "gastei", "gasto", "cartao", "fatura", "categoria", "orcamento", "boleto"],
  payroll: ["salario", "folha", "funcionario", "holerite", "comissao", "adiantamento", "beneficio"],
  goals: ["meta", "pontuacao", "score", "atingid", "trimestre", "semestre"],
  reports: ["relatorio", "exportar", "pdf", "csv", "comparativo", "fluxo de caixa"],
  telegram: ["telegram", "bot", "webhook", "polling", "vincular"],
  "piggy-banks": ["cofrinho", "guardado", "rendimento", "cdi", "resgate", "aporte", "poupanca"],
  calendar: ["calendario", "vence", "vencimento", "hoje", "amanha", "semana", "agenda"],
  subscriptions: ["plano", "assinatura", "expirou", "dias restantes", "trial", "teste", "bloquead"],
  admin: ["admin", "permissao", "papel", "usuario", "liberar", "convite", "username"],
  faq: [],
};

export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Seleciona no máximo `max` domínios relevantes. Nunca envia os 16 docs:
 * `architecture` é sempre incluído (regras de origem de dado) e o domínio da
 * aba aberta tem prioridade sobre os detectados por palavra-chave.
 */
export function selectDomains(
  question: string,
  tab?: string | null,
  max = 4,
): KnowledgeDomain[] {
  const q = stripAccents(question || "");
  const scored: Array<{ domain: KnowledgeDomain; score: number }> = [];

  for (const [domain, words] of Object.entries(DOMAIN_KEYWORDS) as Array<[KnowledgeDomain, string[]]>) {
    let score = 0;
    for (const w of words) if (q.includes(w)) score += 1;
    if (score > 0) scored.push({ domain, score });
  }
  scored.sort((a, b) => b.score - a.score);

  const picked: KnowledgeDomain[] = ["architecture"];
  const tabDomain = tab ? TAB_TO_DOMAIN[tab] : undefined;
  if (tabDomain && !picked.includes(tabDomain)) picked.push(tabDomain);
  for (const { domain } of scored) {
    if (picked.length >= max) break;
    if (!picked.includes(domain)) picked.push(domain);
  }
  if (picked.length === 1) picked.push("faq");
  return picked.slice(0, max);
}

/* ---------------------------------------------------------------------------
 * 2. Período
 * ------------------------------------------------------------------------- */

export type PeriodKind = "day" | "week" | "month" | "quarter" | "semester" | "year" | "custom";

export interface ResolvedPeriod {
  kind: PeriodKind;
  startIso: string;
  endIso: string;
  label: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

const MONTH_NAMES = [
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function lastDay(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/**
 * Resolve o período a partir de uma expressão livre em pt-BR.
 * `todayIso` é sempre a âncora — nunca `new Date()` implícito, para o
 * resultado ser determinístico e testável.
 */
export function resolvePeriod(expression: string | null | undefined, todayIso: string): ResolvedPeriod {
  const [ty, tm, td] = todayIso.slice(0, 10).split("-").map(Number);
  const raw = stripAccents(expression || "").trim();

  const explicit = raw.match(/(\d{4})-(\d{2})-(\d{2})\s*(?:a|ate|->|→)\s*(\d{4})-(\d{2})-(\d{2})/);
  if (explicit) {
    const start = `${explicit[1]}-${explicit[2]}-${explicit[3]}`;
    const end = `${explicit[4]}-${explicit[5]}-${explicit[6]}`;
    return { kind: "custom", startIso: start, endIso: end, label: `${start} a ${end}` };
  }

  const monthYear = raw.match(/(\d{4})-(\d{2})$/);
  if (monthYear) {
    const y = Number(monthYear[1]);
    const m = Number(monthYear[2]);
    return { kind: "month", startIso: iso(y, m, 1), endIso: iso(y, m, lastDay(y, m)), label: `${pad2(m)}/${y}` };
  }

  for (let i = 0; i < MONTH_NAMES.length; i++) {
    if (raw.includes(MONTH_NAMES[i])) {
      const yMatch = raw.match(/(20\d{2})/);
      const y = yMatch ? Number(yMatch[1]) : ty;
      const m = i + 1;
      return { kind: "month", startIso: iso(y, m, 1), endIso: iso(y, m, lastDay(y, m)), label: `${MONTH_NAMES[i]} de ${y}` };
    }
  }

  if (raw.includes("hoje")) {
    return { kind: "day", startIso: todayIso, endIso: todayIso, label: `hoje (${todayIso})` };
  }
  if (raw.includes("ontem")) {
    const d = new Date(ty, tm - 1, td - 1);
    const s = iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return { kind: "day", startIso: s, endIso: s, label: `ontem (${s})` };
  }
  if (raw.includes("semana")) {
    const ref = new Date(ty, tm - 1, td);
    const start = new Date(ty, tm - 1, td - ref.getDay());
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    const s = iso(start.getFullYear(), start.getMonth() + 1, start.getDate());
    const e = iso(end.getFullYear(), end.getMonth() + 1, end.getDate());
    return { kind: "week", startIso: s, endIso: e, label: `semana de ${s} a ${e}` };
  }
  if (raw.includes("trimestre")) {
    const q = Math.floor((tm - 1) / 3);
    const sm = q * 3 + 1;
    const em = sm + 2;
    return { kind: "quarter", startIso: iso(ty, sm, 1), endIso: iso(ty, em, lastDay(ty, em)), label: `${q + 1}º trimestre de ${ty}` };
  }
  if (raw.includes("semestre")) {
    const first = tm <= 6;
    const sm = first ? 1 : 7;
    const em = first ? 6 : 12;
    return { kind: "semester", startIso: iso(ty, sm, 1), endIso: iso(ty, em, lastDay(ty, em)), label: `${first ? "1º" : "2º"} semestre de ${ty}` };
  }
  if (raw.includes("ano") || raw.match(/^20\d{2}$/)) {
    const yMatch = raw.match(/(20\d{2})/);
    const y = yMatch ? Number(yMatch[1]) : ty;
    return { kind: "year", startIso: iso(y, 1, 1), endIso: iso(y, 12, 31), label: String(y) };
  }
  if (raw.includes("mes passado") || raw.includes("mes anterior")) {
    const y = tm === 1 ? ty - 1 : ty;
    const m = tm === 1 ? 12 : tm - 1;
    return { kind: "month", startIso: iso(y, m, 1), endIso: iso(y, m, lastDay(y, m)), label: `${pad2(m)}/${y}` };
  }

  return {
    kind: "month",
    startIso: iso(ty, tm, 1),
    endIso: iso(ty, tm, lastDay(ty, tm)),
    label: `${pad2(tm)}/${ty}`,
  };
}

/** Período imediatamente anterior, de mesma duração — usado em comparações. */
export function previousPeriod(period: ResolvedPeriod): ResolvedPeriod {
  const [sy, sm] = period.startIso.split("-").map(Number);
  if (period.kind === "month") {
    const y = sm === 1 ? sy - 1 : sy;
    const m = sm === 1 ? 12 : sm - 1;
    return { kind: "month", startIso: iso(y, m, 1), endIso: iso(y, m, lastDay(y, m)), label: `${pad2(m)}/${y}` };
  }
  if (period.kind === "year") {
    return { kind: "year", startIso: iso(sy - 1, 1, 1), endIso: iso(sy - 1, 12, 31), label: String(sy - 1) };
  }
  const start = new Date(`${period.startIso}T00:00:00`);
  const end = new Date(`${period.endIso}T00:00:00`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const prevEnd = new Date(start.getTime() - 86_400_000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86_400_000);
  const s = iso(prevStart.getFullYear(), prevStart.getMonth() + 1, prevStart.getDate());
  const e = iso(prevEnd.getFullYear(), prevEnd.getMonth() + 1, prevEnd.getDate());
  return { kind: period.kind, startIso: s, endIso: e, label: `${s} a ${e}` };
}

export function isInsidePeriod(dateIso: string | null | undefined, period: ResolvedPeriod | null): boolean {
  if (!period) return true;
  if (!dateIso) return false;
  const day = String(dateIso).slice(0, 10);
  return day >= period.startIso && day <= period.endIso;
}

/* ---------------------------------------------------------------------------
 * 3. Formatação e segurança
 * ------------------------------------------------------------------------- */

/** Sempre R$ 1.250,00 — nunca notação abreviada em respostas com valores. */
export function formatBRL(value: number): string {
  const n = Number(value) || 0;
  const neg = n < 0;
  const [intPart, decPart] = Math.abs(n).toFixed(2).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}R$ ${grouped},${decPart}`;
}

const SECRET_PATTERNS: RegExp[] = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT
  /sb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}/g,
  /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/g, // token de bot do Telegram
  /\bsk-[A-Za-z0-9]{16,}\b/g,
  /AIza[0-9A-Za-z_-]{20,}/g,
];

/** Remove qualquer credencial que tenha vazado para o texto da resposta. */
export function redactSecrets(text: string): string {
  let out = String(text ?? "");
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[credencial omitida]");
  return out;
}

/**
 * Marca respostas que citam valores em reais sem informar o período.
 * O contrato de resposta (seção 21) exige período explícito.
 */
export function missingPeriodDisclosure(reply: string): boolean {
  const hasMoney = /R\$\s?\d/.test(reply);
  if (!hasMoney) return false;
  const r = stripAccents(reply);
  return !/(periodo|hoje|ontem|semana|mes|mês|trimestre|semestre|ano|\d{2}\/\d{4}|\d{4}-\d{2})/.test(r);
}

/** Nunca gravar como "conhecimento" respostas que contenham dados financeiros. */
export function isLearnableAnswer(question: string, answer: string): boolean {
  if (!question || !answer) return false;
  if (/R\$\s?\d/.test(answer)) return false;
  if (answer.startsWith("⚠️")) return false;
  if (/nao encontrei registros/i.test(stripAccents(answer))) return false;
  return true;
}
