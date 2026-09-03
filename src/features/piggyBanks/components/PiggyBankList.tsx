import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PiggyBank, Plus, TrendingUp, Trash2, Pencil, Sparkles, Wallet, History, ArrowDownCircle, ArrowUpCircle, Repeat, Receipt, Percent, CalendarClock, Coins, RefreshCw, Zap, Target, Calendar, Info } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { RowActions } from "@/components/ui/row-actions";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { useHideValues } from "@/contexts/HideValuesContext";
import { usePiggyBanks, type PiggyBank as PiggyBankType, type PiggyBankDeposit } from "@/features/piggyBanks/hooks/usePiggyBanks";
import { useUnifiedAccountBalance } from "@/features/financial/hooks/useUnifiedAccountBalance";
import { PiggyBanksHero } from "@/features/piggyBanks/components/PiggyBanksHero";
import { cn } from "@/lib/utils";

import { PIGGY_BANK_CATEGORIES } from "@/features/piggyBanks/lib/piggyBankCategories";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/userClient";
import { toast } from "sonner";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const PALETTE = [
  "210 80% 55%", "150 65% 45%", "280 70% 60%", "30 85% 55%",
  "340 75% 60%", "190 70% 50%", "45 90% 55%", "0 75% 60%",
];

interface Props {
  readOnly?: boolean;
  fullWidth?: boolean;
}

export function PiggyBankList({ readOnly = false, fullWidth = false }: Props) {
  const navigate = useNavigate();
  const { mask } = useHideValues();
  const { piggyBanks, deposits, recurrences, balances, detailed, cdiRate, createPiggyBank, updatePiggyBank, deletePiggyBank, adjustBalance, updateDeposit, deleteDeposit, setPiggyRate, refreshCdiNow, storeMoney, withdrawMoney, setRecurrenceActive, deleteRecurrence } = usePiggyBanks();
  


  const [transferTarget, setTransferTarget] = useState<PiggyBankType | null>(null);
  const [transferMode, setTransferMode] = useState<"store" | "withdraw">("store");
  const [transferValue, setTransferValue] = useState("");
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [transferring, setTransferring] = useState(false);
  const [pulseId, setPulseId] = useState<string | null>(null);

  // Saldo em conta — base unificada com o card "Saldo em Conta" da aba Receitas.
  const accountBalance = useUnifiedAccountBalance();

  const openTransfer = (pb: PiggyBankType, mode: "store" | "withdraw") => {
    setTransferTarget(pb);
    setTransferMode(mode);
    setTransferValue("");
    setTransferDate(new Date().toISOString().slice(0, 10));
  };
  const confirmTransfer = async () => {
    if (!transferTarget) return;
    const v = Number(transferValue.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) return;
    setTransferring(true);
    const ok = transferMode === "store"
      ? await storeMoney(transferTarget.id, v, transferDate)
      : await withdrawMoney(transferTarget.id, v, transferDate);
    setTransferring(false);
    if (ok) {
      setPulseId(transferTarget.id);
      setTimeout(() => setPulseId(null), 900);
      setTransferTarget(null);
    }
  };



  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PiggyBankType | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", color: PALETTE[0], annualRate: "11.15", autoRate: false, cdiPercent: "100", shortId: "", goalAmount: "", category: "", targetDate: "" });
  const [refreshingCdi, setRefreshingCdi] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<PiggyBankType | null>(null);
  const [adjustValue, setAdjustValue] = useState("");
  const [historyTarget, setHistoryTarget] = useState<PiggyBankType | null>(null);
  const [expensesById, setExpensesById] = useState<Record<string, { description: string; category: string }>>({});
  const [editDeposit, setEditDeposit] = useState<PiggyBankDeposit | null>(null);
  const [editDepositDraft, setEditDepositDraft] = useState({ amount: "", depositDate: "" });
  const [deleteDepositId, setDeleteDepositId] = useState<string | null>(null);
  // Diálogo de escolha quando a taxa muda no editar
  const [rateChangePending, setRateChangePending] = useState<{ pb: PiggyBankType; newRate: number } | null>(null);
  const [recurrenceTarget, setRecurrenceTarget] = useState<PiggyBankType | null>(null);

  const openEditDeposit = (d: PiggyBankDeposit) => {
    setEditDepositDraft({ amount: d.amount.toFixed(2), depositDate: d.depositDate });
    setEditDeposit(d);
  };
  const confirmEditDeposit = async () => {
    if (!editDeposit) return;
    const v = Number(editDepositDraft.amount.replace(",", "."));
    if (Number.isNaN(v)) return;
    await updateDeposit(editDeposit.id, { amount: v, depositDate: editDepositDraft.depositDate });
    setEditDeposit(null);
  };

  // Returns the smallest unused short_id (1..99) for this account.
  const nextAvailableShortId = (): number | null => {
    const taken = new Set(piggyBanks.map((p) => p.shortId).filter((n): n is number => !!n));
    for (let i = 1; i <= 99; i++) if (!taken.has(i)) return i;
    return null;
  };

  const openCreate = () => {
    const next = nextAvailableShortId();
    const startRate = cdiRate?.annualRate ? cdiRate.annualRate.toFixed(2) : "11.15";
    setDraft({ 
      name: "", color: PALETTE[0], annualRate: startRate, autoRate: true, cdiPercent: "100", 
      shortId: next ? String(next) : "", goalAmount: "", category: "", targetDate: "" 
    });
    setEditing(null);
    setCreateOpen(true);
  };
  const openEdit = (pb: PiggyBankType) => {
    const startRate = cdiRate?.annualRate ? cdiRate.annualRate.toFixed(2) : String(pb.annualRate);
    setDraft({ 
      name: pb.name, color: pb.color, annualRate: startRate, autoRate: true, 
      cdiPercent: String(pb.cdiPercent ?? 100), shortId: pb.shortId ? String(pb.shortId) : "",
      goalAmount: pb.goalAmount ? String(pb.goalAmount) : "",
      category: pb.category ?? "",
      targetDate: pb.targetDate ?? ""
    });
    setEditing(pb);
    setCreateOpen(true);
  };
  const openAdjust = (pb: PiggyBankType) => {
    const current = balances.get(pb.id)?.balance ?? 0;
    setAdjustValue(current.toFixed(2));
    setAdjustTarget(pb);
  };
  const confirmAdjust = async () => {
    if (!adjustTarget) return;
    const v = Number(adjustValue.replace(",", "."));
    if (Number.isNaN(v) || v < 0) return;
    await adjustBalance(adjustTarget.id, v);
    setAdjustTarget(null);
  };

  const historyDeposits = useMemo<PiggyBankDeposit[]>(() => {
    if (!historyTarget) return [];
    return deposits
      .filter((d) => d.piggyBankId === historyTarget.id)
      .slice()
      .sort((a, b) => {
        if (a.depositDate !== b.depositDate) return a.depositDate < b.depositDate ? 1 : -1;
        return a.id < b.id ? 1 : -1;
      });
  }, [historyTarget, deposits]);

  // Fetch linked expenses (description/category) for the history dialog.
  useEffect(() => {
    if (!historyTarget) return;
    const ids = Array.from(
      new Set(historyDeposits.map((d) => d.expenseId).filter((id): id is string => !!id))
    );
    const missing = ids.filter((id) => !(id in expensesById));
    if (missing.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from("expenses")
        .select("id, description, category")
        .in("id", missing);
      if (data) {
        setExpensesById((prev) => {
          const next = { ...prev };
          for (const row of data as any[]) {
            next[row.id] = { description: row.description, category: row.category };
          }
          return next;
        });
      }
    })();
  }, [historyTarget, historyDeposits, expensesById]);

  const save = async () => {
    if (!draft.name.trim()) return;
    // % do CDI escolhida pelo usuário (1..200). 100% = 1x CDI.
    const pctRaw = Number(draft.cdiPercent.replace(",", "."));
    const pct = Number.isFinite(pctRaw) && pctRaw > 0 ? Math.min(pctRaw, 500) : 100;
    // Taxa efetiva = CDI vigente * pct/100 (cai para 11.15% se ainda não há cache).
    const baseCdi = cdiRate ? cdiRate.annualRate : 11.15;
    const rate = Number((baseCdi * (pct / 100)).toFixed(4));

    const goalAmount = draft.goalAmount.trim() ? Number(draft.goalAmount.replace(",", ".")) : null;
    const category = draft.category.trim() || null;
    const targetDate = draft.targetDate.trim() || null;

    // Validate short id (1..99, unique within this account).
    let shortId: number | null = null;
    if (draft.shortId.trim()) {
      const n = Number(draft.shortId.trim());
      if (!Number.isInteger(n) || n < 1 || n > 99) {
        toast.error("O número da caixinha deve ser inteiro entre 1 e 99");
        return;
      }
      const conflict = piggyBanks.find((p) => p.shortId === n && p.id !== editing?.id);
      if (conflict) {
        toast.error(`O número ${n} já está em uso pela caixinha "${conflict.name}"`);
        return;
      }
      shortId = n;
    }

    if (editing) {
      const ok = await updatePiggyBank(editing.id, {
        name: draft.name.trim(),
        color: draft.color,
        shortId,
        autoRate: true,
        // cdiPercent é controlado pelo backend — não enviamos no update.
        goalAmount,
        category,
        targetDate,
      });
      if (!ok) {
        // Mantém o modal aberto para o usuário tentar de novo.
        return;
      }
      toast.success("Cofrinho atualizado");
    } else {
      await createPiggyBank({
        name: draft.name.trim(),
        color: draft.color,
        annualRate: rate,
        autoRate: true,
        cdiPercent: pct,
        shortId,
        goalAmount,
        category,
        targetDate,
      });
    }
    setEditing(null);
    setCreateOpen(false);
  };


  const handleRefreshCdi = async () => {
    setRefreshingCdi(true);
    try { await refreshCdiNow(); } finally { setRefreshingCdi(false); }
  };

  const cdiUpdatedLabel = useMemo(() => {
    if (!cdiRate?.fetchedAt) return "";
    try {
      return new Date(cdiRate.fetchedAt).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch { return ""; }
  }, [cdiRate?.fetchedAt]);


  const totalBalance = useMemo(
    () => piggyBanks.reduce((s, pb) => s + (balances.get(pb.id)?.balance ?? 0), 0),
    [piggyBanks, balances],
  );
  const totalYield = useMemo(
    () => piggyBanks.reduce((s, pb) => s + (balances.get(pb.id)?.yield ?? 0), 0),
    [piggyBanks, balances],
  );
  const totalGross = useMemo(
    () => piggyBanks.reduce((s, pb) => s + (detailed.get(pb.id)?.gross ?? 0), 0),
    [piggyBanks, detailed],
  );
  const totalIof = useMemo(
    () => piggyBanks.reduce((s, pb) => s + (detailed.get(pb.id)?.iof ?? 0), 0),
    [piggyBanks, detailed],
  );
  const totalIr = useMemo(
    () => piggyBanks.reduce((s, pb) => s + (detailed.get(pb.id)?.ir ?? 0), 0),
    [piggyBanks, detailed],
  );

  // Ações rápidas do hero: abre o diálogo já com a caixinha de maior saldo.
  const openTransferQuick = (mode: "store" | "withdraw") => {
    if (piggyBanks.length === 0) return;
    const best = piggyBanks
      .slice()
      .sort((a, b) => (balances.get(b.id)?.balance ?? 0) - (balances.get(a.id)?.balance ?? 0))[0];
    openTransfer(best, mode);
  };

  return (
    <div className="space-y-4">
      <PiggyBanksHero
        totalBalance={totalBalance}
        totalYield={totalYield}
        totalGross={totalGross}
        totalIof={totalIof}
        totalIr={totalIr}
        deposits={deposits}
        cdiAnnualRate={cdiRate?.annualRate ?? null}
        count={piggyBanks.length}
        readOnly={readOnly}
        hasBanks={piggyBanks.length > 0}
        mask={mask}
        onStore={() => openTransferQuick("store")}
        onWithdraw={() => openTransferQuick("withdraw")}
        onCreate={openCreate}
      />


      {/* Guardar / Resgatar dialog */}
      <Dialog open={!!transferTarget} onOpenChange={(o) => !o && setTransferTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{transferTarget?.name}</DialogTitle>
            <DialogDescription>
              Movimente dinheiro entre o saldo em conta e este cofrinho. Não afeta receitas, despesas nem relatórios.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {piggyBanks.length > 1 && (
              <div>
                <Label htmlFor="transfer-piggy">Caixinha</Label>
                <Select
                  value={transferTarget?.id ?? ""}
                  onValueChange={(v) => {
                    const pb = piggyBanks.find((p) => p.id === v);
                    if (pb) setTransferTarget(pb);
                  }}
                >
                  <SelectTrigger id="transfer-piggy">
                    <SelectValue placeholder="Selecione a caixinha" />
                  </SelectTrigger>
                  <SelectContent>
                    {piggyBanks.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={transferMode === "store" ? "default" : "outline"}
                onClick={() => setTransferMode("store")}
                className="h-11"
              >
                <ArrowDownCircle className="h-4 w-4 mr-1.5" /> Guardar
              </Button>
              <Button
                type="button"
                variant={transferMode === "withdraw" ? "default" : "outline"}
                onClick={() => setTransferMode("withdraw")}
                className="h-11"
              >
                <ArrowUpCircle className="h-4 w-4 mr-1.5" /> Resgatar
              </Button>
            </div>
            <div className="rounded-lg bg-muted/50 p-2.5 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Saldo em conta:</span>
                <span className="font-semibold tabular-nums">{fmt(accountBalance)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Saldo do cofrinho:</span>
                <span className="font-semibold tabular-nums">
                  {fmt(transferTarget ? balances.get(transferTarget.id)?.balance ?? 0 : 0)}
                </span>
              </div>
            </div>
            <div>
              <Label htmlFor="transfer-value">Valor (R$)</Label>
              <Input
                id="transfer-value"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={transferValue}
                onChange={(e) => setTransferValue(e.target.value)}
                placeholder="0,00"
              />
              {transferTarget && (() => {
                const v = Number(transferValue.replace(",", "."));
                if (!Number.isFinite(v) || v <= 0) return null;
                const max = transferMode === "store"
                  ? accountBalance
                  : (balances.get(transferTarget.id)?.balance ?? 0);
                if (v > max + 0.0001) {
                  return <p className="text-[11px] mt-1.5 text-destructive">Valor maior que o disponível ({fmt(max)})</p>;
                }
                return (
                  <p className="text-[11px] mt-1.5 text-muted-foreground">
                    {transferMode === "store" ? "Conta → Cofrinho" : "Cofrinho → Conta"}: {fmt(v)}
                  </p>
                );
              })()}
            </div>
            <div>
              <Label htmlFor="transfer-date">Data da movimentação</Label>
              <Input
                id="transfer-date"
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Permite registrar aportes retroativos para calcular o rendimento desde a data original.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferTarget(null)} disabled={transferring}>Cancelar</Button>
            <Button onClick={confirmTransfer} disabled={transferring || !transferValue}>
              {transferMode === "store" ? "Guardar" : "Resgatar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <div className={cn(
        fullWidth ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-2.5"
      )}>
        <p className={cn(
          "px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
          fullWidth && "md:col-span-2 lg:col-span-3"
        )}>
          Minhas caixinhas
        </p>
        {piggyBanks.length === 0 ? (
          <div className={cn(
            "rounded-3xl border border-dashed border-border/60 p-8 text-center",
            fullWidth && "md:col-span-2 lg:col-span-3"
          )}>
            <Sparkles className="h-7 w-7 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm font-semibold text-foreground">Nenhuma caixinha ainda</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Crie caixinhas para separar seu dinheiro por objetivo e render perto de 100% do CDI.
            </p>
          </div>
        ) : (
          piggyBanks.map((pb) => {
            const b = balances.get(pb.id);
            const det = detailed.get(pb.id);

            const currentBalance = b?.balance ?? 0;
            const pbYield = b?.yield ?? 0;
            const pbGross = det?.gross ?? pbYield;
            const pbIof = det?.iof ?? 0;
            const pbIr = det?.ir ?? 0;
            const hasTax = pbIof > 0 || pbIr > 0;
            const goal = pb.goalAmount ?? 0;
            const progress = goal > 0 ? Math.min(100, (currentBalance / goal) * 100) : 0;
            const remaining = goal > 0 ? Math.max(0, goal - currentBalance) : 0;

            const isCompleted = goal > 0 && currentBalance >= goal;
            const isNear = goal > 0 && !isCompleted && progress >= 80;

            return (
              <div
                key={pb.id}
                className={`relative rounded-3xl border border-border/50 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm ${
                  pulseId === pb.id ? "animate-scale-in ring-2 ring-primary/40" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => navigate(`/cofrinho/${pb.id}`)}
                  className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-2xl"
                  aria-label={`Abrir ${pb.name}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `hsl(${pb.color} / 0.14)` }}
                    >
                      <PiggyBank className="h-6 w-6" style={{ color: `hsl(${pb.color})` }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-[15px] font-bold text-foreground truncate">{pb.name}</h4>
                        {isCompleted && (
                          <Badge className="bg-success/15 text-success border-success/20 h-4 px-1 text-[9px] uppercase tracking-tighter">
                            Concluída
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 space-y-0.5">
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
                          {pb.category ? <span className="truncate">{pb.category}</span> : <span>Rendendo diariamente</span>}
                          {pbYield > 0 && (
                            <span className="text-success font-semibold whitespace-nowrap">
                              +{mask(fmt(pbYield))} líquido
                            </span>
                          )}
                        </div>
                        {hasTax && (
                          <div className="text-[10px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span>Bruto: <strong className="text-foreground font-medium">{mask(fmt(pbGross))}</strong></span>
                            {pbIof > 0 && <span>IOF: <strong className="text-destructive font-medium">-{mask(fmt(pbIof))}</strong></span>}
                            {pbIr > 0 && <span>IR: <strong className="text-destructive font-medium">-{mask(fmt(pbIr))}</strong></span>}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-[17px] font-black tabular-nums tracking-tight ${
                          isCompleted ? "text-success" : "text-foreground"
                        }`}
                      >
                        {mask(fmt(currentBalance))}
                      </p>
                      {goal > 0 && (
                        <p className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                          {Math.round(progress)}% da meta
                        </p>
                      )}
                    </div>
                  </div>

                  {goal > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <Progress
                        value={progress}
                        className={`h-2.5 rounded-full bg-muted/50 ${
                          isCompleted ? "[&>div]:bg-success" : isNear ? "[&>div]:bg-warning" : ""
                        }`}
                      />
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-medium text-muted-foreground">
                          {isCompleted ? "Objetivo alcançado" : `Faltam ${mask(fmt(remaining))}`}
                        </span>
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <span className="tabular-nums">Meta {mask(fmt(goal))}</span>
                          {pb.targetDate && (
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-2.5 w-2.5" />
                              {new Date(pb.targetDate + "T12:00:00").toLocaleDateString("pt-BR")}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </button>

                {!readOnly && (
                  <div className="mt-3 flex items-center gap-2 border-t border-border/40 pt-3">
                    <Button
                      data-mutation
                      size="sm"
                      variant="secondary"
                      className="h-9 flex-1 rounded-xl text-[11px] font-semibold"
                      onClick={() => openTransfer(pb, "store")}
                    >
                      <ArrowDownCircle className="h-3.5 w-3.5 mr-1" /> Guardar
                    </Button>
                    <Button
                      data-mutation
                      size="sm"
                      variant="outline"
                      className="h-9 flex-1 rounded-xl text-[11px] font-semibold"
                      onClick={() => openTransfer(pb, "withdraw")}
                    >
                      <ArrowUpCircle className="h-3.5 w-3.5 mr-1" /> Resgatar
                    </Button>
                    <button
                      type="button"
                      onClick={() => openEdit(pb)}
                      className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                      aria-label={`Editar ${pb.name}`}
                      data-testid={`edit-piggy-${pb.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <p className="px-1 text-[10px] text-muted-foreground">
        Rendimento aplicado diariamente (juros compostos), referência ~100% do CDI. Você também pode
        destinar uma despesa pessoal a uma caixinha.
      </p>


      {/* Create/edit dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cofrinho" : "Novo cofrinho"}</DialogTitle>
            <DialogDescription>
              Defina um nome, cor e a taxa anual de rendimento (default ~100% CDI).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-[1fr_90px] gap-2">
              <div>
                <Label htmlFor="pb-name">Nome</Label>
                <Input
                  id="pb-name"
                  placeholder="Ex: Reserva de emergência"
                  value={draft.name}
                  onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="pb-shortid">Nº (1-99)</Label>
                <Input
                  id="pb-shortid"
                  type="number"
                  min={1}
                  max={99}
                  step={1}
                  inputMode="numeric"
                  placeholder="Ex: 1"
                  value={draft.shortId}
                  onChange={(e) => setDraft((p) => ({ ...p, shortId: e.target.value.replace(/[^\d]/g, "").slice(0, 2) }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="pb-category">Categoria (opcional)</Label>
                <Select
                  value={draft.category || "__none__"}
                  onValueChange={(v) => setDraft((p) => ({ ...p, category: v === "__none__" ? "" : v }))}
                >
                  <SelectTrigger id="pb-category">
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem categoria</SelectItem>
                    {PIGGY_BANK_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                    {draft.category && !PIGGY_BANK_CATEGORIES.includes(draft.category as typeof PIGGY_BANK_CATEGORIES[number]) && (
                      <SelectItem value={draft.category}>{draft.category}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="pb-target-date">Data prevista (opcional)</Label>
                <DatePickerField value={draft.targetDate} onChange={(v) => setDraft((p) => ({ ...p, targetDate: v }))} id="pb-target-date" />
              </div>
            </div>
            <div>
              <Label htmlFor="pb-goal">Valor objetivo (opcional)</Label>
              <div className="relative mt-1">
                <Input
                  id="pb-goal"
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex: 5000,00"
                  value={draft.goalAmount}
                  onChange={(e) => setDraft((p) => ({ ...p, goalAmount: e.target.value.replace(/[^\d.,]/g, "") }))}
                  className="pl-9"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground -mt-2">
              O número permite usar atalhos no bot, ex: <code>aporte {draft.shortId || "1"} 200</code>.
            </p>
            <div>
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDraft((p) => ({ ...p, color: c }))}
                    className={`h-7 w-7 rounded-full border-2 transition ${draft.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: `hsl(${c})` }}
                    aria-label={`Cor ${c}`}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 space-y-2">
              <div className="flex items-start gap-2">
                <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0 text-xs">
                  <p className="font-semibold text-foreground">Rendimento atrelado ao CDI</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {cdiRate
                      ? `CDI atual: ${cdiRate.annualRate.toFixed(2)}% a.a. · ${cdiUpdatedLabel}`
                      : "Aguardando primeira sincronização do Banco Central."}
                  </p>
                </div>
              </div>
              <div>
                <Label htmlFor="pb-cdi-pct" className="text-xs">% do CDI</Label>
                <div className="relative mt-1">
                  <Input
                    id="pb-cdi-pct"
                    type="number"
                    min={1}
                    max={500}
                    step="1"
                    inputMode="decimal"
                    placeholder="Ex: 100"
                    value={draft.cdiPercent}
                    onChange={(e) => setDraft((p) => ({ ...p, cdiPercent: e.target.value.replace(/[^\d.,]/g, "") }))}
                    className="pr-9"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                </div>
                {(() => {
                  const pctRaw = Number(draft.cdiPercent.replace(",", "."));
                  const pct = Number.isFinite(pctRaw) && pctRaw > 0 ? pctRaw : 0;
                  const baseCdi = cdiRate?.annualRate ?? 11.15;
                  const eff = baseCdi * (pct / 100);
                  return (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {pct > 0
                        ? <>Equivale a <span className="font-semibold text-foreground">{eff.toFixed(2)}% a.a.</span> ({pct.toFixed(0)}% do CDI atual)</>
                        : "Informe a porcentagem do CDI desejada (ex.: 100, 110)."}
                    </p>
                  );
                })()}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button data-mutation onClick={save} disabled={!draft.name.trim()}>
              {editing ? "Salvar" : "Criar cofrinho"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) deletePiggyBank(deleteId);
          setDeleteId(null);
        }}
        title="Excluir cofrinho"
        description="Os aportes registrados também serão removidos. As despesas já lançadas permanecem no histórico. Esta ação não pode ser desfeita."
      />

      {/* Manual balance adjustment dialog */}
      <Dialog open={!!adjustTarget} onOpenChange={(o) => !o && setAdjustTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar saldo</DialogTitle>
            <DialogDescription>
              Informe o novo saldo desejado para <strong>{adjustTarget?.name}</strong>. A diferença será
              registrada como ajuste manual e não afeta o "Gasto do mês".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="rounded-lg bg-muted/50 p-2.5 text-xs flex items-center justify-between">
              <span className="text-muted-foreground">Saldo atual:</span>
              <span className="font-semibold">
                {fmt(adjustTarget ? balances.get(adjustTarget.id)?.balance ?? 0 : 0)}
              </span>
            </div>
            <div>
              <Label htmlFor="adjust-value">Novo saldo (R$)</Label>
              <Input
                id="adjust-value"
                type="number"
                step="0.01"
                min="0"
                value={adjustValue}
                onChange={(e) => setAdjustValue(e.target.value)}
                autoFocus
              />
              {adjustTarget && (() => {
                const current = balances.get(adjustTarget.id)?.balance ?? 0;
                const v = Number(adjustValue.replace(",", "."));
                if (Number.isNaN(v)) return null;
                const delta = v - current;
                return (
                  <p className={`text-[11px] mt-1.5 ${delta > 0 ? "text-success" : delta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    Ajuste: {delta > 0 ? "+" : ""}{fmt(delta)}
                  </p>
                );
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustTarget(null)}>Cancelar</Button>
            <Button onClick={confirmAdjust}>Aplicar ajuste</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={!!historyTarget} onOpenChange={(o) => !o && setHistoryTarget(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {historyTarget && (
                <span
                  className="h-7 w-7 rounded-md flex items-center justify-center"
                  style={{ backgroundColor: `hsl(${historyTarget.color} / 0.18)` }}
                >
                  <PiggyBank className="h-3.5 w-3.5" style={{ color: `hsl(${historyTarget.color})` }} />
                </span>
              )}
              Histórico de aportes — {historyTarget?.name}
            </DialogTitle>
            <DialogDescription>
              {historyDeposits.length} {historyDeposits.length === 1 ? "movimentação" : "movimentações"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            <div className="space-y-6 py-4">
              {/* Seção de Resumo */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Info className="h-3 w-3" /> Resumo do Cofrinho
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border/50 bg-muted/30 p-3 space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold">Saldo Atual</span>
                    <p className="text-lg font-black text-foreground tabular-nums">
                      {historyTarget && mask(fmt(balances.get(historyTarget.id)?.balance ?? 0))}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/30 p-3 space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold">Objetivo</span>
                    <p className="text-lg font-black text-muted-foreground tabular-nums">
                      {historyTarget?.goalAmount ? mask(fmt(historyTarget.goalAmount)) : "---"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/30 p-3 space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold">Progresso</span>
                    <p className="text-lg font-black text-primary tabular-nums">
                      {(() => {
                        if (!historyTarget?.goalAmount) return "0%";
                        const bal = balances.get(historyTarget.id)?.balance ?? 0;
                        return `${Math.round(Math.min(100, (bal / historyTarget.goalAmount) * 100))}%`;
                      })()}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/30 p-3 space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold">Prazo</span>
                    <p className="text-sm font-bold text-foreground truncate">
                      {historyTarget?.targetDate 
                        ? new Date(historyTarget.targetDate + "T12:00:00").toLocaleDateString('pt-BR') 
                        : "Indeterminado"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Seção de Projeção (se houver meta e prazo) */}
              {historyTarget?.goalAmount && historyTarget.targetDate && (() => {
                const bal = balances.get(historyTarget.id)?.balance ?? 0;
                const rem = historyTarget.goalAmount - bal;
                if (rem <= 0) return null;

                const today = new Date();
                const target = new Date(historyTarget.targetDate + "T12:00:00");
                const days = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                if (days <= 0) return null;

                return (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                      <TrendingUp className="h-3 w-3" /> Ritmo Necessário
                    </h4>
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 sm:p-4 grid grid-cols-1 xs:grid-cols-3 gap-2.5 xs:gap-4">
                      <div className="text-center space-y-1">
                        <span className="text-[9px] text-muted-foreground uppercase font-bold block">Por Dia</span>
                        <span className="text-xs font-black text-primary">{mask(fmt(rem / days))}</span>
                      </div>
                      <div className="text-center space-y-1 xs:border-x xs:border-primary/10 py-1.5 xs:py-0 border-y xs:border-y-0 border-primary/10">
                        <span className="text-[9px] text-muted-foreground uppercase font-bold block">Por Semana</span>
                        <span className="text-xs font-black text-primary">{mask(fmt(rem / (days / 7)))}</span>
                      </div>
                      <div className="text-center space-y-1">
                        <span className="text-[9px] text-muted-foreground uppercase font-bold block">Por Mês</span>
                        <span className="text-xs font-black text-primary">{mask(fmt(rem / (days / 30)))}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Seção de Movimentações */}
              <div className="space-y-3 pb-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <History className="h-3 w-3" /> Movimentações
                </h4>
                {historyDeposits.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
                    <Receipt className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-xs text-muted-foreground max-w-[200px] mx-auto">
                      Nenhuma movimentação registrada ainda neste cofrinho.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {historyDeposits.map((d) => {
                      const isPositive = d.amount >= 0;
                      const exp = d.expenseId ? expensesById[d.expenseId] : null;
                      const SourceIcon = d.source === "recurring" ? Repeat : isPositive ? ArrowDownCircle : ArrowUpCircle;
                      
                      return (
                        <div key={d.id} className="flex items-center gap-3 p-3 rounded-xl border border-border/30 bg-background/50 hover:border-primary/20 transition-colors">
                          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${isPositive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                            <SourceIcon className="h-4.5 w-4.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-bold text-foreground truncate">
                                {exp?.description || (d.source === "manual" ? "Ajuste de saldo" : d.source === "transfer_in" ? "Depósito" : d.source === "transfer_out" ? "Resgate" : "Aporte")}
                              </p>
                              <p className={`text-sm font-black tabular-nums ${isPositive ? 'text-success' : 'text-destructive'}`}>
                                {isPositive ? '+' : ''}{mask(fmt(d.amount))}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-muted-foreground font-medium uppercase">{d.depositDate.split("-").reverse().join("/")}</span>
                              {exp?.category && <Badge variant="secondary" className="h-3.5 px-1 text-[8px] uppercase tracking-tighter">{exp.category}</Badge>}
                            </div>
                          </div>
                          {!readOnly && (
                            <RowActions
                              actions={[
                                { label: "Editar", icon: <Pencil className="h-3 w-3" />, onClick: () => openEditDeposit(d) },
                                { label: "Excluir", icon: <Trash2 className="h-3 w-3" />, destructive: true, onClick: () => setDeleteDepositId(d.id) },
                              ]}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2 border-t border-border/30">
            <Button variant="outline" onClick={() => setHistoryTarget(null)} className="w-full sm:w-auto">Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit deposit dialog */}
      <Dialog open={!!editDeposit} onOpenChange={(o) => !o && setEditDeposit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar lançamento</DialogTitle>
            <DialogDescription>
              Ajuste o valor e a data deste lançamento. Valores negativos representam retiradas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label htmlFor="dep-amount">Valor (R$)</Label>
              <Input
                id="dep-amount"
                type="number"
                step="0.01"
                value={editDepositDraft.amount}
                onChange={(e) => setEditDepositDraft((p) => ({ ...p, amount: e.target.value }))}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="dep-date">Data</Label>
              <DatePickerField
                id="dep-date"
                value={editDepositDraft.depositDate}
                onChange={(v) => setEditDepositDraft((p) => ({ ...p, depositDate: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDeposit(null)}>Cancelar</Button>
            <Button data-mutation onClick={confirmEditDeposit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteDepositId}
        onOpenChange={(o) => !o && setDeleteDepositId(null)}
        onConfirm={() => {
          if (deleteDepositId) deleteDeposit(deleteDepositId);
          setDeleteDepositId(null);
        }}
        title="Excluir lançamento"
        description="Este aporte será removido do histórico do cofrinho. A despesa vinculada (se houver) permanece. Esta ação não pode ser desfeita."
      />

      {/* Recorrências do cofrinho */}
      <Dialog open={!!recurrenceTarget} onOpenChange={(o) => !o && setRecurrenceTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Repeat className="h-4 w-4" />
              Aportes recorrentes — {recurrenceTarget?.name}
            </DialogTitle>
            <DialogDescription>
              Pause ou exclua aportes mensais automáticos. Excluir não remove os aportes já registrados no histórico.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto -mx-2 px-2">
            {(() => {
              const list = recurrences.filter((r) => r.piggyBankId === recurrenceTarget?.id);
              if (list.length === 0) {
                return (
                  <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
                    <Repeat className="h-6 w-6 mx-auto text-muted-foreground/50 mb-1.5" />
                    <p className="text-xs text-muted-foreground">
                      Nenhum aporte recorrente cadastrado neste cofrinho.
                    </p>
                  </div>
                );
              }
              return (
                <ul className="divide-y divide-border/40">
                  {list.map((r) => (
                    <li key={r.id} className="py-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {r.description || "Aporte recorrente"}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {fmt(r.amount)} · todo dia {r.dayOfMonth} · desde {r.startDate.split("-").reverse().join("/")}
                          {r.endDate && <> até {r.endDate.split("-").reverse().join("/")}</>}
                        </p>
                        {!r.active && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 mt-1">Pausada</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Switch
                          checked={r.active}
                          onCheckedChange={(v) => setRecurrenceActive(r.id, v)}
                          aria-label="Ativar/pausar"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => deleteRecurrence(r.id)}
                          title="Excluir recorrência"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecurrenceTarget(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo: como aplicar a nova taxa CDI */}
      <AlertDialog open={!!rateChangePending} onOpenChange={(o) => !o && setRateChangePending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Como aplicar a nova taxa?</AlertDialogTitle>
            <AlertDialogDescription>
              Você alterou a taxa de <strong>{rateChangePending?.pb.annualRate.toFixed(2)}%</strong> para{" "}
              <strong>{rateChangePending?.newRate.toFixed(2)}%</strong> a.a. em
              {" "}<strong>{rateChangePending?.pb.name}</strong>. Escolha como aplicar:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2 py-2 text-sm">
            <div className="rounded-lg border border-border/40 p-3">
              <p className="font-medium">Manter rendimentos já calculados</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                A nova taxa vale apenas a partir de hoje. Os rendimentos passados ficam intocados.
              </p>
            </div>
            <div className="rounded-lg border border-border/40 p-3">
              <p className="font-medium">Recalcular tudo com a nova taxa</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Refaz todos os rendimentos (passados e futuros) usando a nova taxa.
              </p>
            </div>
          </div>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={async () => {
                if (!rateChangePending) return;
                await setPiggyRate(rateChangePending.pb.id, rateChangePending.newRate, "forward");
                toast.success("Nova taxa aplicada apenas aos próximos rendimentos");
                setRateChangePending(null);
                setCreateOpen(false);
              }}
            >
              Manter passados
            </Button>
            <AlertDialogAction
              onClick={async () => {
                if (!rateChangePending) return;
                await setPiggyRate(rateChangePending.pb.id, rateChangePending.newRate, "recalc");
                toast.success("Rendimentos recalculados com a nova taxa");
                setRateChangePending(null);
                setCreateOpen(false);
              }}
            >
              Recalcular tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
