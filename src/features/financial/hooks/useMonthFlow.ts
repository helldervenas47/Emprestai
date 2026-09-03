import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useDataOwner } from "@/hooks/useDataOwner";
import { useIncomes, Income } from "@/features/financial/hooks/useIncomes";
import { useExpenses } from "@/features/financial/hooks/useExpenses";
import { useProducts } from "@/features/sales/hooks/useProducts";
import { useCreditCards } from "@/features/creditCards/hooks/useCreditCards";
import { useCreditCardOpenings } from "@/features/creditCards/hooks/useCreditCardOpenings";
import { isCreditCardExpense, listPaidInvoicesInRange } from "@/features/creditCards/lib/creditCardInvoiceTotals";
import type { Expense, Sale } from "@/types/loan";
import { getInstallmentScheduleStart } from "@/features/financial/lib/installmentEdit";
import { financeFetchStart, financeFetchSuccess, financeInvalidate, financeSetState, useFinanceHookDebug } from "@/lib/financeDebug";

function saleReceivedTotal(sale: Sale): number {
  const history = sale.paymentHistory || [];
  const historyTotal = history.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const iv = sale.installmentValue ?? (sale.installments > 0 ? sale.total / sale.installments : sale.total);
  const legacyTotal = (sale.downPayment || 0) + (sale.paidInstallments || 0) * iv + (sale.partialPaid || 0);
  return Math.max(historyTotal, legacyTotal);
}

function saleReceivedInMonth(sale: Sale, monthKey: string): number {
  const history = sale.paymentHistory || [];
  if (history.length > 0) {
    const historyMonthSum = history
      .filter((p) => (p.date || "").startsWith(monthKey))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const historyTotal = history.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const iv = sale.installmentValue ?? (sale.installments > 0 ? sale.total / sale.installments : sale.total);
    const legacyTotal = (sale.downPayment || 0) + (sale.paidInstallments || 0) * iv + (sale.partialPaid || 0);
    if (historyTotal >= legacyTotal) return historyMonthSum;
    const missing = legacyTotal - historyTotal;
    return historyMonthSum + ((sale.date || "").startsWith(monthKey) ? missing : 0);
  }
  return (sale.date || "").startsWith(monthKey) ? saleReceivedTotal(sale) : 0;
}

function monthlyExpenseAmount(e: Expense): number {
  if (e.type === "recorrente" && e.installments && e.installments > 1) {
    return e.amount / e.installments;
  }
  return e.amount;
}

export interface MonthFlow {
  monthIn: number;
  monthOut: number;
}

/**
 * Calcula Entradas/Saídas do mês usando exatamente a mesma fórmula do
 * card "Entradas mês" / "Saídas mês" exibida em IncomeBalanceCard.
 */
export function useMonthFlow(monthKey: string): MonthFlow {
  useFinanceHookDebug("useMonthFlow");
  const ownerId = useDataOwner();
  const { incomes } = useIncomes(true);
  const { expenses } = useExpenses(true);
  const { sales: rawSales } = useProducts(true);
  const { cards } = useCreditCards();
  const { openings } = useCreditCardOpenings();

  const sales = useMemo(
    () => rawSales.filter((s) => s.businessType !== "aluguel_veiculo"),
    [rawSales],
  );

  const [piggyNetByMonth, setPiggyNetByMonth] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    const load = async () => {
      financeFetchStart("useMonthFlow", "cofrinhos/cofrinho_eventos", { ownerId: "present", monthKey });
      // Nova arquitetura: cruza cofrinhos do usuário com eventos
      // (`cofrinho_eventos`) para obter o fluxo líquido por mês usando
      // `data_evento` como data financeira real (DEPOSITO + / RESGATE -).
      const { data: banks } = await supabase
        .from("cofrinhos" as any)
        .select("id")
        .eq("usuario_id", ownerId);
      const bankIds = ((banks as any[]) ?? []).map((b) => b.id);
      let events: any[] = [];
      if (bankIds.length > 0) {
        const { data: ev } = await supabase
          .from("cofrinho_eventos" as any)
          .select("tipo, valor, data_evento, created_at, cofrinho_id")
          .in("cofrinho_id", bankIds)
          .in("tipo", ["DEPOSITO", "RESGATE"]);
        events = (ev as any[]) ?? [];
      }
      if (cancelled) return;
      const byMonth: Record<string, number> = {};
      for (const r of events) {
        const raw = (r.data_evento as string) || (r.created_at as string) || "";
        const mk = raw.slice(0, 7);
        if (!mk) continue;
        const tipo = String(r.tipo || "").toUpperCase();
        const v = Number(r.valor) || 0;
        const signed = tipo === "RESGATE" ? -Math.abs(v) : Math.abs(v);
        byMonth[mk] = (byMonth[mk] ?? 0) + signed;
      }
      financeSetState("useMonthFlow", "piggyNetByMonth", { months: Object.keys(byMonth).length, events: events.length });
      setPiggyNetByMonth(byMonth);
      financeFetchSuccess("useMonthFlow", "cofrinhos/cofrinho_eventos", { bankRows: bankIds.length, eventRows: events.length });
    };
    load();
    const handler = (event: Event) => {
      financeInvalidate("useMonthFlow", "cofrinhos/cofrinho_eventos", { event: event.type });
      load();
    };
    window.addEventListener("balance:changed", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("balance:changed", handler);
    };
  }, [ownerId]);


  return useMemo<MonthFlow>(() => {
    const monthInIncomes = incomes.reduce((s, i: Income) => {
      if (i.source === "Ajuste manual") return s;
      if (i.status !== "received") return s;
      if (!i.receivedDate.startsWith(monthKey)) return s;
      return s + i.amount;
    }, 0);
    const monthInSales = sales.reduce((s, sale) => s + saleReceivedInMonth(sale, monthKey), 0);
    // Resgates de cofrinhos não são considerados entradas do mês.
    const monthIn = monthInIncomes + monthInSales;


    const monthOutExpenses = expenses.reduce((s, e: any) => {
      if ((e.scope ?? "business") !== "personal") return s;
      
      const isRec = e.type === "recorrente" && e.installments && e.installments > 1;
      const [yy, mm] = monthKey.split("-").map(Number);
      const scheduleStart = isRec ? getInstallmentScheduleStart(e) : e.dueDate;
      const [dYear, dMonth] = scheduleStart.split("-").map(Number);
      
      if (isRec) {
        const startTotalMonths = dYear * 12 + dMonth;
        const currentTotalMonths = yy * 12 + mm;
        const installmentIndex = currentTotalMonths - startTotalMonths;
        
        // Verifica se este mês corresponde a uma das parcelas
        if (installmentIndex >= 0 && installmentIndex < (e.installments || 0)) {
          // Só conta no "Saídas mês" se a parcela específica desse mês estiver paga
          const isPaidInThisMonth = (e.paidInstallments || 0) > installmentIndex;
          if (isPaidInThisMonth) return s + monthlyExpenseAmount(e);
        }
        return s;
      }

      // Despesa única ou fixa
      if (!e.paid) return s;
      if (isCreditCardExpense(e)) return s;
      const d = e.paidDate || e.dueDate || "";
      // Usamos paidDate se disponível para despesas pagas (regime de caixa)
      const targetDate = e.paidDate || e.dueDate || "";
      if (!targetDate.startsWith(monthKey)) return s;
      return s + monthlyExpenseAmount(e);
    }, 0);
    const [yy, mm] = monthKey.split("-").map(Number);
    let invoicesPaid = 0;
    if (yy && mm) {
      const lastDay = new Date(yy, mm, 0).getDate();
      invoicesPaid = listPaidInvoicesInRange(
        expenses,
        cards,
        openings,
        `${monthKey}-01`,
        `${monthKey}-${String(lastDay).padStart(2, "0")}`,
      ).reduce((s, inv) => s + inv.paidTotal, 0);
    }
    const monthOut = monthOutExpenses + invoicesPaid;

    return { monthIn, monthOut };
  }, [incomes, sales, expenses, cards, openings, piggyNetByMonth, monthKey]);
}
