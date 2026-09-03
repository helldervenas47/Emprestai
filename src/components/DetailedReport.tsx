import { useMemo } from "react";
import { Loan, Client, Payment, InstallmentSchedule } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { getInstallmentAmount, getOverdueInstallments } from "@/features/loans/lib/loanInstallmentAmount";
import { todayInAppTz } from "@/lib/timezone";
import { FileText } from "lucide-react";

interface Props {
  loans: Loan[];
  payments: Payment[];
  clients: Client[];
  installmentSchedules: InstallmentSchedule[];
}

function rawFormatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function getTodayStr(): string {
  return todayInAppTz();
}

function getLoanRemaining(loan: Loan, _payments: Payment[], installmentSchedules: InstallmentSchedule[], _todayStr: string): number {
  // Critério unificado: usar somente o valor da próxima parcela em aberto.
  return getInstallmentAmount(loan, installmentSchedules);
}

function getDaysOverdue(dueDate: string): number {
  const due = new Date(dueDate + "T00:00:00");
  const today = new Date(todayInAppTz() + "T00:00:00");
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
}

function calcLateFees(loan: Loan, baseAmount: number): number {
  const daysOverdue = getDaysOverdue(loan.dueDate);
  if (daysOverdue === 0) return 0;
  let lateInterestTotal = 0;
  if (loan.lateInterestValue != null && loan.lateInterestValue > 0) {
    if (loan.lateInterestType === "fixed") lateInterestTotal = loan.lateInterestValue * daysOverdue;
    else lateInterestTotal = baseAmount * (loan.lateInterestValue / 100) * daysOverdue;
  }
  const penaltyTotal = (loan.penaltyValue != null && loan.penaltyValue > 0) ? loan.penaltyValue : 0;
  return lateInterestTotal + penaltyTotal;
}

function getPaymentType(loan: Loan): string {
  const types: Record<string, string> = {
    monthly: "Mensal", biweekly: "Quinzenal", weekly: "Semanal", daily: "Diário",
  };
  return types[loan.paymentType] || loan.paymentType;
}

function formatDateBR(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("pt-BR");
}

function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const days = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  return days[d.getDay()];
}

export function DetailedReport({ loans, payments, installmentSchedules }: Props) {
  const todayStr = getTodayStr();

  const activeLoans = useMemo(() => loans.filter((l) => l.status !== "paid"), [loans]);

  const sortByNameThenDate = (a: { loan: Loan }, b: { loan: Loan }) => {
    const nameCompare = a.loan.borrowerName.localeCompare(b.loan.borrowerName, "pt-BR");
    if (nameCompare !== 0) return nameCompare;
    return a.loan.dueDate.localeCompare(b.loan.dueDate);
  };

  const dueTodayLoans = useMemo(() => activeLoans
    .filter((loan) => loan.dueDate === todayStr)
    .map((loan) => {
      const base = getLoanRemaining(loan, payments, installmentSchedules, todayStr);
      const lateFees = calcLateFees(loan, base);
      return { loan, amount: base + lateFees, baseAmount: base, lateFees };
    })
    .sort(sortByNameThenDate),
    [activeLoans, payments, installmentSchedules, todayStr]);

  const overdueLoans = useMemo(() => activeLoans
    .filter((loan) => loan.dueDate < todayStr)
    .map((loan) => {
      const installments = getOverdueInstallments(loan, installmentSchedules, todayStr);
      const base = installments.reduce((s, i) => s + i.amount, 0)
        || getLoanRemaining(loan, payments, installmentSchedules, todayStr);
      return { loan, amount: base, baseAmount: base, lateFees: 0, installmentsCount: installments.length };
    })
    .sort(sortByNameThenDate),
    [activeLoans, payments, installmentSchedules, todayStr]);

  const totalDueToday = dueTodayLoans.reduce((s, d) => s + d.amount, 0);
  const totalOverdue = overdueLoans.reduce((s, d) => s + d.amount, 0);
  const totalPending = totalDueToday + totalOverdue;

  return (
    <Card no3d>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Relatório detalhado
          </h3>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-3 font-mono text-xs leading-relaxed">
          <div>
            <p className="font-bold">📊 RELATÓRIO DIÁRIO</p>
            <p className="text-muted-foreground">🗓 {formatDateBR(todayStr)} • {getDayOfWeek(todayStr)}</p>
          </div>

          <hr className="border-border" />

          <div>
            <p className="font-bold">💰 RESUMO DO DIA</p>
            <p>▸ A cobrar hoje: {rawFormatCurrency(totalDueToday)} ({dueTodayLoans.length} parcelas)</p>
            <p>▸ Em atraso: {rawFormatCurrency(totalOverdue)} ({overdueLoans.reduce((sum, item) => sum + item.installmentsCount, 0)} parcelas)</p>
            <p>▸ Total pendente: {rawFormatCurrency(totalPending)}</p>
          </div>

          <hr className="border-border" />

          <div>
            <p className="font-bold">⏰ VENCE HOJE — {rawFormatCurrency(totalDueToday)}</p>
            {dueTodayLoans.length === 0 ? (
              <p className="text-muted-foreground">Nenhum empréstimo vencendo hoje.</p>
            ) : (
              <div className="mt-1">
                <p>💵 Empréstimos ({dueTodayLoans.length})</p>
                {dueTodayLoans.map(({ loan, amount, lateFees }) => (
                  <div key={loan.id} className="ml-2">
                    <p>• <strong>{loan.borrowerName}</strong> — {rawFormatCurrency(amount)}
                      {lateFees > 0 && <span className="text-destructive"> (inclui {rawFormatCurrency(lateFees)} juros/multa)</span>}
                    </p>
                    <p className="text-muted-foreground ml-3">└ {getPaymentType(loan)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <hr className="border-border" />

          <div>
            <p className="font-bold">🚨 EM ATRASO — {rawFormatCurrency(totalOverdue)}</p>
            {overdueLoans.length === 0 ? (
              <p className="text-muted-foreground">Nenhum empréstimo em atraso!</p>
            ) : (
              <div className="mt-1">
                <p>💵 Empréstimos ({overdueLoans.length})</p>
                {overdueLoans.map(({ loan, amount, lateFees }) => (
                  <div key={loan.id} className="ml-2">
                    <p>• <strong>{loan.borrowerName}</strong> — {rawFormatCurrency(amount)}
                      {lateFees > 0 && <span className="text-destructive"> (inclui {rawFormatCurrency(lateFees)} juros/multa)</span>}
                    </p>
                    <p className="text-muted-foreground ml-3">└ {getPaymentType(loan)} • Venc. {formatDateBR(loan.dueDate)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
