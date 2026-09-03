export type PaymentType = "mensal" | "quinzenal" | "semanal" | "comissao" | "hora";
export type EmployeeStatus = "ativo" | "inativo" | "ferias" | "afastado";
export type PayrollStatus = "pendente" | "parcial" | "pago" | "atrasado";

export interface SalaryItem {
  label: string;
  amount: number;
  /** Optional kind: benefit / deduction / earning / goal_bonus */
  kind?: string;
  /** Optional metadata (e.g. goal-bonus reference month, score obtained). */
  meta?: Record<string, any>;
}

export interface Employee {
  id: string;
  name: string;
  cpf?: string | null;
  role?: string | null;
  department?: string | null;
  registration?: string | null;
  hireDate?: string | null;
  status: EmployeeStatus;
  photoUrl?: string | null;
  baseSalary: number;
  paymentType: PaymentType;
  hourlyRate?: number | null;
  commissionPercent?: number | null;
  bank?: string | null;
  agency?: string | null;
  account?: string | null;
  pixKey?: string | null;
  benefits: SalaryItem[];
  deductions: SalaryItem[];
  notes?: string | null;
  /** Quando true, cada pagamento de salário gera também uma entrada na aba Receitas (somente composição, sem impacto duplicado no saldo). */
  addToIncomes: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollItems {
  earnings: SalaryItem[];
  deductions: SalaryItem[];
}

export interface Payroll {
  id: string;
  employeeId: string;
  competence: string; // YYYY-MM
  grossSalary: number;
  totalBenefits: number;
  totalDeductions: number;
  netSalary: number;
  paidAmount: number;
  status: PayrollStatus;
  dueDate?: string | null;
  paidDate?: string | null;
  paymentMethodId?: string | null;
  expenseId?: string | null;
  incomeId?: string | null;
  closed: boolean;
  items: PayrollItems;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollPayment {
  id: string;
  payrollId: string;
  amount: number;
  paidDate: string;
  paymentMethodId?: string | null;
  expenseId?: string | null;
  incomeId?: string | null;
  notes?: string | null;
  createdAt: string;
}
