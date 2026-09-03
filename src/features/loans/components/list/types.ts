export type Category =
  | "all"
  | "overdue"
  | "paid_interest"
  | "paid"
  | "due_today"
  | "on_track"
  | "parcelado"
  | "venda";

export interface EditForm {
  borrowerName: string;
  amount: string;
  interestRate: string;
  interestValue: string;
  installmentValue: string;
  installments: string;
  paidInstallments: string;
  startDate: string;
  dueDate: string;
  notes: string;
  tags: string;
  interestType: string;
  remainingAmount: string;
}
