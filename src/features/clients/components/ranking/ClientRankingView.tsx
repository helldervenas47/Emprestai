import { useClientRanking } from "../../hooks/useClientRanking";
import { ClientRankingFilters } from "./ClientRankingFilters";
import { ClientRankingCard } from "./ClientRankingCard";
import { ClientRankingDetailDialog } from "./ClientRankingDetailDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, ChevronLeft, ChevronRight, AlertCircle, Users } from "lucide-react";
import { Client, Loan, Payment, InstallmentSchedule } from "@/types/loan";

interface ClientRankingViewProps {
  clients?: Client[];
  loans?: Loan[];
  payments?: Payment[];
  installmentSchedules?: InstallmentSchedule[];
}

export function ClientRankingView({
  clients,
  loans,
  payments,
  installmentSchedules,
}: ClientRankingViewProps) {
  const {
    rankingType,
    setRankingType,
    period,
    setPeriod,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    search,
    setSearch,
    page,
    setPage,
    selectedClient,
    setSelectedClient,
    items,
    totalCount,
    totalPages,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useClientRanking({ clients, loans, payments, installmentSchedules });

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Tela */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Trophy className="h-6 w-6 text-amber-500" />
            Ranking de Clientes
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Acompanhe a performance, pontualidade e risco dos seus clientes.
          </p>
        </div>

        {totalCount > 0 && (
          <span className="text-xs text-muted-foreground self-start sm:self-auto bg-muted/50 px-2.5 py-1 rounded-full border border-border/50">
            {totalCount} cliente(s) no ranking
          </span>
        )}
      </div>

      {/* Filtros e Abas de Ranking */}
      <ClientRankingFilters
        rankingType={rankingType}
        onRankingTypeChange={setRankingType}
        period={period}
        onPeriodChange={setPeriod}
        search={search}
        onSearchChange={setSearch}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
      />

      {/* Estado: Carregando */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl border border-border/60 bg-card flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3 flex-1">
                <Skeleton className="w-7 h-7 rounded-full" />
                <Skeleton className="w-9 h-9 rounded-full" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
              <Skeleton className="h-6 w-28" />
            </div>
          ))}
        </div>
      )}

      {/* Estado: Erro */}
      {!isLoading && error && (
        <div className="p-8 rounded-xl border border-destructive/30 bg-destructive/5 text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-sm font-medium text-destructive">
            Não foi possível carregar o ranking de clientes no momento.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {/* Estado: Sem Dados */}
      {!isLoading && !error && items.length === 0 && (
        <div className="p-12 rounded-xl border border-dashed border-border bg-card/50 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto text-muted-foreground">
            <Users className="h-6 w-6" />
          </div>
          <h3 className="text-sm sm:text-base font-semibold text-foreground">
            Ainda não há dados suficientes para gerar este ranking.
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto">
            Cadastre clientes e registre empréstimos e pagamentos para acompanhar a performance.
          </p>
        </div>
      )}

      {/* Lista de Cards do Ranking */}
      {!isLoading && !error && items.length > 0 && (
        <div className="space-y-2.5">
          {items.map((item) => (
            <ClientRankingCard
              key={item.client_id}
              item={item}
              rankingType={rankingType}
              onClick={() => setSelectedClient(item)}
            />
          ))}
        </div>
      )}

      {/* Paginação do Servidor / Local */}
      {!isLoading && !error && totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
          <span className="text-xs text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage(page - 1)}
              className="h-8 text-xs"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isFetching}
              onClick={() => setPage(page + 1)}
              className="h-8 text-xs"
            >
              Próxima
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Dialog com Detalhes do Cliente Selecionado */}
      <ClientRankingDetailDialog
        item={selectedClient}
        onClose={() => setSelectedClient(null)}
      />
    </div>
  );
}
