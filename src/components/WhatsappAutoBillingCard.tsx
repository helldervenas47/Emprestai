import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWhatsappBillingSchedule } from "@/hooks/useWhatsappBillingSchedule";
import { toast } from "sonner";
import { Send, Loader2, Clock, Zap, Eye, AlertTriangle, Plug, ChevronDown } from "lucide-react";
import { WppConnectStatus } from "@/features/whatsapp/components/WppConnectStatus";


export function WhatsappAutoBillingCard() {
  const { schedule, logs, loading, save, runNow, previewNextRun } = useWhatsappBillingSchedule();
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<any[]>([]);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [connectRequest, setConnectRequest] = useState(0);
  const [providerDraft, setProviderDraft] = useState({ provider: "evolution", base_url: "", instance_id: "" });

  const openConnectionSettings = () => {
    setProviderDraft({ provider: schedule.provider, base_url: schedule.base_url, instance_id: schedule.instance_id });
    setConnectionOpen(true);
  };

  const toggleConnectionSettings = () => {
    if (connectionOpen) setConnectionOpen(false);
    else openConnectionSettings();
  };

  const loadPreview = async () => {
    setPreviewing(true);
    try {
      const result: any = await previewNextRun();
      setPreview(result?.results || []);
    } catch (error: any) {
      toast.error("Não foi possível gerar a prévia: " + (error?.message || String(error)));
    } finally { setPreviewing(false); }
  };

  const saveAndConnect = async () => {
    await save({ provider: providerDraft.provider, base_url: providerDraft.base_url.trim(), instance_id: providerDraft.instance_id.trim() });
    setConnectRequest((value) => value + 1);
  };

  const alerts = useMemo(() => {
    const rows: string[] = [];
    if (!schedule.base_url || !schedule.instance_id) rows.push("A conexão do WhatsApp ainda não está completamente configurada.");
    const failures = logs.filter((log) => !log.success).length;
    if (failures) rows.push(`${failures} falha(s) encontrada(s) nos últimos envios.`);
    if (schedule.enabled && schedule.last_run_at && Date.now() - new Date(schedule.last_run_at).getTime() > 36 * 60 * 60 * 1000) rows.push("A automação está ativa, mas não executa há mais de 36 horas.");
    return rows;
  }, [logs, schedule]);

  const handleRunNow = async () => {
    if (!schedule.base_url || !schedule.instance_id) {
      toast.error("Configure URL base e Instance ID antes de testar.");
      return;
    }
    setSending(true);
    try {
      const res: any = await runNow();
      const sent = (res?.results ?? []).filter((r: any) => r.success).length;
      const failed = (res?.results ?? []).filter((r: any) => r.success === false).length;
      toast.success(`Execução concluída: ${sent} enviada(s), ${failed} falha(s).`);
    } catch (e: any) {
      toast.error("Falha ao executar: " + (e?.message ?? String(e)));
    } finally {
      setSending(false);
    }
  };



  if (loading) {
    return (
      <Card><CardContent className="p-8 text-center text-muted-foreground">Carregando...</CardContent></Card>
    );
  }

  return (
    <Card no3d className="overflow-hidden rounded-2xl border-border/60 shadow-xs">
      <CardHeader className="p-3.5 pb-3 sm:p-5 sm:pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <Zap className="h-5 w-5 text-emerald-500" />
              Disparos e Cobrança Automática
            </CardTitle>
            <CardDescription className="mt-1 text-xs leading-relaxed">
              Configure sua instância Evolution API ou WPPConnect e as rotinas de envio.
            </CardDescription>
          </div>
          <div className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-border/40 bg-muted/40 px-3 sm:min-h-0 sm:w-auto sm:justify-start sm:py-1.5">
            <Label htmlFor="auto-switch" className="text-xs font-semibold cursor-pointer">
              {schedule.enabled ? "Automação Ativada" : "Automação Pausada"}
            </Label>
            <Switch
              id="auto-switch"
              checked={schedule.enabled}
              onCheckedChange={(v) => save({ enabled: v })}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-3.5 pt-1 sm:space-y-5 sm:p-5 sm:pt-2">
        {(schedule.provider === "wppconnect" || schedule.provider === "evolution") && <WppConnectStatus provider={schedule.provider} onConnectRequested={openConnectionSettings} connectRequest={connectRequest} />}
        {schedule.alert_on_failure && alerts.length > 0 && <div className="space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-700 dark:text-amber-400"><AlertTriangle className="h-4 w-4"/>Alertas da automação</div>
          {alerts.map((alert) => <p key={alert} className="text-xs text-muted-foreground">{alert}</p>)}
        </div>}
        {/* Bloco 1: Conexão da API */}
        <div className="space-y-3 rounded-2xl border border-border/40 bg-muted/20 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2 sm:items-center">
            <div className="min-w-0"><Badge variant="outline" className="whitespace-normal text-left text-[11px] leading-tight bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 sm:text-xs">1. Conexão do Provedor</Badge><p className="mt-1.5 text-xs text-muted-foreground">Credenciais da sua instância do WhatsApp</p></div>
            <Button type="button" variant="ghost" className="h-9 w-auto shrink-0 rounded-xl px-2 text-[11px] sm:px-3 sm:text-xs" aria-expanded={connectionOpen} onClick={toggleConnectionSettings}>{connectionOpen ? "Recolher" : "Expandir"}<ChevronDown className={`ml-1 h-4 w-4 transition-transform sm:ml-1.5 ${connectionOpen ? "rotate-180" : ""}`}/></Button>
          </div>

          {connectionOpen && <div className="space-y-3 border-t border-border/40 pt-3">
          <div className="grid gap-3 pt-1 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Provedor</Label>
              <Select value={providerDraft.provider} onValueChange={(provider) => setProviderDraft((draft) => ({ ...draft, provider }))}>
                <SelectTrigger className="h-11 rounded-xl text-sm sm:h-9 sm:text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="evolution">Evolution API</SelectItem>
                  <SelectItem value="wppconnect">WPPConnect</SelectItem>
                  <SelectItem value="whatsmiau">Whatsmiau / Evolution legado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">URL base do serviço</Label>
              <Input
                placeholder={providerDraft.provider === "wppconnect" ? "https://whatsapp.seudominio.com" : "https://evolution.seudominio.com"}
                value={providerDraft.base_url}
                onChange={(e) => setProviderDraft((draft) => ({ ...draft, base_url: e.target.value }))}
                className="h-11 rounded-xl text-sm sm:h-9 sm:text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Instance ID</Label>
              <Input
                placeholder="minha-instancia"
                value={providerDraft.instance_id}
                onChange={(e) => setProviderDraft((draft) => ({ ...draft, instance_id: e.target.value }))}
                className="h-11 rounded-xl text-sm sm:h-9 sm:text-xs"
              />
            </div>
          </div>
          <Button type="button" className="h-11 w-full rounded-xl sm:ml-auto sm:h-9 sm:w-auto" disabled={!providerDraft.base_url.trim() || !providerDraft.instance_id.trim()} onClick={saveAndConnect}><Plug className="mr-1.5 h-4 w-4"/>Salvar e conectar</Button>
          </div>}
        </div>

        {/* Bloco 2: Regras e Horários de Envio aos Clientes */}
        <div className="space-y-4 rounded-2xl border border-border/40 bg-muted/20 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2 sm:items-center">
            <div className="min-w-0"><Badge variant="outline" className="whitespace-normal text-left text-[11px] leading-tight bg-primary/10 text-primary border-primary/25 sm:text-xs">2. Regras e Horários para Clientes</Badge><p className="mt-1.5 text-xs text-muted-foreground">Defina quando e com que frequência disparar</p></div>
            <Button type="button" variant="ghost" className="h-9 w-auto shrink-0 rounded-xl px-2 text-[11px] sm:px-3 sm:text-xs" aria-expanded={rulesOpen} onClick={() => setRulesOpen((open) => !open)}>{rulesOpen ? "Recolher" : "Expandir"}<ChevronDown className={`ml-1 h-4 w-4 transition-transform sm:ml-1.5 ${rulesOpen ? "rotate-180" : ""}`}/></Button>
          </div>

          {rulesOpen && <div className="space-y-4 border-t border-border/40 pt-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Horário de envio diário</Label>
              <Input
                type="time"
                value={schedule.send_time?.slice(0, 5) ?? "09:00"}
                onChange={(e) => save({ send_time: e.target.value })}
                className="h-11 rounded-xl text-sm sm:h-9 sm:text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Avisar dias antes do vencimento</Label>
              <Input
                type="number"
                min={0}
                max={30}
                value={schedule.days_before_due}
                onChange={(e) => save({ days_before_due: Number(e.target.value || 0) })}
                className="h-11 rounded-xl text-sm sm:h-9 sm:text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Reenviar para vencidos a cada (dias)</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={schedule.overdue_repeat_days}
                onChange={(e) => save({ overdue_repeat_days: Number(e.target.value || 1) })}
                className="h-11 rounded-xl text-sm sm:h-9 sm:text-xs"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Início da janela permitida</Label><Input type="time" value={schedule.allowed_start_time} onChange={(e) => save({ allowed_start_time: e.target.value })} className="h-11 rounded-xl sm:h-9"/></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Fim da janela permitida</Label><Input type="time" value={schedule.allowed_end_time} onChange={(e) => save({ allowed_end_time: e.target.value })} className="h-11 rounded-xl sm:h-9"/></div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Dias permitidos para envio</Label>
            <div className="grid grid-cols-7 gap-1">{["D", "S", "T", "Q", "Q", "S", "S"].map((label, day) => {
              const active = schedule.allowed_weekdays.includes(day);
              return <Button key={day} type="button" size="sm" variant={active ? "default" : "outline"} className="h-9 min-w-0 px-0" onClick={() => save({ allowed_weekdays: active ? schedule.allowed_weekdays.filter((value) => value !== day) : [...schedule.allowed_weekdays, day].sort() })}>{label}</Button>;
            })}</div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 pt-1">
            <label className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/80 p-3 transition-colors hover:bg-background cursor-pointer">
              <div className="min-w-0 pr-2">
                <div className="text-xs font-semibold text-foreground">Avisar no dia do vencimento</div>
                <div className="text-[11px] text-muted-foreground">Dispara a mensagem do template "Vence hoje".</div>
              </div>
              <Switch checked={schedule.send_on_due_day} onCheckedChange={(v) => save({ send_on_due_day: v })} />
            </label>

            <label className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/80 p-3 transition-colors hover:bg-background cursor-pointer">
              <div className="min-w-0 pr-2">
                <div className="text-xs font-semibold text-foreground">Reenviar cobrança para vencidos</div>
                <div className="text-[11px] text-muted-foreground">Dispara cobranças para parcelas em atraso.</div>
              </div>
              <Switch checked={schedule.send_when_overdue} onCheckedChange={(v) => save({ send_when_overdue: v })} />
            </label>
            <label className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/80 p-3 transition-colors hover:bg-background cursor-pointer">
              <div className="min-w-0 pr-2"><div className="text-xs font-semibold text-foreground">Exibir alertas operacionais</div><div className="text-[11px] text-muted-foreground">Destaca desconexões, falhas e interrupções.</div></div>
              <Switch checked={schedule.alert_on_failure} onCheckedChange={(v) => save({ alert_on_failure: v })}/>
            </label>
          </div>

          <div className="flex flex-col items-stretch gap-3 border-t border-border/40 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-1.5 text-xs leading-relaxed text-muted-foreground sm:items-center">
              <Clock className="h-3.5 w-3.5" />
              {schedule.last_run_at ? (
                <span>Última execução: {new Date(schedule.last_run_at).toLocaleString("pt-BR")}</span>
              ) : (
                <span>Nenhuma execução automática registrada ainda.</span>
              )}
            </div>

            <Button
              onClick={handleRunNow}
              disabled={sending}
              size="sm"
              className="h-10 w-full rounded-xl text-xs font-semibold sm:h-8 sm:w-auto"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
              Executar teste agora
            </Button>
          </div>
          </div>}
        </div>

        <div className="space-y-3 rounded-2xl border border-border/40 bg-muted/20 p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2 text-sm font-bold"><Eye className="h-4 w-4 text-primary"/>Prévia da próxima execução</div><p className="mt-1 text-xs text-muted-foreground">Mostra os clientes e valores sem enviar mensagens.</p></div><Button type="button" variant="outline" className="w-full sm:w-auto" onClick={loadPreview} disabled={previewing}>{previewing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin"/> : <Eye className="mr-1.5 h-4 w-4"/>}Gerar prévia</Button></div>
          {preview.length > 0 && <div className="grid gap-2 sm:grid-cols-2">{preview.map((item) => <div key={`${item.client_id}-${item.scheduled_at}`} className="rounded-xl border bg-background p-3 text-center"><p className="truncate text-sm font-semibold">{item.client_name}</p><p className="mt-1 text-xs text-muted-foreground">{item.contracts} contrato(s)</p><p className="mt-1 font-bold">{Number(item.amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p></div>)}</div>}
          {!previewing && preview.length === 0 && <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">Gere uma prévia para conferir a próxima cobrança.</p>}
        </div>

      </CardContent>
    </Card>
  );
}
