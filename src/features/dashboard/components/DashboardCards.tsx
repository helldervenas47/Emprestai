import { DollarSign, TrendingUp, Users, AlertTriangle, Crown, Clock } from "lucide-react";
import { todayInAppTz } from "@/lib/timezone";
import { Loan, Payment } from "@/types/loan";
import { calculateTotalWithInterest } from "@/features/loans/hooks/useLoans";
import { useHideValues } from "@/contexts/HideValuesContext";
import { useSubscription } from "@/hooks/useSubscription";
import { Progress } from "@/components/ui/progress";

interface Props {
  loans: Loan[];
  payments: Payment[];
}

export function DashboardCards({ loans, payments }: Props) {
  const { mask } = useHideValues();
  const { planTier, planLimits } = useSubscription();
  const activeLoansData = loans.filter((l) => l.status !== "paid");

  // Capital na Rua = principal proporcional ainda em aberto
  // (principal × parcelas restantes / total de parcelas) por contrato ativo.
  const totalLent = activeLoansData.reduce((sum, l) => {
    const n = l.installments > 0 ? l.installments : 1;
    const paid = Math.min(l.paidInstallments ?? 0, n);
    const remainingRatio = Math.max(0, (n - paid) / n);
    return sum + l.amount * remainingRatio;
  }, 0);

  // Total a Receber = total do contrato + lateFees + juros recebidos (installmentNumber === 0)
  const todayNorm = new Date(); todayNorm.setHours(0, 0, 0, 0);
  const totalToReceive = activeLoansData.reduce((sum, l) => {
    const total = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
    const dueDate = new Date(l.dueDate + "T00:00:00");
    const daysLate = Math.max(0, Math.floor((todayNorm.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
    let lateFees = 0;
    if (l.lateInterestValue != null && l.lateInterestValue > 0 && daysLate > 0) {
      const paidForLoan = payments.filter((p) => p.loanId === l.id).reduce((s, p) => s + p.amount, 0);
      const baseRemaining = l.remainingAmount != null && l.remainingAmount > 0 ? l.remainingAmount : Math.max(0, total - paidForLoan);
      lateFees += l.lateInterestType === "fixed"
        ? l.lateInterestValue * daysLate
        : baseRemaining * (l.lateInterestValue / 100) * daysLate;
    }
    if (l.penaltyValue != null && l.penaltyValue > 0) {
      lateFees += l.penaltyValue;
    }
    const interestPaymentsReceived = payments
      .filter((p) => p.loanId === l.id && p.installmentNumber === 0)
      .reduce((s, p) => s + p.amount, 0);
    return sum + Math.round((total + lateFees + interestPaymentsReceived) * 100) / 100;
  }, 0);

  const totalInterest = loans.reduce(
    (sum, l) => sum + (calculateTotalWithInterest(l.amount, l.interestRate, l.installments) - l.amount),
    0
  );
  const activeLoans = activeLoansData.length;
  const todayStr = todayInAppTz();
  const overdueLoans = loans.filter((l) => l.status === "overdue" && l.dueDate < todayStr).length;

  // Pendente de Recebimento = soma do remaining_amount dos empréstimos ativos
  const pendingReceivable = activeLoansData.reduce((sum, l) => sum + (l.remainingAmount ?? 0), 0);

  // Lucro Estimado = Pendente de Recebimento - Capital na Rua
  const estimatedProfit = pendingReceivable - totalLent;


  // Calculate loan limit usage (default 5 for trial users without subscription)
  const maxLoans = planLimits?.maxLoans || 5;
  const loanLimitPercent = Math.min(100, (activeLoans / maxLoans) * 100);
  const isNearLimit = loanLimitPercent >= 80;
  const isAtLimit = activeLoans >= maxLoans;

  const cards = [
    { title: "Capital na Rua", value: formatCurrency(totalLent), isCurrency: true, icon: DollarSign, accentClass: "text-primary", bgClass: "bg-primary/10", glowClass: "glow-primary" },
    
    { title: "Pendente de Recebimento", value: formatCurrency(pendingReceivable), isCurrency: true, icon: Clock, accentClass: "text-orange-500", bgClass: "bg-orange-500/10", glowClass: "" },
    { title: "Lucro Estimado", value: formatCurrency(estimatedProfit), isCurrency: true, icon: TrendingUp, accentClass: "text-warning", bgClass: "bg-warning/10", glowClass: "" },
    { 
      title: "Empréstimos Ativos", 
      value: `${activeLoans}`, 
      isCurrency: false, 
      subtitle: overdueLoans > 0 ? `${overdueLoans} em atraso` : undefined, 
      icon: Users, 
      subtitleIcon: overdueLoans > 0 ? AlertTriangle : undefined, 
      accentClass: "text-primary", 
      bgClass: "bg-primary/10", 
      glowClass: "" 
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {cards.map((card, i) => (
          <div key={card.title} className={`rounded-2xl p-4 sm:p-4 lg:p-5 bg-card border border-border/20 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)] backdrop-blur-sm ${card.glowClass} transition-all duration-400 ease-out hover:shadow-[0_4px_16px_-6px_hsl(0_0%_0%/0.08)] hover:-translate-y-[1px] text-center animate-fade-in flex flex-col items-center justify-start min-w-0`} style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'backwards' }}>
            <div className="flex items-center justify-center mb-2 sm:mb-3">
              <div className={`h-8 w-8 rounded-lg ${card.bgClass} flex items-center justify-center`}>
                <card.icon className={`h-4 w-4 ${card.accentClass}`} />
              </div>
            </div>
            <span className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider leading-tight">{card.title}</span>
            <p
              className={`font-bold ${card.accentClass} mt-1 w-full whitespace-nowrap tabular-nums tracking-tight`}
              style={{ fontSize: card.isCurrency ? "clamp(0.95rem, 2.2vw, 1.5rem)" : "1.5rem" }}
            >
              {card.isCurrency ? mask(card.value) : card.value}
            </p>
            {card.subtitle && (
              <p className="text-xs mt-2 text-muted-foreground flex items-center justify-center gap-1">
                {card.subtitleIcon && <card.subtitleIcon className="h-3 w-3 text-destructive" />}
                {card.subtitle}
              </p>
            )}
          </div>
        ))}
      </div>
      
      {/* Loan Limit Indicator */}
      <div className="rounded-2xl p-4 bg-card border border-border/20 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)] backdrop-blur-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Crown className={`h-4 w-4 ${isAtLimit ? "text-destructive" : isNearLimit ? "text-warning" : "text-primary"}`} />
            <span className="text-sm font-medium">Limite de Empréstimos</span>
            <span className="text-xs text-muted-foreground">
              ({planTier === 1 ? "Básico" : planTier === 2 ? "Profissional" : planTier === 3 ? "Empresarial" : "Trial"})
            </span>
          </div>
          <span className={`text-sm font-semibold ${isAtLimit ? "text-destructive" : isNearLimit ? "text-warning" : "text-primary"}`}>
            {activeLoans} / {maxLoans}
          </span>
        </div>
        <Progress 
          value={loanLimitPercent} 
          className={`h-2 ${isAtLimit ? "bg-destructive/20" : isNearLimit ? "bg-warning/20" : ""}`}
        />
        <p className="text-xs text-muted-foreground mt-2">
          {isAtLimit 
            ? "Limite atingido. Faça upgrade para criar mais empréstimos." 
            : isNearLimit 
              ? `Restam apenas ${maxLoans - activeLoans} empréstimos no seu plano.` 
              : `Você pode criar mais ${maxLoans - activeLoans} empréstimos.`}
        </p>
      </div>
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
