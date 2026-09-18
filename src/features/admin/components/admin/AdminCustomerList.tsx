import React, { useState, useMemo } from "react";
import { 
  Search, 
  Filter, 
  ArrowUpDown, 
  Eye, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Sparkles,
  ChevronLeft,
  ChevronRight,
  User,
  RefreshCw
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AdminCustomerItem, CustomerUnifiedStatus } from "../../hooks/useAdminCustomersSubscribers";
import { CustomerDetailDrawer } from "./CustomerDetailDrawer";

interface AdminCustomerListProps {
  customers: AdminCustomerItem[];
  loading: boolean;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  planFilter: string;
  setPlanFilter: (s: string) => void;
  paymentMethodFilter: string;
  setPaymentMethodFilter: (s: string) => void;
  availablePlans: string[];
  onRefresh: () => void;
}

export function AdminCustomerList({
  customers,
  loading,
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  planFilter,
  setPlanFilter,
  paymentMethodFilter,
  setPaymentMethodFilter,
  availablePlans,
  onRefresh,
}: AdminCustomerListProps) {
  const [selectedCustomer, setSelectedCustomer] = useState<AdminCustomerItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Ordenação padrão: Alfabética por nome (A-Z)
  const [sortField, setSortField] = useState<keyof AdminCustomerItem>("display_name");
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (field: keyof AdminCustomerItem) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const handleOpenCustomer = (customer: AdminCustomerItem) => {
    setSelectedCustomer(customer);
    setIsDrawerOpen(true);
  };

  // Ordenar clientes
  const sortedCustomers = useMemo(() => {
    return [...customers].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortAsc 
          ? aVal.localeCompare(bVal, "pt-BR", { sensitivity: "base" }) 
          : bVal.localeCompare(aVal, "pt-BR", { sensitivity: "base" });
      }

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortAsc ? aVal - bVal : bVal - aVal;
      }

      return 0;
    });
  }, [customers, sortField, sortAsc]);

  // Paginar
  const totalItems = sortedCustomers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedCustomers.slice(start, start + pageSize);
  }, [sortedCustomers, currentPage, pageSize]);

  // Renderizador de Badge de Status
  const renderStatusBadge = (status: CustomerUnifiedStatus, label: string, isTrial: boolean) => {
    switch (status) {
      case "trial":
        return (
          <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-medium flex items-center gap-1 w-fit">
            <Sparkles className="w-3 h-3 text-blue-400" />
            {label}
          </Badge>
        );
      case "active":
        return (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-medium flex items-center gap-1 w-fit">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            {label}
          </Badge>
        );
      case "past_due":
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20 font-medium flex items-center gap-1 w-fit">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            {label}
          </Badge>
        );
      case "expired":
        return (
          <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/20 font-medium flex items-center gap-1 w-fit">
            <Clock className="w-3 h-3 text-orange-400" />
            {label}
          </Badge>
        );
      case "canceled":
        return (
          <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/20 font-medium flex items-center gap-1 w-fit">
            <XCircle className="w-3 h-3 text-rose-400" />
            {label}
          </Badge>
        );
      default:
        return <Badge variant="outline">{label}</Badge>;
    }
  };

  // Renderizador de Dias Restantes
  const renderDaysRemaining = (customer: AdminCustomerItem) => {
    if (customer.status === "trial") {
      if (customer.days_remaining > 0) {
        return (
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-blue-400">
              {customer.days_remaining} {customer.days_remaining === 1 ? "dia restante" : "dias restantes"}
            </span>
            <span className="text-[11px] text-muted-foreground">Teste gratuito</span>
          </div>
        );
      } else {
        return (
          <span className="text-xs font-medium text-orange-400">
            Teste expirado
          </span>
        );
      }
    }

    if (customer.status === "active") {
      if (customer.days_remaining > 0) {
        return (
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-emerald-400">
              {customer.days_remaining} {customer.days_remaining === 1 ? "dia restante" : "dias restantes"}
            </span>
            {customer.period_end && (
              <span className="text-[11px] text-muted-foreground">
                até {new Date(customer.period_end).toLocaleDateString("pt-BR")}
              </span>
            )}
          </div>
        );
      } else {
        return (
          <span className="text-xs font-medium text-muted-foreground">
            Acesso ativo
          </span>
        );
      }
    }

    if (customer.status === "past_due") {
      return (
        <span className="text-xs font-semibold text-amber-400">
          Pagamento pendente
        </span>
      );
    }

    if (customer.status === "expired") {
      return (
        <span className="text-xs font-medium text-muted-foreground">
          Período encerrado
        </span>
      );
    }

    return (
      <span className="text-xs font-medium text-rose-400/80">
        Cancelado
      </span>
    );
  };

  const formatCurrency = (val: number | null) => {
    if (val === null || val === undefined) return "-";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    try {
      return new Date(dateStr).toLocaleDateString("pt-BR");
    } catch {
      return "-";
    }
  };

  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Base de Usuários e Assinaturas
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Gerencie os status, dados cadastrais, planos contratados e histórico financeiro de cada usuário.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              className="gap-1.5"
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar Lista
            </Button>
          </div>
        </div>

        {/* Barra de Filtros */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-3 border-t border-border/60">
          {/* Busca */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, e-mail ou IDs..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9 bg-background/50 h-9 text-xs sm:text-sm"
            />
          </div>

          {/* Filtro Status */}
          <div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="bg-background/50 h-9 text-xs sm:text-sm">
                <SelectValue placeholder="Status: Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Status: Todos</SelectItem>
                <SelectItem value="active">🟢 Ativos</SelectItem>
                <SelectItem value="trial">🟣 Em Teste (Trial)</SelectItem>
                <SelectItem value="past_due">🟡 Inadimplentes</SelectItem>
                <SelectItem value="expired">🟠 Expirados</SelectItem>
                <SelectItem value="canceled">🔴 Cancelados</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Filtro Plano */}
          <div>
            <Select
              value={planFilter}
              onValueChange={(v) => {
                setPlanFilter(v);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="bg-background/50 h-9 text-xs sm:text-sm">
                <SelectValue placeholder="Plano: Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Plano: Todos</SelectItem>
                {availablePlans.map((plan) => (
                  <SelectItem key={plan} value={plan}>
                    {plan}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filtro Pagamento */}
          <div>
            <Select
              value={paymentMethodFilter}
              onValueChange={(v) => {
                setPaymentMethodFilter(v);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="bg-background/50 h-9 text-xs sm:text-sm">
                <SelectValue placeholder="Forma: Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Forma: Todas</SelectItem>
                <SelectItem value="PIX">PIX</SelectItem>
                <SelectItem value="CREDIT_CARD">Cartão de Crédito</SelectItem>
                <SelectItem value="BOLETO">Boleto Bancário</SelectItem>
                <SelectItem value="TRIAL">Trial Gratuito</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-[240px]">
                  <button 
                    onClick={() => handleSort("display_name")}
                    className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider hover:text-foreground"
                  >
                    Usuário
                    <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                  </button>
                </TableHead>
                <TableHead>
                  <button 
                    onClick={() => handleSort("status")}
                    className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider hover:text-foreground"
                  >
                    Status
                    <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                  </button>
                </TableHead>
                <TableHead>
                  <button 
                    onClick={() => handleSort("days_remaining")}
                    className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider hover:text-foreground"
                  >
                    Validade / Restante
                    <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                  </button>
                </TableHead>
                <TableHead>
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Plano & Ciclo
                  </span>
                </TableHead>
                <TableHead>
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Forma de Pag.
                  </span>
                </TableHead>
                <TableHead>
                  <button 
                    onClick={() => handleSort("last_payment_amount")}
                    className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider hover:text-foreground"
                  >
                    Último Pagamento
                    <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                  </button>
                </TableHead>
                <TableHead className="text-right w-[100px]">
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Ações
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="animate-pulse">
                    <TableCell colSpan={7} className="h-14 bg-muted/20 my-1" />
                  </TableRow>
                ))
              ) : paginatedCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Filter className="w-8 h-8 mb-2 opacity-40" />
                      <p className="font-medium text-sm">Nenhum usuário encontrado com os filtros selecionados.</p>
                      <p className="text-xs mt-1">Tente limpar os termos de busca ou mudar os filtros.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedCustomers.map((cust) => (
                  <TableRow 
                    key={cust.id} 
                    className="hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => handleOpenCustomer(cust)}
                  >
                    {/* Usuário */}
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-foreground truncate max-w-[220px]">
                          {cust.display_name}
                        </span>
                        <span className="text-xs text-muted-foreground truncate max-w-[220px]">
                          {cust.email}
                        </span>
                        {cust.username && (
                          <span className="text-[11px] text-muted-foreground/80">
                            @{cust.username}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      {renderStatusBadge(cust.status, cust.status_label, cust.is_trial)}
                    </TableCell>

                    {/* Validade / Restante */}
                    <TableCell>
                      {renderDaysRemaining(cust)}
                    </TableCell>

                    {/* Plano & Ciclo */}
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-foreground">
                          {cust.plan_name}
                        </span>
                        <span className="text-[11px] text-muted-foreground capitalize">
                          {cust.cycle}
                        </span>
                      </div>
                    </TableCell>

                    {/* Forma de Pagamento */}
                    <TableCell>
                      <Badge variant="secondary" className="text-xs font-normal">
                        {cust.payment_method}
                      </Badge>
                    </TableCell>

                    {/* Último Pagamento */}
                    <TableCell>
                      {cust.last_payment_amount !== null ? (
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-foreground">
                            {formatCurrency(cust.last_payment_amount)}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {formatDate(cust.last_payment_date)} ({cust.last_payment_status === "paid" ? "Pago" : cust.last_payment_status})
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>

                    {/* Ações */}
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2.5 text-xs gap-1 hover:bg-primary/10 hover:text-primary"
                        onClick={() => handleOpenCustomer(cust)}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Detalhes
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Rodapé e Paginação */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-border text-xs text-muted-foreground">
          <div>
            Exibindo <span className="font-semibold text-foreground">{paginatedCustomers.length}</span> de{" "}
            <span className="font-semibold text-foreground">{totalItems}</span> {totalItems === 1 ? "usuário" : "usuários"}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1 || loading}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span>
              Página <strong className="text-foreground">{currentPage}</strong> de{" "}
              <strong className="text-foreground">{totalPages}</strong>
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || loading}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>

      {/* Drawer de Detalhes do Cliente */}
      <CustomerDetailDrawer
        customer={selectedCustomer}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
      />
    </Card>
  );
}
