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
  readOnly?: boolean;
}

export function DashboardOverview({ loans, sales, payments, expenses, installmentSchedules = [], clients = [], onDeletePayment, onDeleteSale, onDeleteLoan, readOnly = false }: Props) {
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

  return (
    <div className="@container/dash dash-premium dash-page space-y-6">
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
    </div>
  );
}
