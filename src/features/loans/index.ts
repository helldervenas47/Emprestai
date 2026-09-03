// Barrel export para o domínio de Empréstimos.
// Uso: `import { LoanForm } from "@/features/loans"`.
export { LoanForm } from "./components/LoanForm";
export { LoanList } from "./components/LoanList";
export { LoanSimulator } from "./components/LoanSimulator";
export { LoanPaymentHistoryDialog } from "./components/LoanPaymentHistoryDialog";
export { LoanPaymentSplitEditor } from "./components/LoanPaymentSplitEditor";

export * from "./hooks/useLoans";
export * from "./hooks/useLoanRenegotiations";
export * from "./hooks/useLoanSimulations";
export * from "./hooks/useDashboardLoanTotals";
