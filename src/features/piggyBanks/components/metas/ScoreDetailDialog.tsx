import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { GoalType } from "@/features/piggyBanks/hooks/useMonthlyGoals";
import { computeMonthResult, type RealizedInputs } from "@/features/piggyBanks/lib/metasMonthResult";
import { isGoalReached, monthKey } from "@/features/piggyBanks/lib/metasPeriod";
import { INVERSE_GOAL_TYPES } from "@/features/piggyBanks/lib/metasScore";

const GOAL_LABELS: Record<GoalType, string> = {
  interest_rate: "Taxa de Juros Mensal",
  profit: "Faturamento do Período",
  loan_volume: "Valor Emprestado",
  new_loans_count: "Novos Empréstimos",
  received_total: "Pagamentos no Mês",
  interest_received: "Juros Recebidos",
  active_capital: "Capital Ativo",
  net_profit: "Lucro Líquido",
  max_default_rate: "Taxa de Inadimplência",
  new_clients_count: "Novos Clientes",
  renegotiation_rate: "Contratos Renegociados",
  daily_received_avg: "Receita Média Diária",
  monthly_variation: "Variação Mensal do Patrimônio",
};

const MONTH_LABELS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  weights: Record<GoalType, number>;
  inputs: RealizedInputs;
}

export function ScoreDetailDialog({ open, onOpenChange, weights, inputs }: Props) {
  const [year, setYear] = useState(new Date().getFullYear());

  const { rows, monthTotals, grandTotal } = useMemo(() => {
    const goalTypes = (Object.keys(weights) as GoalType[]).filter((gt) => Number(weights[gt] || 0) > 0);

    const rows = goalTypes.map((gt) => {
      const w = Number(weights[gt] || 0);
      const inverse = INVERSE_GOAL_TYPES.has(gt);
      let validCount = 0;
      let sumPoints = 0;
      const monthly = Array.from({ length: 12 }, (_, i) => {
        const mk = monthKey(year, i + 1);
        const r = computeMonthResult(gt, mk, inputs);
        if (!r.hasGoal || r.isFuture) return 0;
        validCount += 1;
        const pts = isGoalReached(inverse, r.target, r.realized) ? w : 0;
        sumPoints += pts;
        return pts;
      });
      const total = validCount > 0 ? sumPoints / validCount : 0;
      return {
        goalType: gt,
        label: GOAL_LABELS[gt] ?? gt,
        weight: w,
        monthly,
        total,
      };
    }).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

    const monthTotals = Array.from({ length: 12 }, (_, i) =>
      rows.reduce((s, r) => s + r.monthly[i], 0),
    );
    const grandTotal = rows.reduce((s, r) => s + r.total, 0);

    return { rows, monthTotals, grandTotal };
  }, [weights, inputs, year]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 w-screen h-[100dvh] max-w-none sm:max-w-none sm:rounded-none border-0 translate-x-0 translate-y-0 left-0 top-0 flex flex-col [&>[data-radix-dialog-close]]:hidden [&_>button.absolute]:hidden"
        style={{ transform: "none" }}
      >
        {/* Cabeçalho fixo */}
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 border-b border-border bg-background shrink-0">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-foreground hover:bg-muted -ml-1 shrink-0"
            aria-label="Voltar"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm">Voltar</span>
          </button>

          <DialogTitle className="text-sm sm:text-lg font-semibold truncate flex-1 text-center">
            Pontuação das Metas
          </DialogTitle>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              className="p-1 rounded-md hover:bg-muted"
              aria-label="Ano anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="tabular-nums text-sm font-medium w-12 text-center">{year}</span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              className="p-1 rounded-md hover:bg-muted"
              aria-label="Próximo ano"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {/* Botão de fechar dedicado para tablet/desktop — o botão nativo do Radix
                está oculto pelas classes acima, então garantimos uma saída visível
                em todas as viewports. */}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="ml-2 hidden sm:inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted text-foreground"
              aria-label="Fechar"
              title="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Conteúdo com rolagem */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b border-border">
                <th className="py-2 px-3 font-semibold text-muted-foreground text-left sticky left-0 bg-background z-20 min-w-[180px]">
                  Meta
                </th>
                {MONTH_LABELS.map((m) => (
                  <th key={m} className="py-2 px-2 font-semibold text-muted-foreground text-right tabular-nums min-w-[52px]">
                    {m}
                  </th>
                ))}
                <th className="py-2 px-3 font-semibold text-muted-foreground text-right tabular-nums min-w-[90px] bg-muted/30">
                  Total do Ano
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-6 px-3 text-center text-muted-foreground">
                    Nenhuma meta com pontuação cadastrada.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.goalType} className="border-b border-border/50">
                    <td className="py-2 px-3 sticky left-0 bg-background z-10 font-medium">
                      {r.label}
                    </td>
                    {r.monthly.map((v, i) => (
                      <td key={i} className="py-2 px-2 text-right tabular-nums text-foreground">
                        {v > 0 ? v : ""}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right tabular-nums font-semibold bg-muted/20">
                      {r.total > 0 ? (Number.isInteger(r.total) ? r.total : r.total.toFixed(2).replace(".", ",")) : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border font-semibold bg-muted/40">
                  <td className="py-3 px-3 sticky left-0 bg-muted/40 z-10">Pontuação Geral</td>
                  {monthTotals.map((v, i) => (
                    <td key={i} className="py-3 px-2 text-right tabular-nums">{v > 0 ? v : ""}</td>
                  ))}
                  <td className="py-3 px-3 text-right tabular-nums bg-muted/60">{grandTotal > 0 ? (Number.isInteger(grandTotal) ? grandTotal : grandTotal.toFixed(2).replace(".", ",")) : ""}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
