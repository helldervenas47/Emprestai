import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send, Plus, X, Clock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useScheduledReportPrefs } from "@/hooks/useScheduledReportPrefs";
import { useTelegramReportsLink } from "@/features/telegram/hooks/useTelegramReportsLink";
import { supabase } from "@/integrations/supabase/userClient";
import { toast } from "sonner";


type SlotKey = "send_time_1" | "send_time_2" | "send_time_3";

interface Props {
  title: string;
  description: string;
  Icon: LucideIcon;
  prefsTable: string;
  functionName: string;
  defaultTime: string;
}

export function ScheduledReportCard({ title, description, Icon, prefsTable, functionName, defaultTime }: Props) {
  const { prefs, loading, save } = useScheduledReportPrefs(prefsTable, defaultTime);
  const { linked } = useTelegramReportsLink();
  const [sending, setSending] = useState(false);

  const slots: SlotKey[] = ["send_time_1", "send_time_2", "send_time_3"];
  const active = slots.filter((s) => !!prefs[s]);
  const canAddMore = active.length < 3;

  const sendNow = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke(functionName, { body: {} });
      if (error) throw error;
      if (data?.error) {
        toast.error("Erro no relatório", { description: data.error });
        return;
      }
      if (!data?.sent) {
        toast.warning("Nada enviado", {
          description: data?.reason === "no_reports_link"
            ? "Conecte o Bot de Relatórios e tente novamente."
            : "O Telegram não confirmou o envio.",
        });
        return;
      }
      toast.success("Relatório enviado!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar");
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
            <Icon className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              <p className="text-xs text-muted-foreground truncate">{description}</p>
            </div>
          </div>
          <Switch checked={prefs.enabled} onCheckedChange={(v) => save({ enabled: v })} />
        </div>

        {prefs.enabled && (
          <div className="space-y-3 pt-2 border-t border-border/40">
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
                  onClick={() => save({ [slots.find((s) => !prefs[s])!]: defaultTime } as any)}
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
