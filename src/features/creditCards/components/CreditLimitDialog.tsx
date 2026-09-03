import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowDown, ArrowUp, Bot, History, Loader2, RefreshCw, User } from "lucide-react";
import { toast } from "sonner";
import {
  useCreditLimits,
  type CreditLimitHistoryEntry,
} from "@/features/creditCards/hooks/useCreditLimits";
import {
  computeAutoLimitAdjustment,
  computeAvailableLimit,
  computeClientCreditMetrics,
  computeUsedLimit,
  formatBRL,
  MIN_LIMIT,
} from "@/features/creditCards/lib/creditLimit";
import type { Client, Loan, Payment } from "@/types/loan";

interface Props {
  client: Client;
  loans: Loan[];
  payments: Payment[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreditLimitDialog({ client, loans, payments, open, onOpenChange }: Props) {
  const { getLimitForClient, ensureLimit, updateLimit, fetchHistory } = useCreditLimits();
  const [history, setHistory] = useState<CreditLimitHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const limit = getLimitForClient(client.id);
  const currentLimit = limit?.currentLimit ?? 0;
  const used = useMemo(() => computeUsedLimit(client, loans, payments), [client, loans, payments]);
  const available = computeAvailableLimit(currentLimit, used);
  const metrics = useMemo(
    () => computeClientCreditMetrics(client.id, loans, payments),
    [client.id, loans, payments],
  );
  const proposed = useMemo(
    () => computeAutoLimitAdjustment(currentLimit, metrics),
    [currentLimit, metrics],
  );

  // Ensure a limit row exists when modal opens
  useEffect(() => {
    if (open) {
      ensureLimit(client.id);
    }
  }, [open, client.id, ensureLimit]);

  // Load history
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoadingHistory(true);
    fetchHistory(client.id).then((h) => {
      if (active) {
        setHistory(h);
        setLoadingHistory(false);
      }
    });
    return () => {
      active = false;
    };
  }, [open, client.id, fetchHistory]);

  // Reset form when client changes
  useEffect(() => {
    setManualValue(currentLimit ? String(currentLimit) : "");
    setManualReason("");
  }, [currentLimit, client.id]);

  const refreshHistory = async () => {
    setLoadingHistory(true);
    const h = await fetchHistory(client.id);
    setHistory(h);
    setLoadingHistory(false);
  };

  const handleSaveManual = async () => {
    const parsed = parseFloat(manualValue.replace(",", "."));
    if (isNaN(parsed) || parsed < MIN_LIMIT) {
      toast.error("Informe um valor válido para o limite");
      return;
    }
    setSubmitting(true);
    try {
      await updateLimit(client.id, Math.round(parsed * 100) / 100, {
        mode: "manual",
        changeType: "manual",
        reason: manualReason || "Ajuste manual",
      });
      toast.success("Limite atualizado");
      await refreshHistory();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecalculate = async () => {
    if (proposed.delta === 0) {
      toast.info("Nenhum ajuste sugerido com base no histórico atual");
      return;
    }
    setSubmitting(true);
    try {
      await updateLimit(client.id, proposed.newLimit, {
        mode: "auto",
        changeType: "automatic",
        reason: proposed.reason,
        metadata: {
          on_time_pct: metrics.onTimePct,
          avg_late_days: metrics.avgLateDays,
          paid_loans: metrics.paidLoans,
          total_installments_paid: metrics.totalInstallmentsPaid,
        },
      });
      toast.success("Limite recalculado automaticamente");
      await refreshHistory();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetMode = async (mode: "auto" | "manual") => {
    if (!limit || limit.mode === mode) return;
    await updateLimit(client.id, currentLimit, {
      mode,
      changeType: "manual",
      reason: mode === "auto" ? "Modo automático ativado" : "Modo manual ativado",
    });
    toast.success(`Modo ${mode === "auto" ? "automático" : "manual"} ativado`);
    await refreshHistory();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Limite de crédito — {client.name}</DialogTitle>
          <DialogDescription>
            Gerencie o limite de crédito disponível para este cliente.
          </DialogDescription>
        </DialogHeader>

        {/* Resumo */}
        <div className="grid grid-cols-3 gap-2">
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">Total</p>
              <p className="text-base sm:text-lg font-bold">{formatBRL(currentLimit)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">Utilizado</p>
              <p className="text-base sm:text-lg font-bold text-warning">{formatBRL(used)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">Disponível</p>
              <p className={`text-base sm:text-lg font-bold ${available < 0 ? "text-destructive" : "text-success"}`}>{formatBRL(available)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Modo */}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Modo:</Label>
          <Button
            type="button"
            size="sm"
            variant={limit?.mode === "auto" ? "default" : "outline"}
            onClick={() => handleSetMode("auto")}
            className="gap-1.5"
          >
            <Bot className="h-3.5 w-3.5" /> Automático
          </Button>
          <Button
            type="button"
            size="sm"
            variant={limit?.mode === "manual" ? "default" : "outline"}
            onClick={() => handleSetMode("manual")}
            className="gap-1.5"
          >
            <User className="h-3.5 w-3.5" /> Manual
          </Button>
        </div>

        {/* Sugestão automática */}
        <Card className="border-dashed">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                Sugestão automática
              </p>
              <Badge variant="outline" className="text-[10px]">
                {Math.round(metrics.onTimePct * 100)}% em dia
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{proposed.reason}</p>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{formatBRL(currentLimit)}</span>
              <span className="text-muted-foreground">→</span>
              <span className={`font-bold ${proposed.delta > 0 ? "text-success" : proposed.delta < 0 ? "text-destructive" : ""}`}>
                {formatBRL(proposed.newLimit)}
              </span>
              {proposed.delta !== 0 && (
                <Badge variant={proposed.delta > 0 ? "default" : "destructive"} className="text-[10px]">
                  {proposed.delta > 0 ? "+" : ""}
                  {formatBRL(proposed.delta)}
                </Badge>
              )}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full gap-1.5"
              onClick={handleRecalculate}
              disabled={submitting || proposed.delta === 0}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Aplicar recálculo agora
            </Button>
          </CardContent>
        </Card>

        {/* Ajuste manual */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4" /> Ajuste manual
            </p>
            <div>
              <Label className="text-xs">Novo limite (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div>
              <Label className="text-xs">Motivo (opcional)</Label>
              <Textarea
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                rows={2}
                placeholder="Ex.: aumento por bom relacionamento"
              />
            </div>
            <Button
              type="button"
              className="w-full"
              onClick={handleSaveManual}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar ajuste manual
            </Button>
          </CardContent>
        </Card>

        {/* Histórico */}
        <div className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <History className="h-4 w-4" /> Histórico de alterações
          </p>
          {loadingHistory ? (
            <div className="text-center py-4">
              <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Sem alterações registradas
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {history.map((h) => {
                const delta = h.newLimit - h.previousLimit;
                return (
                  <div
                    key={h.id}
                    className="flex items-start justify-between gap-2 p-3 rounded-lg border border-border bg-card"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className="text-[10px] gap-1"
                        >
                          {h.changeType === "automatic" ? (
                            <>
                              <Bot className="h-3 w-3" /> Auto
                            </>
                          ) : h.changeType === "manual" ? (
                            <>
                              <User className="h-3 w-3" /> Manual
                            </>
                          ) : (
                            "Inicial"
                          )}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(h.createdAt).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-sm mt-1">
                        {formatBRL(h.previousLimit)} → <strong>{formatBRL(h.newLimit)}</strong>
                      </p>
                      {h.reason && (
                        <p className="text-xs text-muted-foreground mt-0.5">{h.reason}</p>
                      )}
                    </div>
                    {delta !== 0 && (
                      <Badge
                        variant={delta > 0 ? "default" : "destructive"}
                        className="text-[10px] gap-0.5 shrink-0"
                      >
                        {delta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                        {formatBRL(Math.abs(delta))}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
