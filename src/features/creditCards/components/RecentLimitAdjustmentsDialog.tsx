import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, Sparkles, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/userClient";
import { formatBRL } from "@/features/creditCards/lib/creditLimit";
import type { Client } from "@/types/loan";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
  /** Window in days to consider an adjustment "recent". Default 30. */
  days?: number;
}

interface AdjustmentRow {
  id: string;
  clientId: string;
  previousLimit: number;
  newLimit: number;
  reason: string | null;
  createdAt: string;
  changeType: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function RecentLimitAdjustmentsDialog({ open, onOpenChange, clients, days = 30 }: Props) {
  const [rows, setRows] = useState<AdjustmentRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await supabase
        .from("credit_limit_history")
        .select("id, client_id, previous_limit, new_limit, reason, created_at, change_type")
        .eq("change_type", "automatic")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (!error && data) {
        setRows(
          data.map((r: any) => ({
            id: r.id,
            clientId: r.client_id,
            previousLimit: Number(r.previous_limit ?? 0),
            newLimit: Number(r.new_limit ?? 0),
            reason: r.reason,
            createdAt: r.created_at,
            changeType: r.change_type,
          })),
        );
      }
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, days]);

  const clientMap = new Map(clients.map((c) => [c.id, c]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Ajustes recentes de limite
          </DialogTitle>
          <DialogDescription>
            Clientes que tiveram o limite de crédito ajustado automaticamente nos últimos {days} dias.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhum ajuste automático registrado nos últimos {days} dias.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const client = clientMap.get(r.clientId);
              const delta = r.newLimit - r.previousLimit;
              const isUp = delta > 0;
              const isDown = delta < 0;
              return (
                <div
                  key={r.id}
                  className="rounded-lg border bg-card p-3 flex items-start justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{client?.name ?? "Cliente removido"}</p>
                      <Badge
                        variant="outline"
                        className={
                          isUp
                            ? "border-success text-success"
                            : isDown
                            ? "border-destructive text-destructive"
                            : "border-muted-foreground text-muted-foreground"
                        }
                      >
                        {isUp ? (
                          <ArrowUp className="h-3 w-3 mr-1" />
                        ) : isDown ? (
                          <ArrowDown className="h-3 w-3 mr-1" />
                        ) : (
                          <Minus className="h-3 w-3 mr-1" />
                        )}
                        {isUp ? "+" : ""}
                        {formatBRL(delta)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatBRL(r.previousLimit)} → <strong>{formatBRL(r.newLimit)}</strong>
                    </p>
                    {r.reason && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.reason}</p>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {formatDate(r.createdAt)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
