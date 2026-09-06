import { useCallback, useEffect, useMemo } from "react";
import { useDashboardLoanTotalsRpc } from "@/features/dashboard/hooks/useDashboardLoanTotalsRpc";
import { useRpcV3DashboardCards } from "@/features/dashboard/hooks/useRpcV3DashboardCards";
import { useAuth } from "@/hooks/useAuth";
import { useLoanRenegotiations } from "@/features/loans/hooks/useLoanRenegotiations";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Loan, Sale, Payment, Expense, InstallmentSchedule, Client } from "@/types/loan";
import { ManagerCommissionsChart } from "@/features/payroll/components/ManagerCommissionsChart";
import { GoalsCard } from "@/features/piggyBanks/components/GoalsCard";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { rawFormatCurrency } from "@/features/dashboard/components/dashboard/dashboardHelpers";
import { DashboardPeriodFilter } from "@/features/dashboard/components/dashboard/DashboardPeriodFilter";
import { DashboardFinancialHealthSection } from "@/features/dashboard/components/dashboard/DashboardFinancialHealthSection";
import { DashboardMainCards } from "@/features/dashboard/components/dashboard/DashboardMainCards";
import { DashboardPortfolioMetrics } from "@/features/dashboard/components/dashboard/DashboardPortfolioMetrics";
import { DashboardBreakdownSection } from "@/features/dashboard/components/dashboard/DashboardBreakdownSection";
import { DashboardChartsSection } from "@/features/dashboard/components/dashboard/DashboardChartsSection";
import { DashboardInsightsSection } from "@/features/dashboard/components/dashboard/DashboardInsightsSection";
import { CollapsibleSection } from "@/features/dashboard/components/dashboard/CollapsibleSection";
import { BusinessPulseSection } from "@/features/dashboard/components/dashboard/BusinessPulseSection";
import { useBusinessPulse } from "@/features/dashboard/hooks/useBusinessPulse";
import { useDashboardOverviewController } from "@/features/dashboard/components/dashboard/useDashboardOverviewController";
import { useDashboardMetrics } from "@/features/dashboard/components/dashboard/useDashboardMetrics";
import { useDashboardAiReports } from "@/features/dashboard/components/dashboard/useDashboardAiReports";
import { DashboardQuickActionsBar } from "@/features/dashboard/components/dashboard/DashboardQuickActionsBar";
import { DashboardOperationalCards } from "@/features/dashboard/components/dashboard/DashboardOperationalCards";
import { DashboardAttentionSection } from "@/features/dashboard/components/dashboard/DashboardAttentionSection";
import { DashboardDelinquencyBuckets } from "@/features/dashboard/components/dashboard/DashboardDelinquencyBuckets";
import { QuickPaymentSelectorDialog } from "@/features/dashboard/components/dashboard/QuickPaymentSelectorDialog";
import { PaymentHubDialog } from "@/features/loans/components/payment-hub/PaymentHubDialog";
import { todayInAppTz } from "@/lib/timezone";
import { calculateTotalWithInterest } from "@/features/loans/hooks/useLoans";
import { useState } from "react";
import type { PaymentSplit } from "@/types/loan";

interface Props {
  loans: Loan[];
  sales: Sale[];
  payments: Payment[];
  expenses: Expense[];
  installmentSchedules?: InstallmentSchedule[];
  clients?: Client[];
  onDeletePayment?: (id: string) => void;
  onDeleteSale?: (id: string) => void;
  onDeleteLoan?: (id: string) => void;
  onPayment?: (loanId: string, paymentDate?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onPartialPayment?: (loanId: string, amount: number, paymentDate?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onFullPayment?: (loanId: string, paymentDate?: string, customAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onInterestPayment?: (loanId: string, paymentDate?: string, customAmount?: number, feesAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null, options?: { partial?: boolean; notes?: string | null }) => void;
  onAmortize?: (loanId: string, amount: number, paymentDate?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => Promise<void> | void;
  onNewLoan?: () => void;
  onNewClient?: () => void;
  onNavigateToTab?: (tab: string) => void;
  readOnly?: boolean;
}

export function DashboardOverview({
  loans,
  sales,
  payments,
  expenses,
  installmentSchedules = [],
  clients = [],
  onDeletePayment,
  onDeleteSale,
  onDeleteLoan,
  onPayment,
  onPartialPayment,
  onFullPayment,
  onInterestPayment,
  onAmortize,
  onNewLoan,
  onNewClient,
  onNavigateToTab,
  readOnly = false,
}: Props) {
  const { mask } = useHideValues();
  const { role, user } = useAuth();
  const { renegotiations } = useLoanRenegotiations();
  const { methods: paymentMethods } = usePaymentMethods();
  const isMobile = useIsMobile();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const controller = useDashboardOverviewController();
  const {
    period, offset, setOffset, handleChangePeriod,
    range, goalMonthKey, interestGoal, profitGoal,
    txFilter, setTxFilter,
    comparisonWindow,
    showAllTx, setShowAllTx,
    expandedBreakdown, setExpandedBreakdown,
    overdueDialogOpen, setOverdueDialogOpen,
    accountBalance,
    editingBalance,
    tempBalance, setTempBalance,
    saveBalance, cancelEditBalance,
    includeSales, setIncludeSales,
    showInterestDetail, setShowInterestDetail,
    receivedDetailMethodId, setReceivedDetailMethodId,
    showInterestExpectedDetail, setShowInterestExpectedDetail,
    interestExpectedFilter, setInterestExpectedFilter,
    interestReceivedSearch, setInterestReceivedSearch,
    interestExpectedSearch, setInterestExpectedSearch,
    showHealthInfo, setShowHealthInfo,
    riskAiOpen, setRiskAiOpen,
    riskAiLoading,
    riskAiReport,
    riskAiTitle,
    ledgerEntries,
    chartOverrides, setChartOverrides,
    interestOverrides, setInterestOverrides,
    getGoal,
  } = controller;

  const {
    data,
    receivedByMethod,
    receivedDetail,
    profitTargetAmount,
    portfolio,
    monthComparison,
    yearlyAverages,
    riskReturn,
    monthlyChartBase,
    monthlyChart,
    interestChartBase,
    interestChart,
  } = useDashboardMetrics({
    loans, sales, payments, expenses, installmentSchedules, ledgerEntries,
    range, period, includeSales, comparisonWindow,
    chartOverrides, interestOverrides,
    paymentMethods, profitGoal, receivedDetailMethodId,
  });

  // RPC agregada `dashboard_loan_totals` em MODO COMPARAÇÃO.
  // Não substitui os cards ainda — apenas registra no console (dev) qualquer
  // divergência > R$ 0,01 contra o cálculo legado do frontend.
  const legacyTotals = useMemo(() => ({
    emprestado: Number((data as any)?.totalLoanOutgoing ?? 0),
    capitalAtivo: Number((portfolio as any)?.capitalOnStreet ?? 0),
    receber: Number((portfolio as any)?.pendingReceivable ?? 0),
    jurosReceber: Math.max(
      0,
      Number((portfolio as any)?.pendingReceivable ?? 0) - Number((portfolio as any)?.capitalOnStreet ?? 0),
    ),
    totalRecebidoPeriodo: Number((data as any)?.incomeFromPayments ?? 0),
  }), [data, portfolio]);

  const { missing: rpcMissing, harnessEnabled: rpcHarnessEnabled } = useDashboardLoanTotalsRpc({
    range: { start: range.start, end: range.end },
    role,
    legacy: legacyTotals,
  });
  useEffect(() => {
    if (!rpcHarnessEnabled || !rpcMissing) return;
    console.warn(
      "[dashboard_loan_totals] RPC não publicada. Rode supabase/sql/dashboard_loan_totals_v3.sql.",
    );
  }, [rpcHarnessEnabled, rpcMissing]);

  // FASE 7 — rollout oficial: quando ativo e com paridade dentro de R$ 0,01,
  // os cards passam a ler EXCLUSIVAMENTE a RPC V3; caso contrário, legado.
  const rpcCards = useRpcV3DashboardCards({
    range: { start: range.start, end: range.end },
    role,
    userId: user?.id,
    legacy: legacyTotals,
  });

  const cardsData = useMemo(() => {
    if (rpcCards.source !== "rpc") return data;
    return {
      ...data,
      totalLoanOutgoing: Number(rpcCards.totals.emprestado ?? (data as any)?.totalLoanOutgoing ?? 0),
      incomeFromPayments: Number(
        rpcCards.totals.totalRecebidoPeriodo ?? (data as any)?.incomeFromPayments ?? 0,
      ),
    };
  }, [rpcCards.source, rpcCards.totals, data]);

  const cardsPortfolio = useMemo(() => {
    if (rpcCards.source !== "rpc") return portfolio;
    return {
      ...portfolio,
      capitalOnStreet: Number(rpcCards.totals.capitalAtivo ?? (portfolio as any)?.capitalOnStreet ?? 0),
      pendingReceivable: Number(rpcCards.totals.receber ?? (portfolio as any)?.pendingReceivable ?? 0),
    };
  }, [rpcCards.source, rpcCards.totals, portfolio]);


  const { generateRiskAiReport } = useDashboardAiReports({
    controller,
    formatCurrency,
    role,
    monthComparison,
    interestGoal,
    riskReturn,
    yearlyAverages,
    portfolio,
    data,
    range,
  });

  const { analysis: businessPulseAnalysis, refresh: refreshBusinessPulse } = useBusinessPulse({
    loans,
    sales,
    payments,
    expenses,
    clients,
    installmentSchedules,
    range,
    period,
  });

  // Estados para busca operacional e seletor rápido de pagamentos
  const [operationalSearch, setOperationalSearch] = useState("");
  const [quickPaymentSelectorOpen, setQuickPaymentSelectorOpen] = useState(false);
  const [selectedPaymentLoan, setSelectedPaymentLoan] = useState<Loan | null>(null);

  const todayStr = todayInAppTz();
  const currentMonthStr = todayStr.substring(0, 7);

  const activeLoans = useMemo(() => loans.filter((l) => l.status === "active"), [loans]);

  // 1. CARTEIRA ATIVA (Principal)
  const operationalCapitalOnStreet = useMemo(() => {
    return activeLoans.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  }, [activeLoans]);

  // 2. A RECEBER (Saldo futuro total)
  const operationalTotalToReceive = useMemo(() => {
    return activeLoans.reduce((sum, l) => {
      const full = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
      const remaining = l.remainingAmount != null ? Number(l.remainingAmount) : full;
      return sum + remaining;
    }, 0);
  }, [activeLoans]);

  // Parcelas pagas por empréstimo
  const paidNumbersMap = useMemo(() => {
    const map = new Map<string, Set<number>>();
    payments.forEach((p) => {
      if (p.loanId && p.installmentNumber > 0) {
        const set = map.get(p.loanId) || new Set<number>();
        set.add(p.installmentNumber);
        map.set(p.loanId, set);
      }
    });
    return map;
  }, [payments]);

  // 3. VENCE HOJE & 4. EM ATRASO
  const { dueTodayAmount, dueTodayCount, overdueAmount, overdueCount } = useMemo(() => {
    let todayAmt = 0;
    let todayCnt = 0;
    let overAmt = 0;
    let overCnt = 0;

    for (const loan of activeLoans) {
      const schedules = installmentSchedules
        .filter((s) => s.loanId === loan.id)
        .sort((a, b) => a.installmentNumber - b.installmentNumber);

      const paidSet = paidNumbersMap.get(loan.id) || new Set<number>();

      if (schedules.length > 0) {
        const pending = schedules.filter((s) => !paidSet.has(s.installmentNumber));
        for (const s of pending) {
          const sDue = s.dueDate.substring(0, 10);
          const val = Number(s.amount) || 0;
          if (sDue === todayStr) {
            todayAmt += val;
            todayCnt += 1;
          } else if (sDue < todayStr) {
            overAmt += val;
            overCnt += 1;
          }
        }
      } else {
        const lDue = (loan.dueDate || "").substring(0, 10);
        const val = Number(loan.remainingAmount ?? loan.amount) || 0;
        if (lDue === todayStr) {
          todayAmt += val;
          todayCnt += 1;
        } else if (lDue < todayStr) {
          overAmt += val;
          overCnt += 1;
        }
      }
    }

    return {
      dueTodayAmount: todayAmt,
      dueTodayCount: todayCnt,
      overdueAmount: overAmt,
      overdueCount: overCnt,
    };
  }, [activeLoans, installmentSchedules, paidNumbersMap, todayStr]);

  // 5. RECEBIDO NO MÊS
  const operationalReceivedThisMonth = useMemo(() => {
    return payments
      .filter((p) => (p.date || "").substring(0, 7) === currentMonthStr)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [payments, currentMonthStr]);

  // 6. CLIENTES ATIVOS
  const operationalActiveClientsCount = useMemo(() => {
    const clientIds = new Set<string>();
    activeLoans.forEach((l) => {
      if (l.borrowerId) clientIds.add(l.borrowerId);
      else if (l.borrowerName) clientIds.add(l.borrowerName.toLowerCase().trim());
    });
    return clientIds.size;
  }, [activeLoans]);

  // Filtragem de empréstimos pela busca operacional rápida
  const filteredOperationalLoans = useMemo(() => {
    const term = operationalSearch.toLowerCase().trim();
    if (!term) return loans;

    return loans.filter((l) => {
      const client = clients.find((c) => c.id === l.borrowerId);
      const clientName = (client?.name || l.borrowerName || "").toLowerCase();
      const phone = (client?.phone || "").toLowerCase();
      const cpf = (client?.cpf || "").toLowerCase();
      const loanId = l.id.toLowerCase();

      return (
        clientName.includes(term) ||
        phone.includes(term) ||
        cpf.includes(term) ||
        loanId.includes(term)
      );
    });
  }, [loans, clients, operationalSearch]);

  const handleOpenLoanPayment = (loan: Loan) => {
    setSelectedPaymentLoan(loan);
  };

  return (
    <div className="@container/dash dash-premium dash-page space-y-6">
      {/* 🚀 BARRA DE AÇÕES RÁPIDAS E BUSCA OPERACIONAL */}
      <DashboardQuickActionsBar
        searchTerm={operationalSearch}
        onSearchChange={setOperationalSearch}
        onNewLoan={() => onNewLoan?.()}
        onNewClient={() => onNewClient?.()}
        onOpenPaymentSelector={() => setQuickPaymentSelectorOpen(true)}
        onFilterOverdue={() => onNavigateToTab?.("dashboard")}
        readOnly={readOnly}
      />

      {/* 📊 6 INDICADORES OPERACIONAIS PRINCIPAIS */}
      <DashboardOperationalCards
        capitalOnStreet={operationalCapitalOnStreet}
        totalToReceive={operationalTotalToReceive}
        dueTodayAmount={dueTodayAmount}
        dueTodayCount={dueTodayCount}
        overdueAmount={overdueAmount}
        overdueCount={overdueCount}
        receivedThisMonth={operationalReceivedThisMonth}
        activeClientsCount={operationalActiveClientsCount}
        totalLoansActiveCount={activeLoans.length}
        formatCurrency={formatCurrency}
        onFilterDueToday={() => onNavigateToTab?.("dashboard")}
        onFilterOverdue={() => onNavigateToTab?.("dashboard")}
      />

      {/* ⚡ BLOCO: PRECISAM DA SUA ATENÇÃO HOJE */}
      <DashboardAttentionSection
        loans={filteredOperationalLoans}
        installmentSchedules={installmentSchedules}
        payments={payments}
        clients={clients}
        formatCurrency={formatCurrency}
        onOpenPayment={handleOpenLoanPayment}
        onNavigateToLoan={() => onNavigateToTab?.("dashboard")}
        onNavigateToClient={() => onNavigateToTab?.("clients")}
      />

      {/* 🛡️ PAINEL: INADIMPLÊNCIA POR FAIXAS DE ATRASO */}
      <DashboardDelinquencyBuckets
        loans={filteredOperationalLoans}
        installmentSchedules={installmentSchedules}
        payments={payments}
        clients={clients}
        formatCurrency={formatCurrency}
        onOpenPayment={handleOpenLoanPayment}
      />

      {/* 📅 SELETOR DE PERÍODO ANALÍTICO */}
      <DashboardPeriodFilter
        rangeLabel={range.label}
        period={period}
        offset={offset}
        onPrev={() => setOffset(offset - 1)}
        onNext={() => setOffset(offset + 1)}
        onReset={() => setOffset(0)}
        onChangePeriod={handleChangePeriod}
      />

      <div className="space-y-2.5 sm:space-y-3">
      <DashboardMainCards

        readOnly={readOnly}
        accountBalance={accountBalance}
        editingBalance={editingBalance}
        tempBalance={tempBalance}
        setTempBalance={setTempBalance}
        saveBalance={saveBalance}
        cancelEditBalance={cancelEditBalance}
        receivedByMethod={receivedByMethod}
        setReceivedDetailMethodId={setReceivedDetailMethodId}
        data={cardsData}
        allLoans={loans}
        portfolio={cardsPortfolio}
        expandedBreakdown={expandedBreakdown}
        setExpandedBreakdown={setExpandedBreakdown}
        interestGoal={interestGoal}
        profitGoal={profitGoal}
        profitTargetAmount={profitTargetAmount}
        formatCurrency={formatCurrency}
      />

      <DashboardPortfolioMetrics
        portfolio={cardsPortfolio}
        periodProfitRealized={data.periodProfitRealized}
        periodProfitExpected={data.periodProfitExpected}
        periodProfitOverdue={data.periodProfitOverdue}
        prevProfitRealized={data.prevProfitRealized}
        prevProfitDue={data.prevProfitDue}
        formatCurrency={formatCurrency}
        onOpenInterestReceived={() => setShowInterestDetail(true)}
        onOpenInterestExpectedAll={() => { setInterestExpectedFilter("all"); setShowInterestExpectedDetail(true); }}
        onOpenInterestPending={() => { setInterestExpectedFilter("pending"); setShowInterestExpectedDetail(true); }}
      />
      </div>

      {/* 🧠 O que está acontecendo com seu negócio? */}
      <BusinessPulseSection
        analysis={businessPulseAnalysis}
        onRefresh={refreshBusinessPulse}
      />



      <DashboardFinancialHealthSection
        portfolio={portfolio}
        rangeLabel={range.label}
        installmentSchedules={installmentSchedules}
        formatCurrency={formatCurrency}
        overdueDialogOpen={overdueDialogOpen}
        setOverdueDialogOpen={setOverdueDialogOpen}
        onOpenHealthInfo={() => setShowHealthInfo(true)}
      />

      <CollapsibleSection title="Metas" description="Acompanhamento das metas do período">
        <GoalsCard loans={loans} payments={payments} expenses={expenses} clients={clients ?? []} installmentSchedules={installmentSchedules} renegotiations={renegotiations} selectedMonth={goalMonthKey} periodLabel={range.label} />
      </CollapsibleSection>

      <CollapsibleSection title="Comissões por Gerente" description="Distribuição de comissões no período">
        <ManagerCommissionsChart clients={clients} loans={loans} installmentSchedules={installmentSchedules} payments={payments} range={{ start: range.start, end: range.end }} rangeLabel={range.label} />
      </CollapsibleSection>

      <DashboardChartsSection
        readOnly={readOnly}
        formatCurrency={formatCurrency}
        riskReturn={riskReturn}
        yearlyAverages={yearlyAverages}
        onRiskAiClick={generateRiskAiReport}
        monthlyChart={monthlyChart}
        monthlyChartBase={monthlyChartBase}
        interestChart={interestChart}
        interestChartBase={interestChartBase}
        setChartOverrides={setChartOverrides}
        setInterestOverrides={setInterestOverrides}
      />

      <DashboardBreakdownSection
        data={data}
        loans={loans}
        includeSales={includeSales}
        setIncludeSales={setIncludeSales}
        expandedBreakdown={expandedBreakdown}
        setExpandedBreakdown={setExpandedBreakdown}
        formatCurrency={formatCurrency}
      />

      <DashboardInsightsSection
        readOnly={readOnly}
        isMobile={isMobile}
        rangeLabel={range.label}
        formatCurrency={formatCurrency}
        data={data}
        receivedDetail={receivedDetail}
        txFilter={txFilter}
        setTxFilter={setTxFilter}
        showAllTx={showAllTx}
        setShowAllTx={setShowAllTx}
        onDeletePayment={onDeletePayment}
        onDeleteSale={onDeleteSale}
        onDeleteLoan={onDeleteLoan}
        showHealthInfo={showHealthInfo}
        setShowHealthInfo={setShowHealthInfo}
        showInterestDetail={showInterestDetail}
        setShowInterestDetail={setShowInterestDetail}
        interestReceivedSearch={interestReceivedSearch}
        setInterestReceivedSearch={setInterestReceivedSearch}
        receivedDetailMethodId={receivedDetailMethodId}
        setReceivedDetailMethodId={setReceivedDetailMethodId}
        showInterestExpectedDetail={showInterestExpectedDetail}
        setShowInterestExpectedDetail={setShowInterestExpectedDetail}
        interestExpectedFilter={interestExpectedFilter}
        setInterestExpectedFilter={setInterestExpectedFilter}
        interestExpectedSearch={interestExpectedSearch}
        setInterestExpectedSearch={setInterestExpectedSearch}
        riskAiOpen={riskAiOpen}
        setRiskAiOpen={setRiskAiOpen}
        riskAiLoading={riskAiLoading}
        riskAiReport={riskAiReport}
        riskAiTitle={riskAiTitle}
        generateRiskAiReport={generateRiskAiReport}
      />

      {/* Modal para Seleção Rápida de Pagamento */}
      <QuickPaymentSelectorDialog
        open={quickPaymentSelectorOpen}
        onOpenChange={setQuickPaymentSelectorOpen}
        loans={loans}
        clients={clients}
        formatCurrency={formatCurrency}
        onSelectLoan={(loan) => setSelectedPaymentLoan(loan)}
      />

      {/* Modal Central de Registro de Pagamento */}
      {selectedPaymentLoan && (
        <PaymentHubDialog
          open={!!selectedPaymentLoan}
          onOpenChange={(open) => !open && setSelectedPaymentLoan(null)}
          loan={selectedPaymentLoan}
          payments={payments}
          installmentSchedules={installmentSchedules}
          onPayment={onPayment ? (date, methodId, split) => {
            onPayment(selectedPaymentLoan.id, date, methodId, split);
            setSelectedPaymentLoan(null);
          } : undefined}
          onPartialPayment={onPartialPayment ? (amount, date, methodId, split) => {
            onPartialPayment(selectedPaymentLoan.id, amount, date, methodId, split);
            setSelectedPaymentLoan(null);
          } : (amount) => {}}
          onFullPayment={onFullPayment ? (date, customAmt, methodId, split) => {
            onFullPayment(selectedPaymentLoan.id, date, customAmt, methodId, split);
            setSelectedPaymentLoan(null);
          } : undefined}
          onInterestPayment={onInterestPayment ? (date, customAmt, feesAmt, methodId, split, opts) => {
            onInterestPayment(selectedPaymentLoan.id, date, customAmt, feesAmt, methodId, split, opts);
            setSelectedPaymentLoan(null);
          } : (date) => {}}
          onAmortize={onAmortize ? (amount, date, methodId, split) => {
            onAmortize(selectedPaymentLoan.id, amount, date, methodId, split);
            setSelectedPaymentLoan(null);
          } : undefined}
        />
      )}
    </div>
  );
}
