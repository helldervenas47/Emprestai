import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Target, Pencil, Trash2, Plus, Percent, TrendingUp, Banknote, FileText,
  HandCoins, Coins, Wallet, PiggyBank, AlertTriangle, UserPlus, Copy,
  ChevronLeft, ChevronRight, RefreshCw, BarChart3,
} from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { toast } from "sonner";
import { useMonthlyGoals, GoalType, currentMonthKey, formatMonthLabel } from "@/features/piggyBanks/hooks/useMonthlyGoals";
import { useGoalScoreWeights } from "@/features/piggyBanks/hooks/useGoalScoreWeights";
import { computeActual as computeActualFromGoalsCard } from "@/features/piggyBanks/components/GoalsCard";
import { useLoans } from "@/features/loans/hooks/useLoans";
import { getLoanReceivable } from "@/features/loans/lib/loanLateFees";
import { useClients } from "@/features/clients/hooks/useClients";
import { useExpenses } from "@/features/financial/hooks/useExpenses";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { useHideValues } from "@/contexts/HideValuesContext";
import { useActiveCapitalSnapshots } from "@/features/piggyBanks/hooks/useActiveCapitalSnapshots";
import { todayInAppTz } from "@/lib/timezone";

type Unit = "%" | "R$" | "qtd";

const GOAL_TYPE_META: Record<GoalType, { label: string; icon: any; unit: Unit; color: string; description: string; inverse?: boolean }> = {
  interest_rate:      { label: "Taxa de Juros Mensal",            icon: Percent,       unit: "%",   color: "text-warning",     description: "Meta da taxa média de juros aplicada nos contratos." },
  profit:             { label: "Faturamento do Período (% do Previsto)", icon: TrendingUp,    unit: "%",   color: "text-success",     description: "Quanto do valor previsto foi efetivamente realizado." },
  loan_volume:        { label: "Volume Emprestado no Mês",         icon: Banknote,      unit: "R$",  color: "text-primary",     description: "Soma do valor de novos empréstimos criados no mês." },
  new_loans_count:    { label: "Novos Empréstimos no Mês",         icon: FileText,      unit: "qtd", color: "text-primary",     description: "Quantidade de novos contratos criados no mês." },
  received_total:     { label: "Recebimentos no Mês",              icon: HandCoins,     unit: "R$",  color: "text-success",     description: "Soma de todos os pagamentos recebidos no mês." },
  interest_received:  { label: "Juros Recebidos",           icon: Coins,         unit: "R$",  color: "text-success",     description: "Apenas a parte dos juros dos pagamentos recebidos." },
  active_capital:     { label: "Capital Ativo / em Circulação",    icon: Wallet,        unit: "R$",  color: "text-primary",     description: "Valor mensal congelado no fechamento de cada mês." },
  net_profit:         { label: "Lucro Líquido do Mês",             icon: PiggyBank,     unit: "R$",  color: "text-success",     description: "Juros recebidos menos despesas pagas da empresa." },
  max_default_rate:   { label: "Inadimplência Máxima",             icon: AlertTriangle, unit: "%",   color: "text-destructive", description: "Limite máximo de % de parcelas em atraso (meta inversa).", inverse: true },
  new_clients_count:  { label: "Novos Clientes no Mês",            icon: UserPlus,      unit: "qtd", color: "text-primary",     description: "Clientes cadastrados no período." },
  renegotiation_rate: { label: "Contratos Renegociados (máx)",     icon: RefreshCw,     unit: "qtd", color: "text-destructive", description: "Limite máximo de contratos renegociados no mês (meta inversa).", inverse: true },
  daily_received_avg: { label: "Média Geral Recebida por Dia",     icon: HandCoins,     unit: "R$",  color: "text-success",     description: "Meta diária de recebimentos. Mostra média diária e quanto falta receber por dia até o fim do mês." },
  monthly_variation:  { label: "Variação Mensal do Patrimônio",    icon: BarChart3,     unit: "%",   color: "text-primary",     description: "Meta de crescimento mensal do patrimônio (% vs mês anterior)." },
};

const ALL_TYPES = Object.keys(GOAL_TYPE_META) as GoalType[];

function inMonth(dateStr: string | undefined | null, month: string): boolean {
  if (!dateStr) return false;
  return dateStr.slice(0, 7) === month;
}

function fmtValue(v: number, unit: Unit, hidden: boolean): string {
  if (unit === "R$") return hidden ? "R$ ••••" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (unit === "%") return `${v.toFixed(2)}%`;
  return Math.round(v).toString();
}

export function MonthlyGoalsManager({ readOnly = false }: { readOnly?: boolean } = {}) {
  const { goals, upsertGoal, deleteGoal, loading } = useMonthlyGoals();
  const { loans, payments, installmentSchedules } = useLoans();
  const { clients } = useClients();
  const { expenses } = useExpenses(true);
  const { hidden } = useHideValues();
  const currentActiveCapital = useMemo(
    () => loans.filter((l: any) => l.status !== "completed" && l.status !== "paid")
      .reduce((s: number, l: any) => s + getLoanReceivable(l, payments, installmentSchedules), 0),
    [loans, payments, installmentSchedules]
  );
  const { currentMonth, getSnapshotAmount } = useActiveCapitalSnapshots(currentActiveCapital);

  const [goalType, setGoalType] = useState<GoalType>("loan_volume");
  const [month, setMonth] = useState(currentMonthKey());
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState<string>(currentMonthKey());

  const reset = () => {
    setEditId(null);
    setGoalType("loan_volume");
    setMonth(currentMonthKey());
    setValue("");
    setNotes("");
  };

  const handleSave = async () => {
    const num = parseFloat(value.replace(",", "."));
    if (isNaN(num) || num < 0) return;
    await upsertGoal(goalType, month, num, notes);
    reset();
  };

  const handleEdit = (g: typeof goals[number]) => {
    setEditId(g.id);
    setGoalType(g.goalType);
    setMonth(g.month);
    setValue(String(g.targetValue));
    setNotes(g.notes || "");
  };

  // Computa o valor realizado para uma meta — usa exatamente a mesma lógica do GoalsCard (Dashboard)
  const computeActual = (type: GoalType, m: string): number => {
    if (type === "active_capital") {
      return m === currentMonth ? currentActiveCapital : (getSnapshotAmount(m) ?? 0);
    }
    return computeActualFromGoalsCard(type, m, loans, payments, expenses, clients, installmentSchedules);
  };

  const enrichedGoals = useMemo(() =>
    goals.map((g) => {
      const meta = GOAL_TYPE_META[g.goalType];
      let actual = computeActual(g.goalType, g.month);
      let target = g.targetValue;
      // Para "Média Geral Recebida por Dia": targetValue É a meta DIÁRIA.
      // Comparamos a média diária realizada diretamente contra ela.
      if (g.goalType === "daily_received_avg") {
        const [yy, mm] = g.month.split("-").map(Number);
        const today = new Date();
        const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
        const daysInMonth = new Date(yy, mm, 0).getDate();
        const isCurrent = g.month === currentMonth;
        const daysElapsed = isCurrent
          ? today.getDate()
          : (g.month < currentMonth ? daysInMonth : 1);
        actual = daysElapsed > 0 ? actual / daysElapsed : 0; // média diária realizada
        // target permanece como meta diária direta (não dividir)
      }
      let pct = 0;
      if (target > 0) {
        pct = meta?.inverse
          ? Math.max(0, 100 - (actual / target) * 100)
          : Math.min(100, (actual / target) * 100);
      }
      return { ...g, actual, pct };
    }),
    [goals, loans, payments, clients, expenses]
  );

  // Helpers de mês
  const shiftMonthKey = (m: string, delta: number) => {
    const [y, mm] = m.split("-").map(Number);
    const d = new Date(y, mm - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const prevMonthKey = (m: string) => shiftMonthKey(m, -1);
  const goPrevMonth = () => setFilterMonth((m) => shiftMonthKey(m, -1));
  const goNextMonth = () => setFilterMonth((m) => shiftMonthKey(m, 1));

  // Agrupa metas do mês filtrado pelo tipo (nome)
  const groupedGoals = useMemo(() => {
    const filtered = enrichedGoals.filter((g) => g.month === filterMonth);
    const map = new Map<GoalType, typeof enrichedGoals>();
    filtered.forEach((g) => {
      const arr = map.get(g.goalType) || [];
      arr.push(g);
      map.set(g.goalType, arr);
    });
    return Array.from(map.entries()).map(([type, items]) => ({
      type,
      items: [...items].sort((a, b) => b.month.localeCompare(a.month)),
    }));
  }, [enrichedGoals, filterMonth]);

  // Tipos cadastrados no mês anterior mas não no atual filtrado
  const prevMonth = prevMonthKey(filterMonth);
  const missingFromPrev = useMemo(() => {
    const currentTypes = new Set(goals.filter((g) => g.month === filterMonth).map((g) => g.goalType));
    return goals.filter((g) => g.month === prevMonth && !currentTypes.has(g.goalType));
  }, [goals, filterMonth, prevMonth]);

  const copyFromPrevMonth = async () => {
    if (missingFromPrev.length === 0) {
      toast.info("Nenhuma meta nova para copiar do mês anterior");
      return;
    }
    for (const g of missingFromPrev) {
      await upsertGoal(g.goalType, filterMonth, g.targetValue, g.notes || undefined);
    }
    toast.success(`${missingFromPrev.length} meta(s) copiada(s) do mês anterior`);
  };

  const selectedMeta = GOAL_TYPE_META[goalType];

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      {!readOnly && <ScoreWeightsCard />}
      {!readOnly && (
      <Card no3d>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">{editId ? "Editar Meta" : "Nova Meta"}</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo de meta</Label>
              <Select value={goalType} onValueChange={(v) => setGoalType(v as GoalType)} disabled={!!editId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {ALL_TYPES.map((t) => {
                    const m = GOAL_TYPE_META[t];
                    const Icon = m.icon;
                    return (
                      <SelectItem key={t} value={t}>
                        <span className="flex items-center gap-2">
                          <Icon className={`h-3.5 w-3.5 ${m.color}`} /> {m.label} <span className="text-xs text-muted-foreground">({m.unit})</span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{selectedMeta.description}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Mês/Ano</Label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} disabled={!!editId} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor da meta ({selectedMeta.unit})</Label>
              <Input
                type="number"
                step={selectedMeta.unit === "qtd" ? "1" : "0.01"}
                placeholder={selectedMeta.unit === "R$" ? "Ex: 10000" : selectedMeta.unit === "%" ? "Ex: 15" : "Ex: 5"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Observação (opcional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button data-mutation onClick={handleSave} disabled={!value}>
              <Plus className="h-4 w-4" /> {editId ? "Salvar" : "Criar Meta"}
            </Button>
            {editId && <Button variant="outline" onClick={reset}>Cancelar</Button>}
          </div>
        </CardContent>
      </Card>
      )}

      <Card no3d>
        <CardContent className="p-4 min-w-0 overflow-x-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <h3 className="font-semibold text-foreground">Metas cadastradas</h3>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-border/50 bg-muted/30 p-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-background"
                  onClick={goPrevMonth}
                  title="Mês anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <button
                  type="button"
                  onClick={() => setFilterMonth(currentMonthKey())}
                  className="text-xs font-medium text-foreground px-3 min-w-[140px] text-center hover:text-primary transition-colors"
                  title="Voltar para o mês atual"
                >
                  {formatMonthLabel(filterMonth)}
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-background"
                  onClick={goNextMonth}
                  title="Próximo mês"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              {!readOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyFromPrevMonth}
                  disabled={missingFromPrev.length === 0}
                  title={missingFromPrev.length === 0 ? "Nada novo para copiar do mês anterior" : `Copiar ${missingFromPrev.length} meta(s) de ${formatMonthLabel(prevMonth)}`}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copiar do mês anterior
                  {missingFromPrev.length > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{missingFromPrev.length}</Badge>
                  )}
                </Button>
              )}
            </div>
          </div>
          {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!loading && groupedGoals.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma meta cadastrada para {formatMonthLabel(filterMonth)}.
            </p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full overflow-x-hidden auto-rows-fr items-stretch">
            {groupedGoals.map(({ type, items }) => {
              const meta = GOAL_TYPE_META[type];
              if (!meta) return null;
              const Icon = meta.icon;
              // bg do ícone com base na cor semântica
              const iconBg =
                meta.color.includes("primary") ? "bg-primary/10 dark:bg-primary/15" :
                meta.color.includes("success") ? "bg-success/10 dark:bg-success/15" :
                meta.color.includes("warning") ? "bg-warning/10 dark:bg-warning/15" :
                meta.color.includes("destructive") ? "bg-destructive/10 dark:bg-destructive/15" :
                "bg-muted";
              return (
                <div
                  key={type}
                  className="rounded-2xl p-4 bg-card border border-border shadow-sm hover:shadow-md hover:-translate-y-[1px] transition-all duration-300 flex flex-col min-w-0 w-full h-full"
                >
                  <div className="flex flex-col items-center text-center mb-3 min-h-[110px] leading-tight">
                    <div className={`h-10 w-10 rounded-xl ${iconBg} flex items-center justify-center mb-2 ring-1 ring-border/50`}>
                      <Icon className={`h-5 w-5 ${meta.color}`} />
                    </div>
                    <p className="text-[11px] font-semibold text-foreground uppercase tracking-wider leading-[14px] line-clamp-2 min-h-[28px]">
                      {meta.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-[14px] min-h-[14px]">
                      {items.length} {items.length === 1 ? "registro" : "registros"}
                    </p>
                  </div>



                  <div className="space-y-2 flex-1">
                    {items.map((g) => {
                      const targetStr = fmtValue(g.targetValue, meta.unit, hidden);
                      const actualStr = fmtValue(g.actual, meta.unit, hidden);
                      const pctRound = Math.round(g.pct);
                      const reached = meta.inverse ? g.actual <= g.targetValue : g.actual >= g.targetValue;
                      return (
                        <div
                          key={g.id}
                          className="rounded-lg border border-border bg-background/60 dark:bg-background/40 p-2.5 space-y-2 hover:border-primary/40 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 h-5 bg-muted/50 border-border/60 font-medium"
                            >
                              {formatMonthLabel(g.month)}
                            </Badge>
                            {!readOnly && (
                              <div className="shrink-0 -mr-1">
                                <RowActions
                                  actions={[
                                    { label: "Editar", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => handleEdit(g) },
                                    { label: "Excluir", icon: <Trash2 className="h-3.5 w-3.5" />, destructive: true, onClick: () => setDeleteId(g.id) },
                                  ]}
                                />
                              </div>
                            )}

                          </div>

                          <div className="flex items-baseline justify-between gap-1 border-b border-border/50 pb-1.5 min-h-[22px]">
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground leading-[14px]">Meta</span>
                            <span className={`text-sm font-bold ${meta.color} truncate leading-[18px]`}>{targetStr}</span>
                          </div>
                          <div className="flex items-baseline justify-between gap-1 min-h-[22px]">
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground leading-[14px]">Real</span>
                            <span className="text-sm font-semibold text-foreground truncate leading-[18px]">{actualStr}</span>
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] leading-[14px] min-h-[14px]">
                              <span className="text-muted-foreground">Progresso</span>
                              <span className={reached ? "text-success font-bold" : "text-muted-foreground font-medium"}>
                                {pctRound}% {reached && "✓"}
                              </span>
                            </div>
                            <Progress
                              value={Math.max(0, Math.min(100, g.pct))}
                              className={`h-1.5 ${reached ? "[&>div]:bg-success" : ""}`}
                            />
                          </div>
                          <p
                            className="text-[10px] text-muted-foreground truncate italic leading-[14px] min-h-[14px]"
                            title={g.notes || ""}
                          >
                            {g.notes || "\u00A0"}
                          </p>


                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        onConfirm={() => { if (deleteId) { deleteGoal(deleteId); setDeleteId(null); } }}
        title="Excluir meta"
        description="Tem certeza que deseja excluir esta meta?"
      />
    </div>
  );
}

function ScoreWeightsCard() {
  const { weights, saveAll, total } = useGoalScoreWeights();
  const [draft, setDraft] = useState<Record<GoalType, number> | null>(null);
  const current = draft ?? weights;
  const draftTotal = Object.values(current).reduce((s, v) => s + (Number(v) || 0), 0);
  const diff = 100 - draftTotal;

  const setValue = (t: GoalType, v: number) => {
    setDraft({ ...(draft ?? weights), [t]: Math.max(0, Math.round(v || 0)) });
  };

  const save = () => {
    if (draftTotal !== 100) {
      toast.error(
        diff > 0
          ? `Faltam ${diff} pontos para completar 100.`
          : `Excedeu em ${Math.abs(diff)} pontos. Ajuste para totalizar 100.`,
      );
      return;
    }
    if (draft) saveAll(draft);
    setDraft(null);
    toast.success("Pontuações salvas!");
  };

  const reset = () => setDraft(null);
  const hasChanges = !!draft;
  const [open, setOpen] = useState(false);

  return (
    <Card no3d>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
            aria-expanded={open}
          >
            <Target className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-semibold text-foreground flex items-center gap-1.5">
                Pontuação das Metas
                <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
              </h3>
              <p className="text-xs text-muted-foreground">
                Cada meta tem um peso. Meta atingida = peso cheio; não atingida = 0. Soma deve ser exatamente 100.
              </p>
            </div>
          </button>
          <div className="flex items-center gap-2">
            <Badge
              variant={draftTotal === 100 ? "default" : "destructive"}
              className={draftTotal === 100 ? "bg-success text-success-foreground" : ""}
            >
              Total: {draftTotal} / 100
              {draftTotal !== 100 && (
                <span className="ml-1 opacity-90">
                  {diff > 0 ? `(faltam ${diff})` : `(excede ${Math.abs(diff)})`}
                </span>
              )}
            </Badge>
            {hasChanges && (
              <>
                <Button size="sm" variant="outline" onClick={reset}>Cancelar</Button>
                <Button size="sm" data-mutation onClick={save} disabled={draftTotal !== 100}>Salvar</Button>
              </>
            )}
          </div>
        </div>

        {open && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">

          {(Object.keys(GOAL_TYPE_META) as GoalType[]).map((t) => {
            const meta = GOAL_TYPE_META[t];
            const Icon = meta.icon;
            return (
              <div
                key={t}
                className="flex items-center gap-2 rounded-lg border border-border bg-background/60 p-2"
              >
                <div className={`h-7 w-7 rounded-md flex items-center justify-center bg-muted shrink-0`}>
                  <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-foreground leading-tight line-clamp-2">{meta.label}</p>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={current[t] ?? 0}
                  onChange={(e) => setValue(t, Number(e.target.value))}
                  className="w-14 h-8 text-xs text-center px-1"
                />
              </div>
            );
          })}
        </div>
        )}
      </CardContent>
    </Card>
  );
}
