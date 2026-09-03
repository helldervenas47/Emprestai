import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Plus, X, Clock, Sparkles } from "lucide-react";
import { usePersonalInsightsTelegramPrefs, type InsightTone } from "@/hooks/usePersonalInsightsTelegramPrefs";
import { useTelegramReportsLink } from "@/features/telegram/hooks/useTelegramReportsLink";
import { supabase } from "@/integrations/supabase/userClient";
import { toast } from "sonner";

type SlotKey = "send_time_1" | "send_time_2" | "send_time_3";

const TONES: { value: InsightTone; label: string }[] = [
  { value: "balanced", label: "Equilibrado" },
  { value: "strict", label: "Rigoroso" },
  { value: "motivational", label: "Motivacional" },
  { value: "technical", label: "Técnico" },
  { value: "friendly", label: "Amigável" },
];

export function TelegramPersonalInsightsCard() {
  const { prefs, loading, save } = usePersonalInsightsTelegramPrefs();
  const { linked } = useTelegramReportsLink();
  const [sending, setSending] = useState(false);

  const slots: SlotKey[] = ["send_time_1", "send_time_2", "send_time_3"];
  const active = slots.filter((s) => !!prefs[s]);
  const canAddMore = active.length < 3;

  const sendNow = async () => {
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-personal-insights-telegram", { body: {} });
      if (error) throw error;
      toast.success("Insights enviados para o Telegram!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar insights");
    } finally {
      setSending(false);
    }
  };

  if (loading) return null;

  return (
    <Card no3d>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">Insights pessoais por IA</h3>
              <p className="text-xs text-muted-foreground truncate">
                Análise das suas finanças pessoais gerada por IA. Até 3 horários.
              </p>
            </div>
          </div>
          <Switch checked={prefs.enabled} onCheckedChange={(v) => save({ enabled: v })} />
        </div>

        {prefs.enabled && (
          <div className="space-y-3 pt-2 border-t border-border/40">
            <div className="space-y-1">
              <Label className="text-xs">Tom da análise</Label>
              <Select value={prefs.tone} onValueChange={(v) => save({ tone: v as InsightTone })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TONES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Alertar ao estourar orçamento</Label>
              <Switch checked={prefs.alert_on_exceed} onCheckedChange={(v) => save({ alert_on_exceed: v })} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Alertar sobre tendências</Label>
              <Switch checked={prefs.alert_on_trend} onCheckedChange={(v) => save({ alert_on_trend: v })} />
            </div>

            {active.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum horário configurado.</p>
            )}
            {active.map((key, idx) => (
              <div key={key} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Horário {idx + 1}
                  </Label>
                  <Input
                    type="time"
                    value={prefs[key] ?? ""}
                    onChange={(e) => save({ [key]: e.target.value || null } as any)}
                  />
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => save({ [key]: null } as any)} title="Remover horário">
                  <X className="w-[25px] h-[25px] text-destructive" />
                </Button>
              </div>
            ))}

            <div className="flex gap-2">
              {canAddMore && (
                <Button
                  type="button" variant="outline" size="sm" className="flex-1 min-w-0"
                  onClick={() => save({ [slots.find((s) => !prefs[s])!]: "08:00" } as any)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> <span className="truncate">Adicionar horário</span>
                </Button>
              )}
              <Button type="button" size="sm" className="flex-1 min-w-0" onClick={sendNow} disabled={sending || !linked}>
                <Send className="h-3.5 w-3.5 mr-1" />
                <span className="truncate">{sending ? "Enviando..." : "Enviar agora"}</span>
              </Button>
            </div>
            {!linked && (
              <p className="text-[11px] text-muted-foreground">Conecte o Bot de Relatórios para habilitar os envios.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
