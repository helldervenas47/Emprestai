import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send, Plus, X, Clock } from "lucide-react";
import { useTelegramBillingPref } from "@/features/telegram/hooks/useTelegramBillingPref";
import { useAuth } from "@/hooks/useAuth";
import { supabase, USER_SUPABASE_URL, USER_SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/userClient";
import { toast } from "sonner";


type SlotKey = "send_time_1" | "send_time_2" | "send_time_3";

export function TelegramBillingScheduleCard() {
  const { pref, loading, update } = useTelegramBillingPref();
  const { user } = useAuth();
  const [sendingNow, setSendingNow] = useState(false);

  const slots: SlotKey[] = ["send_time_1", "send_time_2", "send_time_3"];
  const activeSlots = slots.filter((s) => !!pref[s]);
  const canAddMore = activeSlots.length < 3;

  const handleAddSlot = () => {
    const next = slots.find((s) => !pref[s]);
    if (next) update({ [next]: "08:00" } as any);
  };

  const handleRemoveSlot = (key: SlotKey) => {
    update({ [key]: null } as any);
  };

  const handleChangeSlot = (key: SlotKey, value: string) => {
    update({ [key]: value } as any);
  };

  const handleSendNow = async () => {
    if (!user) return;
    setSendingNow(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Faça login novamente para enviar o relatório");
      const url = `${USER_SUPABASE_URL}/functions/v1/telegram-billing-summary?user_id=${user.id}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: USER_SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha no envio");
      if ((json.sent ?? 0) > 0) toast.success("Relatório enviado para o Telegram!");
      else toast.error("Conecte o Telegram primeiro para receber o relatório.");
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
            <Send className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">Envio automático para Telegram</h3>
              <p className="text-xs text-muted-foreground truncate">
                Receba o relatório de cobrança no Telegram em até 3 horários por dia.
              </p>
            </div>
          </div>
          <Switch
            checked={pref.enabled}
            onCheckedChange={(v) => update({ enabled: v })}
          />
        </div>

        {pref.enabled && (
          <div className="space-y-3 pt-2 border-t border-border/40">
            <div className="space-y-2">
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
                      value={pref[key] ?? ""}
                      onChange={(e) => handleChangeSlot(key, e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveSlot(key)}
                    title="Remover horário"
                  >
                    <X className="w-[25px] h-[25px] text-destructive" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              {canAddMore && (
                <Button type="button" variant="outline" size="sm" className="flex-1 min-w-0" onClick={handleAddSlot}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> <span className="truncate">Adicionar horário</span>
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                className="flex-1 min-w-0"
                onClick={handleSendNow}
                disabled={sendingNow}
              >
                <Send className="h-3.5 w-3.5 mr-1" />
                <span className="truncate">{sendingNow ? "Enviando..." : "Enviar agora"}</span>
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground">
              💡 É necessário ter o Telegram conectado em Notificações. O relatório usa o mesmo formato visual da prévia abaixo e é gerado com os dados atuais no momento do envio.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
