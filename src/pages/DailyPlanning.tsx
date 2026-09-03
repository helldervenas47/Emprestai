import { lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useLoans } from "@/features/loans/hooks/useLoans";
import { useExpenses } from "@/features/financial/hooks/useExpenses";
import { useProducts } from "@/features/sales/hooks/useProducts";

const DailyPlanningReport = lazy(() =>
  import("@/components/DailyPlanningReport").then((m) => ({ default: m.DailyPlanningReport }))
);

const DailyPlanning = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { loans, payments, installmentSchedules } = useLoans();
  const { expenses } = useExpenses(true);
  const { sales } = useProducts(true);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    navigate("/auth");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/30 glass sticky top-0 z-40" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="max-w-[1280px] mx-auto px-3 sm:px-4 lg:px-8 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="h-9 w-9" aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 min-w-0">
            <CalendarClock className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold truncate">Planejamento Diário</h1>
              <p className="text-[11px] text-muted-foreground hidden sm:block">
                Resumo financeiro consolidado: receitas, despesas e saldo previsto.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6">
        <Suspense fallback={<div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>}>
          <DailyPlanningReport
            loans={loans}
            payments={payments}
            installmentSchedules={installmentSchedules}
            sales={sales}
            expenses={expenses}
          />
        </Suspense>
      </main>
    </div>
  );
};

export default DailyPlanning;
