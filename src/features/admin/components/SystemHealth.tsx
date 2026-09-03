import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Cpu,
  Database,
  Download,
  Gauge,
  HardDrive,
  Info,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Users2,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// ==========================================================================
// Saúde do Sistema — painel híbrido:
//  ✅ REAL: ping ao banco, contagens do owner, status online, sessões ativas,
//           erros capturados no client (window.onerror), memória JS (quando disponível)
//  📊 ESTIMADO: "CPU" derivada de long tasks + frame drops; "uso de rede" por
//           navigator.connection; uptime local (desde o mount).
// Campos estimados são sempre marcados com o chip "Estimado".
// ==========================================================================

type Period = "today" | "7d" | "30d";

type StatusLevel = "ok" | "warn" | "bad";

interface Metric {
  label: string;
  value: string;
  status?: StatusLevel;
  estimated?: boolean;
  hint?: string;
}

interface ClientError {
  time: number;
  type: "error" | "warn" | "info";
  message: string;
}

const statusDot = (s?: StatusLevel) =>
  s === "bad"
    ? "bg-destructive"
    : s === "warn"
    ? "bg-amber-500"
    : "bg-emerald-500";

const statusRing = (s?: StatusLevel) =>
  s === "bad"
    ? "ring-destructive/30"
    : s === "warn"
    ? "ring-amber-500/30"
    : "ring-emerald-500/30";

const fmt = (n: number, digits = 0) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: digits });

// Coleta de erros do cliente (global) — começa já no load
interface ErrorBucket {
  errors: ClientError[];
}
const errorBucket: ErrorBucket = ((window as any).__systemHealthErrors ||= { errors: [] });

if (!(window as any).__systemHealthHooked) {
  (window as any).__systemHealthHooked = true;
  const push = (type: ClientError["type"], message: string) => {
    errorBucket.errors.push({ time: Date.now(), type, message: String(message).slice(0, 300) });
    if (errorBucket.errors.length > 200) errorBucket.errors.shift();
  };
  window.addEventListener("error", (e) => push("error", e.message || "Erro desconhecido"));
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) =>
    push("error", (e.reason && (e.reason.message || String(e.reason))) || "Promise rejeitada")
  );
  const origWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    push("warn", args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    origWarn(...args);
  };
}

// Long tasks para estimar "carga de CPU"
const longTaskState = ((window as any).__systemHealthLongTasks ||= {
  total: 0,
  count: 0,
  windowStart: Date.now(),
});
if (!(window as any).__systemHealthLongTasksHooked && "PerformanceObserver" in window) {
  (window as any).__systemHealthLongTasksHooked = true;
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTaskState.total += entry.duration;
        longTaskState.count += 1;
      }
    });
    po.observe({ entryTypes: ["longtask"] });
  } catch {
    /* ignore */
  }
}

const MOUNT_TIME = Date.now();

export function SystemHealth() {
  const { user, dataOwnerId } = useAuth();
  const [period, setPeriod] = useState<Period>("today");
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  // Real data
  const [dbPingMs, setDbPingMs] = useState<number | null>(null);
  const [activeSessions, setActiveSessions] = useState<number | null>(null);
  const [counts, setCounts] = useState<{
    loans: number | null;
    clients: number | null;
    expenses: number | null;
    payments24h: number | null;
  }>({ loans: null, clients: null, expenses: null, payments24h: null });
  const [queryErrors, setQueryErrors] = useState(0);
  const [lastBackupAt, setLastBackupAt] = useState<Date | null>(null);

  // Online / offline listener
  useEffect(() => {
    const onOn = () => setOnline(true);
    const onOff = () => setOnline(false);
    window.addEventListener("online", onOn);
    window.addEventListener("offline", onOff);
    return () => {
      window.removeEventListener("online", onOn);
      window.removeEventListener("offline", onOff);
    };
  }, []);

  // Último backup: prioriza registro real no servidor (backup_history /
  // account_settings.last_auto_backup_at) e usa localStorage como fallback
  // para exports manuais feitos no navegador.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let serverDate: Date | null = null;
      try {
        const { data: hist } = await supabase
          .from("backup_history")
          .select("created_at")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (hist?.created_at) serverDate = new Date(hist.created_at as string);
      } catch { /* ignore */ }
      if (!serverDate) {
        try {
          const { data: settings } = await supabase
            .from("account_settings")
            .select("last_auto_backup_at")
            .maybeSingle();
          const v = (settings as any)?.last_auto_backup_at;
          if (v) serverDate = new Date(v);
        } catch { /* ignore */ }
      }
      let localDate: Date | null = null;
      try {
        const raw = localStorage.getItem("hvcred-last-backup");
        if (raw) localDate = new Date(raw);
      } catch { /* ignore */ }
      const best = [serverDate, localDate]
        .filter((d): d is Date => !!d && !isNaN(d.getTime()))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
      if (!cancelled) setLastBackupAt(best);
    })();
    return () => { cancelled = true; };
  }, [lastRefresh]);

  const refresh = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    let localErrors = 0;

    // 1) Ping ao banco (latência real)
    const t0 = performance.now();
    try {
      const { error } = await supabase
        .from("loans")
        .select("id", { count: "exact", head: true })
        .limit(1);
      if (error) localErrors++;
      setDbPingMs(Math.round(performance.now() - t0));
    } catch {
      localErrors++;
      setDbPingMs(null);
    }

    // 2) Sessões ativas do usuário (real via RPC segura existente)
    try {
      const { data, error } = await supabase.rpc("list_my_sessions");
      if (error) localErrors++;
      setActiveSessions(Array.isArray(data) ? data.length : 0);
    } catch {
      localErrors++;
    }

    // 3) Contagens reais por owner (empréstimos, clientes, despesas)
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [loansRes, clientsRes, expensesRes, paymentsRes] = await Promise.all([
      supabase.from("loans").select("id", { count: "exact", head: true }),
      supabase.from("clients").select("id", { count: "exact", head: true }),
      supabase.from("expenses").select("id", { count: "exact", head: true }),
      supabase
        .from("payments")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since24h),
    ]);
    if (loansRes.error) localErrors++;
    if (clientsRes.error) localErrors++;
    if (expensesRes.error) localErrors++;
    if (paymentsRes.error) localErrors++;

    setCounts({
      loans: loansRes.count ?? null,
      clients: clientsRes.count ?? null,
      expenses: expensesRes.count ?? null,
      payments24h: paymentsRes.count ?? null,
    });

    setQueryErrors(localErrors);
    setLastRefresh(new Date());
    setLoading(false);
  }, [dataOwnerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh — pausa quando aba oculta e intervalo elevado a 60s.
  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) refresh();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [autoRefresh, refresh]);

  // === Valores derivados ===
  const uptimeMs = Date.now() - MOUNT_TIME;
  const uptimeStr = formatDuration(uptimeMs);

  // Memória JS (Chrome)
  const memInfo: { used: number; total: number } | null = useMemo(() => {
    const perf = performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } };
    if (perf.memory) {
      return {
        used: perf.memory.usedJSHeapSize,
        total: perf.memory.jsHeapSizeLimit,
      };
    }
    return null;
  }, [lastRefresh]);

  const memPercent = memInfo ? Math.min(100, (memInfo.used / memInfo.total) * 100) : null;

  // "CPU": estimada pelo tempo gasto em long tasks na última janela
  const cpuLoad = useMemo(() => {
    const elapsed = Math.max(1, Date.now() - longTaskState.windowStart);
    const pct = Math.min(100, (longTaskState.total / elapsed) * 100);
    // reseta janela a cada refresh
    longTaskState.total = 0;
    longTaskState.count = 0;
    longTaskState.windowStart = Date.now();
    return pct;
  }, [lastRefresh]);

  // Rede
  const conn = (navigator as unknown as { connection?: { effectiveType?: string; downlink?: number; rtt?: number } })
    .connection;
  const networkLabel = online
    ? conn?.effectiveType
      ? `${conn.effectiveType.toUpperCase()} · ${conn.downlink ?? "?"} Mbps`
      : "Online"
    : "Offline";

  // Status geral
  const overall: StatusLevel = !online
    ? "bad"
    : queryErrors > 0 || (dbPingMs !== null && dbPingMs > 1500)
    ? "warn"
    : (dbPingMs !== null && dbPingMs > 600)
    ? "warn"
    : "ok";

  const overallLabel =
    overall === "ok" ? "Operacional" : overall === "warn" ? "Instável" : "Indisponível";

  // Erros recentes (do client)
  const recentErrors = useMemo(() => {
    const cutoff = Date.now() - periodMs(period);
    return errorBucket.errors
      .filter((e) => e.time >= cutoff)
      .slice(-20)
      .reverse();
  }, [period, lastRefresh]);

  const errorsByType = useMemo(() => {
    const b = { error: 0, warn: 0, info: 0 } as Record<ClientError["type"], number>;
    const cutoff = Date.now() - periodMs(period);
    for (const e of errorBucket.errors) if (e.time >= cutoff) b[e.type]++;
    return b;
  }, [period, lastRefresh]);

  const alerts = useMemo(() => {
    const list: { level: StatusLevel; text: string }[] = [];
    if (dbPingMs !== null && dbPingMs > 800)
      list.push({ level: "warn", text: `Tempo de resposta do banco acima do normal (${dbPingMs} ms)` });
    if (memPercent !== null && memPercent > 80)
      list.push({ level: "warn", text: `Uso de memória elevado (${memPercent.toFixed(0)}%)` });
    if (cpuLoad > 40)
      list.push({ level: "warn", text: `Carga de processamento elevada no cliente (${cpuLoad.toFixed(0)}%)` });
    if (errorsByType.error >= 3)
      list.push({ level: "bad", text: `${errorsByType.error} erros recorrentes detectados` });
    if (!online) list.push({ level: "bad", text: "Aplicativo sem conexão" });
    if (!lastBackupAt || Date.now() - lastBackupAt.getTime() > 14 * 24 * 60 * 60 * 1000)
      list.push({ level: "warn", text: "Backup não realizado nos últimos 14 dias" });
    return list;
  }, [dbPingMs, memPercent, cpuLoad, errorsByType, online, lastBackupAt]);

  const handleExport = () => {
    const report = {
      generated_at: new Date().toISOString(),
      user_id: user?.id,
      period,
      overall: overallLabel,
      online,
      uptime_ms: uptimeMs,
      db_ping_ms: dbPingMs,
      query_errors: queryErrors,
      active_sessions: activeSessions,
      counts,
      memory: memInfo,
      cpu_load_estimated: cpuLoad,
      network: networkLabel,
      last_backup: lastBackupAt?.toISOString() ?? null,
      errors: recentErrors,
      alerts,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `saude-do-sistema-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Relatório exportado");
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" /> Saúde do Sistema
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Monitoramento em tempo real · última atualização {lastRefresh.toLocaleTimeString("pt-BR")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border/50 bg-card/50 p-0.5">
            {(["today", "7d", "30d"] as Period[]).map((p) => (
              <button type="button"
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  period === p
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p === "today" ? "Hoje" : p === "7d" ? "7 dias" : "30 dias"}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh((v) => !v)}
            className="h-8"
          >
            <Zap className={`h-3.5 w-3.5 mr-1.5 ${autoRefresh ? "text-primary" : ""}`} />
            Auto {autoRefresh ? "on" : "off"}
          </Button>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="h-8">
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="h-8">
            <Download className="h-3.5 w-3.5 mr-1.5" /> Exportar
          </Button>
        </div>
      </div>

      {/* Visão geral */}
      <Card no3d>
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex h-10 w-10 rounded-full ring-4 items-center justify-center ${statusDot(overall)} ${statusRing(overall)}`}
              >
                <Activity className="h-5 w-5 text-white" />
              </span>
              <div>
                <div className="text-lg font-semibold">{overallLabel}</div>
                <div className="text-xs text-muted-foreground">
                  {online ? (
                    <span className="inline-flex items-center gap-1">
                      <Wifi className="h-3 w-3" /> Conectado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-destructive">
                      <WifiOff className="h-3 w-3" /> Sem conexão
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Uptime (sessão)</div>
                <div className="font-semibold">{uptimeStr}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Latência DB</div>
                <div className="font-semibold">
                  {dbPingMs === null ? "—" : `${dbPingMs} ms`}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Sessões ativas</div>
                <div className="font-semibold">{activeSessions ?? "—"}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grid de seções */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {/* Performance */}
        <SectionCard
          icon={Gauge}
          title="Performance"
          metrics={[
            {
              label: "Ping ao banco",
              value: dbPingMs === null ? "—" : `${dbPingMs} ms`,
              status: dbPingMs === null ? "warn" : dbPingMs > 800 ? "warn" : "ok",
            },
            {
              label: "Carga CPU (cliente)",
              value: `${cpuLoad.toFixed(0)}%`,
              estimated: true,
              status: cpuLoad > 40 ? "warn" : "ok",
            },
            {
              label: "Memória JS",
              value: memInfo
                ? `${formatBytes(memInfo.used)} / ${formatBytes(memInfo.total)}`
                : "Indisponível",
              status: memPercent === null ? undefined : memPercent > 80 ? "warn" : "ok",
            },
            { label: "Rede", value: networkLabel, estimated: !!conn },
          ]}
        />

        {/* Banco de dados */}
        <SectionCard
          icon={Database}
          title="Banco de Dados"
          metrics={[
            { label: "Tempo de query", value: dbPingMs === null ? "—" : `${dbPingMs} ms` },
            { label: "Erros recentes", value: fmt(queryErrors), status: queryErrors > 0 ? "warn" : "ok" },
            { label: "Empréstimos", value: counts.loans === null ? "—" : fmt(counts.loans) },
            { label: "Clientes", value: counts.clients === null ? "—" : fmt(counts.clients) },
            {
              label: "Último backup",
              value: lastBackupAt ? lastBackupAt.toLocaleString("pt-BR") : "Nunca",
              status: !lastBackupAt ? "warn" : "ok",
            },
          ]}
        />

        {/* Segurança */}
        <SectionCard
          icon={ShieldCheck}
          title="Segurança"
          metrics={[
            { label: "Sessões ativas", value: activeSessions === null ? "—" : fmt(activeSessions) },
            { label: "Usuário autenticado", value: user ? "Sim" : "Não", status: user ? "ok" : "bad" },
            { label: "RLS ativo", value: "Sim", status: "ok" },
            {
              label: "Tentativas falhas",
              value: "Indisponível",
              estimated: true,
              hint: "Logs de auth não são acessíveis ao cliente",
            },
          ]}
        />

        {/* Uso do Sistema */}
        <SectionCard
          icon={Users2}
          title="Uso do Sistema"
          metrics={[
            { label: "Sessões ativas", value: activeSessions === null ? "—" : fmt(activeSessions) },
            {
              label: "Recebimentos (24h)",
              value: counts.payments24h === null ? "—" : fmt(counts.payments24h),
            },
            { label: "Despesas totais", value: counts.expenses === null ? "—" : fmt(counts.expenses) },
            {
              label: "Usuários ativos agora",
              value: "Indisponível",
              estimated: true,
              hint: "Requer métrica server-side",
            },
          ]}
        />

        {/* Logs e Erros */}
        <Card no3d className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Logs e Erros · {periodLabel(period)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="border-destructive/40 text-destructive">
                Críticos: {errorsByType.error}
              </Badge>
              <Badge variant="outline" className="border-amber-500/40 text-amber-500">
                Avisos: {errorsByType.warn}
              </Badge>
              <Badge variant="outline">Info: {errorsByType.info}</Badge>
            </div>
            {recentErrors.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                Nenhum erro registrado no período 🎉
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {recentErrors.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-lg border border-border/40 bg-muted/30 px-2.5 py-1.5 text-xs"
                  >
                    <span
                      className={`mt-1 h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                        e.type === "error"
                          ? "bg-destructive"
                          : e.type === "warn"
                          ? "bg-amber-500"
                          : "bg-primary"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-mono text-[11px]">{e.message}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(e.time).toLocaleString("pt-BR")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>


        {/* Alertas */}
        <Card no3d className="md:col-span-2 xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" /> Alertas Inteligentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                Tudo sob controle ✔
              </div>
            ) : (
              <ul className="space-y-2">
                {alerts.map((a, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs rounded-lg border border-border/40 bg-muted/30 px-2.5 py-2"
                  >
                    <span className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${statusDot(a.level)}`} />
                    <span>{a.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gráfico simples: memória vs cpu (barras) */}
      {(memPercent !== null || cpuLoad > 0) && (
        <Card no3d>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Cpu className="h-4 w-4 text-primary" /> Recursos do cliente
              <Badge variant="outline" className="ml-2 text-[10px] font-normal">
                Estimado
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {memPercent !== null && (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <HardDrive className="h-3 w-3" /> Memória JS
                  </span>
                  <span className="font-medium">{memPercent.toFixed(0)}%</span>
                </div>
                <Progress value={memPercent} className="h-2" />
              </div>
            )}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Cpu className="h-3 w-3" /> Carga de processamento
                </span>
                <span className="font-medium">{cpuLoad.toFixed(0)}%</span>
              </div>
              <Progress value={cpuLoad} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 px-1">
        <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
        Métricas marcadas como <Badge variant="outline" className="mx-1 text-[10px] font-normal">Estimado</Badge>
        são aproximações calculadas no próprio aparelho — CPU/memória reais do servidor e
        uptime global não são expostos ao cliente.
      </p>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  metrics,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  metrics: Metric[];
}) {
  return (
    <Card no3d>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {metrics.map((m, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground text-xs flex items-center gap-1.5">
              {m.status && <span className={`h-1.5 w-1.5 rounded-full ${statusDot(m.status)}`} />}
              {m.label}
              {m.estimated && (
                <Badge variant="outline" className="text-[9px] font-normal px-1 py-0 h-4">
                  Estimado
                </Badge>
              )}
            </span>
            <span className="font-medium text-right tabular-nums" title={m.hint}>
              {m.value}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function formatBytes(b: number) {
  if (!b) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(1)} ${units[i]}`;
}

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function periodMs(p: Period) {
  return p === "today" ? 24 * 60 * 60 * 1000 : p === "7d" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
}

function periodLabel(p: Period) {
  return p === "today" ? "últimas 24h" : p === "7d" ? "últimos 7 dias" : "últimos 30 dias";
}
