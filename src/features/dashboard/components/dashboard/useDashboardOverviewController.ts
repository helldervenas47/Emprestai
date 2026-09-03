import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChartOverrides } from "@/hooks/useChartOverrides";
import { useMonthlyGoals } from "@/features/piggyBanks/hooks/useMonthlyGoals";
import { listLedger, type LedgerEntry } from "@/features/financial/lib/ledger";
import { getRange, type Period } from "@/features/dashboard/components/dashboard/dashboardHelpers";
// Saldo em Conta do Dashboard = mesmo valor do Extrato da Conta (LedgerView),
// que lê `balance.account_amount` via `getBalances()`. Não usar cálculos
// derivados (useUnifiedAccountBalance / useOfficialAccountBalance) aqui.
import { getBalances, setBalance as writeBalance } from "@/features/financial/lib/balance";

/**
 * Controller hook do DashboardOverview.
 *
 * Centraliza estados, navegação de período, carregamento do ledger,
 * memos básicos (range / goal keys) e handlers utilitários — sem alterar
 * regra de negócio nem nomes públicos do componente.
 */
export function useDashboardOverviewController() {
  const [period, setPeriod] = useState<Period>("month");
  const [offset, setOffset] = useState(0);
  const [txFilter, setTxFilter] = useState<"all" | "in" | "out">("all");
  const [comparisonWindow, setComparisonWindow] = useState<3 | 6 | 12>(6);
  const [showAllTx, setShowAllTx] = useState(false);
  const [expandedBreakdown, setExpandedBreakdown] = useState<string | null>(null);
  const [overdueDialogOpen, setOverdueDialogOpen] = useState(false);
  const [expandedInsightId, setExpandedInsightId] = useState<string | null>(null);

  const [accountBalance, setAccountBalanceState] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const b = await getBalances();
      if (alive) setAccountBalanceState(b.total);
    };
    load();
    window.addEventListener("balance:changed", load);
    window.addEventListener("ledger:changed", load);
    window.addEventListener("offline-sync:flushed", load);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      window.removeEventListener("balance:changed", load);
      window.removeEventListener("ledger:changed", load);
      window.removeEventListener("offline-sync:flushed", load);
      window.removeEventListener("focus", load);
    };
  }, []);
  const setAccountBalance = useCallback((v: number) => {
    writeBalance(v);
  }, []);
  const [editingBalance, setEditingBalance] = useState(false);
  const [tempBalance, setTempBalance] = useState("");
  const [includeSales, setIncludeSales] = useState(false);
  const [showInterestDetail, setShowInterestDetail] = useState(false);
  const [receivedDetailMethodId, setReceivedDetailMethodId] = useState<string | null>(null);
  const [showInterestExpectedDetail, setShowInterestExpectedDetail] = useState(false);
  const [interestExpectedFilter, setInterestExpectedFilter] = useState<"all" | "pending" | "overdue">("all");
  const [interestReceivedSearch, setInterestReceivedSearch] = useState("");
  const [interestExpectedSearch, setInterestExpectedSearch] = useState("");
  const [showHealthInfo, setShowHealthInfo] = useState(false);
  const [riskAiOpen, setRiskAiOpen] = useState(false);
  const [riskAiLoading, setRiskAiLoading] = useState(false);
  const [riskAiReport, setRiskAiReport] = useState("");
  const [riskAiTitle, setRiskAiTitle] = useState("Relatório IA para reduzir risco");
  const [cachedInsightReports, setCachedInsightReports] = useState<Record<string, string>>({});
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const prefetchingInsightReportsRef = useRef<Set<string>>(new Set());

  const { chartOverrides, setChartOverrides, interestOverrides, setInterestOverrides } = useChartOverrides();
  const { getGoal } = useMonthlyGoals();

  useEffect(() => {
    let alive = true;
    const loadLedger = async () => {
      const entries = await listLedger();
      if (alive) setLedgerEntries(entries);
    };
    loadLedger();
    window.addEventListener("ledger:changed", loadLedger);
    window.addEventListener("balance:changed", loadLedger);
    window.addEventListener("offline-sync:flushed", loadLedger);
    window.addEventListener("focus", loadLedger);
    return () => {
      alive = false;
      window.removeEventListener("ledger:changed", loadLedger);
      window.removeEventListener("balance:changed", loadLedger);
      window.removeEventListener("offline-sync:flushed", loadLedger);
      window.removeEventListener("focus", loadLedger);
    };
  }, []);

  const range = useMemo(() => getRange(period, offset), [period, offset]);

  const goalMonthKey = useMemo(
    () => `${range.start.getFullYear()}-${String(range.start.getMonth() + 1).padStart(2, "0")}`,
    [range],
  );
  const interestGoal = getGoal("interest_rate", goalMonthKey);
  const profitGoal = getGoal("profit", goalMonthKey);

  const handleChangePeriod = useCallback((p: Period) => {
    setPeriod(p);
    setOffset(0);
  }, []);

  const startEditBalance = useCallback(() => {
    setTempBalance(String(accountBalance));
    setEditingBalance(true);
  }, [accountBalance]);
  const saveBalance = useCallback(() => {
    setAccountBalance(parseFloat(tempBalance) || 0);
    setEditingBalance(false);
  }, [tempBalance, setAccountBalance]);
  const cancelEditBalance = useCallback(() => setEditingBalance(false), []);

  return {
    // periodo
    period, setPeriod, offset, setOffset, handleChangePeriod,
    range, goalMonthKey, interestGoal, profitGoal,
    // listagens / filtros
    txFilter, setTxFilter,
    comparisonWindow, setComparisonWindow,
    showAllTx, setShowAllTx,
    expandedBreakdown, setExpandedBreakdown,
    overdueDialogOpen, setOverdueDialogOpen,
    expandedInsightId, setExpandedInsightId,
    // saldo
    accountBalance, setAccountBalance,
    editingBalance, setEditingBalance,
    tempBalance, setTempBalance,
    startEditBalance, saveBalance, cancelEditBalance,
    // toggles / detalhes
    includeSales, setIncludeSales,
    showInterestDetail, setShowInterestDetail,
    receivedDetailMethodId, setReceivedDetailMethodId,
    showInterestExpectedDetail, setShowInterestExpectedDetail,
    interestExpectedFilter, setInterestExpectedFilter,
    interestReceivedSearch, setInterestReceivedSearch,
    interestExpectedSearch, setInterestExpectedSearch,
    showHealthInfo, setShowHealthInfo,
    // risk AI
    riskAiOpen, setRiskAiOpen,
    riskAiLoading, setRiskAiLoading,
    riskAiReport, setRiskAiReport,
    riskAiTitle, setRiskAiTitle,
    cachedInsightReports, setCachedInsightReports,
    // ledger
    ledgerEntries, setLedgerEntries,
    prefetchingInsightReportsRef,
    // overrides
    chartOverrides, setChartOverrides,
    interestOverrides, setInterestOverrides,
    // goals util
    getGoal,
  };
}
