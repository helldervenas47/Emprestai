import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, CheckCircle2, Unlink, Clock, Zap, CalendarDays, CalendarRange } from "lucide-react";
import { generateTelegramLinkCode, invokeUserFunction } from "@/features/telegram/lib/telegramLinkCode";
import { fetchExpensesBotId, fetchReportsBotId } from "@/features/telegram/lib/telegramReportsBot";

const TelegramIcon = ({ className }: { className?: string }) => (
  <span className={className} aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full">
      <path d="M21.944 4.667a1.5 1.5 0 0 0-1.62-.22L3.36 11.32c-.94.39-.93 1.72.02 2.09l4.27 1.66 1.66 5.32c.21.67 1.04.88 1.55.4l2.43-2.27 4.4 3.24c.62.46 1.51.13 1.69-.62l3.1-14.39a1.5 1.5 0 0 0-.54-1.58zM9.9 15.06l-.6 4.04-1.3-4.18 9.62-7.04-7.72 7.18z"/>
    </svg>
  </span>
);
import { toast } from "sonner";
import { useTelegramSummaryPref } from "@/features/telegram/hooks/useTelegramSummaryPref";

const BOT_USERNAME_KEY = "telegram_bot_username";

export function TelegramConnectCard() {
  const [linked, setLinked] = useState<{ chat_id: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);
  const [sendingWeekly, setSendingWeekly] = useState(false);
  const [sendingMonthly, setSendingMonthly] = useState(false);
  const syncingTelegramRef = useRef(false);
  const botUsername = (typeof window !== "undefined" && localStorage.getItem(BOT_USERNAME_KEY)) || "";
  const { pref: summaryPref, update: updateSummary } = useTelegramSummaryPref();

  const refresh = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const expensesBotId = await fetchExpensesBotId();
    const reportsBotId = await fetchReportsBotId();
    let q = supabase
      .from("telegram_links" as any)
      .select("chat_id")
      .eq("user_id", user.id);
    if (expensesBotId) q = q.eq("bot_id", expensesBotId);
    else if (reportsBotId) q = q.or(`bot_id.is.null,bot_id.neq.${reportsBotId}`);
    const { data } = await q.maybeSingle();
    setLinked(data ? { chat_id: (data as any).chat_id } : null);
    setLoading(false);
  };


  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      await refresh();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      channel = supabase
        .channel(`telegram-links:${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "telegram_links", filter: `user_id=eq.${user.id}` },
          () => refresh(),
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (loading || linked) return;
    let stopped = false;
    const syncTelegram = async () => {
      if (stopped || syncingTelegramRef.current) return;
      if (typeof document !== "undefined" && document.hidden) return;
      syncingTelegramRef.current = true;
      try {
        // Não chamamos telegram-poll: o cron já roda a cada minuto e duas chamadas
        // concorrentes de getUpdates no mesmo bot causam erro 409 no Telegram.
        await invokeUserFunction("telegram-process").catch(() => null);
        await refresh();
      } finally {
        syncingTelegramRef.current = false;
      }
    };
    syncTelegram();
    // Ativo apenas enquanto o card está aberto e não vinculado; pausa se aba oculta.
    const interval = window.setInterval(syncTelegram, 30000);
    return () => { stopped = true; window.clearInterval(interval); };
  }, [loading, linked]);

  const generateCode = async () => {
    setGenerating(true);
    try {
      const data = await generateTelegramLinkCode();
      if ((data as any).alreadyLinked) {
        toast.success("Telegram já vinculado");
        await refresh();
        return;
      }
      setCode((data as any).code);
      setExpiresAt((data as any).expiresAt);
    } catch (e: any) {
      toast.error("Erro ao gerar código", { description: e.message });
    } finally {
      setGenerating(false);
    }
  };

  const copyCommand = () => {
    if (!code) return;
    const cmd = `/start ${code}`;
    navigator.clipboard.writeText(cmd);
    toast.success("Comando copiado!");
  };

  const disconnect = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const expensesBotId = await fetchExpensesBotId();
    const reportsBotId = await fetchReportsBotId();
    let q = supabase.from("telegram_links" as any).delete().eq("user_id", user.id);
    if (expensesBotId) q = q.eq("bot_id", expensesBotId);
    else if (reportsBotId) q = q.or(`bot_id.is.null,bot_id.neq.${reportsBotId}`);
    await q;
    setLinked(null);
    toast.success("Telegram desvinculado");
  };




  const sendSummaryNow = async () => {
    setSendingNow(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada");
      const { data, error } = await supabase.functions.invoke(
        `telegram-daily-summary?user_id=${user.id}`,
        { method: "POST" },
      );
      if (error) throw error;
      const sent = (data as any)?.sent ?? 0;
      if (sent > 0) {
        toast.success("Resumo enviado!", { description: "Confira seu Telegram." });
      } else {
        toast.warning("Nada enviado", {
          description: "Verifique se o resumo diário está habilitado e o Telegram vinculado.",
        });
      }
    } catch (e: any) {
      toast.error("Erro ao enviar resumo", { description: e.message });
    } finally {
      setSendingNow(false);
    }
  };

  const sendWeeklySummaryNow = async () => {
    setSendingWeekly(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada");
      const { data, error } = await supabase.functions.invoke(
        `telegram-weekly-summary?user_id=${user.id}`,
        { method: "POST" },
      );
      if (error) throw error;
      const sent = (data as any)?.sent ?? 0;
      if (sent > 0) {
        toast.success("Resumo semanal enviado!", { description: "Confira seu Telegram." });
      } else {
        toast.warning("Nada enviado", {
          description: "Verifique se o Telegram está vinculado.",
        });
      }
    } catch (e: any) {
      toast.error("Erro ao enviar resumo semanal", { description: e.message });
    } finally {
      setSendingWeekly(false);
    }
  };

  const sendMonthlySummaryNow = async () => {
    setSendingMonthly(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada");
      const { data, error } = await supabase.functions.invoke(
        `telegram-monthly-summary?user_id=${user.id}`,
        { method: "POST" },
      );
      if (error) throw error;
      const sent = (data as any)?.sent ?? 0;
      if (sent > 0) {
        toast.success("Resumo mensal enviado!", { description: "Confira seu Telegram." });
      } else {
        toast.warning("Nada enviado", { description: "Verifique se o Telegram está vinculado." });
      }
    } catch (e: any) {
      toast.error("Erro ao enviar resumo mensal", { description: e.message });
    } finally {
      setSendingMonthly(false);
    }
  };

  if (loading) return null;

  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <TelegramIcon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">Bot do Telegram</p>
              <p className="text-xs text-muted-foreground">
                Cadastre despesas pessoais por mensagem
              </p>
            </div>
          </div>
          {linked && (
            <span className="inline-flex items-center gap-1 text-xs text-success font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> Conectado
            </span>
          )}
        </div>

        {linked ? (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Chat vinculado: <span className="font-mono">{linked.chat_id}</span>
              </p>
              <Button size="sm" variant="outline" onClick={disconnect}>
                <Unlink className="h-3.5 w-3.5 mr-1" /> Desvincular
              </Button>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <Label htmlFor="tg-summary" className="text-sm cursor-pointer">
                    Resumo diário
                  </Label>
                </div>
                <Switch
                  id="tg-summary"
                  checked={summaryPref.enabled}
                  onCheckedChange={(v) => updateSummary({ enabled: v })}
                />
              </div>
              {summaryPref.enabled && (
                <div className="flex items-center gap-2 pt-1">
                  <Label htmlFor="tg-summary-time" className="text-xs text-muted-foreground">
                    Horário:
                  </Label>
                  <Input
                    id="tg-summary-time"
                    type="time"
                    value={summaryPref.send_time}
                    onChange={(e) => updateSummary({ send_time: e.target.value })}
                    className="h-8 w-28 text-xs"
                  />
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                Total gasto no dia + saldo dos orçamentos por categoria.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button size="sm" variant="outline" onClick={sendSummaryNow} disabled={sendingNow}>
                  <Zap className="h-3.5 w-3.5 mr-1" />
                  {sendingNow ? "…" : "Hoje"}
                </Button>
                <Button size="sm" variant="outline" onClick={sendWeeklySummaryNow} disabled={sendingWeekly}>
                  <CalendarDays className="h-3.5 w-3.5 mr-1" />
                  {sendingWeekly ? "…" : "Semana"}
                </Button>
                <Button size="sm" variant="outline" onClick={sendMonthlySummaryNow} disabled={sendingMonthly}>
                  <CalendarRange className="h-3.5 w-3.5 mr-1" />
                  {sendingMonthly ? "…" : "Mês"}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  <Label htmlFor="tg-weekly" className="text-sm cursor-pointer">
                    Resumo semanal automático
                  </Label>
                </div>
                <Switch
                  id="tg-weekly"
                  checked={summaryPref.weekly_enabled}
                  onCheckedChange={(v) => updateSummary({ weekly_enabled: v })}
                />
              </div>
              {summaryPref.weekly_enabled && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Label className="text-xs text-muted-foreground">Dia:</Label>
                  <Select
                    value={String(summaryPref.weekly_send_weekday)}
                    onValueChange={(v) => updateSummary({ weekly_send_weekday: Number(v) })}
                  >
                    <SelectTrigger className="h-8 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Segunda</SelectItem>
                      <SelectItem value="2">Terça</SelectItem>
                      <SelectItem value="3">Quarta</SelectItem>
                      <SelectItem value="4">Quinta</SelectItem>
                      <SelectItem value="5">Sexta</SelectItem>
                      <SelectItem value="6">Sábado</SelectItem>
                      <SelectItem value="0">Domingo</SelectItem>
                    </SelectContent>
                  </Select>
                  <Label htmlFor="tg-weekly-time" className="text-xs text-muted-foreground">
                    Horário:
                  </Label>
                  <Input
                    id="tg-weekly-time"
                    type="time"
                    value={summaryPref.weekly_send_time}
                    onChange={(e) => updateSummary({ weekly_send_time: e.target.value })}
                    className="h-8 w-28 text-xs"
                  />
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                Total dos últimos 7 dias por dia e por categoria.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CalendarRange className="h-4 w-4 text-primary" />
                  <Label htmlFor="tg-monthly" className="text-sm cursor-pointer">
                    Resumo mensal automático
                  </Label>
                </div>
                <Switch
                  id="tg-monthly"
                  checked={summaryPref.monthly_enabled}
                  onCheckedChange={(v) => updateSummary({ monthly_enabled: v })}
                />
              </div>
              {summaryPref.monthly_enabled && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Label className="text-xs text-muted-foreground">Dia:</Label>
                  <Select
                    value={String(summaryPref.monthly_send_day)}
                    onValueChange={(v) => updateSummary({ monthly_send_day: Number(v) })}
                  >
                    <SelectTrigger className="h-8 w-20 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Label htmlFor="tg-monthly-time" className="text-xs text-muted-foreground">
                    Horário:
                  </Label>
                  <Input
                    id="tg-monthly-time"
                    type="time"
                    value={summaryPref.monthly_send_time}
                    onChange={(e) => updateSummary({ monthly_send_time: e.target.value })}
                    className="h-8 w-28 text-xs"
                  />
                </div>
              )}
              {summaryPref.monthly_enabled && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Label className="text-xs text-muted-foreground">Formato:</Label>
                  <Select
                    value={summaryPref.monthly_format}
                    onValueChange={(v) => updateSummary({ monthly_format: v as "text" | "image" })}
                  >
                    <SelectTrigger className="h-8 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">📝 Texto</SelectItem>
                      <SelectItem value="image">🖼️ Imagem</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                Total do mês com comparação ao mês anterior, top categorias, média diária e orçamentos. Se o dia escolhido não existir no mês (ex: 31 em fevereiro), envia no último dia.
              </p>
            </div>
          </div>
        ) : code ? (
          <div className="space-y-2 pt-1">
            <p className="text-xs text-muted-foreground">
              1. Abra seu bot no Telegram{botUsername ? ` (@${botUsername})` : ""}<br />
              2. Envie o comando abaixo (válido por 10 min):
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-md bg-muted font-mono text-sm">/start {code}</code>
              <Button size="sm" variant="outline" onClick={copyCommand}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Aguardando vínculo… atualiza automaticamente.
            </p>
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            <Button size="sm" onClick={generateCode} disabled={generating} className="w-full sm:w-auto">
              <TelegramIcon className="h-3.5 w-3.5 mr-1" />
              {generating ? "Gerando…" : "Conectar Telegram"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Clique acima para gerar o comando <code className="font-mono">/start</code> e enviá-lo ao bot do Telegram.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
