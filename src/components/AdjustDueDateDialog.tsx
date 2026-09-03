import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { AlertTriangle, History as HistoryIcon, Info } from "lucide-react";
import { toast } from "sonner";
import { Loan, InstallmentSchedule } from "@/types/loan";
import { calculateInstallment } from "@/features/loans/hooks/useLoans";

function getNextDate(base: Date, frequency: string, periods: number): Date {
  const d = new Date(base);
  if (frequency === "Diário") d.setDate(d.getDate() + periods);
  else if (frequency === "Semanal") d.setDate(d.getDate() + 7 * periods);
  else if (frequency === "Quinzenal") d.setDate(d.getDate() + 15 * periods);
  else d.setMonth(d.getMonth() + periods);
  return d;
}

function getFirstPendingDate(loan: Loan, schedules: InstallmentSchedule[]): string {
  const loanSchedules = schedules
    .filter((s) => s.loanId === loan.id)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);
  const nextNum = loan.paidInstallments + 1;
  const saved = loanSchedules.find((s) => s.installmentNumber === nextNum);
  return saved?.dueDate ?? loan.dueDate;
}

interface DueDateChangeLog {
  loanId: string;
  installmentNumber: number;
  previousDate: string;
  newDate: string;
  scope: "single" | "future";
  changedAt: string;
}

const LOG_KEY = "loan-due-date-history";

function readLog(loanId: string): DueDateChangeLog[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const all: DueDateChangeLog[] = JSON.parse(raw);
    return all.filter((l) => l.loanId === loanId);
  } catch {
    return [];
  }
}

function appendLog(entry: DueDateChangeLog) {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const all: DueDateChangeLog[] = raw ? JSON.parse(raw) : [];
    all.push(entry);
    localStorage.setItem(LOG_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan: Loan;
  installmentSchedules: InstallmentSchedule[];
  onSaveSchedule: (
    loanId: string,
    rows: { installmentNumber: number; dueDate: string; amount: number }[]
  ) => Promise<void>;
  onUpdate: (data: Partial<Omit<Loan, "id">>) => void;
}

export function AdjustDueDateDialog({
  open,
  onOpenChange,
  loan,
  installmentSchedules,
  onSaveSchedule,
  onUpdate,
}: Props) {
  const currentDueIso = useMemo(() => getFirstPendingDate(loan, installmentSchedules), [loan, installmentSchedules]);
  const [newDate, setNewDate] = useState<string>(currentDueIso);
  const [scope, setScope] = useState<"single" | "future">("future");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [history, setHistory] = useState<DueDateChangeLog[]>(() => readLog(loan.id));
  const [showHistory, setShowHistory] = useState(false);

  React.useEffect(() => {
    if (open) {
      setNewDate(currentDueIso);
      setScope(loan.installments > 1 ? "future" : "single");
      setHistory(readLog(loan.id));
      setShowHistory(false);
    }
  }, [open, currentDueIso, loan.id, loan.installments]);

  const todayStr = new Date().toISOString().split("T")[0];
  const isPastDate = newDate < todayStr;
  const isSameDate = newDate === currentDueIso;
  const isMultiInstallment = loan.installments > 1;
  const remainingPending = loan.installments - loan.paidInstallments;

  const formatBR = (iso: string) => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };

  const performSave = async () => {
    const nextNum = loan.paidInstallments + 1;
    const freq = loan.interestType || "Mensal";
    const loanSchedules = installmentSchedules
      .filter((s) => s.loanId === loan.id)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);
    const defaultAmount = calculateInstallment(loan.amount, loan.interestRate, loan.installments);
    const newDateObj = new Date(newDate + "T00:00:00");
    const totalInstallments = loan.installments;

    const updatedRows = Array.from({ length: totalInstallments }, (_, i) => {
      const num = i + 1;
      const existing = loanSchedules.find((s) => s.installmentNumber === num);
      const amount = existing?.amount ?? defaultAmount;
      // Paid installments — preserve
      if (num < nextNum) {
        const firstDue = new Date(loan.dueDate + "T00:00:00");
        const fallback = getNextDate(firstDue, freq, num - 1).toISOString().split("T")[0];
        return { installmentNumber: num, dueDate: existing?.dueDate ?? fallback, amount };
      }
      // Current pending installment — always uses newDate
      if (num === nextNum) {
        return { installmentNumber: num, dueDate: newDate, amount };
      }
      // Future installments
      if (scope === "future") {
        const offset = num - nextNum;
        const computed = getNextDate(newDateObj, freq, offset).toISOString().split("T")[0];
        return { installmentNumber: num, dueDate: computed, amount };
      }
      // single mode — keep existing future dates
      const firstDue = new Date(loan.dueDate + "T00:00:00");
      const fallback = getNextDate(firstDue, freq, num - 1).toISOString().split("T")[0];
      return { installmentNumber: num, dueDate: existing?.dueDate ?? fallback, amount };
    });

    try {
      await onSaveSchedule(loan.id, updatedRows);
    } catch (err: any) {
      console.error("[AdjustDueDate] Failed to save schedule", err);
      toast.error("Erro ao salvar", { description: err?.message ?? "Tente novamente." });
      return;
    }

    // Sync loan.dueDate so reports and internal state stay aligned
    // Also update originalDueDate (anchor) if this is the first installment, or applies to future ones, or is a single-installment (interest-only) loan
    try {
      const updates: Partial<Omit<Loan, "id">> = { dueDate: newDate };
      if (!isMultiInstallment || nextNum === 1 || scope === "future") {
        updates.originalDueDate = newDate;
      }
      onUpdate(updates);
    } catch (err) {
      console.error("[AdjustDueDate] Failed to update loan", err);
    }

    appendLog({
      loanId: loan.id,
      installmentNumber: nextNum,
      previousDate: currentDueIso,
      newDate,
      scope: isMultiInstallment ? scope : "single",
      changedAt: new Date().toISOString(),
    });
    setHistory(readLog(loan.id));

    toast.success("Vencimento atualizado", {
      description: `Parcela ${nextNum}: ${formatBR(currentDueIso)} → ${formatBR(newDate)}`,
    });
    setConfirmOpen(false);
    onOpenChange(false);
  };

  const handleSubmit = () => {
    setConfirmOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ajustar data de vencimento</DialogTitle>
            <DialogDescription>
              Contrato de {loan.borrowerName} — Parcela {loan.paidInstallments + 1} de {loan.installments}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                <p className="text-[10px] text-muted-foreground uppercase">Data atual</p>
                <p className="text-sm font-semibold text-foreground">{formatBR(currentDueIso)}</p>
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                <p className="text-[10px] text-muted-foreground uppercase">Nova data</p>
                <p className="text-sm font-semibold text-primary">{formatBR(newDate)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjust-due-date">Selecionar nova data</Label>
              <DatePickerField
                id="adjust-due-date"
                value={newDate}
                onChange={setNewDate}
                placeholder="Selecione a nova data"
              />
              {isPastDate && (
                <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <span>A data selecionada é anterior à data de hoje. A parcela será marcada como atrasada.</span>
                </div>
              )}
            </div>

            {isMultiInstallment && remainingPending > 1 && (
              <div className="space-y-2">
                <Label>Aplicar alteração</Label>
                <RadioGroup value={scope} onValueChange={(v) => setScope(v as "single" | "future")} className="space-y-2">
                  <div className="flex items-start gap-2 rounded-md border border-border px-3 py-2">
                    <RadioGroupItem value="single" id="scope-single" className="mt-0.5" />
                    <Label htmlFor="scope-single" className="font-normal cursor-pointer flex-1">
                      <span className="block text-sm font-medium">Apenas nesta parcela</span>
                      <span className="text-xs text-muted-foreground">
                        As próximas parcelas mantêm as datas originais.
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-start gap-2 rounded-md border border-border px-3 py-2">
                    <RadioGroupItem value="future" id="scope-future" className="mt-0.5" />
                    <Label htmlFor="scope-future" className="font-normal cursor-pointer flex-1">
                      <span className="block text-sm font-medium">Nesta e nas próximas</span>
                      <span className="text-xs text-muted-foreground">
                        Recalcula as parcelas seguintes pelo intervalo {loan.interestType || "Mensal"}.
                      </span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {(loan.lateInterestValue ?? 0) > 0 || (loan.penaltyValue ?? 0) > 0 ? (
              <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <span className="text-muted-foreground">
                  Este contrato tem juros/multa por atraso configurados. A nova data afeta diretamente os encargos calculados.
                </span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <HistoryIcon className="h-3.5 w-3.5" />
              {showHistory ? "Ocultar histórico" : `Histórico de alterações (${history.length})`}
            </button>

            {showHistory && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 max-h-40 overflow-y-auto">
                {history.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma alteração registrada.</p>
                ) : (
                  <ul className="space-y-2">
                    {history
                      .slice()
                      .reverse()
                      .map((h, i) => (
                        <li key={i} className="text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">Parcela {h.installmentNumber}</span>
                            <span className="text-muted-foreground">
                              {new Date(h.changedAt).toLocaleString("pt-BR")}
                            </span>
                          </div>
                          <div className="text-muted-foreground">
                            {formatBR(h.previousDate)} → <span className="text-foreground">{formatBR(h.newDate)}</span>
                            {" · "}
                            {h.scope === "future" ? "Esta e próximas" : "Apenas esta"}
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit}>
              Salvar alteração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar alteração</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja alterar o vencimento de{" "}
              <span className="font-semibold text-foreground">{formatBR(currentDueIso)}</span> para{" "}
              <span className="font-semibold text-primary">{formatBR(newDate)}</span>?
              {isMultiInstallment && remainingPending > 1 && (
                <>
                  {" "}
                  {scope === "future"
                    ? "Esta parcela e as próximas serão atualizadas."
                    : "Apenas esta parcela será atualizada."}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={performSave}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
