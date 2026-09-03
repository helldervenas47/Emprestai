import { useState } from "react";
import { Bell, BellOff, Clock, Send, Loader2, AlertTriangle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";

const timeOptions = Array.from({ length: 24 }, (_, i) => {
  const h = String(i).padStart(2, "0");
  return `${h}:00`;
});

export function PushNotificationToggle() {
  const { isSupported, isSubscribed, isLoading, permission, subscribe, unsubscribe, sendTime, updateSendTime, sendTestNotification, needsInstall } = usePushNotifications();
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    const ok = await sendTestNotification();
    if (ok) {
      toast.success("Notificação de teste enviada!");
    } else {
      toast.error("Falha ao enviar notificação de teste.");
    }
    setTesting(false);
  };

  if (!isSupported) return null;

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      const ok = await subscribe();
      if (ok) {
        toast.success("Notificações ativadas!");
      } else if (permission === "denied") {
        toast.error("Permissão negada. Habilite nas configurações do navegador.");
      }
    } else {
      await unsubscribe();
      toast.info("Notificações desativadas.");
    }
  };

  const handleTimeChange = async (value: string) => {
    await updateSendTime(value);
    toast.success(`Horário alterado para ${value}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" title="Notificações push">
          {isSubscribed ? (
            <Bell className="h-4 w-4 text-primary" />
          ) : (
            <BellOff className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4" align="end">
        <div className="space-y-4">
          {needsInstall && (
            <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-200">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-400" />
              <span>No iOS, instale o app na Tela de Início primeiro: Safari → Compartilhar → Adicionar à Tela de Início.</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Notificações Push</span>
            <Switch
              checked={isSubscribed}
              onCheckedChange={handleToggle}
              disabled={isLoading || needsInstall}
              aria-label="Notificações push"
            />
          </div>
          {isSubscribed && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>Horário do lembrete</span>
              </div>
              <Select value={sendTime} onValueChange={handleTimeChange}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="w-full" onClick={handleTest} disabled={testing}>
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                Enviar teste
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
