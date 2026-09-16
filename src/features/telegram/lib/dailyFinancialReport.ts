/**
 * Módulo de geração e formatação do Relatório Financeiro Diário do EmprestAI para o Telegram.
 * Consolida as movimentações registradas no dia atual (fuso America/Sao_Paulo) nos 6 módulos:
 * - Receitas: Financeiro, Vendas, Veículos
 * - Despesas: Despesas Pessoais, Despesas Empresariais, Despesas de Veículos
 */

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

/**
 * Filtra e constrói a estrutura consolidada do relatório a partir dos dados brutos dos módulos.
 */
export function buildDailyFinancialData(params: {
  date: string; // YYYY-MM-DD
  incomes: any[];
  sales: any[];
  expenses: any[];
}): DailyFinancialReportData {
  const { date, incomes = [], sales = [], expenses = [] } = params;

  // 1. Receitas - Financeiro
  const financialItems: MovementItem[] = [];
  for (const inc of incomes) {
    const recDate = (inc.actual_received_date || inc.actualReceivedDate || inc.received_date || inc.receivedDate || (inc.created_at ? String(inc.created_at).slice(0, 10) : "")).slice(0, 10);
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
    const isVehicle = (sale.business_type || sale.businessType) === "aluguel_veiculo";
    const history = (Array.isArray(sale.payment_history) ? sale.payment_history : (Array.isArray(sale.paymentHistory) ? sale.paymentHistory : [])) as any[];
    const client = sale.customer_name || sale.customerName || "";

    let hasHistoryPayment = false;
    for (const pay of history) {
      const payDate = (pay.date || "").slice(0, 10);
      if (payDate === date) {
        const val = Number(pay.amount) || 0;
        if (val > 0) {
          hasHistoryPayment = true;
          const desc = client ? `${client} — ${sale.description || (isVehicle ? "Aluguel Veículo" : "Venda")}` : (sale.description || (isVehicle ? "Aluguel Veículo" : "Venda"));
          if (isVehicle) {
            vehicleIncomeItems.push({ description: desc, amount: round2(val) });
          } else {
            salesItems.push({ description: desc, amount: round2(val) });
          }
        }
      }
    }

    // Se não teve pagamento no histórico na data, verifica se a data da venda/aluguel corresponde ao dia
    if (!hasHistoryPayment) {
      const saleDate = (sale.sale_date || sale.saleDate || (sale.created_at ? String(sale.created_at).slice(0, 10) : "")).slice(0, 10);
      if (saleDate === date) {
        const instCount = Number(sale.installments) || 1;
        const instVal = Number(sale.installment_value || sale.installmentValue) || 0;
        const total = Number(sale.total) || 0;
        const down = Number(sale.down_payment || sale.downPayment) || 0;

        let val = 0;
        if (instVal > 0) {
          val = instVal;
        } else if (instCount > 1) {
          val = (total - down > 0 ? (total - down) / instCount : total / instCount);
        } else {
          val = total || Number(sale.partial_paid || sale.partialPaid) || 0;
        }

        if (val > 0) {
          const desc = client ? `${client} — ${sale.description || (isVehicle ? "Aluguel Veículo" : "Venda")}` : (sale.description || (isVehicle ? "Aluguel Veículo" : "Venda"));
          if (isVehicle) {
            vehicleIncomeItems.push({ description: desc, amount: round2(val) });
          } else {
            salesItems.push({ description: desc, amount: round2(val) });
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

  // 7. Faturas dos Cartões de Crédito (apenas valor pendente / restante da fatura)
  const openings = (params as any).openings || [];
  const cards = (params as any).creditCards || (params as any).cards || [];
  const targetDay = Number(date.split("-")[2]) || 0;
  const targetMonth = date.slice(0, 7);
  const processedCardIds = new Set<string>();

  for (const card of cards) {
    if (card.active === false) continue;
    if (processedCardIds.has(String(card.id))) continue;

    const dueDay = Number(card.due_day || card.dueDay) || 0;
    const isDueToday = dueDay === targetDay;

    // Busca opening do ciclo do mês
    const op = openings.find((o: any) => {
      const cId = o.card_id || o.cardId;
      const cKey = o.cycle_key || o.cycleKey || "";
      return String(cId) === String(card.id) && String(cKey).startsWith(targetMonth);
    }) || openings.find((o: any) => String(o.card_id || o.cardId) === String(card.id));

    const notes = op?.notes || "";
    const paidMatch = /\[PAID_DATE:(\d{4}-\d{2}-\d{2})\]/i.exec(notes);
    const isOpeningPaid = /\[PAGA\]/i.test(notes) || !!paidMatch;

    if (isDueToday) {
      const paidValMatch = /\[PAID:([0-9]+(?:\.[0-9]+)?)\]/i.exec(notes);
      const totalValMatch = /\[TOTAL:([0-9]+(?:\.[0-9]+)?)\]/i.exec(notes);
      
      // Soma itens de despesas associadas a este cartão no ciclo
      const cardTag = (card.nickname || card.bank || "").trim().toLowerCase();
      const lastFour = String(card.last_four || card.lastFour || "").trim().toLowerCase();

      const cardExpenses = expenses.filter((e) => {
        const eNotes = (e.notes || "").toLowerCase();
        const eCat = (e.category || "").toLowerCase();
        const isCard = eNotes.includes("[crédito]") || eNotes.includes("[credito]") || eCat.includes("cartão") || eCat.includes("cartao");
        if (!isCard) return false;

        if (cards.length === 1) return true;
        const matchesTag = cardTag.length > 0 && eNotes.includes(cardTag);
        const matchesLastFour = lastFour.length > 0 && eNotes.includes(lastFour);
        return matchesTag || matchesLastFour;
      });

      const cardItemsTotal = cardExpenses.reduce((s, e) => {
        const inst = Number(e.installments) || 1;
        const val = inst > 1 && !e.parent_expense_id && !e.parentExpenseId ? (Number(e.amount) || 0) / inst : (Number(e.amount) || 0);
        return s + val;
      }, 0);

      const cardItemsPaid = cardExpenses
        .filter((e) => e.paid)
        .reduce((s, e) => {
          const inst = Number(e.installments) || 1;
          const val = inst > 1 && !e.parent_expense_id && !e.parentExpenseId ? (Number(e.amount) || 0) / inst : (Number(e.amount) || 0);
          return s + val;
        }, 0);

      const opAmount = Number(op?.opening_amount || op?.openingAmount) || 0;
      const totalInvoice = totalValMatch ? Number(totalValMatch[1]) : (cardItemsTotal + opAmount);
      const paidInvoice = paidValMatch ? Number(paidValMatch[1]) : (cardItemsPaid + (isOpeningPaid ? opAmount : 0));
      
      // Valor estritamente PENDENTE da fatura
      const pendingInvoice = round2(Math.max(0, totalInvoice - paidInvoice));

      processedCardIds.add(String(card.id));

      if (pendingInvoice > 0) {
        const cardLabel = card.nickname || card.bank ? `Fatura ${card.nickname || card.bank}` : "Fatura Cartão de Crédito";
        personalExpenseItems.push({
          description: cardLabel,
          amount: pendingInvoice,
        });
      }
    }
  }

  // 8. Faturas órfãs em credit_card_invoice_openings com valor pendente
  for (const op of openings) {
    const cardIdStr = String(op.card_id || op.cardId || "");
    if (processedCardIds.has(cardIdStr)) continue;

    const notes = op.notes || "";
    const isOpeningPaid = /\[PAGA\]/i.test(notes);
    const paidValMatch = /\[PAID:([0-9]+(?:\.[0-9]+)?)\]/i.exec(notes);
    const totalValMatch = /\[TOTAL:([0-9]+(?:\.[0-9]+)?)\]/i.exec(notes);
    
    const opAmount = Number(op.opening_amount || op.openingAmount) || 0;
    const totalInvoice = totalValMatch ? Number(totalValMatch[1]) : opAmount;
    const paidInvoice = paidValMatch ? Number(paidValMatch[1]) : (isOpeningPaid ? opAmount : 0);
    const pendingInvoice = round2(Math.max(0, totalInvoice - paidInvoice));

    if (pendingInvoice > 0 && op.cycle_key && String(op.cycle_key).startsWith(targetMonth)) {
      processedCardIds.add(cardIdStr);
      const card = cards.find((c: any) => String(c.id) === cardIdStr);
      const cardLabel = card?.nickname || card?.bank ? `Fatura ${card.nickname || card.bank}` : "Fatura Cartão de Crédito";
      personalExpenseItems.push({
        description: cardLabel,
        amount: pendingInvoice,
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
    .select("customer_name, description, total, sale_date, created_at, business_type, payment_history, paid_installments, partial_paid, installments, installment_value, down_payment");
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

