// Traditional list view — table of LoanRowView rows.
// Restored from the previous implementation (before the mini-card refactor).
import { useHideValues } from "@/contexts/HideValuesContext";
import { Loan, Payment, InstallmentSchedule, Client, PaymentSplit } from "@/types/loan";
import type { LoanRenegotiation } from "@/types/loan";
import type { Category } from "@/features/loans/components/list/types";
import { rawFormatCurrency } from "@/features/loans/components/list/formatting";
import { LoanRowView } from "@/features/loans/components/list/LoanListRow";

type SortKey =
  | "borrowerName"
  | "category"
  | "amount"
  | "remaining"
  | "installments"
  | "dueDate"
  | "tags";

export interface LoanListTableProps {
  categorized: Loan[];
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  category: Category;
  totalToReceive: number;
  readOnly?: boolean;
  clients?: Client[];
  renegotiationsByLoan: Map<string, LoanRenegotiation[]>;
  commissionTotalByLoan: Map<string, number>;
  cycleColumnSort: (key: SortKey) => void;
  sortIndicator: (key: SortKey) => React.ReactNode;
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

export function LoanListTable({
  categorized,
  loans,
  payments,
  installmentSchedules,
  category,
  totalToReceive,
  readOnly = false,
  clients = [],
  renegotiationsByLoan,
  commissionTotalByLoan,
  cycleColumnSort,
  sortIndicator,
  onPayment,
  onPartialPayment,
  onFullPayment,
  onInterestPayment,
  onAmortize,
  onRenegotiate,
  onUpdate,
  onDelete,
  onDeletePayment,
  onSaveSchedule,
}: LoanListTableProps) {
  const { mask } = useHideValues();
  const existingTags = loans.flatMap(l => l.tags || []).filter((v, i, a) => a.indexOf(v) === i);

  const headerBtn = (key: SortKey, label: string, className = "") => (
    <button
      type="button"
      onClick={() => cycleColumnSort(key)}
      className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${className}`}
    >
      {label}
      {sortIndicator(key)}
    </button>
  );

  return (
    <div className="space-y-2">
      {/* Header summary */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs sm:text-sm text-muted-foreground tabular-nums">
          {categorized.length} {categorized.length === 1 ? "empréstimo" : "empréstimos"}
        </span>
        <span className={`text-xs sm:text-sm font-semibold tabular-nums ${category === "paid" ? "text-success" : "text-primary"}`}>
          {mask(rawFormatCurrency(totalToReceive))}
        </span>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card overflow-hidden shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/40 bg-muted/30">
              <th className="px-1.5 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground">
                {headerBtn("borrowerName", "Cliente")}
              </th>
              <th className="hidden sm:table-cell px-1.5 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground">
                {headerBtn("category", "Status")}
              </th>
              <th className="hidden sm:table-cell px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                {headerBtn("amount", category === "paid" ? "Total pago" : "Emprestado")}
              </th>
              <th className="px-1.5 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground">
                {headerBtn("remaining", "Restante")}
              </th>
              <th className="hidden sm:table-cell px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                {headerBtn("installments", "Parcelas")}
              </th>
              <th className="px-1.5 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground">
                {headerBtn("dueDate", "Venc.")}
              </th>
              <th className="hidden sm:table-cell px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                {headerBtn("tags", "Etiquetas")}
              </th>
              <th className="hidden sm:table-cell px-4 py-2.5 text-right text-xs font-medium text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody>
            {categorized.map((loan) => (
            <LoanRowView
                key={loan.id}
                loan={loan}
                payments={payments}
                installmentSchedules={installmentSchedules}
                readOnly={readOnly}
                existingTags={existingTags}
                clients={clients}
                renegotiations={renegotiationsByLoan.get(loan.id) || []}
                managerCommissionTotal={commissionTotalByLoan?.get(loan.id) || 0}
                hideQuickNotes
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
