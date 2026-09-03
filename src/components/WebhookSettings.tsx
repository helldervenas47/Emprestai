import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwner } from "@/hooks/useDataOwner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Webhook, Loader2, Send, Clock } from "lucide-react";

export function WebhookSettings() {
  const { user } = useAuth();
  const dataOwnerId = useDataOwner();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [sendTime, setSendTime] = useState("08:00");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const effectiveUserId = dataOwnerId || user?.id;

  useEffect(() => {
    if (!effectiveUserId) return;
    loadSettings();
  }, [effectiveUserId]);

  async function loadSettings() {
    setLoading(true);
    const { data } = await supabase
      .from("webhook_settings")
      .select("webhook_url, enabled, send_time")
      .eq("user_id", effectiveUserId!)
      .maybeSingle();

    if (data) {
      setWebhookUrl(data.webhook_url);
      setEnabled(data.enabled);
      setSendTime(data.send_time);
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!effectiveUserId) return;
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("webhook_settings")
        .select("id")
        .eq("user_id", effectiveUserId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("webhook_settings")
          .update({
            webhook_url: webhookUrl,
            enabled,
            send_time: sendTime,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("webhook_settings")
          .insert({
            user_id: effectiveUserId,
            webhook_url: webhookUrl,
            enabled,
            send_time: sendTime,
          });
        if (error) throw error;
      }
      toast.success("Configurações salvas!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!webhookUrl) {
      toast.error("Insira a URL do webhook primeiro.");
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-webhook-report");
      if (error) throw error;
      toast.success("Relatório de teste enviado para o webhook!");
    } catch (err: any) {
      toast.error("Erro ao testar: " + err.message);
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Webhook className="h-5 w-5" />
          Webhook — Relatório Automático
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Configure um webhook para receber um relatório diário com empréstimos atrasados, vencendo hoje e pagamentos recebidos.
          Compatível com n8n, Zapier, Make ou qualquer serviço que aceite webhook.
        </p>

        <div className="space-y-2">
          <Label htmlFor="webhook-url">URL do Webhook</Label>
          <Input
            id="webhook-url"
            placeholder="https://hooks.zapier.com/... ou https://n8n.example.com/webhook/..."
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="send-time" className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Horário de envio
          </Label>
          <Input
            id="send-time"
            type="time"
            value={sendTime}
            onChange={(e) => setSendTime(e.target.value)}
            className="w-32"
          />
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="webhook-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
          <Label htmlFor="webhook-enabled">
            {enabled ? "Ativado" : "Desativado"}
          </Label>
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Salvar
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={testing || !webhookUrl}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
            Testar Agora
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          💡 O webhook receberá um JSON com resumo de atrasados, vencendo hoje e pagamentos do dia.
          Use o botão "Testar Agora" para verificar se está funcionando.
        </p>
      </CardContent>
    </Card>
  );
}
