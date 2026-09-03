import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Send, Plus, X, Clock, CalendarClock } from "lucide-react";
import { useDailyPlanningTelegramPrefs } from "@/features/telegram/hooks/useDailyPlanningTelegramPrefs";
import { useTelegramReportsLink } from "@/features/telegram/hooks/useTelegramReportsLink";
import { supabase } from "@/integrations/supabase/userClient";
import { toast } from "sonner";


type SlotKey = "send_time_1" | "send_time_2" | "send_time_3";

export function TelegramDailyPlanningScheduleCard() {
  const { prefs, loading, save } = useDailyPlanningTelegramPrefs();
  const { linked } = useTelegramReportsLink();
  const [sendingNow, setSendingNow] = useState(false);

  const slots: SlotKey[] = ["send_time_1", "send_time_2", "send_time_3"];
  const activeSlots = slots.filter((s) => !!prefs[s]);
  const canAddMore = activeSlots.length < 3;

  const handleSendNow = async () => {
    setSendingNow(true);
    try {
      const { data, error } = await supabase.functions.invoke("daily-planning-summary", { body: {} });
      if (error) throw error;
      if (!data?.sent) {
        const reason = data?.reason === "no_reports_link"
          ? "Conecte o Bot de Relatórios novamente e tente enviar."
          : "O backend respondeu, mas o Telegram não confirmou o envio.";
        toast.warning("Nada enviado", { description: reason });
        return;
      }
      toast.success("Relatório enviado para o Telegram!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar relatório");
    } finally {
      setSendingNow(false);
    }
  };

  if (loading) return null;

  return (
    <Card no3d>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarClock className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">Planejamento do dia seguinte</h3>
              <p className="text-xs text-muted-foreground truncate">
                Receba o planejamento financeiro com o que vence no dia. Até 3 horários por dia.
              </p>
            </div>
          </div>
          <Switch checked={prefs.enabled} onCheckedChange={(v) => save({ enabled: v })} />
        </div>

        {prefs.enabled && (
          <div className="space-y-3 pt-2 border-t border-border/40">

            {activeSlots.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum horário configurado.</p>
            )}
            {activeSlots.map((key, idx) => (
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
                <Button type="button" variant="outline" size="sm" className="flex-1 min-w-0" onClick={() => save({ [slots.find((s) => !prefs[s])!]: "08:00" } as any)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> <span className="truncate">Adicionar horário</span>
                </Button>
              )}
              <Button type="button" size="sm" className="flex-1 min-w-0" onClick={handleSendNow} disabled={sendingNow || !linked}>
                <Send className="h-3.5 w-3.5 mr-1" />
                <span className="truncate">{sendingNow ? "Enviando..." : "Enviar agora"}</span>
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
