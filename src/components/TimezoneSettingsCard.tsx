import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, Loader2 } from "lucide-react";
import { useAccountSettings } from "@/hooks/useAccountSettings";
import { COMMON_TIMEZONES, todayInAppTz } from "@/lib/timezone";
import { toast } from "sonner";

export function TimezoneSettingsCard({ disabled = false }: { disabled?: boolean }) {
  const { settings, loading, saving, updateTimezone } = useAccountSettings();
  const [preview, setPreview] = useState<string>("");

  // Update preview every 30s and whenever the tz changes.
  useEffect(() => {
    const tick = () => {
      try {
        const now = new Date();
        const fmt = new Intl.DateTimeFormat("pt-BR", {
          timeZone: settings.timezone,
          dateStyle: "full",
          timeStyle: "short",
        });
        setPreview(fmt.format(now));
      } catch {
        setPreview(todayInAppTz());
      }
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [settings.timezone]);

  const handleChange = async (value: string) => {
    const ok = await updateTimezone(value);
    if (ok) toast.success("Fuso horário atualizado.");
    else toast.error("Falha ao atualizar fuso horário.");
  };

  // Ensure the saved timezone appears even if not in the common list.
  const options = COMMON_TIMEZONES.some((t) => t.value === settings.timezone)
    ? COMMON_TIMEZONES
    : [{ label: settings.timezone, value: settings.timezone }, ...COMMON_TIMEZONES];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="h-4 w-4 text-primary" />
          Fuso Horário
          {(loading || saving) && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription className="text-xs">
          Define o fuso usado em todo o app para identificar atrasos, registrar pagamentos e exibir datas.
          Aplica-se a toda a conta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={settings.timezone} onValueChange={handleChange} disabled={disabled || saving}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {options.map((tz) => (
              <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Agora: </span>
          {preview || "—"}
        </div>
      </CardContent>
    </Card>
  );
}
