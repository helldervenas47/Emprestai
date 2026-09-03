import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CloudOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { flushQueue, usePendingCount } from "@/lib/offline/sync";
import { useOnlineStatus } from "@/lib/offline/status";
import { toast } from "sonner";

const TABLE_LABELS: Record<string, string> = {
  expenses: "Despesas",
  clients: "Clientes",
  loans: "Empréstimos",
  loan_installments: "Parcelas",
  payments: "Pagamentos",
};

export function PendingSyncCard() {
  const online = useOnlineStatus();
  const { count, byTable, balanceDelta } = usePendingCount();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    if (!online) {
      toast.error("Sem conexão. Tente quando voltar online.");
      return;
    }
    setSyncing(true);
    try {
      const result = await flushQueue();
      if (result.flushed === 0 && result.failed === 0) {
        toast.info("Nenhuma alteração pendente.");
      }
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CloudOff className="h-4 w-4 text-muted-foreground" />
          Sincronização offline
        </CardTitle>
        <CardDescription>
          Despesas, clientes e empréstimos podem ser registrados offline. Suas alterações são
          enfileiradas e enviadas automaticamente quando voltar online.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <span className="text-muted-foreground">Status: </span>
            <span className={online ? "text-foreground" : "text-destructive font-medium"}>
              {online ? "Online" : "Offline"}
            </span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Pendentes: </span>
            <span className="font-medium text-foreground">{count}</span>
          </div>
        </div>

        {count > 0 && (
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
            {Object.entries(byTable).map(([table, n]) => (
              <div key={table} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{TABLE_LABELS[table] || table}</span>
                <span className="font-medium text-foreground">{n}</span>
              </div>
            ))}
            {balanceDelta !== 0 && (
              <div className="flex justify-between text-xs pt-1 border-t border-border/60">
                <span className="text-muted-foreground">Ajuste de saldo pendente</span>
                <span className={`font-medium ${balanceDelta >= 0 ? "text-foreground" : "text-destructive"}`}>
                  {balanceDelta >= 0 ? "+" : ""}
                  {balanceDelta.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>
            )}
          </div>
        )}

        {count === 0 && online && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Tudo sincronizado.
          </div>
        )}

        <Button
          onClick={handleSync}
          disabled={syncing || count === 0 || !online}
          variant="outline"
          size="sm"
          className="w-full"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizando…" : "Sincronizar agora"}
        </Button>
      </CardContent>
    </Card>
  );
}
