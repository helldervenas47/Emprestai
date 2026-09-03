import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useDataOwner } from "@/hooks/useDataOwner";
import { useIncomes } from "@/features/financial/hooks/useIncomes";
import { useExpenses } from "@/features/financial/hooks/useExpenses";
import { useProducts } from "@/features/sales/hooks/useProducts";
import { isCreditCardExpense } from "@/features/creditCards/lib/creditCardInvoiceTotals";
import { isVehicleExpenseForVehicles } from "@/features/vehicles/components/VehicleExpenseForm";
import type { Sale } from "@/types/loan";
import { readCachedBalance, writeCachedBalance } from "@/features/financial/lib/balanceCardCache";
import { financeFetchStart, financeFetchSuccess, financeInvalidate, financeSetState, useFinanceHookDebug } from "@/lib/financeDebug";

function saleReceivedTotal(sale: Sale): number {
  const historyTotal = (sale.paymentHistory || []).reduce(
    (s, p) => s + (Number(p.amount) || 0),
    0,
  );
  const iv = sale.installmentValue ?? (sale.installments > 0 ? sale.total / sale.installments : sale.total);
  const legacyTotal = (sale.downPayment || 0) + (sale.paidInstallments || 0) * iv + (sale.partialPaid || 0);
  return Math.max(historyTotal, legacyTotal);
}

/**
 * @deprecated P0-01 — usar `useOfficialAccountBalance` (src/lib/accountLedgerBalance.ts).
 * Mantido como legado até o backfill do `account_ledger`.
 *
 * Saldo em Conta unificado — exatamente a mesma base usada pelo
 * card "Saldo em Conta" da aba Receitas (IncomeBalanceCard):
 *
 *   receitas recebidas
 * + vendas recebidas (exceto aluguel de veículo)
 * − despesas pessoais pagas (exceto itens de cartão e veículos)
 * − pagamentos de fatura de cartão lançados no extrato
 * − aportes líquidos nos cofrinhos
 */
export interface UnifiedAccountBalanceState {
  /** Saldo a exibir: valor calculado quando pronto, senão o último saldo em cache. */
  balance: number | undefined;
  /** `true` quando a base auxiliar já chegou (ou já existe cache confiável). */
  ready: boolean;
  /** `true` enquanto não há valor confiável algum (mostrar tarja de carregamento). */
  loading: boolean;
}

export function useUnifiedAccountBalance(): number {
  return useUnifiedAccountBalanceState().balance ?? 0;
}

export function useUnifiedAccountBalanceState(): UnifiedAccountBalanceState {
  useFinanceHookDebug("useUnifiedAccountBalance");
  const ownerId = useDataOwner();
  const { incomes } = useIncomes(true);
  const { expenses } = useExpenses(true);
  const { sales } = useProducts(true);

  const [cardInvoicePaidTotal, setCardInvoicePaidTotal] = useState(0);
  const [piggyNetTotal, setPiggyNetTotal] = useState(0);
  const [auxReady, setAuxReady] = useState(false);
  const [cachedBalance, setCachedBalance] = useState<number | undefined>(() => readCachedBalance(ownerId));

  useEffect(() => {
    setAuxReady(false);
    setCachedBalance(readCachedBalance(ownerId));
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    const load = async () => {
      financeFetchStart("useUnifiedAccountBalance", "account_ledger/cofrinhos", { ownerId: "present" });
      const [{ data: ledger }, { data: cofrinhos }] = await Promise.all([
        supabase
          .from("account_ledger")
          .select("amount")
          .eq("user_id", ownerId)
          .eq("direction", "out")
          .eq("metadata->>kind", "credit_card_invoice_payment"),
        // Nova arquitetura: saldo líquido dos cofrinhos = soma de saldo_principal
        // da tabela `cofrinhos` (já reflete depósitos − resgates).
        supabase
          .from("cofrinhos" as any)
          .select("saldo_principal, ativo")
          .eq("usuario_id", ownerId),
      ]);
      if (cancelled) return;
      financeSetState("useUnifiedAccountBalance", "cardInvoicePaidTotal", { rows: ((ledger as any[]) ?? []).length });
      setCardInvoicePaidTotal(
        ((ledger as any[]) ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0),
      );
      financeSetState("useUnifiedAccountBalance", "piggyNetTotal", { rows: ((cofrinhos as any[]) ?? []).length });
      setPiggyNetTotal(
        ((cofrinhos as any[]) ?? [])
          .filter((r) => r.ativo !== false)
          .reduce((s, r) => s + (Number(r.saldo_principal) || 0), 0),
      );
      setAuxReady(true);
      financeFetchSuccess("useUnifiedAccountBalance", "account_ledger/cofrinhos", {
        ledgerRows: ((ledger as any[]) ?? []).length,
        cofrinhoRows: ((cofrinhos as any[]) ?? []).length,
      });
    };
    load();
    const handler = (event: Event) => {
      financeInvalidate("useUnifiedAccountBalance", "account_ledger/cofrinhos", { event: event.type });
      load();
    };
    window.addEventListener("ledger:changed", handler);
    window.addEventListener("balance:changed", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("ledger:changed", handler);
      window.removeEventListener("balance:changed", handler);
    };
  }, [ownerId]);


  const balance = useMemo(() => {
    const totalIncomeReceived = incomes
      .filter((i) => i.status === "received")
      .reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const totalSalesReceived = sales
      .filter((s) => s.businessType !== "aluguel_veiculo")
      .reduce((s, sale) => s + saleReceivedTotal(sale), 0);
    const totalExpensePaid = expenses
      .filter(
        (e: any) =>
          e.paid &&
          (e.scope ?? "business") === "personal" &&
          !isCreditCardExpense(e) &&
          !isVehicleExpenseForVehicles(e),
      )
      .reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
    return (
      totalIncomeReceived
      + totalSalesReceived
      - totalExpensePaid
      - cardInvoicePaidTotal
      - piggyNetTotal
    );
  }, [incomes, expenses, sales, cardInvoicePaidTotal, piggyNetTotal]);

  useEffect(() => {
    if (!auxReady || !ownerId) return;
    writeCachedBalance(ownerId, balance);
    setCachedBalance(balance);
  }, [auxReady, ownerId, balance]);

  const display = auxReady ? balance : cachedBalance;
  return { balance: display, ready: auxReady, loading: display === undefined };
}
