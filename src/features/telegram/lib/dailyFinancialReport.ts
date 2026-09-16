/**
 * Módulo de geração e formatação do Relatório Financeiro Diário do EmprestAI para o Telegram.
 * Consolida as movimentações registradas no dia atual (fuso America/Sao_Paulo) nos 6 módulos:
 * - Receitas: Financeiro, Vendas, Veículos
 * - Despesas: Despesas Pessoais, Despesas Empresariais, Despesas de Veículos
 */

import { getCardInvoiceTotalsForMonth } from "@/features/creditCards/lib/creditCardInvoiceTotals";

export interface MovementItem {
  description: string;
  amount: number;
}

export interface ModuleSection {
  name: string;
  items: MovementItem[];
  subtotal: number;
}

export interface DailyFinancialReportData {
  date: string; // YYYY-MM-DD
  formattedDate: string; // DD/MM/YYYY
  incomes: {
    financial: ModuleSection;
    sales: ModuleSection;
    vehicles: ModuleSection;
    total: number;
  };
  expenses: {
    personal: ModuleSection;
    business: ModuleSection;
    vehicles: ModuleSection;
    total: number;
  };
  balance: number;
  hasMovements: boolean;
}

export function fmtBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

export function fmtDateBR(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

export function isVehicleExpenseCategory(category?: string | null): boolean {
  if (!category) return false;
  const vehicleExpenseCategories = [
    "Manutenção", "Seguro", "IPVA", "Multas",
    "Lavagem", "Estacionamento", "Pneus", "Documentação", "Peças",
    "Guincho", "Financiamento", "Outros (Veículo)",
  ];
  const normalized = category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return vehicleExpenseCategories.some(
    (c) => c.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() === normalized
  );
}

export function isFuelExpense(expense: { category?: string | null; description?: string | null; notes?: string | null }): boolean {
  const text = `${expense.category ?? ""} ${expense.description ?? ""} ${expense.notes ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return /\b(combustivel|gasolina|etanol|alcool|diesel|posto|abastec)/i.test(text);
}

export function isVehicleExpense(expense: { category?: string | null; description?: string | null; notes?: string | null }): boolean {
  return isVehicleExpenseCategory(expense.category) && !isFuelExpense(expense);
}

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function parseArrayField<T = any>(val: any): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return [];
      }
    }
  }
  return [];
}

export function normalizeToIsoDate(d: any): string {
  if (!d) return "";
  const s = String(d).trim();
  if (!s) return "";
  const brMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, "0");
    const month = brMatch[2].padStart(2, "0");
    const year = brMatch[3];
    return `${year}-${month}-${day}`;
  }
  const isoMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, "0");
    const day = isoMatch[3].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return s.slice(0, 10);
}

function addByFrequencyDate(dateStr: string, frequency: string | undefined | null, n: number): string {
  const normalized = normalizeToIsoDate(dateStr);
  if (!normalized) return "";
  if (n === 0) return normalized;

  const [y, m, d] = normalized.split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(y, m - 1, d);

  const freq = (frequency || "Mensal").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  if (freq.includes("diar") || freq.includes("daily")) {
    dt.setDate(dt.getDate() + n);
  } else if (freq.includes("seman") || freq.includes("weekly")) {
    dt.setDate(dt.getDate() + n * 7);
  } else if (freq.includes("quinzen")) {
    dt.setDate(dt.getDate() + n * 15);
  } else {
    // Mensal
    dt.setMonth(dt.getMonth() + n);
  }

  const yr = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, "0");
  const dy = String(dt.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${dy}`;
}

export function getSaleInstallmentDueDate(
  baseDate: string,
  frequency: string | undefined | null,
  index: number,
  installmentDates?: any
): string {
  const dates = parseArrayField<string>(installmentDates);
  if (dates && dates[index]) {
    return normalizeToIsoDate(dates[index]);
  }
  const normalizedBase = normalizeToIsoDate(baseDate);
  return addByFrequencyDate(normalizedBase, frequency, index);
}

export function isVehicleSale(sale: any): boolean {
  const bType = String(sale.business_type || sale.businessType || "").toLowerCase();
  if (bType === "aluguel_veiculo" || bType === "veiculo" || bType === "veiculos" || bType === "veículo" || bType === "veículos") {
    return true;
  }
  if (sale.locador_id || sale.locadorId) {
    return true;
  }
  const category = String(sale.category || "").toLowerCase();
  if (category.includes("veículo") || category.includes("veiculo")) {
    return true;
  }
  const desc = String(sale.description || sale.product_name || sale.productName || "").toLowerCase();
  return desc.includes("aluguel de veículo") || desc.includes("aluguel veiculo") || desc.includes("locação veículo") || desc.includes("locacao veiculo") || desc.includes("aluguel de carro") || desc.includes("locação de carro");
}

/**
 * Filtra e constrói a estrutura consolidada do relatório a partir dos dados brutos dos módulos.
 */
export function buildDailyFinancialData(params: {
  date: string; // YYYY-MM-DD
  incomes: any[];
  sales: any[];
  expenses: any[];
}): DailyFinancialReportData {
  const date = normalizeToIsoDate(params.date);
  const { incomes = [], sales = [], expenses = [] } = params;

  // 1. Receitas - Financeiro
  const financialItems: MovementItem[] = [];
  for (const inc of incomes) {
    const recDate = normalizeToIsoDate(inc.actual_received_date || inc.actualReceivedDate || inc.received_date || inc.receivedDate || inc.date || inc.created_at);
    if (recDate === date) {
      const incInstCount = Number(inc.installments) || 1;
      const isParentInst = incInstCount > 1 && !inc.parent_id && !inc.parentId;
      const val = isParentInst ? (Number(inc.amount) || 0) / incInstCount : (Number(inc.amount) || 0);
      if (val > 0) {
        financialItems.push({
          description: inc.description || "Receita Financeiro",
          amount: round2(val),
        });
      }
    }
  }

  // 2. Receitas - Vendas & 3. Receitas - Veículos
  const salesItems: MovementItem[] = [];
  const vehicleIncomeItems: MovementItem[] = [];

  for (const sale of sales) {
    const isVehicle = isVehicleSale(sale);
    const history = parseArrayField<any>(sale.payment_history || sale.paymentHistory);
    const client = sale.customer_name || sale.customerName || sale.customer || "";
    const saleDate = normalizeToIsoDate(sale.sale_date || sale.saleDate || sale.date || sale.created_at);
    const instCount = Math.max(1, Number(sale.installments) || 1);
    const paidCount = Math.max(0, Number(sale.paid_installments ?? sale.paidInstallments) || 0);
    const instVal = Number(sale.installment_value || sale.installmentValue) || 0;
    const total = Number(sale.total) || 0;
    const down = Number(sale.down_payment || sale.downPayment) || 0;
    const partialPaid = Number(sale.partial_paid ?? sale.partialPaid) || 0;
    const customDates = sale.installment_dates || sale.installmentDates;
    const customAmounts = parseArrayField<number>(sale.installment_amounts || sale.installmentAmounts);
    const freq = sale.frequency || "Mensal";
    const defaultTypeDesc = isVehicle ? "Aluguel Veículo" : "Venda";

    // 1. Pagamentos recebidos hoje registrados no histórico
    for (const pay of history) {
      const payDate = normalizeToIsoDate(pay?.date);
      if (payDate === date) {
        const val = Number(pay?.amount) || 0;
        if (val > 0) {
          const desc = client ? `${client} — ${sale.description || defaultTypeDesc}` : (sale.description || defaultTypeDesc);
          if (isVehicle) {
            vehicleIncomeItems.push({ description: desc, amount: round2(val) });
          } else {
            salesItems.push({ description: desc, amount: round2(val) });
          }
        }
      }
    }

    // 2. Parcelas a receber com vencimento no dia
    for (let i = 0; i < instCount; i++) {
      const installmentNum = i + 1;
      const dueDate = getSaleInstallmentDueDate(saleDate, freq, i, customDates);
      if (dueDate === date) {
        // Verifica se a parcela ainda está a receber/pendente
        const isPending = installmentNum > paidCount;
        if (isPending) {
          let val = 0;
          if (customAmounts && customAmounts[i] != null && Number(customAmounts[i]) > 0) {
            val = Number(customAmounts[i]);
          } else if (instVal > 0) {
            val = instVal;
          } else if (instCount > 1) {
            val = (total - down > 0 ? (total - down) / instCount : total / instCount);
          } else {
            val = total;
          }

          // Se for a próxima parcela a receber e houver pagamento parcial registrado
          if (installmentNum === paidCount + 1 && partialPaid > 0) {
            val = Math.max(0, val - partialPaid);
          }

          if (val > 0) {
            const baseDesc = sale.description || sale.product_name || sale.productName || defaultTypeDesc;
            const installmentLabel = instCount > 1 ? ` — Parcela ${installmentNum}/${instCount}` : "";
            const desc = client ? `${client} — ${baseDesc}${installmentLabel}` : `${baseDesc}${installmentLabel}`;
            if (isVehicle) {
              vehicleIncomeItems.push({ description: desc, amount: round2(val) });
            } else {
              salesItems.push({ description: desc, amount: round2(val) });
            }
          }
        }
      }
    }
  }

  // 4. Despesas Pessoais, 5. Despesas Empresariais & 6. Despesas de Veículos
  const personalExpenseItems: MovementItem[] = [];
  const businessExpenseItems: MovementItem[] = [];
  const vehicleExpenseItems: MovementItem[] = [];

  for (const exp of expenses) {
    const paidDate = exp.paid_date || exp.paidDate;
    const dueDate = exp.due_date || exp.dueDate;
    const createdAt = exp.created_at ? String(exp.created_at).slice(0, 10) : "";
    
    // Corresponde ao dia se paid_date for o dia, ou se due_date for o dia, ou createdAt
    const matchesDate = (paidDate && String(paidDate).slice(0, 10) === date) ||
      (dueDate && String(dueDate).slice(0, 10) === date) ||
      (!paidDate && !dueDate && createdAt === date);

    if (matchesDate) {
      // Se a despesa for compra em cartão de crédito, não entra avulsa nas despesas diretas,
      // pois seu valor é consolidado na Fatura do Cartão (trazendo estritamente o saldo pendente).
      const notes = (exp.notes || "").toLowerCase();
      const isCardExp = notes.includes("[crédito]") || notes.includes("[credito]");
      if (isCardExp) {
        continue;
      }

      const installments = Number(exp.installments) || 1;
      const isParentParceladaOrRecurring = installments > 1 && !exp.parent_expense_id && !exp.parentExpenseId;
      const rawAmount = Number(exp.amount) || 0;
      const val = isParentParceladaOrRecurring ? rawAmount / installments : rawAmount;

      if (val > 0) {
        const desc = exp.description || "Despesa";
        const isVeh = isVehicleExpense(exp);

        if (isVeh) {
          vehicleExpenseItems.push({ description: desc, amount: round2(val) });
        } else {
          const scope = exp.scope || "business";
          if (scope === "personal") {
            personalExpenseItems.push({ description: desc, amount: round2(val) });
          } else {
            businessExpenseItems.push({ description: desc, amount: round2(val) });
          }
        }
      }
    }
  }

  // 7. Faturas dos Cartões de Crédito (apenas no dia do vencimento e com saldo pendente)
  const rawOpenings = (params as any).openings || [];
  const rawCards = ((params as any).creditCards || (params as any).cards || []).filter((c: any) => c.active !== false);
  const targetDay = Number(date.split("-")[2]) || 0;
  const targetMonth = date.slice(0, 7);

  const normalizedCards = rawCards.map((c: any) => ({
    id: String(c.id),
    userId: c.user_id || c.userId || "",
    nickname: c.nickname || "",
    bank: c.bank || "",
    lastFour: c.last_four || c.lastFour || "",
    closingDay: Number(c.closing_day || c.closingDay) || 1,
    dueDay: Number(c.due_day || c.dueDay) || 0,
    color: c.color || "",
    limitAmount: Number(c.limit_amount || c.limitAmount) || 0,
    active: c.active !== false,
    createdAt: c.created_at || c.createdAt || "",
    updatedAt: c.updated_at || c.updatedAt || "",
  }));

  const normalizedOpenings = rawOpenings.map((o: any) => ({
    id: String(o.id || ""),
    userId: o.user_id || o.userId || "",
    cardId: String(o.card_id || o.cardId || ""),
    cycleKey: String(o.cycle_key || o.cycleKey || ""),
    openingAmount: Number(o.opening_amount || o.openingAmount) || 0,
    notes: o.notes || "",
    createdAt: o.created_at || o.createdAt || "",
    updatedAt: o.updated_at || o.updatedAt || "",
  }));

  const normalizedExpenses = expenses.map((e: any) => ({
    id: String(e.id || ""),
    userId: e.user_id || e.userId || "",
    description: e.description || "",
    amount: Number(e.amount) || 0,
    category: e.category || "",
    dueDate: String(e.due_date || e.dueDate || e.paid_date || e.paidDate || e.created_at || date).slice(0, 10),
    paidDate: e.paid_date || e.paidDate || undefined,
    paid: !!e.paid,
    scope: (e.scope || "personal") as "personal" | "business",
    type: (e.type || "fixa") as any,
    notes: e.notes || "",
    installments: e.installments ? Number(e.installments) : undefined,
    paidInstallments: e.paid_installments != null ? Number(e.paid_installments) : (e.paidInstallments != null ? Number(e.paidInstallments) : undefined),
    parentExpenseId: e.parent_expense_id || e.parentExpenseId || undefined,
    paymentMethodId: e.payment_method_id || e.paymentMethodId || undefined,
    recurrenceType: e.recurrence_type || e.recurrenceType || undefined,
    createdAt: e.created_at || e.createdAt || "",
    updatedAt: e.updated_at || e.updatedAt || "",
  }));

  const invoiceTotals = getCardInvoiceTotalsForMonth(normalizedExpenses, normalizedCards, normalizedOpenings, targetMonth);

  for (const card of normalizedCards) {
    if (card.active === false) continue;
    if (card.dueDay !== targetDay) continue;

    const inv = invoiceTotals.find((t) => t.card.id === card.id);
    const remaining = inv ? Math.max(0, Number((inv.total - inv.paidTotal).toFixed(2))) : 0;

    if (remaining > 0) {
      const cardLabel = card.nickname || card.bank ? `Fatura ${card.nickname || card.bank}` : "Fatura Cartão de Crédito";
      personalExpenseItems.push({
        description: cardLabel,
        amount: remaining,
      });
    }
  }

  // Cálculos de subtotais e totais
  const sumItems = (items: MovementItem[]) => round2(items.reduce((s, i) => s + i.amount, 0));

  const financialSubtotal = sumItems(financialItems);
  const salesSubtotal = sumItems(salesItems);
  const vehicleIncomeSubtotal = sumItems(vehicleIncomeItems);
  const totalIncomes = round2(financialSubtotal + salesSubtotal + vehicleIncomeSubtotal);

  const personalSubtotal = sumItems(personalExpenseItems);
  const businessSubtotal = sumItems(businessExpenseItems);
  const vehicleExpenseSubtotal = sumItems(vehicleExpenseItems);
  const totalExpenses = round2(personalSubtotal + businessSubtotal + vehicleExpenseSubtotal);

  const balance = round2(totalIncomes - totalExpenses);
  const hasMovements = totalIncomes > 0 || totalExpenses > 0;

  return {
    date,
    formattedDate: fmtDateBR(date),
    incomes: {
      financial: { name: "Financeiro", items: financialItems, subtotal: financialSubtotal },
      sales: { name: "Vendas", items: salesItems, subtotal: salesSubtotal },
      vehicles: { name: "Veículos", items: vehicleIncomeItems, subtotal: vehicleIncomeSubtotal },
      total: totalIncomes,
    },
    expenses: {
      personal: { name: "Pessoais", items: personalExpenseItems, subtotal: personalSubtotal },
      business: { name: "Empresariais", items: businessExpenseItems, subtotal: businessSubtotal },
      vehicles: { name: "Veículos", items: vehicleExpenseItems, subtotal: vehicleExpenseSubtotal },
      total: totalExpenses,
    },
    balance,
    hasMovements,
  };
}

/**
 * Formata o relatório para envio no Telegram em Markdown conforme a estrutura solicitada.
 */
export function formatDailyFinancialReportTelegram(report: DailyFinancialReportData): string {
  const lines: string[] = [];

  lines.push(`📊 *RELATÓRIO FINANCEIRO DO DIA — ${report.formattedDate}*`);

  if (!report.hasMovements) {
    lines.push("");
    lines.push("_Nenhuma movimentação registrada no dia de hoje._");
    return lines.join("\n");
  }

  // RECEITAS
  const activeIncomeModules: ModuleSection[] = [
    report.incomes.financial,
    report.incomes.sales,
    report.incomes.vehicles,
  ].filter((m) => m.items.length > 0 && m.subtotal > 0);

  if (activeIncomeModules.length > 0) {
    lines.push("");
    lines.push("💰 *RECEITAS*");

    for (const mod of activeIncomeModules) {
      lines.push("");
      lines.push(`*${mod.name}*`);
      for (const item of mod.items) {
        lines.push(`• ${item.description} — ${fmtBRL(item.amount)}`);
      }
      lines.push(`Subtotal: *${fmtBRL(mod.subtotal)}*`);
    }
  }

  // DESPESAS
  const activeExpenseModules: ModuleSection[] = [
    report.expenses.personal,
    report.expenses.business,
    report.expenses.vehicles,
  ].filter((m) => m.items.length > 0 && m.subtotal > 0);

  if (activeExpenseModules.length > 0) {
    lines.push("");
    lines.push("💸 *DESPESAS*");

    for (const mod of activeExpenseModules) {
      lines.push("");
      lines.push(`*${mod.name}*`);
      for (const item of mod.items) {
        lines.push(`• ${item.description} — ${fmtBRL(item.amount)}`);
      }
      lines.push(`Subtotal: *${fmtBRL(mod.subtotal)}*`);
    }
  }

  // RESUMO DO DIA
  lines.push("");
  lines.push("📌 *RESUMO DO DIA*");
  lines.push(`Receitas: *${fmtBRL(report.incomes.total)}*`);
  lines.push(`Despesas: *${fmtBRL(report.expenses.total)}*`);
  lines.push(`Saldo: *${fmtBRL(report.balance)}*`);

  return lines.join("\n");
}

export async function buildDailyFinancialReport(opts?: { ownerId?: string; date?: string }): Promise<string> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { todayInAppTz } = await import("@/lib/timezone");
  const targetDate = opts?.date || todayInAppTz();

  let incomesQuery = supabase
    .from("incomes")
    .select("description, amount, category, source, status, received_date, actual_received_date, created_at, recurrence, parent_id");
  let salesQuery = supabase
    .from("sales")
    .select("customer_name, description, total, sale_date, created_at, business_type, payment_history, paid_installments, partial_paid, installments, installment_value, down_payment, frequency, installment_dates, installment_amounts, locador_id, category, notes, payment_mode");
  let expensesQuery = supabase
    .from("expenses")
    .select("description, amount, scope, category, notes, paid, paid_date, due_date, created_at, installments, type, parent_expense_id");
  let ledgerQuery = supabase
    .from("account_ledger")
    .select("amount, occurred_on, description, metadata, category")
    .eq("category", "expense");
  let cardsQuery = supabase
    .from("credit_cards")
    .select("id, nickname, bank, last_four, closing_day, due_day, active");
  let openingsQuery = supabase
    .from("credit_card_invoice_openings")
    .select("card_id, cycle_key, opening_amount, notes");

  if (opts?.ownerId) {
    incomesQuery = incomesQuery.eq("user_id", opts.ownerId);
    salesQuery = salesQuery.eq("user_id", opts.ownerId);
    expensesQuery = expensesQuery.eq("user_id", opts.ownerId);
    ledgerQuery = ledgerQuery.eq("user_id", opts.ownerId);
    cardsQuery = cardsQuery.eq("user_id", opts.ownerId);
    openingsQuery = openingsQuery.eq("user_id", opts.ownerId);
  }

  const [incomesRes, salesRes, expensesRes, ledgerRes, cardsRes, openingsRes] = await Promise.all([
    incomesQuery,
    salesQuery,
    expensesQuery,
    ledgerQuery,
    cardsQuery,
    openingsQuery,
  ]);

  const reportData = buildDailyFinancialData({
    date: targetDate,
    incomes: (incomesRes.data ?? []) as any[],
    sales: (salesRes.data ?? []) as any[],
    expenses: (expensesRes.data ?? []) as any[],
    ledgerRows: (ledgerRes.data ?? []) as any[],
    creditCards: (cardsRes.data ?? []) as any[],
    openings: (openingsRes.data ?? []) as any[],
  } as any);

  return formatDailyFinancialReportTelegram(reportData);
}

