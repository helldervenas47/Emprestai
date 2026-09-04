import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/userClient";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useHideValues } from "@/contexts/HideValuesContext";
import { useMonthlyGoals, GoalType, formatMonthLabel } from "@/features/piggyBanks/hooks/useMonthlyGoals";
import { useGoalSnapshots } from "@/features/piggyBanks/hooks/useGoalSnapshots";
import { useAccountSettings } from "@/hooks/useAccountSettings";
import { Loan, Payment, Expense, Client, InstallmentSchedule, LoanRenegotiation } from "@/types/loan";
import { todayInAppTz, formatYmdInAppTz } from "@/lib/timezone";
import { useActiveCapitalSnapshots } from "@/features/piggyBanks/hooks/useActiveCapitalSnapshots";
import { calculateMonthlyInterestRate } from "@/features/financial/lib/monthlyInterestRate";
import { allocateInterestByPaymentUpTo } from "@/features/financial/lib/interestAllocation";
import { getLoanReceivable } from "@/features/loans/lib/loanLateFees";
import { computeMonthProfitGoal } from "@/features/piggyBanks/lib/periodProfitExpected";
import { GoalYearlyEvolutionDialog } from "@/features/piggyBanks/components/GoalYearlyEvolutionDialog";
import { assertWritable } from "@/lib/readOnlyState";
import {
  Target, Percent, TrendingUp, Banknote, FileText,
  HandCoins, Coins, Wallet, PiggyBank, AlertTriangle, UserPlus,
  Sparkles, CheckCircle2, AlertCircle, TrendingDown, Lightbulb,
  BookOpen, Calculator, Database, FlaskConical, Settings2, ArrowUp, ArrowDown, GripVertical, RefreshCw, Lock, BarChart3,
  Pencil, Check, X,
} from "lucide-react";

// Mês "YYYY-MM" — true se já é estritamente anterior ao mês corrente no fuso do app
function isMonthClosed(month: string): boolean {
  const today = todayInAppTz(); // YYYY-MM-DD
  const currentMonth = today.slice(0, 7);
  return month < currentMonth;
}

// Inline para evitar import circular com useLoans
function calculateTotalWithInterest(principal: number, rate: number, _months: number): number {
  return Math.round(principal * (1 + rate / 100));
}

// Explicações didáticas de como cada meta é calculada
const GOAL_EXPLANATIONS: Record<GoalType, {
  formula: string;
  indicators: string[];
  dataSource: string[];
  example: { setup: string; calc: string; result: string };
  measurement: string;
}> = {
  interest_rate: {
    formula: "Taxa Juros (%) = (Total a Receber − Total Emprestado) ÷ Total Emprestado × 100",
    indicators: [
      "Total Emprestado = soma do valor principal dos contratos do mês",
      "Total a Receber = soma de (principal + juros) de cada contrato do mês",
      "Validação: se Total Emprestado = 0, resultado = 0%",
    ],
    dataSource: ["Tabela de Empréstimos (loans)", "Campos: amount, interest_rate, installments", "Filtro: start_date no mês selecionado"],
    example: {
      setup: "2 empréstimos no mês: R$ 1.000 a 10% e R$ 2.000 a 15%.",
      calc: "Total Emprestado = 3.000. Total a Receber = 1.100 + 2.300 = 3.400. (3.400 − 3.000) ÷ 3.000 × 100",
      result: "Taxa Juros Mensal = 13,33%",
    },
    measurement: "Quanto maior, mais próximo da meta. Atingimento = (Realizado ÷ Meta) × 100. Resultado em % com 2 casas decimais.",
  },
  profit: {
    formula: "Faturamento do Período (%) = (Total Recebido no Mês ÷ Total Previsto no Mês) × 100",
    indicators: [
      "Total Recebido = soma de TODOS pagamentos com data no mês (principal + juros + multa), igual ao extrato",
      "Inclui pagamentos somente de juros (parcela 0) e juros + multa",
      "Total Previsto = soma das parcelas (principal + juros) com vencimento no mês, independentemente do status (pendente ou quitada)",
    ],
    dataSource: ["Tabela de Pagamentos (payments.date, payments.amount)", "Tabela de Empréstimos / Cronograma de Parcelas (vencimentos no mês)"],
    example: {
      setup: "Previsto a receber no mês: R$ 3.000. Recebido no mês: R$ 1.800 (parcelas + R$ 200 de juros avulsos).",
      calc: "(1.800 ÷ 3.000) × 100",
      result: "Faturamento do Período = 60,00%",
    },
    measurement: "Reflete exatamente o que entrou no extrato vs. o previsto a receber pelo vencimento. Resultado em % com 2 casas decimais.",
  },
  loan_volume: {
    formula: "Volume = Soma do valor principal de todos os empréstimos com data de início no mês selecionado",
    indicators: ["Valor principal de cada novo empréstimo", "Data de início (start_date)"],
    dataSource: ["Tabela de Empréstimos (loans)", "Campo: amount", "Filtro: start_date no mês selecionado"],
    example: {
      setup: "3 empréstimos criados no mês: R$ 1.000, R$ 2.500 e R$ 1.500.",
      calc: "1.000 + 2.500 + 1.500",
      result: "Valor emprestado = R$ 5.000",
    },
    measurement: "Atingimento = (Volume realizado ÷ Meta) × 100. Quanto maior, melhor.",
  },
  new_loans_count: {
    formula: "Quantidade = Número total de empréstimos criados no mês selecionado",
    indicators: ["Cada novo contrato conta como 1", "Data de início (start_date)"],
    dataSource: ["Tabela de Empréstimos (loans)", "Filtro: start_date no mês selecionado"],
    example: {
      setup: "Você criou 7 novos contratos no mês.",
      calc: "Contagem direta dos registros",
      result: "Novos empréstimos = 7",
    },
    measurement: "Atingimento = (Quantidade realizada ÷ Meta) × 100.",
  },
  received_total: {
    formula: "Total Recebido = Soma do valor de todos os pagamentos com data no mês selecionado",
    indicators: ["Valor de cada pagamento (principal + juros)", "Data do pagamento"],
    dataSource: ["Tabela de Pagamentos (payments)", "Campo: amount", "Filtro: date no mês selecionado"],
    example: {
      setup: "5 parcelas pagas no mês: R$ 300, R$ 450, R$ 200, R$ 500, R$ 350.",
      calc: "300 + 450 + 200 + 500 + 350",
      result: "Recebimentos no mês = R$ 1.800",
    },
    measurement: "Atingimento = (Total recebido ÷ Meta) × 100.",
  },
  interest_received: {
    formula: "Juros Recebidos = mesma lógica do 'Realizado' no gráfico 'Lucro por Período'",
    indicators: [
      "1) Juros avulsos (parcela 0) de contratos não quitados → valor integral",
      "2) Contratos quitados no mês → (Total Pago − Principal)",
      "3) Parcelas regulares de contratos ativos → valor × proporção de juros do contrato",
    ],
    dataSource: ["Tabela de Pagamentos (payments)", "Tabela de Empréstimos (loans)"],
    example: {
      setup: "Empréstimo R$ 1.000 a 30% (Total a Receber R$ 1.300). Parcela paga R$ 130.",
      calc: "Proporção juros = 1 − (1.000 ÷ 1.300) = 23,08%. Juros = 130 × 23,08%",
      result: "Juros desta parcela ≈ R$ 30,00",
    },
    measurement: "Atingimento = (Juros recebidos ÷ Meta) × 100. Resultado em R$.",
  },
  active_capital: {
    formula: "Capital Ativo = Soma do 'restante a receber' dos contratos ativos, congelada no fechamento de cada mês",
    indicators: ["Durante o mês, mostra o valor parcial atualizado", "No fechamento do mês, o valor é congelado como snapshot", "Meses já fechados não são recalculados retroativamente"],
    dataSource: ["Tabela de Empréstimos (loans)", "Snapshots mensais de capital ativo", "Filtro: mês selecionado"],
    example: {
      setup: "3 contratos ativos com restante: R$ 800, R$ 1.500 e R$ 2.200.",
      calc: "800 + 1.500 + 2.200",
      result: "Capital ativo = R$ 4.500",
    },
    measurement: "Para mês em aberto, usa o valor parcial atual. Para mês fechado, usa apenas o snapshot congelado no fechamento.",
  },
  net_profit: {
    formula: "Lucro Líquido = Juros recebidos no mês − Despesas pagas no mês (escopo empresa)",
    indicators: ["Juros recebidos do mês", "Despesas pagas (paid = true) com escopo diferente de 'pessoal'"],
    dataSource: ["Tabela de Pagamentos", "Tabela de Empréstimos", "Tabela de Despesas (expenses)"],
    example: {
      setup: "Juros recebidos: R$ 2.500. Despesas pagas: R$ 800.",
      calc: "2.500 − 800",
      result: "Lucro líquido = R$ 1.700",
    },
    measurement: "Atingimento = (Lucro líquido ÷ Meta) × 100.",
  },
  max_default_rate: {
    formula: "Inadimplência (%) = (Valor vencido em atraso no mês ÷ Valor total da carteira com vencimento no mês) × 100",
    indicators: [
      "Considera apenas valores com vencimento dentro do mês selecionado",
      "Total do período = soma das parcelas/contratos com vencimento no mês",
      "Em atraso = saldo vencido até a data atual e ainda não quitado",
      "Validação: se não houver carteira com vencimento no período, resultado = 0%",
    ],
    dataSource: ["Tabela de Empréstimos (loans)", "Tabela de Pagamentos (payments)", "Filtro: período do mês selecionado"],
    example: {
      setup: "No mês há R$ 10.000,00 a vencer na carteira e R$ 2.000,00 estão vencidos em atraso.",
      calc: "(2.000 ÷ 10.000) × 100",
      result: "Inadimplência = 20,00%",
    },
    measurement: "Meta INVERSA: quanto menor, melhor. Atingimento = máx(0, 100 − (Realizado ÷ Meta) × 100). Resultado em % com 2 casas decimais.",
  },
  new_clients_count: {
    formula: "Quantidade = Número de clientes cadastrados no mês selecionado",
    indicators: ["Cada cliente conta como 1", "Data de criação (created_at)"],
    dataSource: ["Tabela de Clientes (clients)", "Filtro: created_at no mês selecionado"],
    example: {
      setup: "Você cadastrou 4 novos clientes no mês.",
      calc: "Contagem direta dos registros",
      result: "Novos clientes = 4",
    },
    measurement: "Atingimento = (Quantidade realizada ÷ Meta) × 100.",
  },
  renegotiation_rate: {
    formula: "Quantidade = Número de contratos renegociados no mês selecionado",
    indicators: [
      "Considera apenas renegociações registradas dentro do mês",
      "Cada contrato é contado uma única vez (mesmo com múltiplas renegociações no mês)",
    ],
    dataSource: ["Tabela loan_renegotiations", "Filtro: renegotiated_at no mês selecionado"],
    example: {
      setup: "No mês, 3 contratos diferentes foram renegociados.",
      calc: "Contagem direta dos contratos distintos",
      result: "Contratos renegociados = 3",
    },
    measurement: "Meta INVERSA: quanto menor, melhor. Atingimento = máx(0, 100 − (Realizado ÷ Meta) × 100).",
  },
  daily_received_avg: {
    formula: "Média diária = Total Recebido no período ÷ Dias corridos do período até hoje",
    indicators: [
      "Meta cadastrada é o valor-alvo POR DIA (não mensal)",
      "Média diária = Total Recebido ÷ Dias corridos no período selecionado",
      "Atingimento = (Média diária ÷ Meta diária) × 100",
      "Falta/dia = max(0, Meta diária − Média diária)",
    ],
    dataSource: ["Tabela de Pagamentos (payments)", "Campo: amount, date", "Filtro: date no período selecionado"],
    example: {
      setup: "Hoje é dia 10 do mês. Meta diária: R$ 2.000. Total recebido até hoje: R$ 18.000.",
      calc: "Média diária = 18.000 ÷ 10 = R$ 1.800/dia. Atingimento = 1.800 ÷ 2.000 = 90%",
      result: "Média diária atual = R$ 1.800/dia · Falta/dia = R$ 200",
    },
    measurement: "Atingimento = (Média Diária Realizada ÷ Meta Diária) × 100. Quando a média diária ≥ meta diária, exibe 'Meta diária atingida'.",
  },
  monthly_variation: {
    formula: "Variação (%) = ((Patrimônio Atual − Patrimônio do Mês Anterior) ÷ Patrimônio do Mês Anterior) × 100",
    indicators: [
      "Patrimônio = Saldo em Conta + Pendente de Empréstimos",
      "Snapshot do mês anterior é travado no último dia de cada mês",
      "Atingimento = (Variação realizada ÷ Meta) × 100",
    ],
    dataSource: ["Saldos da conta", "Empréstimos pendentes (loans)", "Snapshot mensal (localStorage)"],
    example: {
      setup: "Patrimônio do mês anterior: R$ 70.000. Patrimônio atual: R$ 80.000.",
      calc: "((80.000 − 70.000) ÷ 70.000) × 100 = 14,29%",
      result: "Variação Mensal = +14,29%",
    },
    measurement: "Atingimento = (Variação realizada ÷ Meta cadastrada) × 100.",
  },
};

type Unit = "%" | "R$" | "qtd";

const GOAL_TYPE_META: Record<GoalType, { label: string; icon: any; unit: Unit; color: string; bgColor: string; description: string; inverse?: boolean }> = {
  interest_rate:      { label: "Taxa de Juros Mensal",            icon: Percent,       unit: "%",   color: "text-warning",     bgColor: "bg-warning/15",     description: "Meta da taxa média de juros aplicada nos contratos." },
  profit:             { label: "Faturamento do Período",            icon: TrendingUp,    unit: "%",   color: "text-success",     bgColor: "bg-success/15",     description: "Quanto do valor previsto foi efetivamente realizado." },
  loan_volume:        { label: "Valor Emprestado",                icon: Banknote,      unit: "R$",  color: "text-primary",     bgColor: "bg-primary/15",     description: "Soma do valor de novos empréstimos criados no mês." },
  new_loans_count:    { label: "Novos Empréstimos",                icon: FileText,      unit: "qtd", color: "text-primary",     bgColor: "bg-primary/15",     description: "Quantidade de novos contratos criados no mês." },
   received_total:     { label: "Pagamentos no Mês",              icon: HandCoins,     unit: "R$",  color: "text-success",     bgColor: "bg-success/15",     description: "Soma de todos os pagamentos Recebidos no mês." },
  interest_received:  { label: "Juros Recebidos",                  icon: Coins,         unit: "R$",  color: "text-success",     bgColor: "bg-success/15",     description: "Apenas a parte dos juros dos pagamentos Recebidos." },
  active_capital:     { label: "Capital Ativo",                    icon: Wallet,        unit: "R$",  color: "text-primary",     bgColor: "bg-primary/15",     description: "Total ainda a receber em contratos ativos." },
  net_profit:         { label: "Lucro Líquido",                    icon: PiggyBank,     unit: "R$",  color: "text-success",     bgColor: "bg-success/15",     description: "Juros recebidos menos despesas pagas da empresa." },
  max_default_rate:   { label: "Taxa de Inadimplência",             icon: AlertTriangle, unit: "%",   color: "text-destructive", bgColor: "bg-destructive/15", description: "Limite máximo de % de parcelas em atraso (meta inversa).", inverse: true },
  new_clients_count:  { label: "Novos Clientes",                   icon: UserPlus,      unit: "qtd", color: "text-primary",     bgColor: "bg-primary/15",     description: "Clientes cadastrados no período." },
  renegotiation_rate: { label: "Contratos Renegociados",           icon: RefreshCw,     unit: "qtd", color: "text-destructive", bgColor: "bg-destructive/15", description: "Limite máximo de contratos renegociados no mês (meta inversa).", inverse: true },
  daily_received_avg: { label: "Receita Média Diária",           icon: HandCoins,     unit: "R$",  color: "text-success",     bgColor: "bg-success/15",     description: "Meta diária com média diária e necessário/dia restante." },
  monthly_variation:  { label: "Variação Mensal do Patrimônio",   icon: BarChart3,     unit: "%",   color: "text-primary",     bgColor: "bg-primary/15",     description: "Meta de crescimento mensal do patrimônio total (% vs mês anterior)." },
};

interface Props {
  loans: Loan[];
  payments: Payment[];
  expenses: Expense[];
  clients: Client[];
  installmentSchedules?: InstallmentSchedule[];
  renegotiations?: LoanRenegotiation[];
  selectedMonth?: string; // YYYY-MM — filtra metas exibidas (exceto active_capital)
  periodLabel?: string;
}

function inMonth(dateStr: string | undefined | null, month: string): boolean {
  if (!dateStr) return false;
  return String(dateStr).slice(0, 7) === month;
}

function fmtValue(v: number, unit: Unit, hidden: boolean): string {
  if (hidden && unit === "R$") return "R$ ••••";
  if (unit === "R$") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  if (unit === "%") return `${v.toFixed(2)}%`;
  return String(Math.round(v));
}

// Calcula o "Lucro Realizado" do período usando a MESMA regra do card "Juros Recebidos no Mês"
// e do gráfico "Juros Recebidos por Mês": alocação "juros primeiro por contrato".
//  - Ordena pagamentos cronologicamente.
//  - installmentNumber === 0 → 100% juros.
//  - Demais pagamentos amortizam primeiro o juros restante do contrato; o resto vira principal.
//  - Em contratos quitados, redistribui o lucro residual (totalPago − principal − juros já alocado)
//    para o último pagamento (captura bônus/descontos na quitação).
//  - Soma o juros alocado aos pagamentos com data no mês `m`.
function computeProfitRealized(loans: Loan[], payments: Payment[], m: string): number {
  const paymentsSorted = [...payments].sort((a: any, b: any) => {
    const d = (a.date || "").localeCompare(b.date || "");
    if (d !== 0) return d;
    return (a.createdAt ?? a.created_at ?? "").localeCompare(b.createdAt ?? b.created_at ?? "");
  });
  // Regime oficial: o mês é TRAVADO no seu próprio fechamento — pagamentos
  // posteriores (juros em atraso) não reprocessam meses já encerrados.
  const [yy, mm] = m.split("-").map(Number);
  const cutoff = `${yy}-${String(mm).padStart(2, "0")}-${String(new Date(yy, mm, 0).getDate()).padStart(2, "0")}`;
  const interestByPaymentId = allocateInterestByPaymentUpTo(loans as any, paymentsSorted as any, cutoff);
  return payments
    .filter((p: any) => inMonth(p.date || "", m))
    .reduce((s: number, p: any) => s + (interestByPaymentId.get(p.id) ?? 0), 0);
}

// Calcula o "Lucro Previsto" do período (parcelas com vencimento no mês × proporção de juros)
function computeProfitExpected(loans: Loan[], m: string): number {
  return loans.reduce((s: number, l: any) => {
    const principal = Number(l.amount) || 0;
    const rate = Number(l.interestRate ?? l.interest_rate) || 0;
    const inst = Number(l.installments) || 1;
    const totalWithInterest = calculateTotalWithInterest(principal, rate, inst);
    const interestRatio = totalWithInterest > 0 ? 1 - (principal / totalWithInterest) : 0;

    const startDate = (l.startDate || l.start_date || "").slice(0, 10);
    if (!startDate) return s;
    const installmentValue = totalWithInterest / Math.max(1, inst);

    // Para empréstimos com 1 parcela, usar dueDate
    if (inst <= 1) {
      const due = (l.dueDate || l.due_date || "").slice(0, 10);
      if (inMonth(due, m)) return s + (totalWithInterest - principal);
      return s;
    }

    // Para parcelados: percorrer cada parcela mensal a partir do startDate
    const [sy, smo, sd] = startDate.split("-").map(Number);
    let monthlyTotal = 0;
    for (let i = 0; i < inst; i++) {
      const dueDt = new Date(sy, (smo - 1) + (i + 1), sd);
      const dueKey = `${dueDt.getFullYear()}-${String(dueDt.getMonth() + 1).padStart(2, "0")}`;
      if (dueKey === m) monthlyTotal += installmentValue * interestRatio;
    }
    return s + monthlyTotal;
  }, 0);
}

function computeDefaultRate(loans: Loan[], payments: Payment[], installmentSchedules: InstallmentSchedule[], m: string): number {
  const today = todayInAppTz();
  const currentMonthKey = today.slice(0, 7);
  const isClosed = m < currentMonthKey;
  const [yy, mm] = m.split("-").map(Number);
  // Ponto de corte para o cálculo: o fim do mês em questão ou hoje (o que for menor).
  // Para meses passados, o corte é sempre o último dia do mês às 23:59:59.
  const lastDay = new Date(yy, mm, 0).getDate();
  const monthEnd = `${m}-${String(lastDay).padStart(2, "0")}`;
  const cutoffDate = monthEnd < today ? monthEnd : today;

  // Filtra pagamentos para considerar apenas o que existia até o final do mês de referência.
  // Pagamentos feitos após o encerramento do mês NÃO limpam a inadimplência retroativamente.
  const totalPaidByLoan = payments.reduce<Record<string, number>>((acc, payment: any) => {
    const loanId = payment.loanId || payment.loan_id;
    const pDate = (payment.date || "").slice(0, 10);
    if (!loanId || !pDate || pDate > cutoffDate) return acc;
    acc[loanId] = (acc[loanId] || 0) + (Number(payment.amount) || 0);
    return acc;
  }, {});

  let periodPortfolio = 0;
  let overdueAmount = 0;

  loans.forEach((loan: any) => {
    const installments = Math.max(1, Number(loan.installments) || 1);
    const principal = Number(loan.amount) || 0;
    const rate = Number(loan.interestRate ?? loan.interest_rate) || 0;
    const totalWithInterest = calculateTotalWithInterest(principal, rate, installments);
    const installmentValue = totalWithInterest / installments;
    
    // Não usamos loan.paidInstallments (tempo real) para meses passados.
    // Calculamos a quantidade de parcelas pagas com base no saldo acumulado até o cutoff.
    const paidAmount = totalPaidByLoan[loan.id] || 0;
    const calculatedPaidInstallments = Math.floor((paidAmount + 0.01) / installmentValue);

    // Checagem de quitação do contrato
    const isLoanFullyPaid =
      loan.status === "paid" ||
      loan.status === "completed" ||
      (loan.remainingAmount != null && Number(loan.remainingAmount) <= 0.01) ||
      (Number(loan.paidInstallments) || 0) >= installments;

    if (isLoanFullyPaid) {
      if (isClosed) {
        const lPayments = payments.filter((p: any) => (p.loanId || p.loan_id) === loan.id);
        const lastPayDate = lPayments
          .map((p: any) => (p.date || "").slice(0, 10))
          .sort()
          .pop();
        if (lastPayDate && lastPayDate <= cutoffDate) {
          return;
        }
      } else {
        return;
      }
    }

    const loanSchedules = installmentSchedules
      .filter((schedule) => schedule.loanId === loan.id)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);

    const dueEntries = loanSchedules.length > 0
      ? loanSchedules.map((schedule) => ({
          installmentNumber: schedule.installmentNumber,
          dueDate: schedule.dueDate,
          amount: Number(schedule.amount) || installmentValue,
        }))
      : installments <= 1
        ? [{ installmentNumber: 1, dueDate: loan.dueDate || loan.due_date, amount: totalWithInterest }]
        : Array.from({ length: installments }, (_, index) => {
            const base = new Date(`${(loan.dueDate || loan.due_date).slice(0, 10)}T00:00:00`);
            const due = new Date(base.getFullYear(), base.getMonth() + index, base.getDate());
            return {
              installmentNumber: index + 1,
              dueDate: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`,
              amount: installmentValue,
            };
          });

    dueEntries.forEach((entry) => {
      if (!inMonth(entry.dueDate, m)) return;
      periodPortfolio += entry.amount;

      // Uma parcela é considerada inadimplente se:
      // 1. O vencimento for ANTES do corte (já venceu no período em questão).
      // 2. O valor pago ATÉ o corte não cobre esta parcela.
      const isPaidAtCutoff = entry.installmentNumber <= calculatedPaidInstallments;
      if (isPaidAtCutoff || entry.dueDate >= cutoffDate) return;

      // Se estamos no mês vigente e o contrato já registrou a parcela como paga
      if (!isClosed && entry.installmentNumber <= (Number(loan.paidInstallments) || 0)) {
        return;
      }

      if (installments === 1) {
        const remainingSingle = Math.max(0, totalWithInterest - paidAmount);
        if (remainingSingle <= 0.05 || isLoanFullyPaid) return;
        overdueAmount += remainingSingle;
        return;
      }

      overdueAmount += entry.amount;
    });
  });

  return periodPortfolio > 0 ? (overdueAmount / periodPortfolio) * 100 : 0;
}

function computeRenegotiationRate(
  loans: Loan[],
  installmentSchedules: InstallmentSchedule[],
  renegotiations: LoanRenegotiation[],
  m: string,
): number {
  const [yy, mm] = m.split("-").map(Number);
  if (!yy || !mm) return 0;

  // Quantidade de contratos renegociados no mês (cada contrato conta uma única
  // vez, ainda que tenha múltiplas renegociações no mesmo mês). Utiliza SEMPRE
  // a data efetiva da renegociação (`renegotiated_at`) — nunca `created_at`,
  // vencimento ou update — e o fuso configurado do app para evitar que uma
  // renegociação feita perto da meia-noite caia no mês vizinho (ex.: 01/jul
  // 00:30 BRT chega como 03:30Z e, se comparada em UTC, cairia em junho).
  // Fonte única de verdade: tabela `loan_renegotiations` persistida no banco.
  const seen = new Set<string>();
  (renegotiations || [])
    .filter((r) => {
      const ts = r.renegotiatedAt || r.createdAt;
      if (!ts || !r.loanId) return false;
      // `renegotiated_at` é gravado como data ISO "YYYY-MM-DD" (todayInAppTz).
      // Não converter para Date, pois `new Date("2026-07-01")` é UTC 00:00 e,
      // em fusos negativos (ex.: BRT-3), retornaria "2026-06-30" — jogando a
      // renegociação para o mês anterior. Comparamos direto o prefixo AAAA-MM.
      if (typeof ts === "string" && /^\d{4}-\d{2}-\d{2}/.test(ts)) {
        return ts.slice(0, 7) === m;
      }
      const d = new Date(ts);
      if (isNaN(d.getTime())) return false;
      return formatYmdInAppTz(d).slice(0, 7) === m;
    })
    .forEach((r) => { seen.add(r.loanId); });

  return seen.size;
}

export function computeActual(
  type: GoalType,
  m: string,
  loans: Loan[],
  payments: Payment[],
  expenses: Expense[],
  clients: Client[],
  installmentSchedules: InstallmentSchedule[],
  renegotiations: LoanRenegotiation[] = [],
): number {
  switch (type) {
    case "loan_volume":
      return loans.filter((l: any) => inMonth(l.startDate || l.start_date, m) && (Number(l.interestRate ?? l.interest_rate) || 0) > 0)
        .reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);
    case "new_loans_count":
      return loans.filter((l: any) => inMonth(l.startDate || l.start_date, m) && (Number(l.interestRate ?? l.interest_rate) || 0) > 0).length;
    case "received_total":
      return payments.filter((p: any) => inMonth(p.date, m))
        .reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
    case "interest_received":
      // Mesma lógica do "Realizado" do gráfico Lucro por Período
      return computeProfitRealized(loans, payments, m);
    case "active_capital":
      return loans.filter((l: any) => l.status !== "completed" && l.status !== "paid")
        .reduce((s: number, l: any) => s + getLoanReceivable(l, payments, installmentSchedules), 0);
    case "net_profit": {
      // Usa o mesmo "Realizado" do Lucro por Período menos despesas pagas da empresa
      const interest = computeProfitRealized(loans, payments, m);
      const exp = expenses.filter((e: any) => e.paid && e.scope !== "personal" && inMonth(e.paid_date || e.paidDate || e.due_date || e.dueDate, m))
        .reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
      return interest - exp;
    }
    case "max_default_rate": {
      return computeDefaultRate(loans, payments, installmentSchedules, m);
    }
    case "new_clients_count":
      return clients.filter((c: any) => inMonth(c.created_at || c.createdAt, m)).length;
    case "renegotiation_rate":
      return computeRenegotiationRate(loans, installmentSchedules, renegotiations, m);
    case "interest_rate": {
      // Taxa Juros Mensal = (Total a Receber − Total Emprestado) ÷ Total Emprestado × 100
      // Considera empréstimos com data de início no mês selecionado.
      // Contratos com taxa 0% são EXCLUÍDOS do cálculo (não impactam rentabilidade).
      const monthLoans = loans.filter((l: any) => inMonth(l.startDate || l.start_date, m));
      const summary = calculateMonthlyInterestRate(monthLoans as Loan[]);
      return summary.rate ?? 0;
    }
    case "profit": {
      // Faturamento do Período — MESMA fonte do card do Dashboard:
      // (Juros realizados no mês ÷ (Juros realizados + Juros previstos não pagos)) × 100.
      // Não considera principal, multa ou quitação antecipada no numerador e
      // respeita as datas de vencimento remarcadas (installmentSchedules).
      return computeMonthProfitGoal(loans as any, payments as any, installmentSchedules as any, m).pct;
    }
    case "daily_received_avg": {
      // Total recebido no mês — pct é calculado contra a meta DIÁRIA.
      // A média diária e o necessário/dia são derivados na visualização (small card e dashboard).
      return payments
        .filter((p: any) => inMonth(p.date, m))
        .reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
    }
    case "monthly_variation": {
      // Variação (%) = ((Patrimônio do mês m − Patrimônio do mês m-1) / Patrimônio do mês m-1) × 100
      // Mês corrente usa o snapshot "ao vivo" publicado por ConsolidatedBalanceCards.
      try {
        const raw = typeof window !== "undefined" ? window.localStorage.getItem("patrimonio.snapshots.v1") : null;
        const snaps: Record<string, any> = raw ? JSON.parse(raw) : {};
        const totalFrom = (v: any): number | null => {
          if (v == null) return null;
          if (typeof v === "number") return v;
          if (typeof v === "object" && typeof v.total === "number") return Number(v.total);
          return null;
        };
        const [y, mo] = m.split("-").map(Number);
        const prevDate = new Date(y, (mo - 1) - 1, 1);
        const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
        const todayKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
        // Para o mês corrente, sempre usa o patrimônio "ao vivo" (mesmo valor exibido
        // no card "Variação Mensal" do extrato). Snapshots só substituem o atual em
        // meses passados.
        let currentTotal: number | null = null;
        if (m === todayKey) {
          const liveRaw = window.localStorage.getItem("patrimonio.current.v1");
          if (liveRaw) {
            try {
              const live = JSON.parse(liveRaw);
              if (live?.month === todayKey && typeof live.total === "number") {
                currentTotal = Number(live.total);
              }
            } catch (e) {
              console.warn("Erro ao ler patrimonio.current.v1 no GoalsCard:", e);
            }
          }
        }
        if (currentTotal == null) currentTotal = totalFrom(snaps[m]);
        const prevTotal = totalFrom(snaps[prevKey]);
        // Sinaliza dado ausente com NaN para o auto-fechamento NÃO congelar 0
        // indevidamente (ex.: mês encerrado sem snapshot de patrimônio salvo).
        if (currentTotal == null || prevTotal == null || prevTotal === 0) return NaN;
        return ((currentTotal - prevTotal) / Math.abs(prevTotal)) * 100;
      } catch {
        return NaN;
      }
    }
    default:
      return 0;
  }
}

const MAX_VISIBLE_GOALS = 8;
const ALL_GOAL_TYPES: GoalType[] = [
  "interest_rate", "profit", "loan_volume", "new_loans_count",
  "received_total", "interest_received", "active_capital", "net_profit",
  "max_default_rate", "new_clients_count", "renegotiation_rate", "daily_received_avg",
  "monthly_variation",
];

function loadGoalPrefs(userId: string | null | undefined): { selected: GoalType[]; order: GoalType[] } {
  const fallback = { selected: ALL_GOAL_TYPES.slice(0, MAX_VISIBLE_GOALS), order: ALL_GOAL_TYPES.slice() };
  if (typeof window === "undefined" || !userId) return fallback;
  try {
    const raw = window.localStorage.getItem(`goalsCard:prefs:${userId}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { selected?: GoalType[]; order?: GoalType[] };
    return normalizePrefs(parsed.selected, parsed.order, fallback);
  } catch {
    return fallback;
  }
}

function normalizePrefs(
  rawSelected: string[] | undefined | null,
  rawOrder: string[] | undefined | null,
  fallback: { selected: GoalType[]; order: GoalType[] },
): { selected: GoalType[]; order: GoalType[] } {
  const validSelected = (rawSelected || []).filter((t): t is GoalType => ALL_GOAL_TYPES.includes(t as GoalType)).slice(0, MAX_VISIBLE_GOALS);
  const validOrder = (rawOrder || []).filter((t): t is GoalType => ALL_GOAL_TYPES.includes(t as GoalType));
  ALL_GOAL_TYPES.forEach((t) => { if (!validOrder.includes(t)) validOrder.push(t); });
  return {
    selected: validSelected.length > 0 ? validSelected : fallback.selected,
    order: validOrder,
  };
}

export function GoalsCard({ loans, payments, expenses, clients, installmentSchedules = [], renegotiations = [], selectedMonth, periodLabel }: Props) {
  const { goals, upsertGoal } = useMonthlyGoals();
  const { hidden } = useHideValues();
  const { user } = useAuth();
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [showCustomize, setShowCustomize] = useState(false);
  const [editingGoalType, setEditingGoalType] = useState<GoalType | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [savingGoal, setSavingGoal] = useState(false);
  const [patrimonioSyncVersion, setPatrimonioSyncVersion] = useState(0);
  // Cancela edição ao trocar de mês
  useEffect(() => { setEditingGoalType(null); }, [selectedMonth]);
  useEffect(() => {
    const onPatrimonioChanged = () => setPatrimonioSyncVersion((version) => version + 1);
    window.addEventListener("patrimonio:snapshots-changed", onPatrimonioChanged);
    return () => window.removeEventListener("patrimonio:snapshots-changed", onPatrimonioChanged);
  }, []);
  // Cache imediato via localStorage (evita flicker enquanto sincroniza com o backend)
  const { getSnapshot, upsertSnapshot } = useGoalSnapshots();
  const [prefs, setPrefs] = useState<{ selected: GoalType[]; order: GoalType[] }>(() => loadGoalPrefs(user?.id));

  // Sincroniza preferências do backend ao montar / trocar de usuário
  useEffect(() => {
    setPrefs(loadGoalPrefs(user?.id));
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("user_goal_prefs")
          .select("selected, order_list")
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled || error) return;
        if (data) {
          const fallback = { selected: ALL_GOAL_TYPES.slice(0, MAX_VISIBLE_GOALS), order: ALL_GOAL_TYPES.slice() };
          const merged = normalizePrefs(data.selected as string[], data.order_list as string[], fallback);
          setPrefs(merged);
          try { window.localStorage.setItem(`goalsCard:prefs:${user.id}`, JSON.stringify(merged)); } catch {}
        } else {
          // Sem registro no backend: faz upload do que estiver no cache local (primeira sincronização)
          const local = loadGoalPrefs(user.id);
          assertWritable();
          await supabase.from("user_goal_prefs").upsert(
            { user_id: user.id, selected: local.selected, order_list: local.order },
            { onConflict: "user_id" },
          );
        }
      } catch {
        /* mantém cache local em caso de falha */
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const savePrefs = (next: { selected: GoalType[]; order: GoalType[] }) => {
    setPrefs(next);
    if (typeof window !== "undefined" && user?.id) {
      try { window.localStorage.setItem(`goalsCard:prefs:${user.id}`, JSON.stringify(next)); } catch {}
    }
    if (user?.id) {
      // Persiste no backend (fire-and-forget; cache local já foi atualizado)
      assertWritable();
      supabase
        .from("user_goal_prefs")
        .upsert(
          { user_id: user.id, selected: next.selected, order_list: next.order },
          { onConflict: "user_id" },
        )
        .then(({ error }) => {
          if (error) {
            toast.error("Não foi possível sincronizar suas preferências de metas.");
          }
        });
    }
  };


  const currentActiveCapital = useMemo(
    () => loans.filter((l: any) => l.status !== "completed" && l.status !== "paid")
      .reduce((s: number, l: any) => s + getLoanReceivable(l, payments, installmentSchedules), 0),
    [loans, payments, installmentSchedules]
  );
  const { currentMonth, getSnapshotAmount } = useActiveCapitalSnapshots(currentActiveCapital);

  const enriched = useMemo(() => {
    // Para cada tipo de meta cadastrada, escolhe a melhor meta para o mês selecionado:
    // 1) match exato; 2) mês anterior mais recente; 3) mês posterior mais próximo
    const byType = new Map<GoalType, typeof goals>();
    goals.forEach((g) => {
      const arr = byType.get(g.goalType) || [];
      arr.push(g);
      byType.set(g.goalType, arr);
    });

    const chosen: typeof goals = [];
    byType.forEach((list, type) => {
      if (!selectedMonth) {
        // Sem filtro: mantém todas (comportamento original)
        chosen.push(...list);
        return;
      }
      const exact = list.find((g) => g.month === selectedMonth);
      if (exact) { chosen.push(exact); return; }
      const earlier = list.filter((g) => g.month < selectedMonth).sort((a, b) => b.month.localeCompare(a.month))[0];
      if (earlier) { chosen.push(earlier); return; }
      const later = list.filter((g) => g.month > selectedMonth).sort((a, b) => a.month.localeCompare(b.month))[0];
      if (later) { chosen.push(later); return; }
    });

    return chosen.map((g) => {
      const meta = GOAL_TYPE_META[g.goalType];
      // Para metas sempre visíveis (snapshot atual) e para todas, usar o mês selecionado nos cálculos
      const computeMonth = selectedMonth || g.month;
      const monthClosed = isMonthClosed(computeMonth);
      const snapshot = getSnapshot(g.goalType, computeMonth);

      // Se o mês já fechou e existe snapshot finalizado, usa o valor congelado para TODAS as metas.
      // Caso contrário, calcula em tempo real.
      let actual: number;
      let liveComputed: number | null = null;
      if (monthClosed && snapshot?.finalized) {
        actual = Number(snapshot.realizedValue) || 0;
        // Para `monthly_variation`, se o snapshot travou em 0 (dado indisponível
        // no dia do fechamento) e agora conseguimos recomputar um valor válido,
        // preferimos o valor recomputado — o auto-fechamento sobrescreve abaixo.
        if (g.goalType === "monthly_variation" && Math.abs(actual) < 0.0001) {
          const recompute = computeActual(g.goalType, computeMonth, loans, payments, expenses, clients, installmentSchedules, renegotiations);
          if (Number.isFinite(recompute) && Math.abs(recompute) > 0.0001) {
            liveComputed = recompute;
            actual = recompute;
          }
        }
      } else {
        const computed = g.goalType === "active_capital"
          ? (computeMonth === currentMonth ? currentActiveCapital : (getSnapshotAmount(computeMonth) ?? 0))
          : computeActual(g.goalType, computeMonth, loans, payments, expenses, clients, installmentSchedules, renegotiations);
        // NaN → dado indisponível (ex.: monthly_variation sem patrimônio do mês). Trata como 0
        // para exibição, mas não deve travar o snapshot em 0.
        actual = Number.isFinite(computed) ? computed : 0;
        liveComputed = Number.isFinite(computed) ? computed : null;
      }

      let pct = 0;
      if (g.targetValue > 0) {
        pct = (g.goalType === "max_default_rate" || g.goalType === "renegotiation_rate")
          ? (actual <= g.targetValue ? 100 : 0)
          : meta?.inverse
            ? Math.max(0, 100 - (actual / g.targetValue) * 100)
            : Math.min(100, (actual / g.targetValue) * 100);
      }
      const expectedReceivable = g.goalType === "profit"
        ? computeMonthProfitGoal(loans as any, payments as any, installmentSchedules as any, computeMonth).expectedTotal
        : null;
      const targetAmount = g.goalType === "profit" && expectedReceivable !== null
        ? expectedReceivable * (g.targetValue / 100)
        : null;

      // Para "Média Geral Recebida por Dia": targetValue É a meta DIÁRIA.
      // Exibimos a média diária realizada e comparamos diretamente contra a meta diária.
      let receivedTotal: number | null = null;
      let monthlyPct: number | null = null;
      if (g.goalType === "daily_received_avg") {
        const [yy, mm] = computeMonth.split("-").map(Number);
        const today = new Date();
        const cur = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
        const daysInMonth = new Date(yy, mm, 0).getDate();
        const isCurrent = computeMonth === cur;
        const daysElapsed = isCurrent ? today.getDate() : (computeMonth < cur ? daysInMonth : 1);
        receivedTotal = actual; // total recebido no período (apenas informativo)
        const dailyAvg = daysElapsed > 0 ? actual / daysElapsed : 0;
        actual = dailyAvg;
        pct = g.targetValue > 0 ? Math.min(100, (dailyAvg / g.targetValue) * 100) : 0;
        monthlyPct = pct; // mantido por compat — mesmo valor (base diária)
      }

      return { ...g, actual, pct, meta, expectedReceivable, targetAmount, receivedTotal, monthlyPct, liveComputed, isLocked: monthClosed && !!snapshot?.finalized };
    });
  }, [goals, loans, payments, expenses, clients, installmentSchedules, renegotiations, selectedMonth, currentMonth, currentActiveCapital, getSnapshotAmount, getSnapshot, patrimonioSyncVersion]);

  // Auto-fechamento: quando o mês já encerrou e ainda não há snapshot finalizado para
  // alguma meta visível, grava o snapshot com o valor realizado atualmente calculado.
  // Isto garante que os dados das metas fiquem "travados no último dia do mês".
  useEffect(() => {
    enriched.forEach((g) => {
      const computeMonth = selectedMonth || g.month;
      if (!isMonthClosed(computeMonth)) return;
      const existing = getSnapshot(g.goalType, computeMonth);
      // Para `daily_received_avg`, snapshots antigos podem ter sido salvos como média;
      // sobrescreve se o valor armazenado diferir do TOTAL recém-computado.
      const rawValue = g.goalType === "daily_received_avg"
        ? (g.receivedTotal ?? 0)
        : g.goalType === "monthly_variation"
          ? g.liveComputed
          : (g.liveComputed ?? g.actual);
      // Nunca congela dado indisponível (NaN/Infinity) — evita travar metas em 0
      // por falta de patrimônio/snapshot no dia do encerramento.
      if (!Number.isFinite(rawValue)) return;
      const snapshotValue = rawValue as number;
      if (existing?.finalized) {
        if (g.goalType === "daily_received_avg") {
          if (Math.abs(Number(existing.realizedValue || 0) - snapshotValue) < 0.01) return;
        } else if (g.goalType === "monthly_variation") {
          // Sobrescreve apenas quando o snapshot antigo travou em 0 e agora temos valor válido.
          const prev = Number(existing.realizedValue || 0);
          if (!(Math.abs(prev) < 0.0001 && Math.abs(snapshotValue) > 0.0001)) return;
        } else {
          return;
        }
      }
      void upsertSnapshot(
        g.goalType,
        computeMonth,
        snapshotValue,
        g.targetValue ?? null,
        g.pct ?? null,
        { allowFinalizedUpdate: g.goalType === "monthly_variation" },
      );
    });
  }, [enriched, selectedMonth, getSnapshot, upsertSnapshot]);

  // Auto-fechamento retroativo: percorre TODAS as metas cadastradas para meses já
  // encerrados e grava o snapshot com o realizado calculado, garantindo que metas
  // (ex.: junho) sejam travadas mesmo que o usuário nunca tenha aberto o Dashboard
  // filtrando por aquele mês. Não sobrescreve snapshots já finalizados.
  useEffect(() => {
    if (!goals.length) return;
    const today = todayInAppTz();
    const currentMonthKey = today.slice(0, 7);

    // Agrupa metas por tipo e monta lista de meses fechados a preencher.
    const byType = new Map<GoalType, typeof goals>();
    goals.forEach((g) => {
      const arr = byType.get(g.goalType) || [];
      arr.push(g);
      byType.set(g.goalType, arr);
    });

    const addMonths = (ym: string, delta: number) => {
      const [y, m] = ym.split("-").map(Number);
      const d = new Date(y, (m - 1) + delta, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    };

    byType.forEach((list, type) => {
      const sorted = [...list].sort((a, b) => a.month.localeCompare(b.month));
      const earliest = sorted[0].month;
      // Percorre do mês mais antigo até o mês anterior ao atual (inclusive).
      let cursor = earliest;
      while (cursor < currentMonthKey) {
        // Meta vigente para esse mês: exato → anterior mais recente → posterior mais próximo.
        const exact = sorted.find((g) => g.month === cursor);
        const earlier = [...sorted].reverse().find((g) => g.month < cursor);
        const later = sorted.find((g) => g.month > cursor);
        const g = exact || earlier || later;
        if (!g) { cursor = addMonths(cursor, 1); continue; }

        const existing = getSnapshot(type, cursor);
        const canWrite = !existing?.finalized || type === "monthly_variation";
        if (canWrite) {
          const computed = type === "active_capital"
            ? (getSnapshotAmount(cursor) ?? 0)
            : computeActual(type, cursor, loans, payments, expenses, clients, installmentSchedules, renegotiations);
          if (Number.isFinite(computed)) {
            const value = Number(computed) || 0;
            if (existing?.finalized && type === "monthly_variation") {
              const prev = Number(existing.realizedValue || 0);
              if (!(Math.abs(prev) < 0.0001 && Math.abs(value) > 0.0001)) {
                cursor = addMonths(cursor, 1);
                continue;
              }
            }
            const target = g.targetValue > 0 ? g.targetValue : null;
            let pct: number | null = null;
            if (target) {
              pct = (type === "max_default_rate" || type === "renegotiation_rate")
                ? (value <= target ? 100 : 0)
                : Math.min(100, (value / target) * 100);
            }
            void upsertSnapshot(type, cursor, value, target, pct, { allowFinalizedUpdate: type === "monthly_variation" });
          }
        }
        cursor = addMonths(cursor, 1);
      }
    });
  }, [goals, loans, payments, expenses, clients, installmentSchedules, renegotiations, getSnapshot, upsertSnapshot, getSnapshotAmount, patrimonioSyncVersion]);

  // Aplica preferências do usuário: filtra pelos tipos selecionados e ordena conforme a ordem definida.
  // Limita a no máximo MAX_VISIBLE_GOALS cards.
  const visibleGoals = useMemo(() => {
    const selectedSet = new Set(prefs.selected);
    const orderIndex = new Map<GoalType, number>();
    prefs.order.forEach((t, i) => orderIndex.set(t, i));
    return enriched
      .filter((g) => selectedSet.has(g.goalType))
      .sort((a, b) => (orderIndex.get(a.goalType) ?? 999) - (orderIndex.get(b.goalType) ?? 999))
      .slice(0, MAX_VISIBLE_GOALS);
  }, [enriched, prefs]);

  const totalGoals = visibleGoals.length;
  const onTrack = visibleGoals.filter((g) => g.pct >= 80).length;
  const offTrack = visibleGoals.filter((g) => g.pct < 50).length;

  const selected = enriched.find((g) => g.id === selectedGoalId) || null;

  return (
    <Card no3d>
      <CardContent className="p-3 sm:p-6">
        <div className="flex flex-col items-center text-center gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between sm:text-left sm:gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Target className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Metas</h3>
              <p className="text-[10px] text-muted-foreground">Acompanhe o progresso das suas metas cadastradas</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setShowCustomize(true)}
              className="ml-1 h-7 px-2 gap-1 text-[11px]"
              title="Personalizar metas exibidas"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Personalizar</span>
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2 w-full sm:w-auto sm:flex sm:gap-6">
            <div className="rounded-md bg-muted/40 sm:bg-transparent px-2 py-1 sm:p-0 text-center sm:text-right">
              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase leading-tight">No Caminho</p>
              <p className="text-xs sm:text-sm font-bold text-success leading-tight">{onTrack}</p>
            </div>
            <div className="rounded-md bg-muted/40 sm:bg-transparent px-2 py-1 sm:p-0 text-center sm:text-right">
              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase leading-tight">Atenção</p>
              <p className="text-xs sm:text-sm font-bold text-destructive leading-tight">{offTrack}</p>
            </div>
            <div className="rounded-md bg-muted/40 sm:bg-transparent px-2 py-1 sm:p-0 text-center sm:text-right">
              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase leading-tight">Total</p>
              <p className="text-xs sm:text-sm font-bold text-foreground leading-tight">{totalGoals}</p>
            </div>
          </div>
        </div>

        {visibleGoals.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            {enriched.length === 0
              ? (selectedMonth
                  ? `Nenhuma meta cadastrada para ${periodLabel || formatMonthLabel(selectedMonth)}.`
                  : "Nenhuma meta cadastrada. Cadastre metas em Configurações → Metas para acompanhar aqui.")
              : "Nenhuma meta selecionada para exibição. Clique em \"Personalizar\" para escolher quais aparecem."}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
            {visibleGoals.map((g) => {
              const Icon = g.meta?.icon || Target;
              const status = (g.goalType === "max_default_rate" || g.goalType === "renegotiation_rate")
                ? (g.pct === 100 ? "success" : "destructive")
                : g.pct >= 80
                  ? "success"
                  : g.pct >= 50
                    ? "warning"
                    : "destructive";
              const statusColor =
                status === "success" ? "text-success" : status === "warning" ? "text-warning" : "text-destructive";
              const progressClassName = status === "success" ? "h-1.5 [&>div]:bg-success" : status === "destructive" ? "h-1.5 [&>div]:bg-destructive" : "h-1.5 [&>div]:bg-warning";
              const targetMonth = selectedMonth || g.month;
              const monthLocked = (g as any).isLocked || isMonthClosed(targetMonth);
              const isEditing = editingGoalType === g.goalType;
              const unit = g.meta?.unit || "qtd";
              return (
                <div
                  key={g.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => { if (!isEditing) setSelectedGoalId(g.id); }}
                  onKeyDown={(e) => {
                    if (isEditing) return;
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedGoalId(g.id); }
                  }}
                  className="relative rounded-lg border border-border bg-card/50 hover:bg-card hover:border-primary/40 hover:shadow-sm transition-all p-2.5 sm:p-4 flex flex-col items-center text-center gap-2 sm:gap-3 sm:items-stretch sm:text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {!monthLocked && (
                    <button
                      type="button"
                      aria-label={`Editar meta de ${g.meta?.label || ""} para ${formatMonthLabel(targetMonth)}`}
                      title={`Editar meta para ${formatMonthLabel(targetMonth)}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingGoalType(g.goalType);
                        setEditingValue(String(g.targetValue ?? 0));
                      }}
                      className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10 z-10"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                  <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:items-center sm:gap-2 sm:pr-7">
                    <div className={`h-7 w-7 sm:h-8 sm:w-8 rounded-md ${g.meta?.bgColor || "bg-primary/15"} flex items-center justify-center shrink-0`}>
                      <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${g.meta?.color || "text-primary"}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-foreground leading-tight break-words sm:truncate" title={g.meta?.label}>
                        {g.meta?.label || g.goalType}
                      </p>
                      <div className="flex items-center justify-center sm:justify-start gap-1 mt-0.5 flex-wrap">
                        {selectedMonth && g.month !== selectedMonth ? (
                          <Badge variant="outline" className="text-[8px] sm:text-[9px] px-1 py-0 h-3.5 border-warning/40 text-warning bg-warning/5 uppercase tracking-wide leading-none" title={`Meta herdada de ${formatMonthLabel(g.month)}`}>
                            Herdada · {formatMonthLabel(g.month)}
                          </Badge>
                        ) : (
                          <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight">
                            {formatMonthLabel(g.month)}
                          </p>
                        )}
                        {(g as any).isLocked && (
                          <Badge variant="outline" className="text-[8px] sm:text-[9px] px-1 py-0 h-3.5 border-muted-foreground/30 text-muted-foreground bg-muted/30 uppercase tracking-wide leading-none gap-0.5" title="Mês fechado — valor congelado no último dia do mês">
                            <Lock className="h-2 w-2" />
                            Travado
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-1.5 sm:gap-2 w-full sm:items-stretch">
                    <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-between gap-1">
                      <span className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Meta</span>
                      {isEditing ? (
                        <div
                          className="flex items-center gap-1 w-full sm:w-auto"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <Input
                            type="number"
                            min={0}
                            step={unit === "%" ? "0.01" : unit === "qtd" ? "1" : "0.01"}
                            value={editingValue}
                            autoFocus
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={async (e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const parsed = Number(String(editingValue).replace(",", "."));
                                if (!Number.isFinite(parsed) || parsed < 0) {
                                  toast.error("Informe um valor válido (≥ 0)");
                                  return;
                                }
                                setSavingGoal(true);
                                await upsertGoal(g.goalType, targetMonth, parsed);
                                setSavingGoal(false);
                                setEditingGoalType(null);
                              } else if (e.key === "Escape") {
                                setEditingGoalType(null);
                              }
                            }}
                            className="h-7 w-full sm:w-24 text-xs px-2"
                            disabled={savingGoal}
                          />
                          <button
                            type="button"
                            aria-label="Salvar meta"
                            disabled={savingGoal}
                            onClick={async (e) => {
                              e.stopPropagation();
                              const parsed = Number(String(editingValue).replace(",", "."));
                              if (!Number.isFinite(parsed) || parsed < 0) {
                                toast.error("Informe um valor válido (≥ 0)");
                                return;
                              }
                              setSavingGoal(true);
                              await upsertGoal(g.goalType, targetMonth, parsed);
                              setSavingGoal(false);
                              setEditingGoalType(null);
                            }}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-success/15 text-success hover:bg-success/25 disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="Cancelar edição"
                            disabled={savingGoal}
                            onClick={(e) => { e.stopPropagation(); setEditingGoalType(null); }}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-muted text-muted-foreground hover:bg-muted/70"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs sm:text-sm font-semibold text-foreground break-all sm:break-normal">
                          {fmtValue(g.targetValue, unit, hidden)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Realizado</span>
                      <span className={`text-xs sm:text-sm font-semibold ${statusColor} break-all sm:break-normal`}>
                        {fmtValue(g.actual, unit, hidden)}
                      </span>
                    </div>
                    <div className="border-t border-border w-full my-0.5 sm:my-1" />
                    <div className="w-full">
                      <Progress value={g.pct} className={progressClassName} />
                      <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-between mt-1">
                        <span className="text-[10px] sm:text-xs font-medium text-foreground leading-tight">Progresso</span>
                        <span className={`text-sm sm:text-base font-bold ${statusColor} break-all sm:break-normal`}>
                          {g.pct.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-3 italic text-center">
          Toque em uma meta para abrir o relatório inteligente com análise e sugestões.
        </p>
      </CardContent>

      <GoalDetailDialog
        open={!!selected}
        onClose={() => setSelectedGoalId(null)}
        goal={selected}
        viewingMonth={selectedMonth}
        payments={payments}
        loans={loans}
        installmentSchedules={installmentSchedules}
        expenses={expenses}
        clients={clients}
        renegotiations={renegotiations}
      />

      <CustomizeGoalsDialog
        open={showCustomize}
        onClose={() => setShowCustomize(false)}
        prefs={prefs}
        onSave={(next) => { savePrefs(next); setShowCustomize(false); }}
      />
    </Card>
  );
}

interface CustomizePrefs { selected: GoalType[]; order: GoalType[] }

function CustomizeGoalsDialog({
  open, onClose, prefs, onSave,
}: { open: boolean; onClose: () => void; prefs: CustomizePrefs; onSave: (next: CustomizePrefs) => void }) {
  const [draft, setDraft] = useState<CustomizePrefs>(prefs);

  useEffect(() => { if (open) setDraft(prefs); }, [open, prefs]);

  const toggle = (type: GoalType) => {
    const isSelected = draft.selected.includes(type);
    if (isSelected) {
      setDraft({ ...draft, selected: draft.selected.filter((t) => t !== type) });
    } else {
      if (draft.selected.length >= MAX_VISIBLE_GOALS) {
        toast.warning(`Você pode selecionar até ${MAX_VISIBLE_GOALS} metas.`);
        return;
      }
      setDraft({ ...draft, selected: [...draft.selected, type] });
    }
  };

  const move = (type: GoalType, direction: -1 | 1) => {
    const order = draft.order.slice();
    const idx = order.indexOf(type);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= order.length) return;
    [order[idx], order[target]] = [order[target], order[idx]];
    setDraft({ ...draft, order });
  };

  const reset = () => setDraft({
    selected: ALL_GOAL_TYPES.slice(0, MAX_VISIBLE_GOALS),
    order: ALL_GOAL_TYPES.slice(),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            Personalizar Metas
          </DialogTitle>
          <DialogDescription>
            Selecione até <strong>{MAX_VISIBLE_GOALS}</strong> metas e ajuste a ordem em que aparecem no painel.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between text-xs text-muted-foreground px-1 py-1 border-b border-border/40">
          <span>Selecionadas: <strong className={draft.selected.length >= MAX_VISIBLE_GOALS ? "text-warning" : "text-foreground"}>{draft.selected.length}</strong> / {MAX_VISIBLE_GOALS}</span>
          <Button variant="ghost" size="sm" type="button" onClick={reset} className="h-7 px-2 text-[11px]">Restaurar padrão</Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-2 px-2" style={{ WebkitOverflowScrolling: "touch" }}>
          <ul className="space-y-1.5 py-2">
            {draft.order.map((type, idx) => {
              const meta = GOAL_TYPE_META[type];
              const checked = draft.selected.includes(type);
              const Icon = meta?.icon || Target;
              return (
                <li
                  key={type}
                  className={`flex items-center gap-2 rounded-lg border p-2 transition-colors ${checked ? "border-primary/40 bg-primary/5" : "border-border bg-card/50"}`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(type)}
                    aria-label={`Selecionar ${meta?.label}`}
                  />
                  <div className={`h-8 w-8 rounded-md ${meta?.bgColor || "bg-muted"} flex items-center justify-center shrink-0`}>
                    <Icon className={`h-4 w-4 ${meta?.color || "text-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{meta?.label || type}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{meta?.description}</p>
                  </div>
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      onClick={() => move(type, -1)}
                      disabled={idx === 0}
                      className="h-5 w-5"
                      aria-label="Mover para cima"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      onClick={() => move(type, 1)}
                      disabled={idx === draft.order.length - 1}
                      className="h-5 w-5"
                      aria-label="Mover para baixo"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
          <Button variant="outline" type="button" onClick={onClose}>Cancelar</Button>
          <Button type="button" onClick={() => onSave(draft)} disabled={draft.selected.length === 0}>
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  goal: (ReturnType<typeof useMonthlyGoals>["goals"][number] & { actual: number; pct: number; meta: typeof GOAL_TYPE_META[GoalType]; expectedReceivable: number | null; targetAmount: number | null }) | null;
  viewingMonth?: string;
  payments: Payment[];
  loans: Loan[];
  installmentSchedules: InstallmentSchedule[];
  expenses: Expense[];
  clients: Client[];
  renegotiations: LoanRenegotiation[];
}

// Calcula o mês de vencimento (YYYY-MM) de uma parcela específica de um empréstimo.
// Usa o cronograma personalizado quando existir; caso contrário, calcula a partir do start_date.
function getInstallmentDueMonth(
  loan: any,
  installmentNumber: number,
  schedules: InstallmentSchedule[]
): string | null {
  if (!loan || !installmentNumber || installmentNumber < 1) return null;
  const sched = schedules.find(
    (s) => s.loanId === loan.id && s.installmentNumber === installmentNumber
  );
  if (sched?.dueDate) return String(sched.dueDate).slice(0, 7);
  const inst = Number(loan.installments) || 1;
  if (inst <= 1) {
    const due = (loan.dueDate || loan.due_date || "").slice(0, 7);
    return due || null;
  }
  const startDate = (loan.startDate || loan.start_date || "").slice(0, 10);
  if (!startDate) return null;
  const [sy, smo, sd] = startDate.split("-").map(Number);
  const dueDt = new Date(sy, (smo - 1) + installmentNumber, sd);
  return `${dueDt.getFullYear()}-${String(dueDt.getMonth() + 1).padStart(2, "0")}`;
}

function GoalDetailDialog({ open, onClose, goal, viewingMonth, payments, loans, installmentSchedules, expenses, clients, renegotiations }: DialogProps) {
  const { hidden } = useHideValues();
  const { upsertGoal } = useMonthlyGoals();
  const { settings } = useAccountSettings();
  const [creating, setCreating] = useState(false);
  const [editingCreate, setEditingCreate] = useState(false);
  const [newTarget, setNewTarget] = useState<string>("");
  const [showEvolution, setShowEvolution] = useState(false);

  // Reset edição ao trocar de meta/mês
  useMemo(() => {
    setEditingCreate(false);
    setNewTarget(goal ? String(goal.targetValue) : "");
  }, [goal?.id, viewingMonth]);

  const handleCreateForMonth = async () => {
    if (!goal || !viewingMonth) return;
    const parsed = Number(String(newTarget).replace(",", "."));
    if (!isFinite(parsed) || parsed < 0) {
      toast.error("Informe um valor válido");
      return;
    }
    setCreating(true);
    try {
      await upsertGoal(goal.goalType, viewingMonth, parsed, goal.notes || undefined);
      setEditingCreate(false);
    } catch (e) {
      toast.error("Erro ao criar meta");
    } finally {
      setCreating(false);
    }
  };

  const analysis = useMemo(() => {
    if (!goal) return null;
    const { meta, actual, targetValue, pct } = goal;
    // Para análise temporal (ritmo, projeção), usa o mês visualizado, não o mês de origem da meta herdada
    const month = viewingMonth || goal.month;
    const unit = meta.unit;
    const inverse = !!meta.inverse;
    const diff = inverse ? targetValue - actual : actual - targetValue;
    const diffPct = targetValue > 0 ? (Math.abs(diff) / targetValue) * 100 : 0;

    // Determinação do status
    let status: "excellent" | "ontrack" | "warning" | "critical";
    if (pct >= 100) status = "excellent";
    else if (pct >= 80) status = "ontrack";
    else if (pct >= 50) status = "warning";
    else status = "critical";

    // Verificação de mês corrente vs passado
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const isCurrentMonth = month === currentMonth;
    const isPastMonth = month < currentMonth;

    // Dias restantes / decorridos no mês
    let dayProgressPct = 100;
    let daysLeft = 0;
    if (isCurrentMonth) {
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      const dayOfMonth = today.getDate();
      dayProgressPct = (dayOfMonth / daysInMonth) * 100;
      daysLeft = daysInMonth - dayOfMonth;
    }

    // Análise de "ritmo": estamos atrás, no ritmo, ou à frente do tempo?
    let pace: "ahead" | "ontrack" | "behind" | null = null;
    let projection: number | null = null;
    if (isCurrentMonth && !inverse && targetValue > 0) {
      const expectedPctByNow = dayProgressPct;
      if (pct >= expectedPctByNow + 10) pace = "ahead";
      else if (pct >= expectedPctByNow - 10) pace = "ontrack";
      else pace = "behind";
      projection = dayProgressPct > 0 ? (actual / dayProgressPct) * 100 : actual;
    }

    // Pontos de melhoria & sugestões
    const insights: { icon: any; type: "positive" | "warning" | "negative" | "info"; text: string }[] = [];

    if (status === "excellent") {
      insights.push({ icon: CheckCircle2, type: "positive", text: `Meta superada em ${fmtValue(Math.abs(diff), unit, false)}! Excelente desempenho.` });
    } else if (status === "ontrack") {
      insights.push({ icon: CheckCircle2, type: "positive", text: `Você está no caminho certo (${pct.toFixed(0)}% da meta atingida).` });
    } else if (status === "warning") {
      insights.push({ icon: AlertCircle, type: "warning", text: `Atenção: progresso de ${pct.toFixed(0)}% — precisa acelerar para bater a meta.` });
    } else {
      insights.push({ icon: AlertCircle, type: "negative", text: `Crítico: apenas ${pct.toFixed(0)}% da meta atingida. Revise a estratégia.` });
    }

    if (pace === "ahead") {
      insights.push({ icon: TrendingUp, type: "positive", text: `Ritmo acima do esperado: ${pct.toFixed(0)}% atingido com ${dayProgressPct.toFixed(0)}% do mês decorrido.` });
    } else if (pace === "behind") {
      insights.push({ icon: TrendingDown, type: "warning", text: `Ritmo abaixo do esperado: ${pct.toFixed(0)}% atingido com ${dayProgressPct.toFixed(0)}% do mês decorrido.` });
    } else if (pace === "ontrack") {
      insights.push({ icon: TrendingUp, type: "info", text: `Ritmo alinhado com o tempo decorrido do mês.` });
    }

    if (isCurrentMonth && projection !== null && targetValue > 0) {
      const projPct = (projection / targetValue) * 100;
      if (projPct >= 100) {
        insights.push({ icon: Sparkles, type: "positive", text: `Projeção: ${fmtValue(projection, unit, false)} ao fim do mês (${projPct.toFixed(0)}% da meta).` });
      } else {
        insights.push({ icon: Sparkles, type: "warning", text: `Projeção atual: ${fmtValue(projection, unit, false)} (${projPct.toFixed(0)}% da meta) se mantiver o ritmo.` });
      }
    }

    if (isCurrentMonth && status !== "excellent" && daysLeft > 0 && targetValue > 0) {
      const remaining = Math.max(0, targetValue - actual);
      const perDay = remaining / daysLeft;
      if (unit === "R$") {
        insights.push({ icon: Lightbulb, type: "info", text: `Faltam ${fmtValue(remaining, unit, false)} em ${daysLeft} dias — meta diária de ${fmtValue(perDay, unit, false)}.` });
      } else if (unit === "qtd") {
        insights.push({ icon: Lightbulb, type: "info", text: `Faltam ${Math.ceil(remaining)} em ${daysLeft} dias.` });
      }
    }

    if (isPastMonth) {
      if (status === "excellent" || status === "ontrack") {
        insights.push({ icon: CheckCircle2, type: "positive", text: `Mês encerrado com sucesso. Use essa meta como referência para os próximos.` });
      } else {
        insights.push({ icon: AlertCircle, type: "negative", text: `Mês encerrado abaixo do esperado. Considere ajustar a estratégia ou rever a meta.` });
      }
    }

    // Sugestões específicas por tipo de meta
    const suggestions: string[] = [];
    if (status !== "excellent" && status !== "ontrack") {
      switch (goal.goalType) {
        case "loan_volume":
        case "new_loans_count":
          suggestions.push("Intensifique a prospecção de novos clientes e acompanhamento de leads.");
          suggestions.push("Revise as taxas e condições oferecidas para atrair mais contratos.");
          break;
        case "received_total":
        case "interest_received":
          suggestions.push("Reforce a cobrança de parcelas em atraso na aba Cobranças.");
          suggestions.push("Revise contratos com inadimplência recorrente.");
          break;
        case "net_profit":
          suggestions.push("Reduza despesas operacionais não essenciais.");
          suggestions.push("Aumente a margem de juros nos novos contratos.");
          break;
        case "max_default_rate":
          suggestions.push("Ative notificações de cobrança automáticas.");
          suggestions.push("Revise critérios de aprovação de novos empréstimos.");
          break;
        case "new_clients_count":
          suggestions.push("Invista em divulgação e programas de indicação.");
          break;
        case "interest_rate":
          suggestions.push("Ajuste a política de juros padrão nos novos contratos.");
          break;
        case "active_capital":
          suggestions.push("Reaplique o capital recebido em novos empréstimos.");
          break;
      }
    }

    return { status, diff, diffPct, isCurrentMonth, isPastMonth, dayProgressPct, daysLeft, pace, projection, insights, suggestions };
  }, [goal, viewingMonth]);

  if (!goal || !analysis) return null;

  const Icon = goal.meta.icon;
  void settings;
  const statusBadge = {
    excellent: { label: "Meta superada", className: "bg-success/15 text-success border-success/30" },
    ontrack: { label: "No caminho", className: "bg-success/15 text-success border-success/30" },
    warning: { label: "Atenção", className: "bg-warning/15 text-warning border-warning/30" },
    critical: { label: "Crítico", className: "bg-destructive/15 text-destructive border-destructive/30" },
  }[analysis.status];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg ${goal.meta.bgColor} flex items-center justify-center shrink-0`}>
              <Icon className={`h-5 w-5 ${goal.meta.color}`} />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base truncate flex items-center gap-2">
                {goal.meta.label}
                {viewingMonth && goal.month !== viewingMonth && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-warning/40 text-warning bg-warning/5 uppercase tracking-wide leading-none shrink-0">
                    Herdada
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {formatMonthLabel(goal.month)} · {goal.meta.description}
              </DialogDescription>
            </div>
          </div>
          {viewingMonth && goal.month !== viewingMonth && (
            <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-warning">Meta herdada de {formatMonthLabel(goal.month)}</p>
                <p className="text-muted-foreground mt-0.5">
                  Não há meta cadastrada para {formatMonthLabel(viewingMonth)}. Os valores realizados e a análise abaixo
                  consideram <strong>{formatMonthLabel(viewingMonth)}</strong>, comparados ao alvo definido em {formatMonthLabel(goal.month)}.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 text-[11px] border-warning/40 text-warning hover:bg-warning/10"
                  onClick={() => {
                    setNewTarget(String(goal.targetValue));
                    setEditingCreate((v) => !v);
                  }}
                  disabled={creating}
                >
                  <Target className="h-3 w-3" />
                  {editingCreate ? "Cancelar" : `Criar meta para ${formatMonthLabel(viewingMonth)}`}
                </Button>
                {editingCreate && (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-1.5 flex-1">
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        Valor-alvo {goal.meta.unit === "R$" ? "(R$)" : goal.meta.unit === "%" ? "(%)" : "(qtd)"}:
                      </span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={newTarget}
                        onChange={(e) => setNewTarget(e.target.value)}
                        autoFocus
                        className="flex-1 h-7 rounded-md border border-warning/40 bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-warning"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] border-warning/40 text-warning hover:bg-warning/10"
                      onClick={handleCreateForMonth}
                      disabled={creating}
                    >
                      {creating ? "Salvando..." : "Confirmar"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 -mx-6 px-6 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="space-y-4 pb-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-9 gap-2 border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary"
              onClick={() => setShowEvolution(true)}
            >
              <BarChart3 className="h-4 w-4" />
              Ver Evolução Anual
            </Button>
            {/* Resumo */}
            <Card no3d className="bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <Badge variant="outline" className={statusBadge.className}>
                    {statusBadge.label}
                  </Badge>
                  <span className={`text-2xl font-bold ${goal.pct >= 80 ? "text-success" : goal.pct >= 50 ? "text-warning" : "text-destructive"}`}>
                    {goal.pct.toFixed(0)}%
                  </span>
                </div>
                <Progress value={goal.pct} className="h-2 mb-3" />
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Meta</p>
                    <p className="text-sm font-bold">{fmtValue(goal.targetValue, goal.meta.unit, hidden)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Realizado</p>
                    <p className={`text-sm font-bold ${goal.pct >= 80 ? "text-success" : goal.pct >= 50 ? "text-warning" : "text-destructive"}`}>
                      {fmtValue(goal.actual, goal.meta.unit, hidden)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">{goal.meta.inverse ? "Folga" : "Diferença"}</p>
                    <p className={`text-sm font-bold ${analysis.diff >= 0 ? "text-success" : "text-destructive"}`}>
                      {analysis.diff >= 0 ? "+" : ""}{fmtValue(analysis.diff, goal.meta.unit, hidden)}
                    </p>
                  </div>
                </div>
                {goal.goalType === "profit" && goal.expectedReceivable !== null && goal.targetAmount !== null && (() => {
                  const computeMonth = viewingMonth || goal.month;
                  // Recebido total = TODOS os pagamentos com data no mês (principal + juros + multa),
                  // refletindo exatamente o que entrou no extrato da conta.
                  const receivedTotal = payments.reduce((s: number, p: any) => {
                    if (!inMonth(p.date, computeMonth)) return s;
                    return s + (Number(p.amount) || 0);
                  }, 0);
                  const diffToTarget = Math.max(0, goal.targetAmount - receivedTotal);
                  const targetReached = receivedTotal >= goal.targetAmount;
                  return (
                    <div className="mt-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="rounded-md border border-border bg-card/60 p-2">
                          <p className="text-[10px] text-muted-foreground uppercase">Previsto a receber</p>
                          <p className="text-sm font-bold text-foreground">{fmtValue(goal.expectedReceivable, "R$", hidden)}</p>
                        </div>
                        <div className="rounded-md border border-success/30 bg-success/5 p-2">
                          <p className="text-[10px] text-muted-foreground uppercase">Meta em valor</p>
                          <p className="text-sm font-bold text-success">{fmtValue(goal.targetAmount, "R$", hidden)}</p>
                        </div>
                        <div className="rounded-md border border-border bg-card/60 p-2">
                          <p className="text-[10px] text-muted-foreground uppercase">Recebido total</p>
                          <p className="text-sm font-bold text-foreground">{fmtValue(receivedTotal, "R$", hidden)}</p>
                        </div>
                        <div className={`rounded-md border p-2 ${targetReached ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}>
                          <p className="text-[10px] text-muted-foreground uppercase">{targetReached ? "Meta atingida" : "Falta para a meta"}</p>
                          <p className={`text-sm font-bold ${targetReached ? "text-success" : "text-destructive"}`}>
                            {targetReached ? "✓" : fmtValue(diffToTarget, "R$", hidden)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {goal.goalType === "daily_received_avg" && (() => {
                  const computeMonth = viewingMonth || goal.month;
                  const [yy, mm] = computeMonth.split("-").map(Number);
                  const today = new Date();
                  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
                  const isCurrent = computeMonth === currentMonth;
                  const daysInMonth = new Date(yy, mm, 0).getDate();
                  const daysElapsed = isCurrent
                    ? today.getDate()
                    : (computeMonth < currentMonth ? daysInMonth : 1);
                  const receivedTotal = (goal as any).receivedTotal ?? 0;
                  const dailyAvg = daysElapsed > 0 ? receivedTotal / daysElapsed : 0;
                  const dailyTarget = goal.targetValue; // meta DIÁRIA direta
                  const reached = dailyAvg >= dailyTarget && dailyTarget > 0;
                  const dailyShortfall = Math.max(0, dailyTarget - dailyAvg);
                  const pctDaily = dailyTarget > 0 ? Math.min(100, (dailyAvg / dailyTarget) * 100) : 0;
                  return (
                    <div className="mt-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="rounded-md border border-success/30 bg-success/5 p-2">
                          <p className="text-[10px] text-muted-foreground uppercase">Média diária atual</p>
                          <p className="text-sm font-bold text-success">{fmtValue(dailyAvg, "R$", hidden)}</p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">em {daysElapsed} {daysElapsed === 1 ? "dia" : "dias"}</p>
                        </div>
                        <div className="rounded-md border border-border bg-card/60 p-2">
                          <p className="text-[10px] text-muted-foreground uppercase">Meta diária</p>
                          <p className="text-sm font-bold text-foreground">{fmtValue(dailyTarget, "R$", hidden)}</p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">{pctDaily.toFixed(0)}% atingido</p>
                        </div>
                        <div className="rounded-md border border-border bg-card/60 p-2">
                          <p className="text-[10px] text-muted-foreground uppercase">Recebido no período</p>
                          <p className="text-sm font-bold text-foreground">{fmtValue(receivedTotal, "R$", hidden)}</p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">informativo</p>
                        </div>
                        {(() => {
                          const daysRemaining = Math.max(0, daysInMonth - daysElapsed);
                          const totalTarget = dailyTarget * daysInMonth;
                          const totalShortfall = Math.max(0, totalTarget - receivedTotal);
                          const neededPerDay = daysRemaining > 0
                            ? totalShortfall / daysRemaining
                            : 0;
                          const onTrack = totalShortfall <= 0;
                          const borderCls = onTrack ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5";
                          const valueCls = onTrack ? "text-success" : "text-warning";
                          return (
                            <div className={`rounded-md border ${borderCls} p-2`}>
                              <p className="text-[10px] text-muted-foreground uppercase">Necessário/dia restante</p>
                              <p className={`text-sm font-bold ${valueCls}`}>
                                {fmtValue(neededPerDay, "R$", hidden)}
                              </p>
                              <p className="text-[9px] text-muted-foreground mt-0.5">
                                {onTrack
                                  ? `Meta projetada já atingida${daysRemaining > 0 ? ` · ${daysRemaining} ${daysRemaining === 1 ? "dia restante" : "dias restantes"}` : ""}`
                                  : `Faltam ${fmtValue(totalShortfall, "R$", hidden)} ${daysRemaining > 0 ? `em ${daysRemaining} ${daysRemaining === 1 ? "dia" : "dias"}` : "no período"}`}
                              </p>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Progresso temporal */}
            {analysis.isCurrentMonth && (
              <Card no3d>
                <CardContent className="p-4">
                  <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-primary" /> Progresso do Mês
                  </h4>
                  <Progress value={analysis.dayProgressPct} className="h-1.5 mb-2" />
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{analysis.dayProgressPct.toFixed(0)}% do mês decorrido</span>
                    <span>{analysis.daysLeft} dias restantes</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Insights */}
            <Card no3d>
              <CardContent className="p-4">
                <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> Análise Inteligente
                </h4>
                <div className="space-y-2">
                  {analysis.insights.map((ins, i) => {
                    const InsIcon = ins.icon;
                    const colorMap = {
                      positive: "text-success bg-success/10 border-success/20",
                      warning: "text-warning bg-warning/10 border-warning/20",
                      negative: "text-destructive bg-destructive/10 border-destructive/20",
                      info: "text-primary bg-primary/10 border-primary/20",
                    };
                    return (
                      <div key={i} className={`flex items-start gap-2 p-2 rounded-md border ${colorMap[ins.type]}`}>
                        <InsIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <p className="text-xs leading-snug">{ins.text}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Sugestões */}
            {analysis.suggestions.length > 0 && (
              <Card no3d className="border-primary/30 bg-primary/5">
                <CardContent className="p-4">
                  <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                    <Lightbulb className="h-3.5 w-3.5 text-primary" /> Sugestões de Ajuste
                  </h4>
                  <ul className="space-y-1.5">
                    {analysis.suggestions.map((s, i) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {goal.notes && (
              <Card no3d>
                <CardContent className="p-4">
                  <h4 className="text-xs font-semibold text-foreground mb-2">Notas</h4>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{goal.notes}</p>
                </CardContent>
              </Card>
            )}

            {/* Como esta meta é calculada */}
            {(() => {
              const exp = GOAL_EXPLANATIONS[goal.goalType];
              if (!exp) return null;
              return (
                <Card no3d className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
                        <BookOpen className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-foreground leading-tight">Como esta meta é calculada</h4>
                        <p className="text-[10px] text-muted-foreground leading-tight">Entenda a fórmula, os dados e veja um exemplo prático</p>
                      </div>
                    </div>

                    {/* Fórmula */}
                    <div className="rounded-md border border-border bg-card/60 p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Calculator className="h-3.5 w-3.5 text-primary" />
                        <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">Fórmula</span>
                      </div>
                      <p className="text-xs text-foreground leading-snug font-mono bg-muted/40 rounded px-2 py-1.5">
                        {exp.formula}
                      </p>
                    </div>

                    {/* Indicadores */}
                    <div className="rounded-md border border-border bg-card/60 p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Target className="h-3.5 w-3.5 text-primary" />
                        <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">Indicadores considerados</span>
                      </div>
                      <ul className="space-y-1">
                        {exp.indicators.map((ind, i) => (
                          <li key={i} className="text-xs text-foreground flex items-start gap-2 leading-snug">
                            <span className="text-primary mt-0.5">•</span>
                            <span>{ind}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Origem dos dados */}
                    <div className="rounded-md border border-border bg-card/60 p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Database className="h-3.5 w-3.5 text-primary" />
                        <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">Origem dos dados</span>
                      </div>
                      <ul className="space-y-1">
                        {exp.dataSource.map((src, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-2 leading-snug">
                            <span className="text-primary mt-0.5">›</span>
                            <span>{src}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Exemplo prático */}
                    <div className="rounded-md border border-success/30 bg-success/5 p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <FlaskConical className="h-3.5 w-3.5 text-success" />
                        <span className="text-[11px] font-semibold text-success uppercase tracking-wide">Exemplo prático</span>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase">Cenário</span>
                          <p className="text-foreground leading-snug">{exp.example.setup}</p>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase">Cálculo</span>
                          <p className="text-foreground leading-snug font-mono bg-muted/40 rounded px-2 py-1">{exp.example.calc}</p>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase">Resultado</span>
                          <p className="text-success font-semibold leading-snug">{exp.example.result}</p>
                        </div>
                      </div>
                    </div>

                    {/* Como é medido */}
                    <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        <span className="text-[11px] font-semibold text-primary uppercase tracking-wide">Como o progresso é medido</span>
                      </div>
                      <p className="text-xs text-foreground leading-snug">{exp.measurement}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}
          </div>
        </div>
      </DialogContent>
      <GoalYearlyEvolutionDialog
        open={showEvolution}
        onClose={() => setShowEvolution(false)}
        goalType={goal.goalType}
        goalLabel={goal.meta.label}
        unit={goal.meta.unit}
        inverse={goal.meta.inverse}
        loans={loans}
        payments={payments}
        expenses={expenses}
        clients={clients}
        installmentSchedules={installmentSchedules}
        renegotiations={renegotiations}
      />
    </Dialog>
  );
}
