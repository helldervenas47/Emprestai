export interface Loan {
  id: string;
  borrowerName: string;
  borrowerId?: string;
  amount: number;
  /** Principal original do contrato — definido na criação e imutável. Usado em apurações históricas (lucro, juros recebidos). Cai em `amount` quando ausente. */
  originalAmount?: number;
  interestRate: number;
  interestType: string;
  paymentType: string;
  startDate: string;
  dueDate: string;
  /** Data de vencimento original do contrato — referência fixa de ciclo, não muda com renegociação. */
  originalDueDate?: string;
  installments: number;
  paidInstallments: number;
  status: "active" | "paid" | "overdue";
  remainingAmount?: number;
  customInstallmentValue?: number | null;
  customInterestValue?: number | null;
  tags?: string[];
  notes?: string;
  lateInterestType?: string | null;
  lateInterestValue?: number | null;
  penaltyValue?: number | null;
  hasManager?: boolean;
  managerId?: string | null;
  managerCommissionRate?: number | null;
  autoBillingEnabled?: boolean;
  renegotiationPenaltyTotal?: number;
  isSale?: boolean;
  /** Divisão do desembolso entre até 2 formas de pagamento (quando houver). */
  paymentSplit?: PaymentSplit | null;
  createdAt: string;
}

export type LoanRenegotiationType = "no_interest" | "with_penalty";
export type LoanRenegotiationPenaltyMode = "fixed" | "percentage";

export interface LoanRenegotiation {
  id: string;
  loanId: string;
  userId: string;
  renegotiatedAt: string;
  type: LoanRenegotiationType;
  previousAmount: number;
  newAmount: number;
  penaltyAmount: number;
  penaltyMode?: LoanRenegotiationPenaltyMode | null;
  penaltyInput?: number | null;
  previousInstallments?: number | null;
  newInstallments?: number | null;
  notes?: string | null;
  createdAt: string;
}

export interface InstallmentSchedule {
  id?: string;
  loanId: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
}

export interface PaymentSplitPart {
  paymentMethodId: string | null;
  amount: number;
}

export interface PaymentSplit {
  parts: PaymentSplitPart[];
}

export interface PaymentMetadata {
  kind?: "amortization" | string;
  old_principal?: number;
  new_principal?: number;
  old_interest_total?: number;
  new_interest_total?: number;
  interest_saved?: number;
  new_remaining?: number;
  interest_rate?: number;
  split?: PaymentSplit | null;
  [key: string]: any;
}

export interface Payment {
  id: string;
  loanId: string;
  amount: number;
  date: string;
  installmentNumber: number;
  previousDueDate?: string;
  paymentMethodId?: string | null;
  metadata?: PaymentMetadata | null;
  createdAt?: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  cpf: string;
  cnpj: string;
  rg: string;
  address: string;
  city: string;
  state: string;
  score: string;
  notes?: string;
  active: boolean;
  createdAt: string;
  isVehicleRental?: boolean;
  nacionalidade?: string;
  estadoCivil?: string;
  profissao?: string;
  bairro?: string;
  isManager?: boolean;
  defaultInterestRate?: number | null;
  autoBillingEnabled?: boolean;
  scoreRisco?: number | null;
  scoreTempoReal?: number | null;
  scoreAtualizadoEm?: string | null;
  qtdPagamentosTotal?: number | null;
  qtdPagamentosAtrasados?: number | null;
  diasAtrasoAcumulado?: number | null;
  diasAtrasoExcedenteAcumulado?: number | null;
  streakAtual?: number | null;
  maiorStreak?: number | null;
  ultimaDataVencimentoProcessada?: string | null;
  valorEmAtraso?: number | null;
  qtdEmprestimosQuitados?: number | null;
}

export type ClientAnalysisStatus = "pending" | "verified" | "unavailable" | "stale";

export interface ClientFinancialProfile {
  id: string;
  ownerId: string;
  clientId: string;
  analysisStatus: ClientAnalysisStatus;
  sourceStatus: ClientAnalysisStatus;
  consentGiven: boolean;
  consentedAt?: string | null;
  provider?: string | null;
  monthlyIncome?: number | null;
  debtLevel?: number | null;
  employmentStability?: string | null;
  industrySector?: string | null;
  bankingRelationship?: string | null;
  externalScore?: number | null;
  internalScore?: number | null;
  consolidatedScore?: number | null;
  riskLevel?: "baixo" | "moderado" | "alto" | "critico" | null;
  positiveFactors: string[];
  negativeFactors: string[];
  lastError?: string | null;
  fetchedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientCreditReport {
  id: string;
  ownerId: string;
  clientId: string;
  provider: string;
  rawSummary: Record<string, unknown>;
  delinquencyHistory: Array<Record<string, unknown>>;
  creditHistorySummary?: string | null;
  sourceStatus: ClientAnalysisStatus;
  fetchedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientAnalysisEvent {
  id: string;
  ownerId: string;
  clientId: string;
  eventType: string;
  status: string;
  message?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ManagerCommission {
  id: string;
  loanId: string;
  managerId: string;
  paymentId?: string | null;
  commissionType: "interest" | "full";
  baseAmount: number;
  rate: number;
  amount: number;
  generatedAt: string;
  /** Parcela que originou a comissão (congelada no banco). */
  installmentNumber?: number | null;
  /** Nome do gerente no momento do pagamento (histórico imutável). */
  managerNameSnapshot?: string | null;
  /** 'trigger' | 'backfill' | 'manual' */
  source?: string | null;
  locked?: boolean | null;
  notes?: string | null;

  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  /** Preço de venda. */
  price: number;
  /** Preço de compra (custo padrão). */
  cost: number;
  /** Último valor pago em uma compra. */
  lastPurchasePrice: number;
  /** Estoque sugerido (mínimo recomendado). */
  suggestedStock: number;
  stock: number;
  active: boolean;
  createdAt: string;
}

export type BusinessType = "venda" | "streaming" | "aluguel_veiculo";

export type PaymentMode = "fixa" | "recorrente";

export interface SalePaymentRecord {
  amount: number;
  /** Data do pagamento (YYYY-MM-DD). */
  date: string;
  /** Hora do pagamento (HH:mm). Opcional para registros antigos. */
  time?: string | null;
  type: "full" | "partial";
  paymentMethodId?: string | null;
  notes?: string | null;
  /** Número da parcela (1-indexed) a que este pagamento foi aplicado. Opcional p/ registros antigos. */
  installmentNumber?: number | null;
  /** Nome ou e-mail do usuário responsável pelo recebimento. */
  userName?: string | null;
}

export interface Sale {
  id: string;
  productId?: string;
  productName: string;
  description: string;
  quantity: number;
  unitPrice: number;
  cost: number;
  total: number;
  customerName: string;
  date: string;
  notes?: string;
  businessType: BusinessType;
  paymentMode: PaymentMode;
  installments: number;
  paidInstallments: number;
  downPayment: number;
  frequency: string;
  installmentValue?: number | null;
  installmentAmounts?: number[] | null;
  installmentDates?: string[] | null;
  partialPaid: number;
  paymentHistory?: SalePaymentRecord[];
  locadorId?: string | null;
  foroCity?: string | null;
  category?: string | null;
}
export interface Expense {
  id: string;
  /** Opcional: presente em payloads legados/mocks. */
  userId?: string | null;
  description: string;
  amount: number;
  type: "fixa" | "recorrente";
  category: string;
  installments?: number;
  paidInstallments?: number;
  dueDate: string;
  paid: boolean;
  paidDate?: string;
  notes?: string;
  createdAt: string;
  parentExpenseId?: string;
  scope?: "business" | "personal";
  paymentMethodId?: string | null;
  generateIncomeOnPay?: boolean;
  generatedIncomeId?: string | null;
  recurrenceType?: "standard" | "after_payment";
}
