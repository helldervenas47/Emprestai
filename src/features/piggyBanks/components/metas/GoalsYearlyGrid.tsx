import { useMemo, useState, useCallback, useEffect } from "react";
import { useMonthlyGoals, GoalType } from "@/features/piggyBanks/hooks/useMonthlyGoals";
import { useLoanRenegotiations } from "@/features/loans/hooks/useLoanRenegotiations";
import { useGoalSnapshots } from "@/features/piggyBanks/hooks/useGoalSnapshots";
import { useActiveCapitalSnapshots } from "@/features/piggyBanks/hooks/useActiveCapitalSnapshots";
import { useGoalScoreWeights } from "@/features/piggyBanks/hooks/useGoalScoreWeights";
import { Loan, Payment, Expense, Client, InstallmentSchedule } from "@/types/loan";
import { getLoanReceivable } from "@/features/loans/lib/loanLateFees";
import { GoalYearlyChartCard } from "./GoalYearlyChartCard";
import { ManagerCommissionsYearlyCard } from "./ManagerCommissionsYearlyCard";
import { ActiveTooltipProvider, useActiveTooltip } from "./ActiveTooltipContext";
import { PeriodFilterCard } from "./PeriodFilterCard";
import { ScoreCard, VariationCard } from "./ScoreCards";
import { Target, ListChecks } from "lucide-react";
import { getPreviousPeriod, PeriodSelection } from "@/features/piggyBanks/lib/metasPeriod";
import { computePeriodScore } from "@/features/piggyBanks/lib/metasScore";
import { ScoreDetailDialog } from "./ScoreDetailDialog";

type Unit = "%" | "R$" | "qtd";

const GOAL_META: Record<GoalType, { label: string; unit: Unit; inverse?: boolean }> = {
  interest_rate:      { label: "Taxa de Juros Mensal", unit: "%" },
  profit:             { label: "Faturamento do Período", unit: "%" },
  loan_volume:        { label: "Valor Emprestado", unit: "R$" },
  new_loans_count:    { label: "Novos Empréstimos", unit: "qtd" },
  received_total:     { label: "Pagamentos no Mês", unit: "R$" },
  interest_received:  { label: "Juros Recebidos", unit: "R$" },
  active_capital:     { label: "Capital Ativo", unit: "R$" },
  net_profit:         { label: "Lucro Líquido", unit: "R$" },
  max_default_rate:   { label: "Taxa de Inadimplência", unit: "%", inverse: true },
  new_clients_count:  { label: "Novos Clientes", unit: "qtd" },
  renegotiation_rate: { label: "Contratos Renegociados", unit: "qtd", inverse: true },
  daily_received_avg: { label: "Receita Média Diária", unit: "R$" },
  monthly_variation:  { label: "Variação Mensal do Patrimônio", unit: "%" },
};

const ALL_GOAL_TYPES: GoalType[] = [
  "interest_rate", "profit", "loan_volume", "new_loans_count",
  "received_total", "interest_received", "active_capital", "net_profit",
  "max_default_rate", "new_clients_count", "renegotiation_rate",
  "daily_received_avg", "monthly_variation",
];

interface Props {
  loans: Loan[];
  payments: Payment[];
  expenses: Expense[];
  clients: Client[];
  installmentSchedules: InstallmentSchedule[];
}

export function GoalsYearlyGrid({
  loans, payments, expenses, clients, installmentSchedules,
}: Props) {
  const { goals, loading } = useMonthlyGoals();
  const { renegotiations } = useLoanRenegotiations();
  const [period, setPeriod] = useState<PeriodSelection>({
    mode: "month",
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  });

  const goalTypes = useMemo<GoalType[]>(() => {
    const set = new Set<GoalType>();
    goals.forEach((g) => set.add(g.goalType));
    return ALL_GOAL_TYPES.filter((t) => set.has(t));
  }, [goals]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Carregando metas…
      </div>
    );
  }

  return (
    <ActiveTooltipProvider>
      <GridInner
        period={period}
        setPeriod={setPeriod}
        goalTypes={goalTypes}
        loans={loans}
        payments={payments}
        expenses={expenses}
        clients={clients}
        installmentSchedules={installmentSchedules}
        renegotiations={renegotiations}
      />
    </ActiveTooltipProvider>
  );
}

function GridInner(props: {
  period: PeriodSelection;
  setPeriod: (p: PeriodSelection) => void;
  goalTypes: GoalType[];
  loans: Loan[];
  payments: Payment[];
  expenses: Expense[];
  clients: Client[];
  installmentSchedules: InstallmentSchedule[];
  renegotiations: ReturnType<typeof useLoanRenegotiations>["renegotiations"];
}) {
  const { period, setPeriod, goalTypes, loans, payments, expenses, clients, installmentSchedules, renegotiations } = props;
  const { clearAll } = useActiveTooltip("__grid__");
  const { goals } = useMonthlyGoals();
  const { getSnapshot } = useGoalSnapshots();
  const { weights } = useGoalScoreWeights();

  // Garantimos que o capital ativo use os dados mais frescos das props
  const currentActiveCapital = useMemo(
    () => loans
      .filter((l: any) => l.status !== "completed" && l.status !== "paid")
      .reduce((s: number, l: any) => s + getLoanReceivable(l, payments, installmentSchedules), 0),
    [loans, payments, installmentSchedules],
  );

  const { currentMonth: acCurrentMonth, getSnapshotAmount, snapshots } = useActiveCapitalSnapshots(currentActiveCapital);

  // Forçar atualização do snapshot de capital ativo quando os dados de empréstimos mudarem
  useEffect(() => {
    // O useActiveCapitalSnapshots já tem um efeito interno que sincroniza com o banco
    // quando o currentAmount muda. Aqui garantimos que ele tenha as dependências corretas.
  }, [currentActiveCapital]);

  const scoreInputs = useMemo(() => ({
    loans, payments, expenses, clients, installmentSchedules, renegotiations,
    goals, getSnapshot, acCurrentMonth, currentActiveCapital, getSnapshotAmount,
  }), [loans, payments, expenses, clients, installmentSchedules, renegotiations, goals, getSnapshot, acCurrentMonth, currentActiveCapital, getSnapshotAmount]);

  const currentScore = useMemo(() => computePeriodScore(period, weights, scoreInputs), [period, weights, scoreInputs]);
  const previousScore = useMemo(() => computePeriodScore(getPreviousPeriod(period), weights, scoreInputs), [period, weights, scoreInputs]);

  const handlePeriodChange = useCallback((p: PeriodSelection) => { clearAll(); setPeriod(p); }, [clearAll, setPeriod]);
  const handleYearChange = useCallback((y: number) => { clearAll(); setPeriod({ ...period, year: y }); }, [clearAll, period]);

  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* 4 cards de topo */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <div className="col-span-2 md:col-span-1">
          <ScoreCard label="Pontuação Atual" value={currentScore.total} max={100} variant="current" />
        </div>
        <ScoreCard label="Pontuação Anterior" value={previousScore.total} max={100} variant="previous" />
        <VariationCard current={currentScore.total} previous={previousScore.total} />
        <div className="col-span-2 md:col-span-3 lg:col-span-1">
          <PeriodFilterCard value={period} onChange={handlePeriodChange} />
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-card hover:bg-muted/60 px-4 py-2 text-sm font-semibold text-foreground transition-colors"
        >
          <ListChecks className="h-4 w-4 text-primary" />
          Ver pontuação detalhada
        </button>
      </div>

      <ScoreDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        weights={weights}
        inputs={scoreInputs}
      />


      {goalTypes.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center border border-dashed border-border rounded-xl bg-muted/20">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Target className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Nenhuma meta cadastrada</p>
            <p className="text-xs text-muted-foreground mt-1">
              Vá em <span className="font-medium">Configuração de Metas</span> para cadastrar sua primeira meta.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 auto-rows-[440px]">
          <ManagerCommissionsYearlyCard
            year={period.year}
            onYearChange={handleYearChange}
            clients={clients}
            loans={loans}
            payments={payments}
          />
          {goalTypes.map((gt) => {
            const meta = GOAL_META[gt];
            return (
              <GoalYearlyChartCard
                key={gt}
                goalType={gt}
                goalLabel={meta.label}
                unit={meta.unit}
                inverse={meta.inverse}
                year={period.year}
                onYearChange={handleYearChange}
                loans={loans}
                payments={payments}
                expenses={expenses}
                clients={clients}
                installmentSchedules={installmentSchedules}
                renegotiations={renegotiations}
                compact
                period={period}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
