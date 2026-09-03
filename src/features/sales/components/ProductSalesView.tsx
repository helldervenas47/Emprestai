import { useState, useCallback, useEffect, useMemo } from "react";
import { Sale, BusinessType, Client, Expense } from "@/types/loan";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VehiclePaymentHistoryView } from "@/features/sales/components/product-sales/VehiclePaymentHistoryView";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addMonths, endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/userClient";
import { useHideValues } from "@/contexts/HideValuesContext";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";


import { StockManager } from "@/features/sales/components/StockManager";
import { SalesLedger } from "@/features/sales/components/SalesLedger";

import { isVehicleExpenseForVehicles } from "@/features/vehicles/components/VehicleExpenseForm";
import { useLocadorInfo, LocadorInfo } from "@/features/vehicles/hooks/useLocadorInfo";
import { useVehicleRegistry } from "@/features/vehicles/hooks/useVehicleRegistry";

import { ProductSalesHeader } from "@/features/sales/components/product-sales/ProductSalesHeader";
import { rawFormatCurrency, salesSubTabs } from "@/features/sales/components/product-sales/productSalesUtils";
import { ProductSalesSubTabsList } from "@/features/sales/components/product-sales/ProductSalesSubTabs";
import { SalesList } from "@/features/sales/components/product-sales/SalesList";
import { VehicleExpensesSection } from "@/features/sales/components/product-sales/VehicleExpensesSection";

interface Props {
  sales: Sale[];
  onDeleteSale: (id: string) => void;
  onUpdateSale: (id: string, data: Partial<Omit<Sale, "id">>) => void;
  clients?: Client[];
  expenses?: Expense[];
  onAddExpense?: (expense: Omit<Expense, "id" | "paid" | "paidDate" | "createdAt">) => void;
  onPayExpense?: (id: string, skipBalanceAdjust?: boolean, payDate?: string, paidAmount?: number) => void;
  onDeleteExpense?: (id: string, skipBalanceAdjust?: boolean) => void;
  onUpdateExpense?: (id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => void;
  readOnly?: boolean;
  isVehicleView?: boolean;
  locadores?: LocadorInfo[];
  onSaveLocador?: (info: LocadorInfo) => void;
}

export function ProductSalesView({
  sales,
  onDeleteSale,
  onUpdateSale,
  clients = [],
  expenses = [],
  onAddExpense,
  onPayExpense,
  onDeleteExpense,
  onUpdateExpense,
  readOnly = false,
  isVehicleView = false,
  locadores: locadoresProp,
  onSaveLocador: onSaveLocadorProp,
}: Props) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);

  // Locador & Vehicle Registry hooks - use props from parent to share state
  const locadorHook = useLocadorInfo();
  const locadores = locadoresProp ?? locadorHook.locadores;
  const saveLocador = onSaveLocadorProp ?? locadorHook.save;
  void saveLocador;
  const locador = locadores[0] || { nome: "", rg: "", cpf: "", nacionalidade: "Brasileiro(a)", profissao: "", endereco: "", bairro: "", cidade: "", estado: "" };
  const { vehicles: registeredVehicles } = useVehicleRegistry();

  // Balance state
  const [balance, setBalanceState] = useState<number>(0);
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState("");
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: ownerData } = await supabase.from("user_owner" as any).select("owner_id").eq("user_id", user.id).maybeSingle();
      const ownerId = (ownerData as any)?.owner_id || user.id;
      const { data } = await supabase.from("vehicle_balance").select("amount").eq("user_id", ownerId).maybeSingle();
      setBalanceState(data?.amount ?? 0);
    })();
  }, []);

  const handleSaveBalance = async () => {
    const val = parseFloat(balanceInput);
    if (isNaN(val)) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: ownerData } = await supabase.from("user_owner" as any).select("owner_id").eq("user_id", user.id).maybeSingle();
    const ownerId = (ownerData as any)?.owner_id || user.id;
    const { data: existing } = await supabase.from("vehicle_balance").select("id").eq("user_id", ownerId).maybeSingle();
    if (existing) {
      await supabase.from("vehicle_balance").update({ amount: val, updated_at: new Date().toISOString() }).eq("user_id", ownerId);
    } else {
      await supabase.from("vehicle_balance").insert({ user_id: ownerId, amount: val });
    }
    setBalanceState(val);
    setEditingBalance(false);
  };

  // Month filter for expenses
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  // All vehicle-related expenses (used for "Limpar Pagamentos" actions)
  const allVehicleExpenses = useMemo(
    () => expenses.filter(isVehicleExpenseForVehicles),
    [expenses],
  );

  // Monthly vehicle expenses - consider installment due dates
  const [selYear, selMonthNum] = selectedMonth.split("-").map(Number);
  const monthStart = new Date(selYear, selMonthNum - 1, 1);
  const monthEnd = endOfMonth(monthStart);
  const monthStartStr = format(monthStart, "yyyy-MM-dd");
  const monthEndStr = format(monthEnd, "yyyy-MM-dd");

  // Filter expenses that have at least one due date inside the selected month
  // (considers recurring installments). Sum monthly total in the same pass.
  const { vehicleExpenses, monthlyTotal } = useMemo(() => {
    let total = 0;
    const list = allVehicleExpenses.filter((exp) => {
      const isRecorrente = exp.type === "recorrente" && exp.installments && exp.installments > 1;
      if (isRecorrente) {
        const baseDate = new Date(exp.dueDate + "T00:00:00");
        const installmentAmount = exp.amount / exp.installments!;
        let hit = false;
        for (let i = 0; i < exp.installments!; i++) {
          const instDateStr = format(addMonths(baseDate, i), "yyyy-MM-dd");
          if (instDateStr >= monthStartStr && instDateStr <= monthEndStr) {
            total += installmentAmount;
            hit = true;
          }
        }
        return hit;
      }
      if (exp.dueDate >= monthStartStr && exp.dueDate <= monthEndStr) {
        total += exp.amount;
        return true;
      }
      return false;
    });
    return { vehicleExpenses: list, monthlyTotal: total };
  }, [allVehicleExpenses, monthStartStr, monthEndStr]);


  // Generate month options (last 12 months + current) — used by ProductSalesHeader indirectly
  const monthOptions: { value: string; label: string }[] = [];
  for (let i = -1; i < 12; i++) {
    const d = addMonths(now, -i);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = format(d, "MMMM yyyy", { locale: ptBR });
    monthOptions.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  void monthOptions;

  const secondaryCards = (
    <ProductSalesHeader
      selectedMonth={selectedMonth}
      setSelectedMonth={setSelectedMonth}
      selYear={selYear}
      selMonthNum={selMonthNum}
      readOnly={readOnly}
      balance={balance}
      editingBalance={editingBalance}
      balanceInput={balanceInput}
      setBalanceInput={setBalanceInput}
      setEditingBalance={setEditingBalance}
      handleSaveBalance={handleSaveBalance}
      formatCurrency={formatCurrency}
      monthlyTotal={monthlyTotal}
    />
  );

  // Check if this is the vehicles-only view
  const hasSalesOrStreaming = !isVehicleView;

  const updateVehicleBalance = useCallback(async (delta: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: ownerData } = await supabase.from("user_owner" as any).select("owner_id").eq("user_id", user.id).maybeSingle();
    const ownerId = (ownerData as any)?.owner_id || user.id;
    const { data: existing } = await supabase.from("vehicle_balance").select("amount").eq("user_id", ownerId).maybeSingle();
    const currentBalance = existing?.amount ?? 0;
    const newBalance = currentBalance + delta;
    if (existing) {
      await supabase.from("vehicle_balance").update({ amount: newBalance, updated_at: new Date().toISOString() }).eq("user_id", ownerId);
    } else {
      await supabase.from("vehicle_balance").insert({ user_id: ownerId, amount: newBalance });
    }
    setBalanceState(newBalance);
  }, []);

  // Wrap onUpdateSale to update vehicle balance when installments are paid or deleted
  const handleVehicleUpdateSale = useCallback((id: string, data: Partial<Omit<Sale, "id">>) => {
    const sale = sales.find((s) => s.id === id);
    if (!sale) { onUpdateSale(id, data); return; }

    if (data.paidInstallments !== undefined) {
      const amounts = sale.installmentAmounts;
      const defaultVal = sale.installments > 0 ? Math.max(0, sale.total - (sale.downPayment || 0)) / sale.installments : sale.total;

      if (data.paidInstallments > sale.paidInstallments) {
        // Payment: add installment value to balance
        const paidIdx = sale.paidInstallments;
        const paidValue = amounts && amounts[paidIdx] != null ? amounts[paidIdx] : defaultVal;
        const actualPaid = Math.max(0, paidValue - (data.partialPaid !== undefined ? 0 : (sale.partialPaid || 0)));
        updateVehicleBalance(actualPaid);
      } else if (data.paidInstallments < sale.paidInstallments) {
        // Undo payment: subtract deleted installments from balance
        let refundTotal = 0;
        for (let i = data.paidInstallments; i < sale.paidInstallments; i++) {
          refundTotal += amounts && amounts[i] != null ? amounts[i] : defaultVal;
        }
        updateVehicleBalance(-refundTotal);
      }
    }

    // Handle partial payments
    if (data.partialPaid !== undefined && data.paidInstallments === undefined) {
      const addedPartial = (data.partialPaid || 0) - (sale.partialPaid || 0);
      if (addedPartial !== 0) {
        updateVehicleBalance(addedPartial);
      }
    }

    onUpdateSale(id, data);
  }, [sales, onUpdateSale, updateVehicleBalance]);

  // Wrap onPayExpense to debit vehicle balance using the actual paid amount.
  // Para despesas parceladas, ajusta o total da despesa (exp.amount) para refletir o
  // valor efetivamente pago nesta parcela, mantendo as parcelas restantes no valor
  // original. O valor original da parcela é guardado em notes como [OrigParcela: X].
  const handleVehiclePayExpense = useCallback((id: string, payDate: string, paidAmount: number) => {
    const exp = expenses.find((e) => e.id === id);
    if (!exp || exp.paid) { onPayExpense?.(id, true, payDate, paidAmount); return; }
    updateVehicleBalance(-paidAmount);

    const isRecorrente = exp.type === "recorrente" && exp.installments && exp.installments > 1;
    if (isRecorrente && onUpdateExpense) {
      const origMatch = (exp.notes ?? "").match(/\[OrigParcela:\s*([\d.]+)\]/i);
      const originalInstallment = origMatch ? parseFloat(origMatch[1]) : exp.amount / exp.installments!;
      const diff = paidAmount - originalInstallment;
      const updates: Partial<Omit<Expense, "id" | "createdAt">> = {};
      if (Math.abs(diff) > 0.005) {
        updates.amount = Math.round((exp.amount + diff) * 100) / 100;
      }
      if (!origMatch) {
        const baseNotes = (exp.notes ?? "").trimEnd();
        updates.notes = baseNotes ? `${baseNotes}\n[OrigParcela: ${originalInstallment.toFixed(2)}]` : `[OrigParcela: ${originalInstallment.toFixed(2)}]`;
      }
      if (Object.keys(updates).length > 0) onUpdateExpense(id, updates);
    }

    onPayExpense?.(id, true, payDate, paidAmount);
  }, [expenses, onPayExpense, onUpdateExpense, updateVehicleBalance]);

  // Wrap onDeleteExpense to restore vehicle balance for any amount that was already paid
  const handleVehicleDeleteExpense = useCallback(async (id: string, scope: import("@/features/financial/lib/seriesEdit").EditScope = "this") => {
    const target = expenses.find((e) => e.id === id);
    if (!target) return;

    const deleteOne = async (rowId: string) => {
      const exp = expenses.find((e) => e.id === rowId);
      if (exp) {
        const isRecorrente = exp.type === "recorrente" && exp.installments && exp.installments > 1;
        let refund = 0;
        if (isRecorrente) {
          const installmentAmount = exp.amount / exp.installments!;
          refund = installmentAmount * (exp.paidInstallments || 0);
        } else if (exp.paid) {
          refund = exp.amount;
        }
        if (refund > 0) updateVehicleBalance(refund);
      }
      await onDeleteExpense?.(rowId, true);
    };

    const { applyExpenseScopedDelete } = await import("@/features/financial/lib/seriesEdit");
    await applyExpenseScopedDelete({
      target,
      scope,
      expenses,
      onDeleteLocal: deleteOne,
    });
  }, [expenses, onDeleteExpense, updateVehicleBalance]);


  // Wrap onUpdateExpense to restore vehicle balance when payments are removed
  const handleVehicleUpdateExpense = useCallback((id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => {
    const exp = expenses.find((e) => e.id === id);
    if (exp) {
      const isRecorrente = exp.type === "recorrente" && exp.installments && exp.installments > 1;
      const installmentAmount = isRecorrente ? exp.amount / exp.installments! : exp.amount;

      if (data.paidInstallments !== undefined && isRecorrente) {
        const diff = (exp.paidInstallments || 0) - data.paidInstallments;
        if (diff > 0) {
          // Payments removed — restore balance and roll back due date
          updateVehicleBalance(installmentAmount * diff);
          const currentDue = new Date(exp.dueDate + "T00:00:00");
          currentDue.setMonth(currentDue.getMonth() - diff);
          data = { ...data, dueDate: currentDue.toISOString().split("T")[0] };
        }
      } else if (data.paid === false && exp.paid) {
        // Single expense payment removed — restore balance
        updateVehicleBalance(exp.amount);
      }
    }
    onUpdateExpense?.(id, data);
  }, [expenses, onUpdateExpense, updateVehicleBalance]);

  // Wrap onDeleteSale for vehicle sales to reverse paid amounts from vehicle balance
  const handleVehicleDeleteSale = useCallback((id: string) => {
    const sale = sales.find((s) => s.id === id);
    if (sale && sale.paidInstallments > 0) {
      const amounts = sale.installmentAmounts;
      const defaultVal = sale.installments > 0 ? Math.max(0, sale.total - ((sale as any).downPayment || 0)) / sale.installments : sale.total;
      let paidTotal = 0;
      for (let i = 0; i < sale.paidInstallments; i++) {
        paidTotal += amounts && amounts[i] != null ? amounts[i] : defaultVal;
      }
      paidTotal += sale.partialPaid || 0;
      if (paidTotal > 0) updateVehicleBalance(-paidTotal);
    }
    onDeleteSale(id);
  }, [sales, onDeleteSale, updateVehicleBalance]);

  // Sub-tab state must be declared before any early return to keep hook order stable.
  const activeTabs = salesSubTabs;
  const allTabValues = [...activeTabs.map((t) => t.type as string), "extrato"];
  const [currentSubTab, setCurrentSubTab] = useState<string>(allTabValues[0] || "venda");
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("products-subtab-change", { detail: currentSubTab }));
  }, [currentSubTab]);

  // History dialog listener (opened from floating icon button in Index.tsx)
  const [showVehicleHistory, setShowVehicleHistory] = useState(false);
  useEffect(() => {
    const handler = () => setShowVehicleHistory(true);
    window.addEventListener("open-vehicle-history", handler);
    return () => window.removeEventListener("open-vehicle-history", handler);
  }, []);

  if (!hasSalesOrStreaming) {
    // Vehicles page - render without sub-tabs + vehicle expenses
    return (
      <div className="space-y-6">
        <SalesList
          sales={sales}
          onDeleteSale={handleVehicleDeleteSale}
          onUpdateSale={handleVehicleUpdateSale}
          clients={clients}
          hideOnTrackCard
          renderAfterCards={secondaryCards}
          readOnly={readOnly}
          locadorInfo={locador}
          registeredVehicles={registeredVehicles}
          locadores={locadores}
          scopeKey="aluguel_veiculo"
        />

        {!readOnly && onAddExpense && (
          <VehicleExpensesSection
            vehicleExpenses={vehicleExpenses}
            allVehicleExpenses={allVehicleExpenses}
            readOnly={readOnly}
            formatCurrency={formatCurrency}
            onPayExpense={onPayExpense}
            onUpdateExpense={onUpdateExpense}
            handleVehicleUpdateExpense={handleVehicleUpdateExpense}
            handleVehiclePayExpense={handleVehiclePayExpense}
            handleVehicleDeleteExpense={handleVehicleDeleteExpense}
          />
        )}

        <Dialog open={showVehicleHistory} onOpenChange={setShowVehicleHistory}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Histórico de Pagamentos</DialogTitle>
            </DialogHeader>
            <VehiclePaymentHistoryView
              sales={sales}
              allVehicleExpenses={allVehicleExpenses}
              registeredVehicles={registeredVehicles}
              formatCurrency={formatCurrency}
            />
          </DialogContent>
        </Dialog>
      </div>
    );
  }



  // Sales page - show sub-tabs for venda/streaming + extrato


  return (
    <>
      <Tabs value={currentSubTab} onValueChange={setCurrentSubTab} className="space-y-4">
        <ProductSalesSubTabsList showStock={!isVehicleView} />

        {activeTabs.map((tab) => (
          <TabsContent key={tab.type} value={tab.type}>
            <SalesList
              sales={sales.filter((s) => s.businessType === tab.type)}
              onDeleteSale={onDeleteSale}
              onUpdateSale={onUpdateSale}
              clients={clients}
              readOnly={readOnly}
              scopeKey={tab.type}
            />
          </TabsContent>
        ))}

        <TabsContent value="extrato">
          <SalesLedger sales={sales.filter((s) => s.businessType !== "aluguel_veiculo")} />
        </TabsContent>

        {!isVehicleView && (
          <TabsContent value="estoque">
            <StockManager readOnly={readOnly} />
          </TabsContent>
        )}
      </Tabs>
      <ConfirmDeleteDialog
        open={!!deleteExpenseId}
        onOpenChange={() => setDeleteExpenseId(null)}
        onConfirm={() => { if (deleteExpenseId && onDeleteExpense) { onDeleteExpense(deleteExpenseId, true); setDeleteExpenseId(null); } }}
        title="Excluir despesa"
        description="Tem certeza que deseja excluir esta despesa?"
      />
    </>
  );
}
