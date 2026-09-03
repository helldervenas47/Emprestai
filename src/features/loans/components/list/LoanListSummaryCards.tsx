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

type Tone = "destructive" | "warning" | "primary" | "purple";

interface CardConfig {
  id: "overdue" | "due_today" | "on_track" | "all";
  label: string;
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
    iconBg: "bg-destructive/10",
    badgeBg: "bg-destructive/10",
    badgeText: "text-destructive",
    stroke: "hsl(var(--destructive))",
    ring: "ring-destructive/40",
    activeBorder: "border-destructive/40",
  },
  warning: {
    text: "text-warning",
    iconBg: "bg-warning/10",
    badgeBg: "bg-warning/10",
    badgeText: "text-warning",
    stroke: "hsl(var(--warning))",
    ring: "ring-warning/40",
    activeBorder: "border-warning/40",
  },
  primary: {
    text: "text-primary",
    iconBg: "bg-primary/10",
    badgeBg: "bg-primary/10",
    badgeText: "text-primary",
    stroke: "hsl(var(--primary))",
    ring: "ring-primary/40",
    activeBorder: "border-primary/40",
  },
  purple: {
    text: "text-primary",
    iconBg: "bg-primary/10",
    badgeBg: "bg-primary/10",
    badgeText: "text-primary",
    stroke: "hsl(var(--primary))",
    ring: "ring-primary/50",
    activeBorder: "border-primary/60",
  },
} as const;

/** Neutral flat sparkline (no invented data). */
function Sparkline({ stroke, flat = true }: { stroke: string; flat?: boolean }) {
  // 8 points, flat line by default. When we don't have real history we
  // deliberately render a neutral straight line.
  const points = flat
    ? "0,10 10,10 20,10 30,10 40,10 50,10 60,10 70,10"
    : "0,14 10,12 20,13 30,9 40,10 50,6 60,8 70,4";
  return (
    <svg
      width="70"
      height="22"
      viewBox="0 0 70 22"
      fill="none"
      className="opacity-70 group-hover:opacity-100 transition-opacity"
      aria-hidden
    >
      <polyline
        points={points}
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={flat ? "3 3" : undefined}
      />
    </svg>
  );
}

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


    // Próximo vencimento: soma de TODAS as parcelas em aberto (de qualquer
    // contrato ativo) cuja data de vencimento é a próxima data futura (após
    // hoje). Considera múltiplas parcelas pendentes por contrato quando
    // existir cronograma.
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
        // Sem cronograma: considera parcela única ou próximo vencimento simples.
        // Para contratos de parcela única (installments < 2), usa o saldo
        // restante (base) como valor a receber na data de vencimento.
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

    // Vence Hoje: soma das parcelas que vencem hoje (dos contratos due_today).
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

    // Parcela média (média das próximas parcelas dos on_track)
    const parcelas = onTrackLoans
      .map((l) => getNextPendingInstallmentAmount(l, payments, schedules))
      .filter((v): v is number => v != null && v > 0);
    const parcelaMedia =
      parcelas.length > 0 ? parcelas.reduce((s, v) => s + v, 0) / parcelas.length : 0;

    // Ticket médio: total a receber / total de contratos ativos
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
      value: statusSummary.overdue,
      count: statusSummary.overdueCount,
      icon: Clock,
      secondaryIcon: AlertTriangle,
      tone: "destructive",
      footerLabel: "Maior atraso",
      footerValue: footer.biggestOverdue > 0 ? formatCurrency(footer.biggestOverdue) : "—",
    },
    {
      id: "due_today",
      label: "Vence Hoje",
      value: statusSummary.dueToday,
      count: statusSummary.dueTodayCount,
      icon: Calendar,
      secondaryIcon: Clock,
      tone: "warning",
      footerLabel: "Próximo vencimento",
      footerValue:
        footer.nextDueValue != null && footer.nextDueValue > 0
          ? formatCurrency(footer.nextDueValue)
          : "—",


    },
    {
      id: "on_track",
      label: "Em Dia",
      value: statusSummary.onTrack,
      count: statusSummary.onTrackCount,
      icon: CheckCircle,
      secondaryIcon: RefreshCw,
      tone: "primary",
      footerLabel: "Parcela média",
      footerValue: footer.parcelaMedia > 0 ? formatCurrency(footer.parcelaMedia) : "—",
    },
    {
      id: "all",
      label: "Total a Receber",
      value: statusSummary.total,
      count: statusSummary.totalCount,
      icon: DollarSign,
      secondaryIcon: Info,
      tone: "purple",
      footerLabel: "Ticket médio",
      footerValue: footer.ticketMedio > 0 ? formatCurrency(footer.ticketMedio) : "—",
      emphasized: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 lg:gap-3">
      {cards.map((c, idx) => {
        const Icon = c.icon;
        const Secondary = c.secondaryIcon;
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
              "group relative text-left rounded-[12px] sm:rounded-[13px] lg:rounded-[14px] p-2.5 sm:p-3 lg:p-4",
              "bg-card border border-border/60 dark:border-white/5",
              "shadow-[0_1px_2px_hsl(220_40%_2%/0.04)] dark:shadow-none",
              "transition-all duration-200 hover:-translate-y-[2px]",
              "hover:shadow-[0_8px_24px_-10px_hsl(220_40%_2%/0.16)]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              "animate-fade-in flex flex-col",
              c.emphasized ? `${t.activeBorder}` : "",
              isActive ? `ring-2 ${t.ring} border-transparent` : "",
            ].join(" ")}
            style={{ animationDelay: `${idx * 60}ms`, animationFillMode: "backwards" }}
          >
            {/* Linha superior */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <span
                  className={`h-7 w-7 lg:h-8 lg:w-8 rounded-lg ${t.iconBg} flex items-center justify-center shrink-0`}
                >
                  <Icon className={`h-3.5 w-3.5 lg:h-4 lg:w-4 ${t.text}`} aria-hidden />
                </span>
                <span className="text-[13px] lg:text-sm font-medium text-foreground truncate">
                  {c.label}
                </span>
              </div>
              <Secondary className={`h-3 w-3 lg:h-3.5 lg:w-3.5 shrink-0 ${t.text} opacity-70`} aria-hidden />
            </div>

            {/* Valor principal */}
            <p
              className={`mt-2 lg:mt-3 text-[17px] sm:text-[20px] lg:text-[26px] font-bold tabular-nums leading-none whitespace-nowrap ${t.text}`}
            >
              {formatCurrency(c.value)}
            </p>


            {/* Contratos */}
            <p className="mt-1 lg:mt-1.5 text-[11px] lg:text-[12px] text-muted-foreground">
              {c.count} {c.count === 1 ? "contrato" : "contratos"}
            </p>

            {/* Badge + sparkline */}
            <div className="mt-2 lg:mt-3 flex items-end justify-between gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-1.5 lg:px-2 py-0.5 text-[10px] lg:text-[11px] font-medium ${t.badgeBg} ${t.badgeText}`}
              >
                <span className="opacity-70">—</span>
                sem histórico
              </span>
              <Sparkline stroke={t.stroke} flat />
            </div>

            {/* Rodapé */}
            <div className="mt-2 lg:mt-3 pt-2 lg:pt-2.5 border-t border-border/50">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-[11px] lg:text-[12px] text-muted-foreground truncate">{c.footerLabel}</span>
                <span className={`text-[11px] lg:text-[12px] font-semibold tabular-nums whitespace-nowrap ${t.text}`}>
                  {c.footerValue}
                </span>
              </div>

            </div>
          </button>
        );
      })}
    </div>
  );
}
