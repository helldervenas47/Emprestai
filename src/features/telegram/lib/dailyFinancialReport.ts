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
      const val = Number(inc.amount) || 0;
      if (val > 0) {
        financialItems.push({
          description: inc.description || "Receita Financeiro",
          amount: val,
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
            vehicleIncomeItems.push({ description: desc, amount: val });
          } else {
            salesItems.push({ description: desc, amount: val });
          }
        }
      }
    }

    // Se não teve pagamento no histórico na data, verifica se a data da venda/aluguel corresponde ao dia
    if (!hasHistoryPayment) {
      const saleDate = (sale.sale_date || sale.saleDate || (sale.created_at ? String(sale.created_at).slice(0, 10) : "")).slice(0, 10);
      if (saleDate === date) {
        const val = Number(sale.total) || Number(sale.partial_paid || sale.partialPaid) || 0;
        if (val > 0) {
          const desc = client ? `${client} — ${sale.description || (isVehicle ? "Aluguel Veículo" : "Venda")}` : (sale.description || (isVehicle ? "Aluguel Veículo" : "Venda"));
          if (isVehicle) {
            vehicleIncomeItems.push({ description: desc, amount: val });
          } else {
            salesItems.push({ description: desc, amount: val });
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
      const val = Number(exp.amount) || 0;
      if (val > 0) {
        const desc = exp.description || "Despesa";
        const isVeh = isVehicleExpense(exp);

        if (isVeh) {
          vehicleExpenseItems.push({ description: desc, amount: val });
        } else {
          const scope = exp.scope || "business";
          if (scope === "personal") {
            personalExpenseItems.push({ description: desc, amount: val });
          } else {
            businessExpenseItems.push({ description: desc, amount: val });
          }
        }
      }
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
