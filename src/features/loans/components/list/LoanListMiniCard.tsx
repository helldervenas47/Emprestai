// Mini horizontal card for the "Lista" view — compact, presentation-only.
// Tap opens a Dialog with the full LoanCardView (same logic, dialogs, permissions).
import React, { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, Tag, Pencil, Check, X } from "lucide-react";
import { Loan, Payment, InstallmentSchedule, Client, PaymentSplit } from "@/types/loan";
import type { LoanRenegotiation } from "@/types/loan";
import { useHideValues } from "@/contexts/HideValuesContext";
import { rawFormatCurrency } from "@/features/loans/components/list/formatting";
import { statusMap } from "@/features/loans/components/list/constants";
import {
  getDaysOverdue,
  getLoanCategory,
  getFirstPendingDate,
  getTotalPaid,
  getNextPendingInstallmentAmount,
} from "@/features/loans/components/list/calculations";
import { calculateTotalWithInterest } from "@/features/loans/hooks/useLoans";
import { LoanRowView } from "@/features/loans/components/list/LoanListRow";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Cat = "paid" | "paid_interest" | "overdue" | "due_today" | "on_track";

const toneByCat: Record<Cat, { text: string; dot: string; ring: string; stripe: string; avatarBg: string }> = {
  overdue:      { text: "text-destructive", dot: "bg-destructive", ring: "ring-destructive/30", stripe: "bg-destructive",  avatarBg: "bg-destructive/15 text-destructive" },
  due_today:    { text: "text-warning",     dot: "bg-warning",     ring: "ring-warning/30",     stripe: "bg-warning",      avatarBg: "bg-warning/15 text-warning" },
  on_track:     { text: "text-primary",     dot: "bg-primary",     ring: "ring-primary/30",     stripe: "bg-primary",      avatarBg: "bg-primary/15 text-primary" },
  paid_interest:{ text: "text-purple",      dot: "bg-purple",      ring: "ring-purple/30",      stripe: "bg-purple",       avatarBg: "bg-purple/15 text-purple" },
  paid:         { text: "text-success",     dot: "bg-success",     ring: "ring-success/30",     stripe: "bg-success",      avatarBg: "bg-success/15 text-success" },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function fmtDateBR(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export interface LoanListMiniCardProps {
  loan: Loan;
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  readOnly?: boolean;
  clients?: Client[];
  renegotiations?: LoanRenegotiation[];
  existingTags?: string[];
  onPayment: (date?: string, methodId?: string | null, split?: PaymentSplit | null) => void;
  onPartialPayment: (amount: number, date?: string, methodId?: string | null, split?: PaymentSplit | null) => void;
  onFullPayment?: (date?: string, custom?: number, methodId?: string | null, split?: PaymentSplit | null) => void;
  onInterestPayment: (date?: string, custom?: number, fees?: number, methodId?: string | null, split?: PaymentSplit | null, options?: { partial?: boolean; notes?: string | null }) => void;
  onAmortize?: (amount: number, date?: string, methodId?: string | null, split?: PaymentSplit | null) => Promise<void> | void;
  onRenegotiate?: (params: { type: "no_interest" | "with_penalty"; penaltyMode?: "fixed" | "percentage" | null; penaltyInput?: number | null; penaltyDistribution?: "diluted" | "first" | null; newInstallments?: number | null; notes?: string | null; selectedInstallmentNumbers?: number[] | null; firstDueDate?: string | null }) => Promise<void> | void;
  onUpdate: (data: Partial<Omit<Loan, "id">>) => void;
  onDelete: () => void;
  onDeletePayment: (paymentId: string) => void;
  onSaveSchedule: (loanId: string, rows: { installmentNumber: number; dueDate: string; amount: number }[]) => Promise<void>;
  hideQuickNotes?: boolean;
}

export function LoanListMiniCard(props: LoanListMiniCardProps) {
  const { loan, payments, installmentSchedules, onUpdate, readOnly, hideQuickNotes = false } = props;
  const [open, setOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(loan.notes || "");
  const { mask } = useHideValues();

  const saveNote = () => {
    const trimmed = noteDraft.trim();
    if (trimmed !== (loan.notes || "")) {
      onUpdate({ notes: trimmed || null });
      toast.success("Observação salva");
    }
    setNoteOpen(false);
  };
  const cancelNote = () => {
    setNoteDraft(loan.notes || "");
    setNoteOpen(false);
  };

  const category = getLoanCategory(loan, payments, installmentSchedules) as Cat;
  const tone = toneByCat[category];
  const status = statusMap[category];

  const total = useMemo(
    () => calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments),
    [loan.amount, loan.interestRate, loan.installments],
  );
  const totalPaid = getTotalPaid(loan, payments);
  const baseRemaining = loan.status === "paid"
    ? 0
    : loan.remainingAmount != null && loan.remainingAmount > 0
      ? loan.remainingAmount
      : Math.max(0, total - totalPaid);

  const nextDue = getFirstPendingDate(loan, installmentSchedules)
    .toISOString().split("T")[0];
  const daysOverdue = getDaysOverdue(loan, installmentSchedules);

  // Late fees (display only — mirrors LoanRowView calc)
  const effectiveDaysLate = Math.max(0, daysOverdue);
  let lateInterestTotal = 0;
  if (loan.lateInterestValue != null && loan.lateInterestValue > 0 && effectiveDaysLate > 0 && loan.status !== "paid") {
    lateInterestTotal = loan.lateInterestType === "fixed"
      ? loan.lateInterestValue * effectiveDaysLate
      : baseRemaining * (loan.lateInterestValue / 100) * effectiveDaysLate;
  }
  const penaltyTotal = (loan.penaltyValue != null && loan.penaltyValue > 0 && loan.status !== "paid") ? loan.penaltyValue : 0;
  const lateFees = lateInterestTotal + penaltyTotal;

  // Restante inclui juros/multa (quando houver)
  const remaining = baseRemaining + lateFees;

  // Nos cards, contratos parcelados exibem o valor da próxima parcela pendente (incluindo encargos)
  const isParcelado = loan.installments >= 2 && loan.status !== "paid";
  const nextPendingInstallment = getNextPendingInstallmentAmount(loan, payments, installmentSchedules);
  
  // Para parcelados, o valor exibido deve ser o valor da parcela pendente + encargos (lateFees)
  // Sincronizado com a lógica do PaymentHubDialog.
  const displayRemaining = isParcelado 
    ? (nextPendingInstallment + lateFees) 
    : remaining;
  const remainingLabel = isParcelado ? "Próx. parcela" : "Restante";

  const statusText =
    category === "overdue" ? `Atrasado${daysOverdue > 0 ? ` • ${daysOverdue} dia${daysOverdue > 1 ? "s" : ""}` : ""}`
      : category === "due_today" ? "Vence hoje"
      : category === "paid" ? "Quitado"
      : category === "paid_interest" ? "Juros pagos"
      : "Em dia";

  return (
    <>
      <div
        className={[
          "group relative rounded-2xl border border-border/60 dark:border-white/[0.06]",
          "bg-card/80 dark:bg-white/[0.03] backdrop-blur-sm",
          "shadow-[0_1px_2px_hsl(220_40%_2%/0.04)]",
          "transition-all duration-200 hover:border-primary/30 hover:-translate-y-[1px]",
          "overflow-hidden",
        ].join(" ")}
      >
        {/* Status accent stripe */}
        <span className={`absolute inset-y-0 left-0 w-[3px] ${tone.stripe}`} aria-hidden />

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full text-left px-3 py-2.5 sm:px-4 sm:py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-2xl"
          aria-label={`${open ? "Recolher" : "Expandir"} detalhes de ${loan.borrowerName}`}
        >
          {/* Row 1 — identity + total */}
          <div className="flex items-start gap-2.5">
            <div className={`h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold shrink-0 ${tone.avatarBg}`}>
              {initials(loan.borrowerName)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <h3 className="font-semibold text-foreground text-sm sm:text-[15px] truncate leading-tight">
                  {loan.borrowerName}
                </h3>
                {(loan.tags || []).slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary max-w-[80px]"
                    title={tag}
                  >
                    <Tag className="h-2.5 w-2.5 shrink-0" aria-hidden />
                    <span className="truncate">{tag}</span>
                  </span>
                ))}
                {(loan.tags || []).length > 2 && (
                  <span className="inline-flex items-center rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    +{(loan.tags || []).length - 2}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] sm:text-xs text-muted-foreground">
                <span className={`inline-flex items-center gap-1 ${tone.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden />
                  {statusText}
                </span>
              </div>
            </div>

            <div className="text-right shrink-0 flex items-start gap-1">
              <div>
                <p className="text-[10px] sm:text-[11px] text-muted-foreground leading-none">{remainingLabel}</p>
                <p className={`text-sm sm:text-[15px] font-bold tabular-nums mt-0.5 ${tone.text}`}>
                  {mask(rawFormatCurrency(displayRemaining))}
                </p>
              </div>
              {open ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground mt-0.5 transition-transform" aria-hidden />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5 transition-transform" aria-hidden />
              )}
            </div>
          </div>

          {/* Row 2 — total do contrato / próx / progresso ou multa */}
          <div className="mt-2.5 grid grid-cols-3 gap-2 items-center">
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground leading-none">
                {loan.status === "paid" ? "Total pago" : "Total emprestado"}
              </p>
              <p className={`text-xs sm:text-sm font-semibold tabular-nums mt-1 ${tone.text} truncate`}>
                {mask(rawFormatCurrency(loan.status === "paid" ? totalPaid : loan.amount))}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground leading-none">Próx. parcela</p>
              <p className="text-xs sm:text-sm font-medium text-foreground/90 tabular-nums mt-1 truncate">
                {fmtDateBR(nextDue)}
              </p>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1 leading-none">
                <p className="text-[10px] text-muted-foreground">Observação</p>
                {!readOnly && !hideQuickNotes && (
                  <Popover open={noteOpen} onOpenChange={setNoteOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNoteDraft(loan.notes || "");
                        }}
                        className="inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground/70 hover:text-primary hover:bg-primary/10 transition-colors"
                        aria-label="Editar observação"
                      >
                        <Pencil className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-64 sm:w-72 p-3"
                      onClick={(e) => e.stopPropagation()}
                      align="end"
                    >
                      <p className="text-xs font-medium text-foreground mb-1.5">Observação rápida</p>
                      <Textarea
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="Digite uma observação..."
                        rows={3}
                        className="text-xs resize-none"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            saveNote();
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            cancelNote();
                          }
                        }}
                      />
                      <div className="flex items-center justify-end gap-2 mt-2">
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={cancelNote}>
                          <X className="h-3 w-3 mr-1" /> Cancelar
                        </Button>
                        <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={saveNote}>
                          <Check className="h-3 w-3 mr-1" /> Salvar
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              {loan.notes ? (
                <p className="text-[11px] sm:text-xs text-foreground/90 mt-1 line-clamp-2 leading-snug">
                  {loan.notes}
                </p>
              ) : (
                <p className="text-[11px] sm:text-xs text-muted-foreground/60 mt-1">—</p>
              )}
            </div>
          </div>
        </button>

        {/* Inline expansion — full LoanCardView (all dialogs/actions preserved) */}
        {open && (
          <div
            className="border-t border-border/50 dark:border-white/[0.06] bg-muted/20 dark:bg-white/[0.02] p-2 sm:p-3 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <table className="w-full">
              <tbody>
                <LoanRowView {...props} defaultExpanded hideCollapsedRow hideQuickNotes={hideQuickNotes} />
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
