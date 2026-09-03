import { useMemo } from "react";
import { useIncomes } from "@/features/financial/hooks/useIncomes";
import { useExpenses } from "@/features/financial/hooks/useExpenses";
import { useProducts } from "@/features/sales/hooks/useProducts";
import { usePiggyBanks } from "@/features/piggyBanks/hooks/usePiggyBanks";
import { useExternalAccountSources } from "@/hooks/useExternalAccountSources";
import { useCreditCards } from "@/features/creditCards/hooks/useCreditCards";
import { useCreditCardOpenings } from "@/features/creditCards/hooks/useCreditCardOpenings";
import { creditCardInvoiceExtraPaid, creditCardLedgerHandled, cycleKeyForDate, isCreditCardExpense } from "@/features/creditCards/lib/creditCardInvoiceTotals";
import { isVehicleExpenseForVehicles } from "@/features/vehicles/components/VehicleExpenseForm";
import type { Sale } from "@/types/loan";
import { financeSetState, useFinanceHookDebug } from "@/lib/financeDebug";

/**
 * Fonte oficial e única do "Saldo em Conta" do app.
 * Espelha exatamente o cálculo exibido na tela inicial da aba Receitas e Despesas
 * (IncomeBalanceCard). Todos os módulos (Dashboard, Cofrinhos, Cards consolidados,
 * indicadores, etc.) devem consumir este hook para garantir consistência.
 * @deprecated P0-01 — fonte oficial migrou para `src/lib/accountLedgerBalance.ts`
 * (`useOfficialAccountBalance`). Este hook permanece como legado enquanto o
 * ledger não é backfilled (ver docs/finance-balance-source.md). Não usar em
 * código novo.
 */
function saleReceivedTotal(sale: Sale): number {
  const historyTotal = (sale.paymentHistory || []).reduce(
    (s, p) => s + (Number(p.amount) || 0),
    0,
  );
  const iv =
    sale.installmentValue ??
    (sale.installments > 0 ? sale.total / sale.installments : sale.total);
  const legacyTotal =
    (sale.downPayment || 0) +
    (sale.paidInstallments || 0) * iv +
    (sale.partialPaid || 0);
  return Math.max(historyTotal, legacyTotal);
}

export function useAccountBalance() {
  useFinanceHookDebug("useAccountBalance");
  const { incomes } = useIncomes(true);
  const { expenses } = useExpenses(true);
  const { sales } = useProducts(true);
  const { deposits: piggyDeposits } = usePiggyBanks();
  const external = useExternalAccountSources();
  const { cards } = useCreditCards();
  const { openings } = useCreditCardOpenings();

  const balance = useMemo(() => {
    const totalIncomeReceived = incomes
      .filter((i) => i.status === "received")
      .reduce((s, i) => s + i.amount, 0);
    const totalSalesReceived = sales.reduce(
      (s, sale) => s + saleReceivedTotal(sale),
      0,
    );
    // Ciclos de cartão cujo pagamento já está lançado no extrato (ledger).
    // Para esses, o débito ocorre via external.total — não somar de novo via expense.paid.
    const ledgerCycles = new Set(
      openings
        .filter((o) => creditCardLedgerHandled(o.notes))
        .map((o) => `${o.cardId}:${o.cycleKey}`),
    );
    const cardByTag = new Map<string, typeof cards[number]>();
    for (const c of cards) {
      const tag = (c.nickname || c.lastFour || "").toLowerCase();
      if (tag) cardByTag.set(tag, c);
    }
    const expenseInLedgerCycle = (e: any): boolean => {
      if (!isCreditCardExpense(e)) return false;
      const n = (e.notes ?? "").toLowerCase();
      // Tenta casar pelo tag do cartão nas notas; senão, varre todos os cartões.
      let matchedCards: typeof cards = [];
      for (const [tag, card] of cardByTag) {
        if (n.includes(tag)) { matchedCards = [card]; break; }
      }
      if (matchedCards.length === 0) matchedCards = cards;
      for (const card of matchedCards) {
        const ck = cycleKeyForDate(e.dueDate, card.closingDay);
        if (ledgerCycles.has(`${card.id}:${ck}`)) return true;
      }
      return false;
    };
    const totalExpensePaid = expenses
      .filter((e: any) => e.paid && (e.scope ?? "business") === "personal" && !isVehicleExpenseForVehicles(e))
      .filter((e: any) => !expenseInLedgerCycle(e))
      .reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
    const totalPiggyManualDeposits = piggyDeposits
      .filter((d) => !d.expenseId)
      .reduce((s, d) => s + (Number(d.amount) || 0), 0);
    // Excedente pago de faturas de cartão (saldo inicial / override) que não está em despesas individuais.
    const ccExtra = creditCardInvoiceExtraPaid(expenses as any, cards, openings);
    const base =
      totalIncomeReceived +
      totalSalesReceived -
      totalExpensePaid -
      totalPiggyManualDeposits -
      ccExtra;
    // Soma saldos externos (Dashboard conta+dinheiro, Cofrinhos, Veículos)
    const total = base + external.total;
    financeSetState("useAccountBalance", "derived balance", { total, table: "composite", queryKey: null });
    return total;
  }, [incomes, sales, expenses, piggyDeposits, external.total, cards, openings]);

  return balance;
}

export { saleReceivedTotal };
