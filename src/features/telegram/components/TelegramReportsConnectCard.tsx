import { forwardRef, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, Copy, CheckCircle2, Unlink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useTelegramReportsLink } from "@/features/telegram/hooks/useTelegramReportsLink";
import { generateTelegramLinkCode, invokeUserFunction } from "@/features/telegram/lib/telegramLinkCode";


export const TelegramReportsConnectCard = forwardRef<HTMLDivElement, Record<string, never>>(function TelegramReportsConnectCard(_, ref) {
  const { linked, loading, disconnect, refresh } = useTelegramReportsLink();
  const [code, setCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [syncingCommands, setSyncingCommands] = useState(false);
  const syncingTelegramRef = useRef(false);

  useEffect(() => {
    if (loading || linked) return;
    let stopped = false;
    const syncTelegram = async () => {
      if (stopped || syncingTelegramRef.current) return;
      if (typeof document !== "undefined" && document.hidden) return;
      syncingTelegramRef.current = true;
      try {
        await invokeUserFunction("telegram-reports-poll").catch(() => null);
        await refresh();
      } finally {
        syncingTelegramRef.current = false;
      }
    };
    syncTelegram();
    // Ativo apenas enquanto o card está aberto e não vinculado; pausa se aba oculta.
    const interval = window.setInterval(syncTelegram, 30000);
    return () => { stopped = true; window.clearInterval(interval); };
  }, [loading, linked, refresh]);

  const generateCode = async () => {
    setGenerating(true);
    try {
      const data = await generateTelegramLinkCode("telegram-reports-link-code");
      if ((data as any).alreadyLinked) {
        toast.success("Bot de Relatórios já conectado");
        return;
      }
      setCode((data as any).code);
    } catch (e: any) {
      toast.error("Erro ao gerar código", { description: e.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleSyncCommands = async () => {
    setSyncingCommands(true);
    try {
      const data: any = await invokeUserFunction("telegram-set-commands");
      if (data?.ok === false) {
        toast.error("Falha ao sincronizar comandos", { description: data.error || "Erro desconhecido." });
      } else {
        toast.success("Menu e comandos do Telegram atualizados!");
      }
    } catch (e: any) {
      toast.error("Erro ao sincronizar comandos", { description: e?.message ?? "Tente novamente." });
    } finally {
      setSyncingCommands(false);
    }
  };

  const copyCommand = () => {
    if (!code) return;
    navigator.clipboard.writeText(`/start ${code}`);
    toast.success("Comando copiado!");
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setCode(null);
      toast.success("Bot de Relatórios desvinculado");
    } catch (e: any) {
      toast.error("Erro ao desconectar", { description: e?.message ?? "Tente novamente." });
    }
  };

  if (loading) return null;

  return (
    <Card ref={ref} no3d>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Send className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <p className="font-semibold text-sm whitespace-nowrap">Bot de Relatórios (Telegram)</p>
                {linked && (
                  <span className="inline-flex items-center gap-1 text-xs text-success font-medium sm:hidden">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Conectado
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                Independente do bot de despesas. Recebe os relatórios de cobrança.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-border/40">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSyncCommands}
              disabled={syncingCommands}
              title="Atualizar comandos e botão de menu no Telegram"
              className="text-xs text-muted-foreground hover:text-foreground h-8 px-2"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncingCommands ? "animate-spin" : ""}`} />
              Sincronizar Comandos
            </Button>
            {linked && (
              <span className="hidden sm:inline-flex items-center gap-1 text-xs text-success font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> Conectado
              </span>
            )}
          </div>
        </div>

        {linked ? (
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs text-muted-foreground">
              Chat: <span className="font-mono">{linked.chat_id}</span>
            </p>
            <Button size="sm" variant="outline" onClick={handleDisconnect}>
              <Unlink className="h-3.5 w-3.5 mr-1" /> Desvincular
            </Button>
          </div>
        ) : code ? (
          <div className="space-y-2 pt-1">
            <p className="text-xs text-muted-foreground">
              1. Abra o bot de relatórios no Telegram<br />
              2. Envie o comando abaixo (válido por 10 min):
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-md bg-muted font-mono text-sm">/start {code}</code>
              <Button size="sm" variant="outline" onClick={copyCommand}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Aguardando vínculo… atualiza automaticamente.
            </p>
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            <Button size="sm" onClick={generateCode} disabled={generating} className="w-full sm:w-auto">
              <Send className="h-3.5 w-3.5 mr-1" />
              {generating ? "Gerando…" : "Conectar bot de relatórios"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Clique acima para gerar o comando <code className="font-mono">/start</code> e enviá-lo ao bot de relatórios.
            </p>
          </div>
        )}




      </CardContent>
    </Card>
  );
});
