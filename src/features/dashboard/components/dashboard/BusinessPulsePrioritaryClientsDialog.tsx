import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/features/creditCards/lib/creditLimit";
import { AlertCircle, Clock, ShieldCheck, User } from "lucide-react";
import type { PulsePrioritaryClient } from "../lib/businessPulse/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: PulsePrioritaryClient[];
  totalOverdueAmount: number;
}

export function BusinessPulsePrioritaryClientsDialog({
  open,
  onOpenChange,
  clients,
  totalOverdueAmount,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-center shrink-0">
              <AlertCircle className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold">Clientes Prioritários para Cobrança</DialogTitle>
              <DialogDescription className="text-xs">
                Estes clientes concentram o maior valor atrasado na carteira atualmente.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 mt-2 max-h-[60vh] overflow-y-auto pr-1">
          {clients.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum cliente em atraso relevante no momento.
            </p>
          ) : (
            clients.map((c, idx) => (
              <div
                key={c.clientId || idx}
                className="rounded-xl border border-border/70 bg-card p-3.5 space-y-2.5 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-bold text-muted-foreground">
                      #{idx + 1}
                    </div>
                    <span className="font-semibold text-sm text-foreground truncate">
                      {c.clientName}
                    </span>
                  </div>
                  <Badge variant="outline" className={`text-xs px-2 py-0.5 font-bold uppercase ${c.badgeClassName}`}>
                    RISCO: {c.riskLevel}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/40 text-xs">
                  <div>
                    <span className="text-muted-foreground text-[11px] block">Valor Vencido</span>
                    <span className="font-bold text-destructive text-xs">
                      {formatBRL(c.overdueAmount)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px] block">Atraso</span>
                    <span className="font-semibold text-foreground text-xs flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      {c.maxOverdueDays} dia(s)
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px] block">Score</span>
                    <span className="font-semibold text-foreground text-xs flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3 text-primary" />
                      {c.score}/100
                    </span>
                  </div>
                </div>

                {totalOverdueAmount > 0 && (
                  <div className="text-[11px] text-muted-foreground bg-muted/40 rounded-md px-2 py-1">
                    Representa <strong className="text-foreground">{c.shareOfTotalOverduePct}%</strong> do valor total vencido da carteira.
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
