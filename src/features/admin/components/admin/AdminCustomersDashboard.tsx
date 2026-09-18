import React from "react";
import { useAdminCustomersSubscribers } from "@/features/admin/hooks/useAdminCustomersSubscribers";
import { CustomerMetricsCards } from "./CustomerMetricsCards";
import { AdminCustomerList } from "./AdminCustomerList";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Users, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function AdminCustomersDashboard() {
  const {
    customers: adminCustomers,
    summaryMetrics: customerSummary,
    loading: customersLoading,
    reconciling,
    syncWithAsaas,
    searchTerm: customerSearchTerm,
    setSearchTerm: setCustomerSearchTerm,
    statusFilter: customerStatusFilter,
    setStatusFilter: setCustomerStatusFilter,
    planFilter: customerPlanFilter,
    setPlanFilter: setCustomerPlanFilter,
    paymentMethodFilter: customerPaymentMethodFilter,
    setPaymentMethodFilter: setCustomerPaymentMethodFilter,
    availablePlans: customerAvailablePlans,
    refetch: refetchCustomers,
  } = useAdminCustomersSubscribers();

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Seção de Clientes */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card/60 p-4 rounded-2xl border border-border/50 backdrop-blur-sm shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-bold tracking-tight text-foreground">
              Gestão de Clientes & Assinaturas
            </h3>
            {(customerSummary?.totalCustomers ?? 0) > 0 && (
              <Badge variant="secondary" className="px-2 py-0.5 text-xs font-bold">
                {customerSummary?.totalCustomers} clientes
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Acompanhe a base de clientes, períodos de teste gratuito, planos vigentes e status financeiro unificado.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto pt-1 sm:pt-0">
          <Button
            variant="outline"
            size="sm"
            onClick={syncWithAsaas}
            disabled={reconciling}
            className="w-full sm:w-auto h-9 text-xs gap-1.5 rounded-xl border-primary/30 hover:bg-primary/10 text-primary font-medium justify-center"
            title="Sincronizar base de dados com as assinaturas e clientes do Asaas"
          >
            <RefreshCw className={cn("h-4 w-4", reconciling && "animate-spin")} />
            <span>{reconciling ? "Sincronizando com Asaas..." : "Sincronizar com Asaas"}</span>
          </Button>
        </div>
      </div>

      {/* Cards de Resumo e Conversão */}
      <CustomerMetricsCards
        metrics={customerSummary}
        loading={customersLoading}
        activeStatusFilter={customerStatusFilter}
        onFilterStatus={setCustomerStatusFilter}
      />

      {/* Tabela de Clientes */}
      <AdminCustomerList
        customers={adminCustomers}
        loading={customersLoading}
        searchTerm={customerSearchTerm}
        setSearchTerm={setCustomerSearchTerm}
        statusFilter={customerStatusFilter}
        setStatusFilter={setCustomerStatusFilter}
        planFilter={customerPlanFilter}
        setPlanFilter={setCustomerPlanFilter}
        paymentMethodFilter={customerPaymentMethodFilter}
        setPaymentMethodFilter={setCustomerPaymentMethodFilter}
        availablePlans={customerAvailablePlans}
        onRefresh={refetchCustomers}
      />
    </div>
  );
}
