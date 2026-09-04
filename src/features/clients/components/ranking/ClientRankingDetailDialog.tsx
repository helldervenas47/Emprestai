import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClientRankingItem } from "../../types/clientRanking";
import { getClientRiskScoreInfo } from "../../lib/clientRiskScore";
import { formatBRL } from "@/features/creditCards/lib/creditLimit";
import { Badge } from "@/components/ui/badge";
import {
  Trophy,
  ShieldCheck,
  TrendingUp,
  DollarSign,
  Clock,
  Flame,
  Wallet,
  CheckCircle2,
  AlertCircle,
  FileText,
} from "lucide-react";

interface ClientRankingDetailDialogProps {
  item: ClientRankingItem | null;
  onClose: () => void;
}

export function ClientRankingDetailDialog({
  item,
  onClose,
}: ClientRankingDetailDialogProps) {
  const riskInfo = useMemo(() => {
    if (!item) return null;
    return getClientRiskScoreInfo(item.score);
  }, [item]);

  if (!item || !riskInfo) return null;

  return (
    <Dialog open={!!item} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[550px] p-0 overflow-hidden">
        {/* Header com avatar e score */}
        <DialogHeader className="p-4 sm:p-6 bg-muted/30 border-b border-border/60">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-base shrink-0 uppercase">
                {item.client_name.slice(0, 2)}
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                  {item.client_name}
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {item.client_cpf ? `CPF: ${item.client_cpf}` : "Cliente cadastrado"}
                  {item.client_phone && ` • ${item.client_phone}`}
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs font-semibold text-muted-foreground block">Posição</span>
              <span className="text-base sm:text-lg font-extrabold text-foreground flex items-center justify-end gap-1">
                <Trophy className="h-4 w-4 text-amber-500" />
                #{item.position}
              </span>
            </div>
          </div>

          {/* Badge de Score e Risco */}
          <div className="mt-3 flex items-center gap-2">
            <Badge
              variant="outline"
              className={`text-xs px-2.5 py-0.5 font-bold ${riskInfo.color} ${riskInfo.bgColor}/10 border-current/30`}
            >
              <ShieldCheck className="h-3.5 w-3.5 mr-1" />
              Score: {riskInfo.score}/100 • {riskInfo.label}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              Pontualidade: {item.on_time_percentage.toFixed(0)}%
            </Badge>
          </div>
        </DialogHeader>

        {/* Grade de Métricas Detalhadas */}
        <div className="p-4 sm:p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
              Resumo Financeiro
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="p-3 rounded-lg border border-border/50 bg-card">
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
                  <TrendingUp className="h-3.5 w-3.5 text-primary" />
                  <span>Emprestado</span>
                </div>
                <span className="text-sm sm:text-base font-bold text-foreground block">
                  {formatBRL(item.total_borrowed)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {item.total_loans} contrato(s)
                </span>
              </div>

              <div className="p-3 rounded-lg border border-border/50 bg-card">
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  <span>Total Recebido</span>
                </div>
                <span className="text-sm sm:text-base font-bold text-success block">
                  {formatBRL(item.total_received)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {item.total_payments} pagamento(s)
                </span>
              </div>

              <div className="p-3 rounded-lg border border-border/50 bg-card col-span-2 sm:col-span-1">
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
                  <DollarSign className="h-3.5 w-3.5 text-amber-500" />
                  <span>Juros Recebidos</span>
                </div>
                <span className="text-sm sm:text-base font-bold text-amber-600 dark:text-amber-400 block">
                  {formatBRL(item.profit_generated)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Total de juros recebidos
                </span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
              Pontualidade e Atrasos
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="p-3 rounded-lg border border-border/50 bg-card">
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
                  <Clock className="h-3.5 w-3.5 text-success" />
                  <span>Em Dia</span>
                </div>
                <span className="text-sm sm:text-base font-bold text-foreground block">
                  {item.on_time_payments}
                </span>
                <span className="text-[10px] text-success">
                  {item.on_time_percentage.toFixed(0)}% de pontualidade
                </span>
              </div>

              <div className="p-3 rounded-lg border border-border/50 bg-card">
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
                  <Flame className="h-3.5 w-3.5 text-destructive" />
                  <span>Maior Atraso</span>
                </div>
                <span className={`text-sm sm:text-base font-bold block ${item.max_delay_days > 0 ? "text-destructive" : "text-foreground"}`}>
                  {item.max_delay_days} dias
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {item.overdue_loans} empréstimo(s) com atraso
                </span>
              </div>

              <div className="p-3 rounded-lg border border-border/50 bg-card col-span-2 sm:col-span-1">
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
                  <Wallet className="h-3.5 w-3.5 text-primary" />
                  <span>Saldo em Aberto</span>
                </div>
                <span className="text-sm sm:text-base font-bold text-foreground block">
                  {formatBRL(item.open_amount)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Principal, juros e multas
                </span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
