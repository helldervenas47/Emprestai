import React, { useState, useMemo } from "react";
import {
  useSaasFinancialMetrics,
  useAsaasBalance,
  type PeriodFilterKey,
  type RecentTransactionItem,
} from "@/features/admin/hooks/useSaasFinancialMetrics";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  CreditCard,
  Calendar,
  AlertTriangle,
  RotateCcw,
  Users,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  Search,
  Filter,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Eye,
  EyeOff,
  Info,
  Tag,
  Wallet,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";

function fmtCurrency(val?: number | null): string {
  if (val == null || isNaN(val)) return "R$ 0,00";
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDateBR(isoString?: string | null): string {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

export function SaasFinancialDashboard() {
  const {
    data,
    loading,
    error,
    refetch,
    environment,
    setEnvironment,
    periodKey,
    setPeriodKey,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    selectedPlanId,
    setSelectedPlanId,
    selectedCycle,
    setSelectedCycle,
    selectedStatus,
    setSelectedStatus,
  } = useSaasFinancialMetrics();

  // Saldo em Conta Asaas
  const {
    balance: asaasBalance,
    pendingBalance: asaasPendingBalance,
    retainedBalance: asaasRetainedBalance,
    loading: balanceLoading,
    isVisible: balanceVisible,
    toggleVisibility: toggleBalanceVisibility,
    refetch: refetchBalance,
  } = useAsaasBalance();

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [transactionsExpanded, setTransactionsExpanded] = useState(false);
  const itemsPerPage = 10;

  const summary = data?.summary;

  // Filtragem local da tabela de transações
  const filteredTransactions = useMemo(() => {
    if (!data?.recent_transactions) return [];
    if (!searchTerm.trim()) return data.recent_transactions;
    const term = searchTerm.toLowerCase();
    return data.recent_transactions.filter(
      (t) =>
        t.user_name.toLowerCase().includes(term) ||
        (t.user_email && t.user_email.toLowerCase().includes(term)) ||
        (t.payment_id && t.payment_id.toLowerCase().includes(term)) ||
        t.plan_name.toLowerCase().includes(term)
    );
  }, [data?.recent_transactions, searchTerm]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage) || 1;
  const paginatedTransactions = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return filteredTransactions.slice(start, start + itemsPerPage);
  }, [filteredTransactions, page]);

  if (error) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="py-8 flex flex-col items-center justify-center text-center space-y-3">
          <ShieldAlert className="h-10 w-10 text-destructive" />
          <p className="text-sm font-semibold text-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={refetch} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Tentar Novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* 1. Header com Título e Filtros Globais */}
        <div className="relative z-20 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card/60 p-4 rounded-2xl border border-border/50 backdrop-blur-sm shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" /> Faturamento do SaaS
              </h2>
              {environment === "live" ? (
                <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-semibold">
                  Produção (Live)
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-[10px] font-semibold animate-pulse">
                  Sandbox (Testes)
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Métricas de faturamento e assinaturas do EmprestAI via Asaas ({data?.timezone || "America/Sao_Paulo"}).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Seletor de Período */}
            <Select value={periodKey} onValueChange={(v) => { setPeriodKey(v as PeriodFilterKey); setPage(1); }}>
              <SelectTrigger className="w-[140px] h-9 text-xs">
                <Calendar className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="this_month">Este mês</SelectItem>
                <SelectItem value="last_month">Mês anterior</SelectItem>
                <SelectItem value="last_12_months">Últimos 12 meses</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>

            {/* Seletor de Plano */}
            <Select value={selectedPlanId} onValueChange={(v) => { setSelectedPlanId(v); setPage(1); }}>
              <SelectTrigger className="w-[125px] h-9 text-xs">
                <SelectValue placeholder="Todos os Planos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Planos</SelectItem>
                <SelectItem value="basico_plan">Básico</SelectItem>
                <SelectItem value="profissional_plan">Profissional</SelectItem>
                <SelectItem value="empresarial_plan">Empresarial</SelectItem>
              </SelectContent>
            </Select>

            {/* Seletor de Ciclo */}
            <Select value={selectedCycle} onValueChange={(v) => { setSelectedCycle(v); setPage(1); }}>
              <SelectTrigger className="w-[115px] h-9 text-xs">
                <SelectValue placeholder="Todos os Ciclos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Ciclos</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="semestral">Semestral</SelectItem>
                <SelectItem value="annual">Anual</SelectItem>
              </SelectContent>
            </Select>

            {/* Seletor de Status */}
            <Select value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v); setPage(1); }}>
              <SelectTrigger className="w-[115px] h-9 text-xs">
                <SelectValue placeholder="Todos Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="paid">Confirmados</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="revoked">Estornados</SelectItem>
              </SelectContent>
            </Select>

            {/* Seletor de Ambiente */}
            <Select value={environment} onValueChange={(v) => { setEnvironment(v as any); setPage(1); }}>
              <SelectTrigger className="w-[110px] h-9 text-xs">
                <SelectValue placeholder="Ambiente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="live">Live</SelectItem>
                <SelectItem value="sandbox">Sandbox</SelectItem>
              </SelectContent>
            </Select>

            {/* Botão Atualizar */}
            <Button variant="outline" size="icon" onClick={() => { refetch(); refetchBalance(); }} disabled={loading || balanceLoading} className="h-9 w-9 shrink-0" title="Atualizar dados">
              <RefreshCw className={cn("h-4 w-4", (loading || balanceLoading) && "animate-spin text-primary")} />
            </Button>
          </div>
        </div>

        {/* Inputs para Período Personalizado */}
        {periodKey === "custom" && (
          <div className="flex flex-wrap items-center gap-3 bg-muted/40 p-3 rounded-xl border border-border/50 text-xs">
            <span className="font-medium text-foreground">Intervalo personalizado:</span>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="h-8 text-xs w-36"
              />
              <span className="text-muted-foreground">até</span>
              <Input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="h-8 text-xs w-36"
              />
            </div>
          </div>
        )}

        {/* Alerta quando em Sandbox */}
        {environment === "sandbox" && (
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 p-3 rounded-xl text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Você está visualizando dados de <strong>Sandbox (Testes)</strong>. Esses valores não refletem o faturamento real da empresa.</span>
          </div>
        )}

        {/* 2. Card de Destaque: Saldo em Conta Asaas */}
        <Card className="rounded-2xl border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-card shadow-sm overflow-hidden relative">
          <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-primary/15 text-primary rounded-2xl">
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Saldo em Conta Asaas (Tempo Real)
                  </span>
                  <button
                    type="button"
                    onClick={toggleBalanceVisibility}
                    className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                    title={balanceVisible ? "Ocultar valores" : "Mostrar valores"}
                  >
                    {balanceVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <p className="text-3xl font-extrabold tracking-tight text-foreground">
                    {balanceLoading ? "..." : balanceVisible ? fmtCurrency(asaasBalance) : "R$ ••••••••"}
                  </p>
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    Disponível para saque / TED
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs pt-3 md:pt-0 border-t md:border-t-0 border-border/40">
              <div className="bg-background/80 px-3.5 py-2 rounded-xl border border-border/50">
                <span className="text-muted-foreground block text-[11px]">A Receber / Futuro</span>
                <span className="font-bold text-foreground">
                  {balanceLoading ? "..." : balanceVisible ? fmtCurrency(asaasPendingBalance) : "R$ ••••"}
                </span>
              </div>
              {asaasRetainedBalance > 0 && (
                <div className="bg-background/80 px-3.5 py-2 rounded-xl border border-border/50">
                  <span className="text-muted-foreground block text-[11px]">Retido / Bloqueado</span>
                  <span className="font-bold text-rose-500">
                    {balanceLoading ? "..." : balanceVisible ? fmtCurrency(asaasRetainedBalance) : "R$ ••••"}
                  </span>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={refetchBalance}
                disabled={balanceLoading}
                className="h-8 text-xs gap-1.5 rounded-xl"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", balanceLoading && "animate-spin")} />
                Atualizar Saldo
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 3. Grid Principal de Receita: Bruto -> Descontos -> Estornos -> Líquido */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Faturamento Bruto */}
          <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium">Faturamento Bruto</span>
                <DollarSign className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-bold tracking-tight text-foreground">
                {loading ? "..." : fmtCurrency(summary?.gross_revenue)}
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                {summary && summary.month_growth_pct !== 0 && (
                  <span
                    className={cn(
                      "font-semibold flex items-center gap-0.5",
                      summary.month_growth_pct > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                    )}
                  >
                    {summary.month_growth_pct > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(summary.month_growth_pct)}%
                  </span>
                )}
                <span>vs. mês anterior ({fmtCurrency(summary?.previous_month_gross)})</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Descontos do App */}
          <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium">Descontos Concedidos</span>
                <Tag className="h-4 w-4 text-amber-500" />
              </div>
              <p className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                {loading ? "..." : `− ${fmtCurrency(summary?.app_discounts)}`}
              </p>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                <span>Abatimentos comerciais e planos</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Estornos */}
          <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500" />
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium">Estornos / Chargebacks</span>
                <RotateCcw className="h-4 w-4 text-rose-500" />
              </div>
              <p className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
                {loading ? "..." : `− ${fmtCurrency(summary?.refunds_amount)}`}
              </p>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                <span>Valores devolvidos no período</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Receita Líquida */}
          <Card className="rounded-2xl border-emerald-500/40 bg-emerald-500/5 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-500" />
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Receita Líquida</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-muted-foreground hover:text-foreground">
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs p-2.5">
                      Faturamento bruto menos descontos concedidos pelo EmprestAI e valores estornados.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
                {loading ? "..." : fmtCurrency(summary?.net_revenue)}
              </p>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground pt-1 border-t border-emerald-500/20">
                <span>Bruto − Descontos − Estornos</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 4. Métricas Secundárias do SaaS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="rounded-2xl border-border/50 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-muted-foreground font-medium">Ticket Médio (Bruto)</span>
                <p className="text-xl font-bold text-foreground mt-0.5">
                  {loading ? "..." : fmtCurrency(summary?.average_ticket)}
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {summary?.paid_orders_count || 0} pedidos confirmados
                </span>
              </div>
              <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
                <CreditCard className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-muted-foreground font-medium">Cobranças Pendentes</span>
                <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                  {loading ? "..." : fmtCurrency(summary?.pending_amount)}
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {summary?.pending_orders_count || 0} faturas aguardando
                </span>
              </div>
              <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-xl">
                <Clock className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground font-medium">MRR Recorrente</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-muted-foreground hover:text-foreground">
                        <Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs p-2">
                      Monthly Recurring Revenue: Receita mensal recorrente normalizada de todas as assinaturas ativas.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-xl font-bold text-foreground mt-0.5">
                  {loading ? "..." : fmtCurrency(summary?.mrr)}
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {summary?.active_subscribers_count || 0} assinantes ativos
                </span>
              </div>
              <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-xl">
                <Users className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground font-medium">ARPU Médio</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-muted-foreground hover:text-foreground">
                        <Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs p-2">
                      Average Revenue Per User: Receita média mensal por usuário ativo (MRR ÷ Assinantes).
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-xl font-bold text-foreground mt-0.5">
                  {loading ? "..." : fmtCurrency(summary?.arpu)}
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {summary?.active_trials_count || 0} trials em andamento
                </span>
              </div>
              <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-xl">
                <Sparkles className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 5. Gráficos Financeiros com Legendas Claras */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico 1: Evolução Diária */}
          <Card className="rounded-2xl border-border/50 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span>Evolução Diária (Período Selecionado)</span>
                <Badge variant="outline" className="text-[10px]">
                  Bruto vs. Líquido
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Faturamento bruto diário e receita líquida após descontos e estornos.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="h-64 w-full">
                {data?.daily_evolution && data.daily_evolution.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.daily_evolution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="grossGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `R$${v}`} />
                      <RechartsTooltip
                        formatter={(val: any, name: string) => [
                          fmtCurrency(Number(val)),
                          name === "gross" ? "Faturamento Bruto" : name === "net" ? "Receita Líquida" : name === "refunds" ? "Estornos" : name,
                        ]}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11 }}
                        formatter={(value) => (value === "gross" ? "Faturamento Bruto" : value === "net" ? "Receita Líquida" : "Estornos")}
                      />
                      <Area type="monotone" dataKey="gross" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#grossGrad)" name="gross" strokeWidth={2} />
                      <Area type="monotone" dataKey="net" stroke="#10b981" fillOpacity={1} fill="url(#netGrad)" name="net" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                    Nenhuma movimentação financeira confirmada no período.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Gráfico 2: Evolução Mensal (Últimos 12 meses) */}
          <Card className="rounded-2xl border-border/50 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span>Histórico Mensal (Últimos 12 Meses)</span>
                <Badge variant="outline" className="text-[10px]">
                  Anual
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Comparativo de receita bruta e líquida confirmada mês a mês.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="h-64 w-full">
                {data?.monthly_evolution && data.monthly_evolution.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.monthly_evolution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `R$${v}`} />
                      <RechartsTooltip
                        formatter={(val: any, name: string) => [
                          fmtCurrency(Number(val)),
                          name === "gross" ? "Faturamento Bruto" : "Receita Líquida",
                        ]}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11 }}
                        formatter={(value) => (value === "gross" ? "Faturamento Bruto" : "Receita Líquida")}
                      />
                      <Bar dataKey="gross" fill="hsl(var(--primary)/0.6)" name="gross" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="net" fill="#10b981" name="net" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                    Sem dados históricos suficientes para os últimos 12 meses.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 6. Distribuição por Plano e Ciclo */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Distribuição por Plano */}
          <Card className="rounded-2xl border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Desempenho por Plano</CardTitle>
              <CardDescription className="text-xs">
                Faturamento bruto, descontos concedidos e receita líquida gerada por cada plano.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data?.plans_distribution && data.plans_distribution.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table className="min-w-[480px]">
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead className="whitespace-nowrap">Plano</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Bruto</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Descontos</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Líquido</TableHead>
                        <TableHead className="text-right whitespace-nowrap">% Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.plans_distribution.map((p, idx) => (
                        <TableRow key={idx} className="text-xs">
                          <TableCell className="font-semibold text-foreground whitespace-nowrap">
                            {p.plan_name}
                            <span className="block text-[10px] text-muted-foreground font-normal whitespace-nowrap">
                              {p.count} assinaturas
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium text-foreground whitespace-nowrap">
                            {fmtCurrency(p.gross)}
                          </TableCell>
                          <TableCell className="text-right text-amber-600 dark:text-amber-400 whitespace-nowrap">
                            {p.discounts > 0 ? `− ${fmtCurrency(p.discounts)}` : "R$ 0,00"}
                          </TableCell>
                          <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                            {fmtCurrency(p.net)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                            {p.percentage}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Nenhum plano registrou faturamento no período.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Distribuição por Ciclo de Cobrança */}
          <Card className="rounded-2xl border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Distribuição por Ciclo de Pagamento</CardTitle>
              <CardDescription className="text-xs">
                Adesão dos clientes entre os ciclos Mensal, Semestral e Anual.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data?.cycles_distribution && data.cycles_distribution.length > 0 ? (
                <div className="space-y-4">
                  {data.cycles_distribution.map((c, idx) => (
                    <div key={idx} className="space-y-1.5 bg-muted/20 p-3 rounded-xl border border-border/40">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-foreground flex items-center gap-1.5">
                          {c.cycle_label}
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {c.count} transações
                          </Badge>
                        </span>
                        <div className="text-right">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 block">
                            {fmtCurrency(c.net)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            Bruto: {fmtCurrency(c.gross)} ({c.percentage}%)
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-muted/60 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-primary h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(c.percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Nenhuma transação por ciclo no período.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 7. Tabela de Transações com Busca e Paginação (Colapsável) */}
        <Card className="rounded-2xl border-border/50 shadow-sm transition-all overflow-hidden">
          <CardHeader
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer select-none hover:bg-muted/20 transition-colors"
            onClick={() => setTransactionsExpanded((prev) => !prev)}
          >
            <div className="flex items-center justify-between w-full sm:w-auto">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                  <CreditCard className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-semibold">Transações do Período</CardTitle>
                    {filteredTransactions.length > 0 && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {filteredTransactions.length}
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs">
                    Histórico detalhado das ordens e cobranças processadas pelo Asaas.
                  </CardDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground shrink-0 sm:hidden"
                onClick={(e) => {
                  e.stopPropagation();
                  setTransactionsExpanded((prev) => !prev);
                }}
              >
                {transactionsExpanded ? (
                  <span className="flex items-center gap-1 font-medium text-xs">
                    Recolher <ChevronUp className="h-4 w-4" />
                  </span>
                ) : (
                  <span className="flex items-center gap-1 font-medium text-xs">
                    Expandir <ChevronDown className="h-4 w-4" />
                  </span>
                )}
              </Button>
            </div>

            <div className="hidden sm:flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs gap-1.5"
                onClick={(e) => {
                  e.stopPropagation();
                  setTransactionsExpanded((prev) => !prev);
                }}
              >
                {transactionsExpanded ? (
                  <>
                    <span>Recolher</span>
                    <ChevronUp className="h-3.5 w-3.5" />
                  </>
                ) : (
                  <>
                    <span>Expandir</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </div>
          </CardHeader>

          {transactionsExpanded && (
            <CardContent className="space-y-4 pt-0">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar por cliente, plano..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                  className="pl-8 h-8 text-xs rounded-xl"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              {paginatedTransactions.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead className="whitespace-nowrap">Cliente</TableHead>
                        <TableHead className="whitespace-nowrap">Plano / Ciclo</TableHead>
                        <TableHead className="whitespace-nowrap">Valor Original</TableHead>
                        <TableHead className="whitespace-nowrap">Desconto</TableHead>
                        <TableHead className="whitespace-nowrap">Valor Pago</TableHead>
                        <TableHead className="whitespace-nowrap">Status</TableHead>
                        <TableHead className="whitespace-nowrap">Data Efetiva</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Fatura</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedTransactions.map((t) => (
                        <TableRow key={t.id} className="text-xs">
                          <TableCell className="font-semibold text-foreground whitespace-nowrap">
                            {t.user_name}
                            {t.payment_id && (
                              <span className="block text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                                {t.payment_id}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <span className="font-medium text-foreground">{t.plan_name}</span>
                            <span className="block text-[10px] text-muted-foreground capitalize whitespace-nowrap">
                              {t.cycle === "annual" ? "Anual" : t.cycle === "semestral" ? "Semestral" : "Mensal"} • {t.checkout_kind.toUpperCase()}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {fmtCurrency(t.original_amount || t.amount)}
                          </TableCell>
                          <TableCell className="text-amber-600 dark:text-amber-400 whitespace-nowrap">
                            {t.discount_amount > 0 ? `− ${fmtCurrency(t.discount_amount)}` : "—"}
                          </TableCell>
                          <TableCell className="font-bold text-foreground whitespace-nowrap">
                            {fmtCurrency(t.amount)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {t.status === "paid" ? (
                              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] whitespace-nowrap">
                                Confirmado
                              </Badge>
                            ) : t.status === "pending" ? (
                              <Badge variant="secondary" className="text-amber-600 dark:text-amber-400 text-[10px] whitespace-nowrap">
                                Pendente
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px] whitespace-nowrap">
                                Estornado
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {fmtDateBR(t.credited_at || t.revoked_at || t.created_at)}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {t.invoice_url ? (
                              <a
                                href={t.invoice_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:underline text-[11px] whitespace-nowrap"
                              >
                                Ver <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground text-[10px]">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Paginação */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4 text-xs text-muted-foreground border-t border-border/40 mt-4">
                      <span>
                        Página {page} de {totalPages} ({filteredTransactions.length} transações)
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.max(p - 1, 1))}
                          disabled={page === 1}
                          className="h-8 text-xs"
                        >
                          Anterior
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                          disabled={page === totalPages}
                          className="h-8 text-xs"
                        >
                          Próxima
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Nenhuma transação encontrada para os filtros aplicados.
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </div>
    </TooltipProvider>
  );
}
