import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShieldCheck, Info, ChevronRight, ChevronDown, AlertCircle } from "lucide-react";
import { todayInAppTz } from "@/lib/timezone";
import { getOverdueAmount } from "@/features/loans/lib/loanInstallmentAmount";
import { rawFormatCurrency } from "@/features/dashboard/components/dashboard/dashboardHelpers";
import type { Loan, InstallmentSchedule } from "@/types/loan";

interface PortfolioLike {
  score: number;
  receivingRate: number;
  defaultRate: number;
  totalReceived: number;
  overdueAmount: number;
  overdueLoans: Loan[];
}

interface Props {
  portfolio: PortfolioLike;
  rangeLabel: string;
  installmentSchedules: InstallmentSchedule[];
  formatCurrency: (v: number) => string;
  overdueDialogOpen: boolean;
  setOverdueDialogOpen: (open: boolean) => void;
  onOpenHealthInfo: () => void;
}

export function DashboardFinancialHealthSection({
  portfolio,
  rangeLabel,
  installmentSchedules,
  formatCurrency,
  overdueDialogOpen,
  setOverdueDialogOpen,
  onOpenHealthInfo,
}: Props) {
  const status = portfolio.score >= 70 ? "Saudável" : portfolio.score >= 40 ? "Atenção" : "Crítico";
  const accent = portfolio.score >= 70 ? "success" : portfolio.score >= 40 ? "warning" : "destructive";
  const recAccent = portfolio.receivingRate >= 70 ? "success" : portfolio.receivingRate >= 40 ? "warning" : "destructive";
  const defAccent = portfolio.defaultRate <= 20 ? "success" : portfolio.defaultRate <= 50 ? "warning" : "destructive";
  const accentMap = {
    success: { text: "text-success", bg: "bg-success", border: "border-success/30", soft: "bg-success/10" },
    warning: { text: "text-warning", bg: "bg-warning", border: "border-warning/30", soft: "bg-warning/10" },
    destructive: { text: "text-destructive", bg: "bg-destructive", border: "border-destructive/30", soft: "bg-destructive/10" },
  } as const;
  const a = accentMap[accent];
  const ra = accentMap[recAccent];
  const da = accentMap[defAccent];
  const filledSegments = Math.round((portfolio.score / 100) * 10);
  const expanded = overdueDialogOpen;
  const [open, setOpen] = useState(false);

  return (
    <Card no3d className="relative overflow-hidden border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl">
      {/* Background glow */}
      <div
        className={`pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full blur-[80px] opacity-60`}
        style={{ background: `hsl(var(--${accent}) / 0.25)` }}
      />

      <CardContent className="relative p-5 sm:p-6">
        {/* Header */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`w-full flex items-center justify-between gap-3 text-left ${open ? "mb-8" : ""}`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className={`h-10 w-10 rounded-xl border ${a.border} ${a.soft} flex items-center justify-center shrink-0`}>
              <ShieldCheck className={`h-5 w-5 ${a.text}`} />
            </div>
            <div className="min-w-0">
              <h3 className="text-foreground font-semibold text-base sm:text-lg tracking-tight truncate">Saúde da Operação</h3>
              <p className="text-muted-foreground text-[10px] uppercase tracking-widest truncate">Visão em tempo real</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!open && (
              <span className={`text-sm font-bold tabular-nums ${a.text}`}>
                {portfolio.score}<span className="text-muted-foreground font-medium">/100</span>
              </span>
            )}
            <div className={`px-3 py-1 rounded-full border ${a.border} ${a.soft}`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${a.text}`}>{status}</span>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </div>
        </button>

        {open && (<>


        {/* Score */}
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-5xl sm:text-6xl font-black text-foreground tracking-tighter tabular-nums leading-none">{portfolio.score}</span>
          <span className="text-lg sm:text-xl font-medium text-muted-foreground">/100</span>
          <button
            type="button"
            onClick={onOpenHealthInfo}
            className="ml-auto inline-flex items-center justify-center h-7 w-7 rounded-md border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            aria-label="Como cada indicador é calculado"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Segmented health bar */}
        <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden mb-8 flex gap-0.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className={`h-full flex-1 rounded-full transition-colors ${i < filledSegments ? a.bg : "bg-white/5"}`}
              style={i < filledSegments ? { boxShadow: `0 0 8px hsl(var(--${accent}) / 0.6)` } : undefined}
            />
          ))}
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/10">
            <p className="text-muted-foreground text-[10px] sm:text-xs mb-1 font-medium uppercase tracking-wider">Taxa de Recebimento</p>
            <p className={`font-bold text-base sm:text-lg tabular-nums ${ra.text}`}>{portfolio.receivingRate.toFixed(1)}%</p>
          </div>
          <div className="p-3 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/10">
            <p className="text-muted-foreground text-[10px] sm:text-xs mb-1 font-medium uppercase tracking-wider">Inadimplência</p>
            <p className={`font-bold text-base sm:text-lg tabular-nums ${da.text}`}>{portfolio.defaultRate.toFixed(1)}%</p>
          </div>
          <div className="p-3 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/10">
            <p className="text-muted-foreground text-[10px] sm:text-xs mb-1 font-medium uppercase tracking-wider">Recebido</p>
            <p className="text-success font-bold text-base sm:text-lg tabular-nums leading-tight truncate">{formatCurrency(portfolio.totalReceived)}</p>
          </div>
          <button
            type="button"
            onClick={() => setOverdueDialogOpen(true)}
            className="p-3 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/10 text-left transition-all hover:bg-white/[0.06] hover:border-white/20"
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-muted-foreground text-[10px] sm:text-xs font-medium uppercase tracking-wider">Atrasado</p>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            </div>
            <p className="text-destructive font-bold text-base sm:text-lg tabular-nums leading-tight truncate">{formatCurrency(portfolio.overdueAmount)}</p>
            {portfolio.overdueLoans.length > 0 && (
              <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">
                {portfolio.overdueLoans.length} contrato{portfolio.overdueLoans.length !== 1 ? "s" : ""}
              </p>
            )}
          </button>
        </div>

        {/* Footer */}
        <div className="mt-5 pt-4 border-t border-white/5 flex justify-between items-center">
          <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wider">{rangeLabel}</span>
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest ${a.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${a.bg} animate-pulse`} />Live
          </span>
        </div>
        </>)}
      </CardContent>

      {/* Overdue Modal */}
      <Dialog open={expanded} onOpenChange={(o) => setOverdueDialogOpen(o)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0 border border-white/10 bg-card/80 backdrop-blur-2xl backdrop-saturate-150 shadow-2xl">
          <DialogHeader className="p-5 pb-4 border-b border-white/10">
            <DialogTitle className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl border border-destructive/30 bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertCircle className="h-4 w-4 text-destructive" />
              </div>
              <div className="min-w-0 text-left">
                <p className="text-base font-semibold text-foreground truncate">Contratos em atraso</p>
                <p className="text-[11px] font-normal text-muted-foreground">
                  {portfolio.overdueLoans.length} contrato{portfolio.overdueLoans.length !== 1 ? "s" : ""} · {rawFormatCurrency(portfolio.overdueAmount)}
                </p>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {portfolio.overdueLoans.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Nenhum contrato em atraso.
              </div>
            ) : (
              [...portfolio.overdueLoans].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((l) => {
                const remaining = getOverdueAmount(l, installmentSchedules, todayInAppTz());
                const dueDate = new Date(l.dueDate + "T00:00:00");
                const daysLate = Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
                return (
                  <div key={l.id} className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3.5 transition-colors hover:bg-destructive/10">
                    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
                      <p className="font-semibold text-foreground truncate min-w-0">{l.borrowerName}</p>
                      <span className="inline-flex items-center justify-center rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive tabular-nums w-12">
                        {daysLate}d
                      </span>
                      <span className="font-bold text-destructive whitespace-nowrap tabular-nums text-sm text-right w-24">{rawFormatCurrency(remaining)}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">venc. {dueDate.toLocaleDateString("pt-BR")}</p>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
