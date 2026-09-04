import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchClientRanking } from "../services/clientRankingService";
import {
  ClientRankingType,
  ClientRankingPeriod,
  ClientRankingItem,
} from "../types/clientRanking";

export function useClientRanking() {
  const [rankingType, setRankingType] = useState<ClientRankingType>("best");
  const [period, setPeriod] = useState<ClientRankingPeriod>("all");
  const [startDate, setStartDate] = useState<string | undefined>();
  const [endDate, setEndDate] = useState<string | undefined>();
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [selectedClient, setSelectedClient] = useState<ClientRankingItem | null>(null);

  // Query React Query com cache inteligente
  const {
    data,
    isLoading,
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
    staleTime: 1000 * 60 * 3, // 3 minutos de cache
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
    items: data?.data ?? [],
    totalCount: data?.total_count ?? 0,
    totalPages: data?.total_pages ?? 0,
    isLoading,
    isFetching,
    error: error ? (error as Error).message : null,
    refetch,
  };
}
