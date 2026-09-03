import type { LedgerEntry, LedgerCategory } from "@/features/financial/lib/ledger";

/**
 * Normaliza um lançamento do extrato em uma estrutura fixa de exibição,
 * garantindo que cada informação ocupe sempre a mesma posição no registro:
 *
 *  Linha 1 → título (cliente/entidade) + valor
 *  Linha 2 → tipo de movimentação · data/hora · forma de pagamento
 *  Linha 3 → status · carteira (conta/dinheiro) · complementos
 */
export interface LedgerDisplay {
  /** Nome do cliente/entidade — ou nome da movimentação/categoria quando não houver. */
  title: string;
  /** Tipo da movimentação (Recebimento, Empréstimo, Juros, Multa, Venda, Despesa…). */
  typeLabel: string;
  /** Status derivado (Recebido, Pago, Parcial, Quitado, Ajuste…). */
  status: string;
  /** Tom semântico do status. */
  statusTone: "success" | "destructive" | "warning" | "muted";
}

const categoryLabels: Record<LedgerCategory, string> = {
  loan: "Empréstimo",
  payment: "Pagamento",
  expense: "Despesa",
  adjustment: "Ajuste",
  aporte: "Aporte",
  sale: "Venda",
  initial: "Saldo inicial",
  other: "Outro",
  transfer: "Transferência",
};

/** Dicionário de tipos reconhecidos a partir do texto da descrição. */
const TYPE_PATTERNS: Array<[RegExp, string]> = [
  [/quitad|quitação/i, "Quitação"],
  [/amortiz/i, "Amortização"],
  [/multa|mora/i, "Multa"],
  [/juros/i, "Juros"],
  [/renegocia/i, "Renegociação"],
  [/empréstimo concedido|empréstimo/i, "Empréstimo"],
  [/recebiment|pagamento recebido/i, "Recebimento"],
  [/parcela/i, "Parcela"],
  [/fatura/i, "Fatura"],
  [/salário|folha|pagamento de funcion/i, "Folha"],
  [/aporte/i, "Aporte"],
  [/transfer/i, "Transferência"],
  [/venda/i, "Venda"],
  [/despesa/i, "Despesa"],
  [/receita/i, "Receita"],
  [/ajuste|edição manual/i, "Ajuste"],
];

const NAME_META_KEYS = [
  "client_name",
  "borrower_name",
  "customer_name",
  "employee_name",
  "manager_name",
  "person_name",
  "name",
];

const cleanup = (s: string) => s.replace(/\s+/g, " ").trim();

/** Heurística: um nome próprio tem 1–8 palavras e não contém números/“:”. */
const looksLikePerson = (s: string): boolean => {
  const v = cleanup(s);
  if (!v || v.length > 54) return false;
  if (/\d|[:/()%]/.test(v)) return false;
  const words = v.split(" ");
  return words.length <= 8 && /^[A-ZÀ-Ú]/.test(v);
};

/** Remove prefixos operacionais para isolar o nome do cliente na descrição. */
const LOAN_PREFIX_PATTERNS = [
  /^Empréstimo concedido\s*[-–—]\s*/i,
  /^Empréstimo quitado na criação\s*[-–—]\s*/i,
  /^Juros\/multa por atraso\s*[-–—]\s*/i,
  /^Ajuste de saldo do empréstimo de\s+/i,
  /^Edição manual do contrato de\s+/i,
  /^Pagamento de empréstimo \(juros \+ multa\)\s*[-–—]\s*/i,
  /^Pagamento de empréstimo\s*[-–—]\s*/i,
  /^Juros mensal\s*[-–—]\s*/i,
];

const extractLoanBorrowerName = (desc: string): string | null => {
  for (const re of LOAN_PREFIX_PATTERNS) {
    if (re.test(desc)) {
      const name = cleanup(desc.replace(re, "").split(/\s[-–—]\s/)[0]);
      if (name && looksLikePerson(name)) return name;
    }
  }
  return null;
};

export function getLedgerDisplay(e: LedgerEntry, fallbackName?: string | null): LedgerDisplay {
  const md = (e.metadata ?? {}) as Record<string, any>;
  const desc = cleanup(e.description ?? "");

  // ---- Tipo da movimentação -------------------------------------------------
  let typeLabel = categoryLabels[e.category] ?? "Movimentação";
  for (const [re, label] of TYPE_PATTERNS) {
    if (re.test(desc)) { typeLabel = label; break; }
  }
  if (md.kind === "credit_card_invoice_payment") typeLabel = "Fatura de cartão";
  if (e.category === "transfer") typeLabel = "Transferência";
  if (e.category === "initial") typeLabel = "Saldo inicial";

  // ---- Título (cliente quando houver) --------------------------------------
  let title = "";
  for (const k of NAME_META_KEYS) {
    const v = md[k];
    if (typeof v === "string" && cleanup(v)) { title = cleanup(v); break; }
  }
  // Empréstimos: garantir que o título seja o nome do cliente.
  if (!title && (e.category === "loan" || e.loan_id)) {
    title = extractLoanBorrowerName(desc) ?? "";
  }
  // Fallback: nome do mutuário resolvido pelo contrato (loans.borrower_name).
  if (!title && fallbackName && cleanup(fallbackName)) {
    title = cleanup(fallbackName);
  }
  if (!title) {
    // Padrão dominante das descrições: "<Tipo/Operação> - <Nome>" (ou " — ").
    const parts = desc.split(/\s[-–—]\s/).map(cleanup).filter(Boolean);
    if (parts.length > 1) {
      const tail = parts[parts.length - 1];
      if (looksLikePerson(tail)) {
        title = tail;
      } else {
        const person = parts.slice(1).find(looksLikePerson);
        title = person ?? parts.slice(1).join(" · ");
      }
    }
  }
  if (!title) {
    // Sem cliente vinculado: usa o nome da movimentação ou a categoria.
    title = cleanup(md.category ?? "") || desc || typeLabel;
  }

  // ---- Status --------------------------------------------------------------
  let status: string;
  let statusTone: LedgerDisplay["statusTone"];
  if (e.category === "adjustment" || md.audit) {
    status = "Ajuste";
    statusTone = "muted";
  } else if (e.category === "transfer") {
    status = "Transferido";
    statusTone = "muted";
  } else if (md.split_part) {
    status = "Parcial";
    statusTone = "warning";
  } else if (md.pay_mode === "partial" || md.full_payment === false) {
    status = "Parcial";
    statusTone = "warning";
  } else if (/quitad/i.test(desc)) {
    status = "Quitado";
    statusTone = "success";
  } else if (e.direction === "in") {
    status = "Recebido";
    statusTone = "success";
  } else {
    status = "Pago";
    statusTone = "destructive";
  }

  return { title, typeLabel, status, statusTone };
}

export const statusToneClass: Record<LedgerDisplay["statusTone"], string> = {
  success: "bg-success/10 text-success border-success/30",
  destructive: "bg-destructive/10 text-destructive border-destructive/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  muted: "bg-muted text-muted-foreground border-border/60",
};
