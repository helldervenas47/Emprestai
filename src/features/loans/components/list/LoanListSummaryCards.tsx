import { useMemo } from "react";
import {
  AlertTriangle,
  Clock,
  CheckCircle,
  DollarSign,
  Calendar,
  RefreshCw,
  Info,
} from "lucide-react";
import type { Category } from "./types";
import type { Loan, Payment, InstallmentSchedule } from "@/types/loan";
import {
  getLoanCategory,
  getLoanTotalReceivable,
  getNextPendingInstallmentAmount,
  getFirstPendingDate,
  getDaysOverdue,
} from "./calculations";
import { getOverdueAmount } from "@/features/loans/lib/loanInstallmentAmount";
import { getBaseRemainingAmount, getLoanLateFees } from "@/features/loans/lib/loanLateFees";


export interface LoanStatusSummary {
  overdue: number;
  dueToday: number;
  onTrack: number;
  total: number;
  overdueCount: number;
  dueTodayCount: number;
  onTrackCount: number;
  totalCount: number;
}

interface Props {
  statusSummary: LoanStatusSummary;
  selectedCategories: Category[];
  applyCardFilter: (cardId: "overdue" | "due_today" | "on_track" | "all") => void;
  formatCurrency: (value: number) => string;
  loans?: Loan[];
  payments?: Payment[];
  schedules?: InstallmentSchedule[];
}

type Tone = "destructive" | "warning" | "sky" | "indigo";

interface CardConfig {
  id: "overdue" | "due_today" | "on_track" | "all";
  label: string;
  sublabel: string;
  value: number;
  count: number;
  icon: typeof AlertTriangle;
  secondaryIcon: typeof AlertTriangle;
  tone: Tone;
  footerLabel: string;
  footerValue: string;
  emphasized?: boolean;
}

const TONE = {
  destructive: {
    text: "text-destructive",
    bgGradient: "bg-gradient-to-br from-destructive/10 via-destructive/[0.04] to-transparent",
    iconBg: "bg-destructive/15 text-destructive",
    badgeBg: "bg-destructive/15 text-destructive border-destructive/30",
    dot: "bg-destructive",
    activeRing: "ring-2 ring-destructive/40 border-destructive/50",
    border: "border-destructive/20 hover:border-destructive/40",
  },
  warning: {
    text: "text-amber-600 dark:text-amber-400",
    bgGradient: "bg-gradient-to-br from-amber-500/10 via-amber-500/[0.04] to-transparent",
    iconBg: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    badgeBg: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    dot: "bg-amber-500",
    activeRing: "ring-2 ring-amber-500/40 border-amber-500/50",
    border: "border-amber-500/20 hover:border-amber-500/40",
  },
  sky: {
    text: "text-sky-600 dark:text-sky-400",
    bgGradient: "bg-gradient-to-br from-sky-500/10 via-sky-500/[0.04] to-transparent",
    iconBg: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    badgeBg: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    dot: "bg-sky-500",
    activeRing: "ring-2 ring-sky-500/40 border-sky-500/50",
    border: "border-sky-500/20 hover:border-sky-500/40",
  },
  indigo: {
    text: "text-indigo-600 dark:text-indigo-400",
    bgGradient: "bg-gradient-to-br from-indigo-500/15 via-indigo-500/[0.05] to-transparent",
    iconBg: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
    badgeBg: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
    dot: "bg-indigo-500",
    activeRing: "ring-2 ring-indigo-500/40 border-indigo-500/50",
    border: "border-indigo-500/30 hover:border-indigo-500/50",
  },
} as const;

export function LoanListSummaryCards({
  statusSummary,
  selectedCategories,
  applyCardFilter,
  formatCurrency,
  loans = [],
  payments = [],
  schedules = [],
}: Props) {
  const footer = useMemo(() => {
    const activeLoans = loans.filter((l) => l.status !== "paid");
    const cat = (l: Loan) => getLoanCategory(l, payments, schedules);

    const overdueLoans = activeLoans.filter((l) => cat(l) === "overdue");
    const onTrackLoans = activeLoans.filter((l) => cat(l) === "on_track");
    const dueTodayLoans = activeLoans.filter((l) => cat(l) === "due_today");

    // Maior atraso: maior valor de parcelas vencidas em aberto (sem multa/juros)
    let biggestOverdue = 0;
    let biggestOverdueDays = 0;
    for (const l of overdueLoans) {
      const v = getOverdueAmount(l, schedules);
      if (v > biggestOverdue) biggestOverdue = v;
      const d = getDaysOverdue(l, schedules);
      if (d > biggestOverdueDays) biggestOverdueDays = d;
    }

    // Próximo vencimento: soma de TODAS as parcelas em aberto cuja data é a próxima data futura
    const today = new Date();
    const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const pendingByDate = new Map<number, number>();
    for (const l of activeLoans) {
      const paid = l.paidInstallments || 0;
      const loanSchedules = schedules.filter(
        (s) => s.loanId === l.id && s.installmentNumber > paid,
      );
      if (loanSchedules.length > 0) {
        for (const s of loanSchedules) {
          const d = new Date(s.dueDate + "T00:00:00").getTime();
          if (d <= todayNorm) continue;
          const amt =
            s.installmentNumber === paid + 1
              ? getNextPendingInstallmentAmount(l, payments, schedules) ?? s.amount
              : s.amount;
          pendingByDate.set(d, (pendingByDate.get(d) || 0) + Number(amt || 0));
        }
      } else {
        const due = getFirstPendingDate(l, schedules).getTime();
        if (due <= todayNorm) continue;
        let amt = getNextPendingInstallmentAmount(l, payments, schedules);
        if (amt == null || amt <= 0) {
          if (l.installments < 2) {
            amt = getBaseRemainingAmount(l, payments, schedules);
          }
        }
        if (amt == null || amt <= 0) continue;
        pendingByDate.set(due, (pendingByDate.get(due) || 0) + amt);
      }
    }
    let nextDueDate: Date | null = null;
    let nextDueValue: number | null = null;
    if (pendingByDate.size > 0) {
      const minTs = Math.min(...pendingByDate.keys());
      nextDueDate = new Date(minTs);
      nextDueValue = Math.round((pendingByDate.get(minTs) || 0) * 100) / 100;
    }

    // Vence Hoje: soma das parcelas que vencem hoje
    let dueTodayValue = 0;
    for (const l of dueTodayLoans) {
      const paid = l.paidInstallments || 0;
      const loanSchedules = schedules.filter(
        (s) => s.loanId === l.id && s.installmentNumber > paid,
      );
      const todaySchedules = loanSchedules.filter((s) => {
        const d = new Date(s.dueDate + "T00:00:00").getTime();
        return d === todayNorm;
      });
      if (todaySchedules.length > 0) {
        for (const s of todaySchedules) {
          const amt =
            s.installmentNumber === paid + 1
              ? getNextPendingInstallmentAmount(l, payments, schedules) ?? s.amount
              : s.amount;
          dueTodayValue += Number(amt || 0);
        }
      } else {
        let amt = getNextPendingInstallmentAmount(l, payments, schedules);
        if ((amt == null || amt <= 0) && l.installments < 2) {
          amt = getBaseRemainingAmount(l, payments, schedules);
        }
        if (amt && amt > 0) dueTodayValue += amt;
      }
    }
    dueTodayValue = Math.round(dueTodayValue * 100) / 100;

    // Parcela média
    const parcelas = onTrackLoans
      .map((l) => getNextPendingInstallmentAmount(l, payments, schedules))
      .filter((v): v is number => v != null && v > 0);
    const parcelaMedia =
      parcelas.length > 0 ? parcelas.reduce((s, v) => s + v, 0) / parcelas.length : 0;

    // Ticket médio
    const totalActive = activeLoans.length;
    const ticketMedio = totalActive > 0 ? statusSummary.total / totalActive : 0;

    return {
      biggestOverdue,
      biggestOverdueDays,
      nextDueValue,
      nextDueDate,
      dueTodayCount: dueTodayLoans.length,
      dueTodayValue,
      parcelaMedia,
      ticketMedio,
    };
  }, [loans, payments, schedules, statusSummary.total]);

  const cards: CardConfig[] = [
    {
      id: "overdue",
      label: "Atrasados",
      sublabel: "Em atraso",
      value: statusSummary.overdue,
      count: statusSummary.overdueCount,
      icon: AlertTriangle,
      secondaryIcon: Clock,
      tone: "destructive",
      footerLabel: "Maior atraso",
      footerValue:
        footer.biggestOverdue > 0
          ? formatCurrency(footer.biggestOverdue)
          : "—",
    },
    {
      id: "due_today",
      label: "Vence Hoje",
      sublabel: "Para receber hoje",
      value: statusSummary.dueToday,
      count: statusSummary.dueTodayCount,
      icon: Calendar,
      secondaryIcon: Clock,
      tone: "warning",
      footerLabel: "Próx. vencimento",
      footerValue:
        footer.nextDueValue != null && footer.nextDueValue > 0
          ? formatCurrency(footer.nextDueValue)
          : "—",
    },
    {
      id: "on_track",
      label: "Em Dia",
      sublabel: "Contratos regulares",
      value: statusSummary.onTrack,
      count: statusSummary.onTrackCount,
      icon: CheckCircle,
      secondaryIcon: RefreshCw,
      tone: "sky",
      footerLabel: "Parcela média",
      footerValue: footer.parcelaMedia > 0 ? formatCurrency(footer.parcelaMedia) : "—",
    },
    {
      id: "all",
      label: "Total a Receber",
      sublabel: "Carteira ativa",
      value: statusSummary.total,
      count: statusSummary.totalCount,
      icon: DollarSign,
      secondaryIcon: Info,
      tone: "indigo",
      footerLabel: "Ticket médio",
      footerValue: footer.ticketMedio > 0 ? formatCurrency(footer.ticketMedio) : "—",
      emphasized: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
      {cards.map((c, idx) => {
        const Icon = c.icon;
        const t = TONE[c.tone];
        const isActive =
          selectedCategories.length === 1 && (selectedCategories[0] as string) === c.id;
        return (
          <button
            key={c.id}
            type="button"
            aria-label={`${c.label}: ${formatCurrency(c.value)} — ${c.count} contratos`}
            onClick={() => applyCardFilter(c.id)}
            className={[
              "group relative text-left rounded-2xl p-3 sm:p-4",
              "bg-card border transition-all duration-200",
              t.bgGradient,
              isActive ? t.activeRing : `${t.border} shadow-xs hover:shadow-md hover:-translate-y-0.5`,
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              "flex flex-col justify-between overflow-hidden",
            ].join(" ")}
            style={{ animationDelay: `${idx * 50}ms` }}
          >
            {/* Top Row: Icon + Title & Sublabel (badge on right for sm+) */}
            <div>
              <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`h-7 w-7 sm:h-9 sm:w-9 rounded-xl ${t.iconBg} flex items-center justify-center shrink-0 shadow-xs`}
                  >
                    <Icon className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <span className="text-xs sm:text-sm font-bold text-foreground block leading-tight truncate">
                      {c.label}
                    </span>
                    <span className="text-[10px] sm:text-[11px] text-muted-foreground block leading-tight mt-0.5 truncate">
                      {c.sublabel}
                    </span>
                  </div>
                </div>

                {/* Badge visível no desktop/tablet */}
                <span
                  className={`hidden sm:inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border shrink-0 ${t.badgeBg}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} aria-hidden />
                  {c.count} {c.count === 1 ? "contrato" : "contratos"}
                </span>
              </div>

              {/* Main Financial Value */}
              <div className="mt-2.5 sm:mt-3">
                <p
                  className={`text-base sm:text-2xl lg:text-[26px] font-bold tabular-nums tracking-tight leading-tight ${t.text}`}
                >
                  {formatCurrency(c.value)}
                </p>

                {/* Quantidade de contratos abaixo do valor na versão mobile */}
                <div className="sm:hidden mt-1.5">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${t.badgeBg}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} aria-hidden />
                    {c.count} {c.count === 1 ? "contrato" : "contratos"}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer metric */}
            <div className="mt-2.5 sm:mt-3 pt-2 sm:pt-2.5 border-t border-border/40 dark:border-white/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-1 text-[10px] sm:text-xs">
              <span className="text-muted-foreground leading-tight text-[10px] sm:text-xs">{c.footerLabel}</span>
              <span className={`font-semibold tabular-nums leading-tight text-[10px] sm:text-xs ${t.text}`}>
                {c.footerValue}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
