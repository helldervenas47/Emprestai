import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, Clock } from "lucide-react";
import { useTelegramSummaryPref } from "@/features/telegram/hooks/useTelegramSummaryPref";

const WEEKDAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
];

export function TelegramFinancialSummariesCard() {
  const { pref, loading, update } = useTelegramSummaryPref();

  if (loading) return null;

  return (
    <Card no3d>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2 min-w-0">
          <BarChart3 className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Resumos diário, semanal e mensal</h3>
            <p className="text-xs text-muted-foreground truncate">
              Resumos consolidados do negócio enviados pelo bot.
            </p>
          </div>
        </div>

        {/* Diário */}
        <div className="space-y-2 pt-2 border-t border-border/40">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-medium">Resumo diário</Label>
            <Switch checked={pref.enabled} onCheckedChange={(v) => update({ enabled: v })} />
          </div>
          {pref.enabled && (
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Horário</Label>
              <Input type="time" value={pref.send_time} onChange={(e) => update({ send_time: e.target.value })} />
            </div>
          )}
        </div>

        {/* Semanal */}
        <div className="space-y-2 pt-2 border-t border-border/40">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-medium">Resumo semanal</Label>
            <Switch checked={pref.weekly_enabled} onCheckedChange={(v) => update({ weekly_enabled: v })} />
          </div>
          {pref.weekly_enabled && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Dia</Label>
                <Select
                  value={String(pref.weekly_send_weekday)}
                  onValueChange={(v) => update({ weekly_send_weekday: Number(v) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((d) => (
                      <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Horário</Label>
                <Input type="time" value={pref.weekly_send_time} onChange={(e) => update({ weekly_send_time: e.target.value })} />
              </div>
            </div>
          )}
        </div>

        {/* Mensal */}
        <div className="space-y-2 pt-2 border-t border-border/40">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-medium">Resumo mensal</Label>
            <Switch checked={pref.monthly_enabled} onCheckedChange={(v) => update({ monthly_enabled: v })} />
          </div>
          {pref.monthly_enabled && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Dia do mês</Label>
                  <Select
                    value={String(pref.monthly_send_day)}
                    onValueChange={(v) => update({ monthly_send_day: Number(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Horário</Label>
                  <Input type="time" value={pref.monthly_send_time} onChange={(e) => update({ monthly_send_time: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Formato</Label>
                <Select
                  value={pref.monthly_format}
                  onValueChange={(v) => update({ monthly_format: v as "text" | "image" })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="image">Imagem</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
