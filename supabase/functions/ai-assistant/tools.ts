/**
 * Tools de dados reais do assistente EmprestAI.
 *
 * Regras invioláveis:
 * - Toda leitura usa o client com o JWT do usuário → RLS aplica-se sempre.
 * - Nenhum cálculo financeiro novo: agregação por buildAggregatesFromRows
 *   (_shared/financial-aggregates.ts), a fonte oficial usada por Dashboard,
 *   Metas, Relatórios e Telegram.
 * - Toda tool é somente leitura nesta fase.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getExternalSupabaseUrl, getExternalAnonKey } from "./external-supabase.ts";
import { buildAggregatesFromRows } from "./financial-aggregates.ts";
import { formatBRL, resolvePeriod, type ResolvedPeriod } from "./pure.ts";

export interface ToolContext {
  client: SupabaseClient;
  ownerId: string;
  todayIso: string;
}

export function createUserClient(authHeader: string): SupabaseClient {
  return createClient(getExternalSupabaseUrl(), getExternalAnonKey(), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sumBy(rows: any[], keys: string[]): number {
  return rows.reduce((acc, row) => {
    for (const k of keys) {
      if (row?.[k] != null) return acc + num(row[k]);
    }
    return acc;
  }, 0);
}

function pickDate(row: any): string {
  for (const k of ["date", "due_date", "sale_date", "created_at", "start_date"]) {
    if (row?.[k]) return String(row[k]).slice(0, 10);
  }
  return "";
}

/**
 * Data de vencimento efetiva do contrato = vencimento da PRIMEIRA parcela
 * ainda em aberto (mesma regra do app: `getFirstPendingDate`). Sem cronograma,
 * cai para `loans.due_date`.
 */
function effectiveDueDate(loan: any, installments: any[]): string {
  const rows = installments
    .filter((i) => String(i.loan_id) === String(loan.id))
    .sort((a, b) => num(a.installment_number) - num(b.installment_number));
  if (rows.length > 0) {
    const open = rows.find((i) => i.paid !== true);
    if (open?.due_date) return String(open.due_date).slice(0, 10);
    const next = num(loan.paid_installments) + 1;
    const byNumber = rows.find((i) => num(i.installment_number) === next);
    if (byNumber?.due_date) return String(byNumber.due_date).slice(0, 10);
  }
  return String(loan.due_date ?? "").slice(0, 10);
}

async function loadLoansAndPayments(ctx: ToolContext) {
  const { data: loans, error: loansError } = await ctx.client
    .from("loans")
    .select("*")
    .eq("user_id", ctx.ownerId);
  if (loansError) throw new Error(`loans: ${loansError.message}`);

  const { data: payments, error: paymentsError } = await ctx.client
    .from("payments")
    .select("*")
    .eq("user_id", ctx.ownerId);
  if (paymentsError) throw new Error(`payments: ${paymentsError.message}`);

  const loanIds = (loans ?? []).map((l: any) => String(l.id));
  let installmentRows: any[] = [];
  if (loanIds.length > 0) {
    const { data: inst } = await ctx.client
      .from("loan_installments")
      .select("loan_id, installment_number, due_date, amount, paid")
      .in("loan_id", loanIds);
    installmentRows = inst ?? [];
  }

  // Alinha a data de vencimento usada nos cálculos com a exibida no app.
  const loanRows = (loans ?? []).map((l: any) => {
    const effective = effectiveDueDate(l, installmentRows);
    return effective && effective !== String(l.due_date ?? "").slice(0, 10)
      ? { ...l, due_date: effective, contract_due_date: l.due_date }
      : l;
  });

  return { loanRows, paymentRows: payments ?? [], installmentRows };
}


function aggregatesFor(ctx: ToolContext, rows: { loanRows: any[]; paymentRows: any[] }, period: ResolvedPeriod) {
  return buildAggregatesFromRows({
    loanRows: rows.loanRows,
    paymentRows: rows.paymentRows,
    todayIso: ctx.todayIso,
    period: { kind: "custom", startIso: period.startIso, endIso: period.endIso, label: period.label } as any,
  });
}

async function clientNameMap(ctx: ToolContext): Promise<Map<string, string>> {
  const { data } = await ctx.client.from("clients").select("id, name").eq("user_id", ctx.ownerId);
  const map = new Map<string, string>();
  for (const row of data ?? []) map.set(String(row.id), String(row.name ?? ""));
  return map;
}


function loanClientName(loan: any, names: Map<string, string>): string {
  const direct = String(loan?.borrower_name ?? "").trim();
  if (direct) return direct;
  const id = String(loan?.borrower_id ?? loan?.client_id ?? "");
  return names.get(id) ?? "—";
}

/* ---------------------------------------------------------------------------
 * Definições expostas ao modelo (JSON Schema, formato OpenAI-compatible)
 * ------------------------------------------------------------------------- */

const periodParam = {
  type: "string",
  description:
    "Período em linguagem natural pt-BR (ex.: 'hoje', 'esta semana', 'mês passado', 'julho de 2026', '2026-01-01 a 2026-03-31'). Padrão: mês atual.",
};

export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "get_financial_overview",
      description:
        "Indicadores oficiais da carteira no período: capital ativo, total a receber, recebido, lucro realizado, juros pendentes, contratos e inadimplência.",
      parameters: { type: "object", properties: { period: periodParam }, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "list_loans",
      description: "Lista contratos de empréstimo do usuário, com filtro opcional por status ou nome do cliente.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "active, paid ou overdue" },
          client_name: { type: "string", description: "Parte do nome do cliente" },
          limit: { type: "number", description: "Máximo de contratos (padrão 20)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_loan_details",
      description: "Detalhe de um contrato: valor, taxa, parcelas, pagamentos recebidos e situação atual.",
      parameters: {
        type: "object",
        properties: {
          loan_id: { type: "string" },
          client_name: { type: "string", description: "Alternativa ao id: nome do cliente" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_overdue",
      description: "Contratos vencidos com dias de atraso e valor em aberto (inadimplência).",
      parameters: { type: "object", properties: { limit: { type: "number" } }, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_summary",
      description: "Resumo de um cliente: contratos, total emprestado, pago e em aberto.",
      parameters: {
        type: "object",
        properties: { client_name: { type: "string" } },
        required: ["client_name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_income_expense_summary",
      description: "Receitas e despesas do período, com as maiores categorias de despesa.",
      parameters: { type: "object", properties: { period: periodParam }, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "list_sales",
      description: "Vendas de produtos no período, com total faturado.",
      parameters: { type: "object", properties: { period: periodParam }, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_goals_progress",
      description: "Metas mensais do usuário e progresso frente aos agregados oficiais.",
      parameters: { type: "object", properties: { period: periodParam }, additionalProperties: false },
    },
  },
] as const;

/* ---------------------------------------------------------------------------
 * Executores
 * ------------------------------------------------------------------------- */

type ToolResult = Record<string, unknown>;

export async function executeTool(name: string, args: any, ctx: ToolContext): Promise<ToolResult> {
  const period = resolvePeriod(args?.period ?? null, ctx.todayIso);

  switch (name) {
    case "get_financial_overview": {
      const rows = await loadLoansAndPayments(ctx);
      const agg = aggregatesFor(ctx, rows, period);
      return {
        periodo: period.label,
        contratos: {
          total: agg.contractsTotal,
          ativos: agg.contractsActive,
          quitados: agg.contractsPaid,
          vencidos: agg.contractsOverdue,
          iniciados_no_periodo: agg.contractsStartedInPeriod,
        },
        capital_ativo: formatBRL(agg.principalRemaining),
        total_a_receber: formatBRL(agg.totalReceivable),
        composicao_total_a_receber: {
          capital_ativo: formatBRL(agg.principalRemaining),
          juros_pendentes: formatBRL(agg.contractualInterestRemaining),
          multa_pendente: formatBRL(agg.penaltyPending),
          juros_atraso_pendentes: formatBRL(agg.lateInterestPending),
          formula:
            "total_a_receber = capital_ativo + juros_pendentes + multa_pendente + juros_atraso_pendentes",
        },
        juros_pendentes: formatBRL(agg.contractualInterestRemaining),
        multa_pendente: formatBRL(agg.penaltyPending),
        juros_atraso_pendentes: formatBRL(agg.lateInterestPending),
        valor_vencido: formatBRL(agg.overdueAmount),
        observacao_valor_vencido:
          "valor_vencido é um recorte do total a receber (parcelas já vencidas) e NÃO deve ser somado à composição acima.",

        recebido_no_periodo: {
          total: formatBRL(agg.receivedInPeriod.total),
          principal: formatBRL(agg.receivedInPeriod.principal),
          juros: formatBRL(agg.receivedInPeriod.interest),
          multa: formatBRL(agg.receivedInPeriod.penalty),
          juros_atraso: formatBRL(agg.receivedInPeriod.lateInterest),
          pagamentos: agg.receivedInPeriod.count,
        },
        lucro_realizado_no_periodo: formatBRL(agg.realizedProfitInPeriod),
        versao_calculo: agg.calculationVersion,
      };
    }

    case "list_loans": {
      const rows = await loadLoansAndPayments(ctx);
      const names = await clientNameMap(ctx);
      const limit = Math.min(Math.max(num(args?.limit) || 20, 1), 50);
      const wanted = String(args?.status ?? "").trim().toLowerCase();
      const clientFilter = String(args?.client_name ?? "").trim().toLowerCase();

      const list = rows.loanRows
        .filter((l) => (wanted ? String(l.status ?? "").toLowerCase() === wanted : true))
        .filter((l) =>
          clientFilter ? loanClientName(l, names).toLowerCase().includes(clientFilter) : true,
        )
        .slice(0, limit)
        .map((l) => {
          const paid = rows.paymentRows
            .filter((p) => String(p.loan_id) === String(l.id))
            .reduce((acc, p) => acc + num(p.amount), 0);
          return {
            id: String(l.id),
            cliente: loanClientName(l, names),
            valor_emprestado: formatBRL(num(l.amount)),
            taxa_mensal: `${num(l.interest_rate)}%`,
            parcelas: num(l.installments) || 1,
            status: l.status,
            vencimento: pickDate(l),
            total_pago: formatBRL(paid),
          };
        });

      return { periodo: "todos os contratos", quantidade: list.length, contratos: list };
    }

    case "get_loan_details": {
      const rows = await loadLoansAndPayments(ctx);
      const names = await clientNameMap(ctx);
      const id = String(args?.loan_id ?? "").trim();
      const clientFilter = String(args?.client_name ?? "").trim().toLowerCase();
      const loan = rows.loanRows.find((l) =>
        id
          ? String(l.id) === id
          : clientFilter && loanClientName(l, names).toLowerCase().includes(clientFilter),
      );
      if (!loan) return { encontrado: false, motivo: "Nenhum contrato correspondente ao filtro informado." };

      const payments = rows.paymentRows
        .filter((p) => String(p.loan_id) === String(loan.id))
        .sort((a, b) => pickDate(a).localeCompare(pickDate(b)));
      const agg = aggregatesFor(
        ctx,
        { loanRows: [loan], paymentRows: payments },
        resolvePeriod("ano", ctx.todayIso),
      );

      return {
        encontrado: true,
        id: String(loan.id),
        cliente: loanClientName(loan, names),
        valor_emprestado: formatBRL(num(loan.amount)),
        taxa_mensal: `${num(loan.interest_rate)}%`,
        parcelas: num(loan.installments) || 1,
        status: loan.status,
        vencimento: pickDate(loan),
        principal_restante: formatBRL(agg.principalRemaining),
        juros_restantes: formatBRL(agg.contractualInterestRemaining),
        saldo_total_a_receber: formatBRL(agg.totalReceivable),
        pagamentos: payments.map((p) => ({ data: pickDate(p), valor: formatBRL(num(p.amount)) })),
      };
    }

    case "list_overdue": {
      const rows = await loadLoansAndPayments(ctx);
      const names = await clientNameMap(ctx);
      const limit = Math.min(Math.max(num(args?.limit) || 20, 1), 50);
      const today = ctx.todayIso;

      const overdue = rows.loanRows
        .filter((l) => !["paid", "completed"].includes(String(l.status ?? "").toLowerCase()))
        .filter((l) => {
          const due = String(l.due_date ?? "").slice(0, 10);
          return due && due < today;
        })
        .map((l) => {
          const due = String(l.due_date ?? "").slice(0, 10);
          const dias = Math.max(
            0,
            Math.floor(
              (new Date(`${today}T00:00:00`).getTime() - new Date(`${due}T00:00:00`).getTime()) / 86_400_000,
            ),
          );
          const single = aggregatesFor(
            ctx,
            { loanRows: [l], paymentRows: rows.paymentRows.filter((p) => String(p.loan_id) === String(l.id)) },
            resolvePeriod("ano", ctx.todayIso),
          );
          const parcelaVencida = rows.installmentRows.find(
            (i) => String(i.loan_id) === String(l.id) && String(i.due_date ?? "").slice(0, 10) === due,
          );
          return {
            id: String(l.id),
            cliente: loanClientName(l, names),
            vencimento: due,
            dias_atraso: dias,
            valor_emprestado: formatBRL(num(l.amount)),
            parcela_vencida: parcelaVencida ? formatBRL(num(parcelaVencida.amount)) : null,
            saldo_devedor: formatBRL(single.overdueAmount),
            multa_pendente: formatBRL(single.penaltyPending ?? 0),
            juros_atraso_pendentes: formatBRL(single.lateInterestPending ?? 0),
            total_em_aberto: formatBRL(single.totalReceivable),
          };
        })
        .sort((a, b) => b.dias_atraso - a.dias_atraso)
        .slice(0, limit);

      return {
        referencia: today,
        quantidade: overdue.length,
        observacao:
          "vencimento = data da primeira parcela em aberto (mesma regra do app). total_em_aberto = saldo_devedor + multa_pendente + juros_atraso_pendentes; parcela_vencida é apenas o valor daquela parcela.",
        contratos_vencidos: overdue,
      };
    }

    case "get_client_summary": {
      const filter = String(args?.client_name ?? "").trim().toLowerCase();
      const names = await clientNameMap(ctx);
      const matches = [...names.entries()].filter(([, name]) => name.toLowerCase().includes(filter));
      if (matches.length === 0) return { encontrado: false, motivo: "Nenhum cliente com esse nome." };

      const rows = await loadLoansAndPayments(ctx);
      const ids = new Set(matches.map(([id]) => id));
      const loanRows = rows.loanRows.filter(
        (l) =>
          ids.has(String(l.borrower_id ?? l.client_id)) ||
          loanClientName(l, names).toLowerCase().includes(filter),
      );
      const loanIds = new Set(loanRows.map((l) => String(l.id)));
      const paymentRows = rows.paymentRows.filter((p) => loanIds.has(String(p.loan_id)));
      const agg = aggregatesFor(ctx, { loanRows, paymentRows }, resolvePeriod("ano", ctx.todayIso));

      return {
        encontrado: true,
        clientes: matches.map(([, name]) => name),
        contratos: loanRows.length,
        contratos_ativos: agg.contractsActive,
        total_emprestado: formatBRL(agg.principalLentActive),
        principal_restante: formatBRL(agg.principalRemaining),
        total_recebido: formatBRL(agg.receivedAllTime.total),
        saldo_a_receber: formatBRL(agg.totalReceivable),
      };
    }

    case "get_income_expense_summary": {
      const [{ data: incomes }, { data: expenses }] = await Promise.all([
        ctx.client
          .from("incomes")
          .select("*")
          .eq("user_id", ctx.ownerId)
          .gte("received_date", period.startIso)
          .lte("received_date", period.endIso),
        ctx.client
          .from("expenses")
          .select("*")
          .eq("user_id", ctx.ownerId)
          .gte("due_date", period.startIso)
          .lte("due_date", period.endIso),
      ]);

      const incomeRows = incomes ?? [];
      const expenseRows = (expenses ?? []).filter(
        (e: any) => String(e.type ?? e.category ?? "") !== "credit_card_invoice_payment",
      );
      const totalIncome = sumBy(incomeRows, ["amount", "value"]);
      const totalExpense = sumBy(expenseRows, ["amount", "value"]);

      const byCategory = new Map<string, number>();
      for (const e of expenseRows) {
        const key = String(e.category ?? e.description ?? "Sem categoria");
        byCategory.set(key, (byCategory.get(key) ?? 0) + num(e.amount ?? e.value));
      }
      const top = [...byCategory.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([categoria, valor]) => ({ categoria, valor: formatBRL(valor) }));

      return {
        periodo: period.label,
        receitas: formatBRL(totalIncome),
        despesas: formatBRL(totalExpense),
        resultado: formatBRL(totalIncome - totalExpense),
        lancamentos: { receitas: incomeRows.length, despesas: expenseRows.length },
        maiores_categorias_de_despesa: top,
      };
    }

    case "list_sales": {
      const { data } = await ctx.client.from("sales").select("*").eq("user_id", ctx.ownerId);
      const rows = (data ?? []).filter((s: any) => {
        const d = pickDate(s);
        return d >= period.startIso && d <= period.endIso;
      });
      const total = sumBy(rows, ["total", "total_amount", "amount", "value"]);
      return {
        periodo: period.label,
        quantidade: rows.length,
        total_faturado: formatBRL(total),
        vendas: rows.slice(0, 20).map((s: any) => ({
          data: pickDate(s),
          descricao: String(s.product_name ?? s.description ?? "—"),
          valor: formatBRL(num(s.total ?? s.total_amount ?? s.amount ?? s.value)),
        })),
      };
    }

    case "get_goals_progress": {
      const { data } = await ctx.client.from("monthly_goals").select("*").eq("user_id", ctx.ownerId);
      const rows = data ?? [];
      const rowsInPeriod = rows.filter((g: any) => {
        const ref = String(g.month ?? g.reference_month ?? pickDate(g)).slice(0, 7);
        return !ref || (ref >= period.startIso.slice(0, 7) && ref <= period.endIso.slice(0, 7));
      });
      if (rowsInPeriod.length === 0) return { periodo: period.label, encontrado: false, motivo: "Nenhuma meta cadastrada no período." };

      const loans = await loadLoansAndPayments(ctx);
      const agg = aggregatesFor(ctx, loans, period);
      return {
        periodo: period.label,
        encontrado: true,
        metas: rowsInPeriod,
        realizado_no_periodo: {
          recebido: formatBRL(agg.receivedInPeriod.total),
          lucro_realizado: formatBRL(agg.realizedProfitInPeriod),
          contratos_iniciados: agg.contractsStartedInPeriod,
          principal_emprestado: formatBRL(agg.principalLentInPeriod),
        },
      };
    }

    default:
      return { erro: `Tool desconhecida: ${name}` };
  }
}
