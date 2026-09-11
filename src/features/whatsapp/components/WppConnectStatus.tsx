import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/userClient";
import { Loader2, Power, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export function WppConnectStatus() {
  const { dataOwnerId } = useAuth();
  const [state, setState] = React.useState<"unknown" | "connected" | "connecting" | "disconnected">("unknown");
  const [qr, setQr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const call = React.useCallback(async (action: "status" | "connect" | "disconnect", quiet = false) => {
    setBusy(true);
    if (action === "connect") setState("connecting");
    const { data, error } = await supabase.functions.invoke("whatsapp-session", { body: { action, owner_id: dataOwnerId } });
    setBusy(false);
    if (error || data?.error) {
      let failure = data as any;
      const context = (error as any)?.context;
      if (!failure && context && typeof context.json === "function") {
        try { failure = await context.json(); } catch { /* resposta sem JSON */ }
      }
      if (!quiet) {
        const detail = failure?.message
          ? `${failure.message}${failure.upstream_status ? ` (HTTP ${failure.upstream_status})` : ""}`
          : failure?.error
            ? `Falha na conexão: ${failure.error}`
            : `Não foi possível comunicar com o WPPConnect${(error as any)?.message ? `: ${(error as any).message}` : "."}`;
        toast.error(detail);
      }
      setState("disconnected");
      return;
    }
    const value = String(data.state || data.status || data.message || "").toLowerCase();
    const disconnected = ["disconnect", "notlogged", "not logged", "closed", "browserclose", "autoclose"]
      .some((item) => value.includes(item));
    const connected = !disconnected && ["connected", "islogged", "inchat", "qrreadsuccess"]
      .some((item) => value.includes(item));
    setState(connected ? "connected" : value.includes("connecting") || action === "connect" ? "connecting" : "disconnected");
    setQr(data.qrcode || null);
  }, [dataOwnerId]);
  React.useEffect(() => { call("status"); }, [call]);
  React.useEffect(() => {
    if (state !== "connecting") return;
    const timer = window.setInterval(() => call("status", true), 3_000);
    return () => window.clearInterval(timer);
  }, [state, call]);
  return <Card no3d className="rounded-2xl border-border/60"><CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-3.5">
    <div className="flex min-w-0 flex-1 items-start gap-2">{state === "connected" ? <Wifi className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500"/> : state === "connecting" ? <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-amber-500"/> : <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-destructive"/>}<div className="min-w-0"><p className="text-sm font-semibold">WhatsApp {state === "connected" ? "conectado" : state === "connecting" ? "conectando..." : "desconectado"}</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Sessão processada no servidor; credenciais não chegam ao navegador.</p></div></div>
    {qr && <img src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`} alt="QR Code temporário do WhatsApp" className="h-32 w-32 rounded-lg border bg-white p-1 self-center"/>}
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto"><Button size="sm" variant="outline" className="h-10 w-full sm:h-9 sm:w-auto" disabled={busy} onClick={() => call("status")}><RefreshCw className="h-3.5 w-3.5 mr-1"/>Verificar</Button>{state === "connected" ? <Button size="sm" variant="outline" className="h-10 w-full sm:h-9 sm:w-auto" onClick={() => call("disconnect")}><Power className="h-3.5 w-3.5 mr-1"/>Desconectar</Button> : <Button size="sm" className="h-10 w-full sm:h-9 sm:w-auto" onClick={() => call("connect")}>Conectar</Button>}</div>
  </CardContent></Card>;
}
