import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useWhatsappBillingSchedule } from "@/hooks/useWhatsappBillingSchedule";
import { useMyProfilePhone } from "@/hooks/useMyProfilePhone";
import { toast } from "sonner";
import { Send, Loader2, CheckCircle2, XCircle, Clock, Users, Phone } from "lucide-react";

const WEEKDAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" },
];

export function WhatsappAutoBillingCard() {
  const { schedule, logs, loading, save, runNow, runManagerSummaryNow } = useWhatsappBillingSchedule();
  const { phone: myPhone, save: saveMyPhone, loading: loadingPhone } = useMyProfilePhone();
  const [phoneDraft, setPhoneDraft] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingManager, setSendingManager] = useState(false);

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

  const handleRunManagerNow = async () => {
    setSendingManager(true);
    try {
      const res: any = await runManagerSummaryNow();
      const sent = (res?.results ?? []).filter((r: any) => r.success).length;
      const failed = (res?.results ?? []).filter((r: any) => r.success === false).length;
      if (sent === 0 && failed === 0) {
        toast.info("Nenhum gerente com telefone configurado encontrado.");
      } else {
        toast.success(`Resumo de gerentes: ${sent} enviado(s), ${failed} falha(s).`);
      }
    } catch (e: any) {
      toast.error("Falha ao enviar resumo: " + (e?.message ?? String(e)));
    } finally {
      setSendingManager(false);
    }
  };

  if (loading) {
    return (
      <Card><CardContent className="p-8 text-center text-muted-foreground">Carregando...</CardContent></Card>
    );
  }

  return (
    <Card no3d className="border-border/60 shadow-xs rounded-2xl">
      <CardHeader className="p-4 sm:p-5 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Zap className="h-5 w-5 text-emerald-500" />
              Disparos e Cobrança Automática
            </CardTitle>
            <CardDescription className="text-xs">
              Configure as credenciais da API do WhatsApp (Whatsmiau / Evolution) e as rotinas automáticas de envio.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2.5 shrink-0 bg-muted/40 px-3 py-1.5 rounded-xl border border-border/40">
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

      <CardContent className="p-4 sm:p-5 pt-2 space-y-5">
        {/* Bloco 1: Conexão da API */}
        <div className="space-y-3 bg-muted/20 p-3.5 sm:p-4 rounded-2xl border border-border/40">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25">
              1. Conexão do Provedor
            </Badge>
            <span className="text-xs text-muted-foreground">Credenciais da sua instância do WhatsApp</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">URL base do provedor (Whatsmiau / Evolution)</Label>
              <Input
                placeholder="https://api.whatsmiau.com.br"
                value={schedule.base_url}
                onChange={(e) => save({ base_url: e.target.value })}
                className="text-xs rounded-xl h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Instance ID</Label>
              <Input
                placeholder="minha-instancia"
                value={schedule.instance_id}
                onChange={(e) => save({ instance_id: e.target.value })}
                className="text-xs rounded-xl h-9"
              />
            </div>
          </div>
        </div>

        {/* Bloco 2: Regras e Horários de Envio aos Clientes */}
        <div className="space-y-4 bg-muted/20 p-3.5 sm:p-4 rounded-2xl border border-border/40">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/25">
              2. Regras e Horários para Clientes
            </Badge>
            <span className="text-xs text-muted-foreground">Defina quando e com que frequência disparar</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Horário de envio diário</Label>
              <Input
                type="time"
                value={schedule.send_time?.slice(0, 5) ?? "09:00"}
                onChange={(e) => save({ send_time: e.target.value })}
                className="text-xs rounded-xl h-9"
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
                className="text-xs rounded-xl h-9"
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
                className="text-xs rounded-xl h-9"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 pt-1">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/80 p-3 hover:bg-background transition-colors cursor-pointer">
              <div className="min-w-0 pr-2">
                <div className="text-xs font-semibold text-foreground">Avisar no dia do vencimento</div>
                <div className="text-[11px] text-muted-foreground">Dispara a mensagem do template "Vence hoje".</div>
              </div>
              <Switch checked={schedule.send_on_due_day} onCheckedChange={(v) => save({ send_on_due_day: v })} />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/80 p-3 hover:bg-background transition-colors cursor-pointer">
              <div className="min-w-0 pr-2">
                <div className="text-xs font-semibold text-foreground">Reenviar cobrança para vencidos</div>
                <div className="text-[11px] text-muted-foreground">Dispara cobranças para parcelas em atraso.</div>
              </div>
              <Switch checked={schedule.send_when_overdue} onCheckedChange={(v) => save({ send_when_overdue: v })} />
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/40 flex-wrap">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
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
              className="h-8 text-xs font-semibold rounded-xl"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
              Executar teste agora
            </Button>
          </div>
        </div>

        {/* Bloco 3: Resumo Semanal para Gerentes */}
        <div className="space-y-4 bg-muted/20 p-3.5 sm:p-4 rounded-2xl border border-border/40">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25">
                3. Resumo Semanal para Gerentes
              </Badge>
              <span className="text-xs text-muted-foreground">Vencimentos da equipe</span>
            </div>
            <Switch
              checked={schedule.manager_summary_enabled}
              onCheckedChange={(v) => save({ manager_summary_enabled: v })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Dia da semana</Label>
              <select
                className="h-9 w-full rounded-xl border border-border/60 bg-background px-3 text-xs"
                value={schedule.manager_summary_day_of_week}
                onChange={(e) => save({ manager_summary_day_of_week: Number(e.target.value) })}
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Horário do resumo</Label>
              <Input
                type="time"
                value={schedule.manager_summary_time?.slice(0, 5) ?? "09:00"}
                onChange={(e) => save({ manager_summary_time: e.target.value })}
                className="text-xs rounded-xl h-9"
              />
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-border/50 bg-background/80 p-3">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-primary" /> Meu telefone WhatsApp para receber resumos
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="Ex: (11) 99999-9999"
                value={phoneDraft || myPhone}
                onChange={(e) => setPhoneDraft(e.target.value)}
                disabled={loadingPhone || savingPhone}
                className="text-xs rounded-xl h-9 flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={savingPhone || loadingPhone || (phoneDraft || myPhone) === myPhone}
                onClick={async () => {
                  setSavingPhone(true);
                  const { error } = await saveMyPhone((phoneDraft || myPhone).trim());
                  setSavingPhone(false);
                  if (error) toast.error("Não foi possível salvar o telefone.");
                  else {
                    toast.success("Telefone atualizado com sucesso.");
                    setPhoneDraft("");
                  }
                }}
                className="h-9 text-xs rounded-xl"
              >
                Salvar
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/40 flex-wrap">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {schedule.manager_last_run_at ? (
                <span>Último envio: {new Date(schedule.manager_last_run_at).toLocaleString("pt-BR")}</span>
              ) : (
                <span>Nenhum resumo enviado ainda.</span>
              )}
            </div>
            <Button
              onClick={handleRunManagerNow}
              disabled={sendingManager}
              size="sm"
              variant="secondary"
              className="h-8 text-xs font-semibold rounded-xl"
            >
              {sendingManager ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
              Enviar resumo para gerentes agora
            </Button>
          </div>
        </div>

        {/* Bloco 4: Histórico dos Últimos Envios */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Clock className="h-4 w-4 text-primary" />
              Histórico dos Últimos Envios ({logs.length})
            </div>
          </div>

          {logs.length === 0 ? (
            <div className="text-xs text-muted-foreground py-6 text-center rounded-2xl border border-dashed border-border/60 bg-muted/10">
              Nenhum registro de envio automático até o momento.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {logs.map((l) => (
                <div
                  key={l.id}
                  className="flex items-start gap-3 rounded-xl border border-border/40 bg-card p-2.5 text-xs shadow-2xs hover:bg-muted/20 transition-colors"
                >
                  {l.success ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap justify-between">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] font-semibold">
                          {l.status_when_sent}
                        </Badge>
                        <span className="font-mono text-foreground font-medium">{l.phone}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {new Date(l.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    {l.error_message && (
                      <div className="text-destructive text-[11px] mt-1 break-all bg-destructive/10 p-1.5 rounded-lg border border-destructive/20">
                        {l.error_message}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

