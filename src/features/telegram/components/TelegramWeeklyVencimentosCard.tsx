import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, CalendarClock, Clock } from "lucide-react";
import { useTelegramReportsLink } from "@/features/telegram/hooks/useTelegramReportsLink";
import { supabase } from "@/integrations/supabase/userClient";
import { toast } from "sonner";

const WEEKDAYS = [
  { v: 0, label: "Domingo" },
  { v: 1, label: "Segunda-feira" },
  { v: 2, label: "Terça-feira" },
  { v: 3, label: "Quarta-feira" },
  { v: 4, label: "Quinta-feira" },
  { v: 5, label: "Sexta-feira" },
  { v: 6, label: "Sábado" },
];

export function TelegramWeeklyVencimentosCard() {
  const { linked } = useTelegramReportsLink();
  const [enabled, setEnabled] = useState(true);
  const [weekday, setWeekday] = useState(1);
  const [sendTime, setSendTime] = useState("08:00");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) return;
        const { data } = await (supabase as any)
          .from("telegram_weekly_vencimentos_prefs")
          .select("enabled, weekday, send_time")
          .eq("user_id", auth.user.id)
          .maybeSingle();
        if (data) {
          setEnabled(data.enabled !== false);
          if (typeof data.weekday === "number") setWeekday(data.weekday);
          if (data.send_time) setSendTime(String(data.send_time).slice(0, 5));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async (patch: Partial<{ enabled: boolean; weekday: number; send_time: string }>) => {
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;
      await (supabase as any).from("telegram_weekly_vencimentos_prefs").upsert({
        user_id: auth.user.id,
        enabled,
        weekday,
        send_time: sendTime,
        ...patch,
        updated_at: new Date().toISOString(),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSendNow = async () => {
    setSendingNow(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) throw new Error("Sessão não encontrada");
      const { error } = await supabase.functions.invoke(
        `telegram-vencimentos-semana?user_id=${userId}`,
        { body: {} },
      );
      if (error) throw error;
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
              <h3 className="text-sm font-semibold text-foreground">Vencimentos da semana</h3>
              <p className="text-xs text-muted-foreground truncate">
                Escolha o dia e o horário do envio automático.
              </p>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => { setEnabled(v); save({ enabled: v }); }}
            disabled={saving}
          />
        </div>

        {enabled && (
          <div className="space-y-3 pt-2 border-t border-border/40">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" /> Dia
                </Label>
                <Select
                  value={String(weekday)}
                  onValueChange={(v) => { const n = Number(v); setWeekday(n); save({ weekday: n }); }}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((d) => (
                      <SelectItem key={d.v} value={String(d.v)}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Horário
                </Label>
                <Input
                  type="time"
                  value={sendTime}
                  onChange={(e) => setSendTime(e.target.value)}
                  onBlur={() => save({ send_time: sendTime })}
                />
              </div>
            </div>

            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={handleSendNow}
              disabled={sendingNow || !linked}
            >
              <Send className="h-3.5 w-3.5 mr-1" />
              <span className="truncate">{sendingNow ? "Enviando..." : "Enviar agora"}</span>
            </Button>
            {!linked && (
              <p className="text-[11px] text-muted-foreground">
                Conecte o Bot de Relatórios para habilitar os envios.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
