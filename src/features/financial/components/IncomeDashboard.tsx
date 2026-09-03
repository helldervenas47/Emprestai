import { useMemo, useState } from "react";
import { Income } from "@/features/financial/hooks/useIncomes";
import { Sale } from "@/types/loan";
import { AllIncomeCategoriesSheet } from "@/features/financial/components/AllIncomeCategoriesSheet";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useClients } from "@/features/clients/hooks/useClients";
import { displayIncomeCategory, incomeCategoryKey } from "@/features/financial/lib/incomeCategory";
import { CategoryRanking, CategoryDonutChart } from "@/features/financial/components/financial";

const PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--purple))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--accent))",
];

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  incomes: Income[];
  allMonthIncomes?: Income[];
  allIncomes?: Income[];
  monthKey: string;
  sales?: Sale[];
}

/** Valor efetivamente recebido de uma venda dentro do mês (YYYY-MM). */
function salePaidInMonth(sale: Sale, monthKey: string): number {
  let total = 0;
  if ((sale.downPayment || 0) > 0 && sale.date?.startsWith(monthKey)) {
    total += Number(sale.downPayment) || 0;
  }
  (sale.paymentHistory || []).forEach((p) => {
    if (p?.date?.startsWith(monthKey)) total += Number(p.amount) || 0;
  });
  return total;
}

export function IncomeDashboard({ incomes, allMonthIncomes, allIncomes, monthKey, sales = [] }: Props) {
  const consolidated = allMonthIncomes ?? incomes;
  const { methods } = usePaymentMethods();
  const methodName = (id?: string | null) => methods.find((m) => m.id === id)?.name || "";
  const { clients } = useClients();
  const clientNameById = useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [clients]);

  const [allCategoriesOpen, setAllCategoriesOpen] = useState(false);
  const [allCategoriesInitialTab, setAllCategoriesInitialTab] = useState<string>("all");

  const salesByCategory = useMemo(() => {
    const map = new Map<string, number>();
    sales.forEach((s) => {
      const paid = salePaidInMonth(s, monthKey);
      if (paid <= 0) return;
      const k = (s.category && s.category.trim()) || "Vendas";
      map.set(k, (map.get(k) || 0) + paid);
    });
    return map;
  }, [sales, monthKey]);

  const categories = useMemo(() => {
    const map = new Map<string, { name: string; value: number }>();
    consolidated.forEach((i) => {
      const key = incomeCategoryKey(i.category);
      const current = map.get(key) ?? { name: displayIncomeCategory(i.category), value: 0 };
      map.set(key, { ...current, value: current.value + i.amount });
    });
    salesByCategory.forEach((v, k) => {
      const key = incomeCategoryKey(k);
      const current = map.get(key) ?? { name: displayIncomeCategory(k), value: 0 };
      map.set(key, { ...current, value: current.value + v });
    });
    return Array.from(map.values());
  }, [consolidated, salesByCategory]);

  const coloredCategories = useMemo(
    () =>
      [...categories]
        .sort((a, b) => b.value - a.value)
        .map((c, i) => ({ ...c, color: PALETTE[i % PALETTE.length] })),
    [categories],
  );

  const paidCategories = useMemo(() => {
    const map = new Map<string, { name: string; value: number }>();
    consolidated.forEach((i) => {
      if (i.status !== "received") return;
      const key = incomeCategoryKey(i.category);
      const current = map.get(key) ?? { name: displayIncomeCategory(i.category), value: 0 };
      map.set(key, { ...current, value: current.value + i.amount });
    });
    salesByCategory.forEach((v, k) => {
      const key = incomeCategoryKey(k);
      const current = map.get(key) ?? { name: displayIncomeCategory(k), value: 0 };
      map.set(key, { ...current, value: current.value + v });
    });
    return Array.from(map.values())
      .sort((a, b) => b.value - a.value)
      .map((c, i) => ({ ...c, color: PALETTE[i % PALETTE.length] }));
  }, [consolidated, salesByCategory]);

  const [y, m] = monthKey.split("-").map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  if (consolidated.length === 0 && salesByCategory.size === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-4">
        <h3 className="text-sm font-semibold mb-1 text-foreground">Receitas — {monthLabel}</h3>
        <p className="text-xs text-muted-foreground">Nenhuma receita registrada neste mês.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <CategoryRanking
        title="Top 5 categorias"
        items={coloredCategories}
        formatCurrency={fmtBRL}
        emptyLabel="Sem receitas no período"
        onSelect={(name) => {
          setAllCategoriesInitialTab(name);
          setAllCategoriesOpen(true);
        }}
      />

      <div className="flex flex-col min-w-0">
        <CategoryDonutChart
          title="Receitas por categoria"
          slices={paidCategories.length > 0 ? paidCategories : coloredCategories}
          formatCurrency={fmtBRL}
          centerLabel="Receitas"
          onClick={() => {
            setAllCategoriesInitialTab("all");
            setAllCategoriesOpen(true);
          }}
          onSelectSlice={(name) => {
            setAllCategoriesInitialTab(name);
            setAllCategoriesOpen(true);
          }}
        />
      </div>

      <AllIncomeCategoriesSheet
        open={allCategoriesOpen}
        onOpenChange={setAllCategoriesOpen}
        initialMonth={monthKey}
        incomes={consolidated}
        allIncomes={allIncomes ?? consolidated}
        sales={sales}
        methodName={methodName}
        clientNameById={clientNameById}
        initialCategory={allCategoriesInitialTab}
        formatCurrency={fmtBRL}
      />
    </div>
  );
}

