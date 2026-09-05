import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchClientRanking } from "../services/clientRankingService";
import {
  ClientRankingType,
  ClientRankingPeriod,
  ClientRankingItem,
} from "../types/clientRanking";
import { Client, Loan, LoanRenegotiation, Payment, InstallmentSchedule } from "@/types/loan";
import { computeClientRanking } from "../lib/computeClientRanking";

interface UseClientRankingOptions {
  clients?: Client[];
  loans?: Loan[];
  payments?: Payment[];
  installmentSchedules?: InstallmentSchedule[];
  renegotiations?: LoanRenegotiation[];
}

export function useClientRanking(options?: UseClientRankingOptions) {
  const [rankingType, setRankingType] = useState<ClientRankingType>("best");
  const [period, setPeriod] = useState<ClientRankingPeriod>("all");
  const [startDate, setStartDate] = useState<string | undefined>();
  const [endDate, setEndDate] = useState<string | undefined>();
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [selectedClient, setSelectedClient] = useState<ClientRankingItem | null>(null);

  const hasLocalData = !!options?.clients;

  // Cálculo local caso os dados do app já estejam em memória
  const localResult = useMemo(() => {
    if (!hasLocalData || !options?.clients) return null;
    return computeClientRanking({
      clients: options.clients,
      loans: options.loans || [],
      payments: options.payments || [],
      installmentSchedules: options.installmentSchedules || [],
      renegotiations: options.renegotiations || [],
      rankingType,
      period,
      startDate,
      endDate,
      search,
      page,
      pageSize,
    });
  }, [
    hasLocalData,
    options?.clients,
    options?.loans,
    options?.payments,
    options?.installmentSchedules,
    options?.renegotiations,
    rankingType,
    period,
    startDate,
    endDate,
    search,
    page,
    pageSize,
  ]);

  // Query React Query remota caso não tenha dados locais
  const {
    data: remoteData,
    isLoading: isRemoteLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      "client-ranking",
      rankingType,
      period,
      startDate,
      endDate,
      search,
      page,
      pageSize,
    ],
    queryFn: () =>
      fetchClientRanking({
        rankingType,
        period,
        startDate,
        endDate,
        page,
        pageSize,
        search,
      }),
    enabled: !hasLocalData,
    staleTime: 1000 * 60 * 3,
    refetchOnWindowFocus: false,
  });

  const handleRankingTypeChange = (type: ClientRankingType) => {
    setRankingType(type);
    setPage(1);
  };

  const handlePeriodChange = (p: ClientRankingPeriod) => {
    setPeriod(p);
    setPage(1);
  };

  const handleSearchChange = (s: string) => {
    setSearch(s);
    setPage(1);
  };

  const activeData = hasLocalData ? localResult : remoteData;

  return {
    rankingType,
    setRankingType: handleRankingTypeChange,
    period,
    setPeriod: handlePeriodChange,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    search,
    setSearch: handleSearchChange,
    page,
    setPage,
    pageSize,
    setPageSize,
    selectedClient,
    setSelectedClient,
    items: activeData?.data ?? [],
    totalCount: activeData?.total_count ?? 0,
    totalPages: activeData?.total_pages ?? 0,
    isLoading: hasLocalData ? false : isRemoteLoading,
    isFetching: hasLocalData ? false : isFetching,
    error: error ? (error as Error).message : null,
    refetch,
  };
}
