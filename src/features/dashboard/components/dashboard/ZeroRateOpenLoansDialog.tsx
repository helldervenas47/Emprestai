import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Percent, AlertTriangle, CalendarClock } from "lucide-react";
import { rawFormatCurrency } from "@/features/dashboard/components/dashboard/dashboardHelpers";
import type { Loan } from "@/types/loan";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Todos os empréstimos do usuário (sem filtro de período). */
  loans: Loan[];
}

/** Dias corridos entre a data de saída (startDate) e hoje. */
function daysOpen(startDate: string): number {
  const raw = String(startDate || "").slice(0, 10);
  const [y, m, d] = raw.split("-").map(Number);
  if (!y || !m || !d) return 0;
  const start = new Date(y, m - 1, d);
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.round((t.getTime() - start.getTime()) / 86_400_000));
}

const LATE_THRESHOLD = 30;

export function ZeroRateOpenLoansDialog({ open, onOpenChange, loans }: Props) {
  const rows = useMemo(() => {
    return loans
      .filter((l) => (Number(l.interestRate) || 0) === 0 && l.status !== "paid")
      .map((l) => ({
        id: l.id,
        name: l.borrowerName,
        amount: Number(l.amount) || 0,
        installments: l.installments ?? 1,
        startDate: l.startDate,
        days: daysOpen(l.startDate),
      }))
      .sort((a, b) => b.days - a.days);
  }, [loans]);

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  const lateCount = rows.filter((r) => r.days > LATE_THRESHOLD).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:flex max-sm:flex-col">
        <DialogHeader
          className="px-5 pt-5 pb-3 border-b"
          style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}
        >
          <DialogTitle className="flex items-center gap-2 text-base">
            <Percent className="h-4 w-4 text-warning" />
            Taxa 0% em aberto
          </DialogTitle>
          <div className="mt-3 rounded-2xl border border-border/60 bg-muted/30 p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Total em aberto sem juros
            </p>
            <p className="text-2xl font-bold tabular-nums leading-tight mt-1">
              {rawFormatCurrency(totalAmount)}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                {rows.length} contrato(s)
              </span>
              {lateCount > 0 && (
                <span className="inline-flex items-center gap-1 text-destructive font-semibold">
                  <AlertTriangle className="h-3 w-3" />
                  {lateCount} com mais de {LATE_THRESHOLD} dias
                </span>
              )}
            </div>
          </div>
        </DialogHeader>
        <ScrollArea
          className="max-h-[60vh] max-sm:max-h-none max-sm:flex-1 max-sm:h-full px-5 py-4"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum empréstimo com taxa 0% em aberto.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const late = r.days > LATE_THRESHOLD;
                return (
                  <div
                    key={r.id}
                    className={`rounded-xl border p-3 ${
                      late ? "border-destructive/50 bg-destructive/5" : "border-border/60 bg-card/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-semibold truncate ${
                            late ? "text-destructive" : "text-foreground"
                          }`}
                        >
                          {r.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Emprestado: {rawFormatCurrency(r.amount)} • {r.installments} parcela(s)
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Saída: {String(r.startDate).slice(0, 10).split("-").reverse().join("/")}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p
                          className={`text-base font-bold tabular-nums leading-none ${
                            late ? "text-destructive" : "text-foreground"
                          }`}
                        >
                          {r.days}
                        </p>
                        <p
                          className={`text-[10px] uppercase tracking-wide ${
                            late ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          dias
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
