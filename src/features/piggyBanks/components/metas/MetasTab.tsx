import { lazy, Suspense, useState, useEffect } from "react";
import { emitAppUIEvent, onAppUIEvent } from "@/lib/appUIEvents";
import { LineChart, ListChecks, BarChart3 } from "lucide-react";
import { GoalsYearlyGrid } from "./GoalsYearlyGrid";
import { MonthlyClosingView } from "@/features/monthlyClosing";
import { Loan, Payment, Expense, Client, InstallmentSchedule } from "@/types/loan";

const MonthlyGoalsManager = lazy(() =>
  import("@/features/piggyBanks/components/MonthlyGoalsManager").then((m) => ({ default: m.MonthlyGoalsManager })),
);

type SubTab = "fechamento" | "evolucao" | "configuracao";

interface Props {
  loans: Loan[];
  payments: Payment[];
  expenses: Expense[];
  clients: Client[];
  installmentSchedules: InstallmentSchedule[];
  readOnly?: boolean;
}

export function MetasTab({
  loans, payments, expenses, clients, installmentSchedules, readOnly,
}: Props) {
  const [sub, setSub] = useState<SubTab>("fechamento");
  
  useEffect(() => {
    // Ao montar a aba de Metas, dispara recarregamento global de dados para garantir reatividade
    emitAppUIEvent({ type: "METAS_RELOAD" });

    return onAppUIEvent("NAVIGATE", (event) => {
      if (event.tab === "metas" && event.subTab) {
        if (event.subTab === "configuracao" || event.subTab === "evolucao" || event.subTab === "fechamento") {
          setSub(event.subTab as SubTab);
        }
      }
    });
  }, []);

  const items = [
    { id: "fechamento" as SubTab, label: "Fechamento Mensal", Icon: BarChart3 },
    { id: "evolucao" as SubTab, label: "Evolução Anual", Icon: LineChart },
    { id: "configuracao" as SubTab, label: "Configuração de Metas", Icon: ListChecks },
  ];

  return (
    <div>
      <nav className="flex gap-1 mb-4 bg-muted/60 p-1 rounded-xl border border-border/50 overflow-x-auto scrollbar-hide">
        {items.map(({ id, label, Icon }) => {
          const active = sub === id;
          return (
            <button type="button"
              key={id}
              onClick={() => setSub(id)}
              className={`flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all whitespace-nowrap flex-1 min-w-0 ${
                active
                  ? "bg-background !text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? "!text-primary" : ""}`} />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </nav>

      {sub === "fechamento" && (
        <MonthlyClosingView
          loans={loans}
          payments={payments}
          expenses={expenses}
          clients={clients}
          installmentSchedules={installmentSchedules}
          onNavigateToConfig={() => setSub("configuracao")}
        />
      )}
      {sub === "evolucao" && (
        <GoalsYearlyGrid
          loans={loans}
          payments={payments}
          expenses={expenses}
          clients={clients}
          installmentSchedules={installmentSchedules}
        />
      )}
      {sub === "configuracao" && (
        <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">Carregando…</div>}>
          <MonthlyGoalsManager readOnly={readOnly} />
        </Suspense>
      )}
    </div>
  );
}


