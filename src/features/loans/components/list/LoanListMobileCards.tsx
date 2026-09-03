// Cards view — stack of mini horizontal loan cards (premium compact model).
import React from "react";
import { Loan, Payment, InstallmentSchedule, Client, PaymentSplit } from "@/types/loan";
import type { LoanRenegotiation } from "@/types/loan";
import { LoanListMiniCard } from "@/features/loans/components/list/LoanListMiniCard";

interface Props {
  loans: Loan[];
  allLoans: Loan[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  renegotiationsByLoan: Map<string, LoanRenegotiation[]>;
  clients?: Client[];
  readOnly?: boolean;
  onPayment: (loanId: string, paymentDate?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onPartialPayment: (loanId: string, amount: number, paymentDate?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onFullPayment?: (loanId: string, paymentDate?: string, customAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onInterestPayment: (loanId: string, paymentDate?: string, customAmount?: number, feesAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null, options?: { partial?: boolean; notes?: string | null }) => void;
  onAmortize?: (loanId: string, amount: number, paymentDate?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => Promise<void> | void;
  onRenegotiate?: (loanId: string, params: { type: "no_interest" | "with_penalty"; penaltyMode?: "fixed" | "percentage" | null; penaltyInput?: number | null; penaltyDistribution?: "diluted" | "first" | null; newInstallments?: number | null; notes?: string | null; selectedInstallmentNumbers?: number[] | null; firstDueDate?: string | null }) => Promise<void> | void;
  onUpdate: (id: string, data: Partial<Omit<Loan, "id">>) => void;
  onDelete: (loanId: string) => void;
  onDeletePayment: (paymentId: string) => void;
  onSaveSchedule: (loanId: string, rows: { installmentNumber: number; dueDate: string; amount: number }[]) => Promise<void>;
}

export function LoanListMobileCards({
  loans, allLoans, payments, installmentSchedules, renegotiationsByLoan, clients = [], readOnly = false,
  onPayment, onPartialPayment, onFullPayment, onInterestPayment, onAmortize, onRenegotiate,
  onUpdate, onDelete, onDeletePayment, onSaveSchedule,
}: Props) {
  const existingTags = allLoans.flatMap(l => l.tags || []).filter((v, i, a) => a.indexOf(v) === i);
  // Anima o fade-in apenas na primeira renderização da lista. Sem isso, cada
  // mutação (pagamento, edição, expansão de card) reaplica a animação e a
  // combinação `animation-fill-mode: backwards` + delays escalonados dá a
  // sensação de "voltar ao topo" enquanto os cards reaparecem de baixo pra cima.
  const didMountRef = React.useRef(false);
  React.useEffect(() => { didMountRef.current = true; }, []);
  const animateOnMount = !didMountRef.current;
  return (
    <div className="flex flex-col gap-2 sm:gap-2.5 loan-list-compact">
      {loans.map((loan, i) => (
        <div
          key={loan.id}
          className={animateOnMount ? "animate-fade-in" : undefined}
          style={animateOnMount ? { animationDelay: `${Math.min(i, 12) * 40}ms`, animationFillMode: "backwards" } : undefined}
        >
          <LoanListMiniCard
            loan={loan}
            payments={payments}
            installmentSchedules={installmentSchedules}
            readOnly={readOnly}
            existingTags={existingTags}
            clients={clients}
            renegotiations={renegotiationsByLoan.get(loan.id) || []}
            onPayment={(date, mid, split) => onPayment(loan.id, date, mid, split)}
            onPartialPayment={(amt, date, mid, split) => onPartialPayment(loan.id, amt, date, mid, split)}
            onFullPayment={onFullPayment ? (date, custom, mid, split) => onFullPayment(loan.id, date, custom, mid, split) : undefined}
            onInterestPayment={(date, custom, fees, mid, split, opts) => onInterestPayment(loan.id, date, custom, fees, mid, split, opts)}
            onAmortize={onAmortize ? (amt, date, mid, split) => onAmortize(loan.id, amt, date, mid, split) : undefined}
            onRenegotiate={onRenegotiate ? (params) => onRenegotiate(loan.id, params) : undefined}
            onUpdate={(d) => onUpdate(loan.id, d)}
            onDelete={() => onDelete(loan.id)}
            onDeletePayment={onDeletePayment}
            onSaveSchedule={onSaveSchedule}
          />
        </div>
      ))}
    </div>
  );
}
