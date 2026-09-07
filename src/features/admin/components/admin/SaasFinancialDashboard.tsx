import React, { useState, useMemo } from "react";
import {
  useSaasFinancialMetrics,
  type PeriodFilterKey,
  type RecentTransactionItem,
} from "@/features/admin/hooks/useSaasFinancialMetrics";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
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

function getStatusBadge(status: string) {
  switch (status?.toLowerCase()) {
    case "paid":
    case "confirmed":
    case "received":
      return <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">Pago</Badge>;
    case "pending":
    case "creating":
      return <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20">Pendente</Badge>;
    case "revoked":
    case "refunded":
      return <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/20">Estornado</Badge>;
    case "canceled":
      return <Badge variant="outline" className="text-muted-foreground">Cancelado</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
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
    selectedCycle,
    setSelectedCycle,
    selectedStatus,
    setSelectedStatus,
  } = useSaasFinancialMetrics();

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const itemsPerPage = 15;

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

          {/* Seletor de Ciclo */}
          <Select value={selectedCycle} onValueChange={(v) => { setSelectedCycle(v); setPage(1); }}>
            <SelectTrigger className="w-[120px] h-9 text-xs">
              <SelectValue placeholder="Ciclo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos ciclos</SelectItem>
              <SelectItem value="monthly">Mensal</SelectItem>
              <SelectItem value="semestral">Semestral</SelectItem>
              <SelectItem value="annual">Anual</SelectItem>
            </SelectContent>
          </Select>

          {/* Seletor de Status */}
          <Select value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v); setPage(1); }}>
            <SelectTrigger className="w-[120px] h-9 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="paid">Pagos</SelectItem>
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
          <Button variant="outline" size="icon" onClick={refetch} disabled={loading} className="h-9 w-9 shrink-0" title="Atualizar dados">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin text-primary")} />
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

      {/* 2. Grid de Cards Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Faturamento do Período */}
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

        {/* Card 2: Receita Líquida após Estornos */}
        <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Receita Líquida (após estornos)</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {loading ? "..." : fmtCurrency(summary?.net_revenue)}
            </p>
            <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/40">
              {summary?.paid_orders_count || 0} {(summary?.paid_orders_count || 0) === 1 ? "pagamento aprovado" : "pagamentos aprovados"}
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Ticket Médio */}
        <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500" />
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Ticket Médio</span>
              <CreditCard className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {loading ? "..." : fmtCurrency(summary?.average_ticket)}
            </p>
            <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/40">
              Média por pedido aprovado
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Faturamento Pendente */}
        <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Cobranças Pendentes</span>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {loading ? "..." : fmtCurrency(summary?.pending_amount)}
            </p>
            <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/40">
              {summary?.pending_orders_count || 0} {(summary?.pending_orders_count || 0) === 1 ? "fatura aguardando" : "faturas aguardando"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Cards Secundários: MRR, ARPU e Estornos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* MRR */}
        <div className="bg-card/70 border border-border/50 p-4 rounded-2xl flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-xs text-muted-foreground font-medium">MRR (Recorrência Mensal)</span>
            <p className="text-lg font-bold text-foreground">{fmtCurrency(summary?.mrr)}</p>
            <p className="text-[10px] text-muted-foreground">Normalizado (Mensal, Semestral /6, Anual /12)</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
        </div>

        {/* ARPU */}
        <div className="bg-card/70 border border-border/50 p-4 rounded-2xl flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-xs text-muted-foreground font-medium">ARPU (Receita / Assinante)</span>
            <p className="text-lg font-bold text-foreground">{fmtCurrency(summary?.arpu)}</p>
            <p className="text-[10px] text-muted-foreground">{summary?.active_subscribers_count || 0} assinantes ativos</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Users className="h-5 w-5" />
          </div>
        </div>

        {/* Estornos / Reembolsos */}
        <div className="bg-card/70 border border-border/50 p-4 rounded-2xl flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-xs text-muted-foreground font-medium">Total Estornado / Chargebacks</span>
            <p className="text-lg font-bold text-rose-600 dark:text-rose-400">{fmtCurrency(summary?.refunds_amount)}</p>
            <p className="text-[10px] text-muted-foreground">Valores revogados no período</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <RotateCcw className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* 4. Gráficos de Evolução Diária e Mensal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gráfico 1: Evolução Diária */}
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Evolução Diária do Faturamento</span>
              <span className="text-xs font-normal text-muted-foreground">Período selecionado</span>
            </CardTitle>
            <CardDescription className="text-xs">Faturamento confirmado dia a dia</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-[220px] w-full">
              {data?.daily_evolution && data.daily_evolution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.daily_evolution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="grossGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(val) => {
                        const parts = val.split("-");
                        return `${parts[2]}/${parts[1]}`;
                      }}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(val) => `R$${val}`}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload || !payload.length) return null;
                        const item = payload[0].payload;
                        return (
                          <div className="bg-popover border border-border p-2.5 rounded-xl shadow-lg text-xs space-y-1">
                            <p className="font-semibold text-foreground">{label}</p>
                            <p className="text-primary">Bruto: {fmtCurrency(item.gross)}</p>
                            {item.refunds > 0 && <p className="text-rose-500">Estornos: {fmtCurrency(item.refunds)}</p>}
                            <p className="text-emerald-500 font-semibold">Líquido: {fmtCurrency(item.net)}</p>
                            <p className="text-[10px] text-muted-foreground">{item.count} pagamentos</p>
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="gross"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#grossGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  Nenhum faturamento confirmado neste período.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Gráfico 2: Evolução dos Últimos 12 Meses */}
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Histórico dos Últimos 12 Meses</span>
              <span className="text-xs font-normal text-muted-foreground">Consolidado Mensal</span>
            </CardTitle>
            <CardDescription className="text-xs">Faturamento bruto mês a mês</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-[220px] w-full">
              {data?.monthly_evolution && data.monthly_evolution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.monthly_evolution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(val) => `R$${val}`}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload || !payload.length) return null;
                        const item = payload[0].payload;
                        return (
                          <div className="bg-popover border border-border p-2.5 rounded-xl shadow-lg text-xs space-y-1">
                            <p className="font-semibold text-foreground">{item.month} ({label})</p>
                            <p className="text-primary font-medium">Bruto: {fmtCurrency(item.gross)}</p>
                            {item.refunds > 0 && <p className="text-rose-500">Estornos: {fmtCurrency(item.refunds)}</p>}
                            <p className="text-emerald-500 font-semibold">Líquido: {fmtCurrency(item.net)}</p>
                            <p className="text-[10px] text-muted-foreground">{item.count} pagamentos</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="gross" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  Sem dados consolidados nos últimos 12 meses.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 5. Distribuição por Plano e por Ciclo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Distribuição por Plano */}
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Receita por Plano</CardTitle>
            <CardDescription className="text-xs">Participação de cada plano no faturamento</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data?.plans_distribution && data.plans_distribution.length > 0 ? (
              data.plans_distribution.map((p) => (
                <div key={p.product_id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">{p.plan_name}</span>
                    <span className="text-muted-foreground">
                      {fmtCurrency(p.gross)} ({p.percentage}%) • {p.count} {p.count === 1 ? "venda" : "vendas"}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-muted/60 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, p.percentage))}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhum dado de planos no período.</p>
            )}
          </CardContent>
        </Card>

        {/* Distribuição por Ciclo */}
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Receita por Ciclo</CardTitle>
            <CardDescription className="text-xs">Mensal, Semestral e Anual</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data?.cycles_distribution && data.cycles_distribution.length > 0 ? (
              data.cycles_distribution.map((c) => (
                <div key={c.cycle} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">{c.cycle_label}</span>
                    <span className="text-muted-foreground">
                      {fmtCurrency(c.gross)} ({c.percentage}%) • Méd: {fmtCurrency(c.average_ticket)}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-muted/60 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, c.percentage))}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhum dado de ciclos no período.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 6. Tabela de Transações / Últimos Pagamentos */}
      <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
        <CardHeader className="p-4 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold">Últimas Transações ({filteredTransactions.length})</CardTitle>
            <CardDescription className="text-xs">Cobranças e pagamentos registrados no Asaas</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente, email ou ID..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                className="h-8 text-xs pl-8 w-full"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <tr className="border-b border-border/40 bg-muted/30 text-[11px]">
                  <TableHead className="py-2.5">Data Confirmação</TableHead>
                  <TableHead className="py-2.5">Cliente / Usuário</TableHead>
                  <TableHead className="py-2.5">Plano / Ciclo</TableHead>
                  <TableHead className="py-2.5">Método</TableHead>
                  <TableHead className="py-2.5">Status</TableHead>
                  <TableHead className="py-2.5 text-right">Valor</TableHead>
                  <TableHead className="py-2.5 text-right">Ação</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {paginatedTransactions.length > 0 ? (
                  paginatedTransactions.map((t) => (
                    <TableRow key={t.id} className="text-xs hover:bg-muted/30 transition-colors">
                      <TableCell className="py-2.5 text-muted-foreground whitespace-nowrap">
                        {fmtDateBR(t.credited_at || t.created_at)}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate max-w-[180px]">{t.user_name}</p>
                          {t.user_email && <p className="text-[10px] text-muted-foreground truncate max-w-[180px]">{t.user_email}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{t.plan_name}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{t.cycle === "monthly" ? "Mensal" : t.cycle === "semestral" ? "Semestral" : "Anual"}</p>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 whitespace-nowrap">
                        <span className="uppercase text-[10px] font-medium bg-muted/60 px-2 py-0.5 rounded-md text-foreground">
                          {t.checkout_kind || "PIX"}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 whitespace-nowrap">
                        {getStatusBadge(t.status)}
                      </TableCell>
                      <TableCell className="py-2.5 text-right font-semibold text-foreground tabular-nums whitespace-nowrap">
                        {fmtCurrency(t.amount)}
                      </TableCell>
                      <TableCell className="py-2.5 text-right whitespace-nowrap">
                        {t.invoice_url && (
                          <a
                            href={t.invoice_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" /> Fatura
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                      {loading ? "Carregando transações..." : "Nenhuma transação encontrada para os filtros selecionados."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t border-border/40 text-xs text-muted-foreground">
              <span>Página {page} de {totalPages}</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-7 text-xs px-2"
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-7 text-xs px-2"
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
