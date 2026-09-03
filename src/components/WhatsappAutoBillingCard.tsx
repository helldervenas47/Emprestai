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
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Cobrança automática (WhatsApp)</CardTitle>
            <CardDescription>
              Envia mensagens automaticamente para clientes com parcelas a vencer, no dia ou em atraso.
              Usa os templates configurados em "Cobrança WhatsApp".
            </CardDescription>
          </div>
          <Switch checked={schedule.enabled} onCheckedChange={(v) => save({ enabled: v })} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>URL base do provedor (Whatsmiau / Evolution)</Label>
            <Input
              placeholder="https://api.whatsmiau.com.br"
              value={schedule.base_url}
              onChange={(e) => save({ base_url: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Instance ID</Label>
            <Input
              placeholder="minha-instancia"
              value={schedule.instance_id}
              onChange={(e) => save({ instance_id: e.target.value })}
            />
          </div>
        </div>

        <Separator />

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Horário de envio diário</Label>
            <Input type="time"
              value={schedule.send_time?.slice(0, 5) ?? "09:00"}
              onChange={(e) => save({ send_time: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Avisar dias antes do vencimento</Label>
            <Input type="number" min={0} max={30}
              value={schedule.days_before_due}
              onChange={(e) => save({ days_before_due: Number(e.target.value || 0) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Reenviar para vencidos a cada (dias)</Label>
            <Input type="number" min={1} max={30}
              value={schedule.overdue_repeat_days}
              onChange={(e) => save({ overdue_repeat_days: Number(e.target.value || 1) })}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Avisar no dia do vencimento</div>
              <div className="text-xs text-muted-foreground">Mensagem "vence hoje".</div>
            </div>
            <Switch checked={schedule.send_on_due_day} onCheckedChange={(v) => save({ send_on_due_day: v })} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Reenviar para vencidos</div>
              <div className="text-xs text-muted-foreground">Cobra parcelas em atraso.</div>
            </div>
            <Switch checked={schedule.send_when_overdue} onCheckedChange={(v) => save({ send_when_overdue: v })} />
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-muted-foreground">
            {schedule.last_run_at
              ? <>Última execução: {new Date(schedule.last_run_at).toLocaleString("pt-BR")}</>
              : "Nenhuma execução automática registrada ainda."}
          </div>
          <Button onClick={handleRunNow} disabled={sending} size="sm">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Executar agora (teste)
          </Button>
        </div>

        <Separator />

        <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <div>
                <div className="text-sm font-medium">Resumo semanal para gerentes</div>
                <div className="text-xs text-muted-foreground">
                  Envia um WhatsApp aos usuários com perfil <strong>Gerente</strong> listando os
                  empréstimos que vencem na semana atual.
                </div>
              </div>
            </div>
            <Switch
              checked={schedule.manager_summary_enabled}
              onCheckedChange={(v) => save({ manager_summary_enabled: v })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Dia da semana</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={schedule.manager_summary_day_of_week}
                onChange={(e) => save({ manager_summary_day_of_week: Number(e.target.value) })}
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Horário</Label>
              <Input
                type="time"
                value={schedule.manager_summary_time?.slice(0, 5) ?? "09:00"}
                onChange={(e) => save({ manager_summary_time: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5 rounded-md border bg-background p-2.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" /> Meu telefone (WhatsApp) para receber resumos
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="Ex: (11) 99999-9999"
                value={phoneDraft || myPhone}
                onChange={(e) => setPhoneDraft(e.target.value)}
                disabled={loadingPhone || savingPhone}
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
                  else { toast.success("Telefone atualizado."); setPhoneDraft(""); }
                }}
              >
                Salvar
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Apenas usuários com perfil <strong>Gerente</strong> recebem este resumo. Defina o
              papel em "Gerenciar Usuários".
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-muted-foreground">
              {schedule.manager_last_run_at
                ? <>Último envio: {new Date(schedule.manager_last_run_at).toLocaleString("pt-BR")}</>
                : "Nenhum resumo enviado ainda."}
            </div>
            <Button onClick={handleRunManagerNow} disabled={sendingManager} size="sm" variant="secondary">
              {sendingManager ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar resumo agora
            </Button>
          </div>
        </div>

        <Separator />

        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4" /> Últimos envios
          </div>
          {logs.length === 0 ? (
            <div className="text-xs text-muted-foreground py-4 text-center">Nenhum envio registrado.</div>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {logs.map((l) => (
                <div key={l.id} className="flex items-start gap-2 rounded-md border p-2 text-xs">
                  {l.success
                    ? <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                    : <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{l.status_when_sent}</Badge>
                      <span className="font-mono">{l.phone}</span>
                      <span className="text-muted-foreground">
                        {new Date(l.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    {l.error_message && (
                      <div className="text-destructive mt-0.5 break-all">{l.error_message}</div>
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
