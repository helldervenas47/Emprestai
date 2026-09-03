import { useEffect, useMemo, useState } from "react";
import * as LucideIcons from "lucide-react";
import { format } from "date-fns";
import { CalendarIcon, CheckCircle, Clock, HandCoins, Receipt, Trash2, User, Wallet } from "lucide-react";
import { Sale, SalePaymentRecord } from "@/types/loan";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { NativeDatePicker } from "@/components/ui/native-date-picker";
import { PaymentMethodPicker } from "@/components/PaymentMethodPicker";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { usePaymentCelebration } from "@/hooks/usePaymentCelebration";
import { validateSalePayment } from "@/features/financial/lib/paymentValidation";
import { supabase } from "@/integrations/supabase/userClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { addByFrequency } from "./productSalesUtils";

export function SalePaymentHistoryDialog({
  open,
  onOpenChange,
  sale,
  onUpdate,
  formatCurrency,
  readOnly = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale;
  onUpdate: (data: Partial<Omit<Sale, "id">>) => void;
  formatCurrency: (v: number) => string;
  readOnly?: boolean;
}) {
  const { activeMethods } = usePaymentMethods();
  const methodById = useMemo(() => {
    const m = new Map<string, { name: string; icon: string | null; kind: string }>();
    activeMethods.forEach((pm) => m.set(pm.id, { name: pm.name, icon: pm.icon, kind: pm.kind }));
    return m;
  }, [activeMethods]);
  const isRecorrente = sale.paymentMode === "recorrente" && sale.installments > 1;
  const amounts = sale.installmentAmounts;
  const defaultVal = sale.installments > 0 ? Math.max(0, sale.total - (sale.downPayment || 0)) / sale.installments : sale.total;
  const getParcelaValue = (idx: number) => amounts && amounts[idx] != null ? amounts[idx] : defaultVal;

  const rawHistory = sale.paymentHistory || [];
  const synthetic: (SalePaymentRecord & { __synthetic?: boolean })[] = [];
  if (rawHistory.length === 0) {
    if ((sale.downPayment || 0) > 0) {
      synthetic.push({ amount: sale.downPayment, date: sale.date, type: "full", notes: "Entrada", __synthetic: true } as any);
    }
    for (let i = 0; i < (sale.paidInstallments || 0); i++) {
      const customDate = sale.installmentDates && sale.installmentDates[i];
      const baseDate = new Date(sale.date + "T00:00:00");
      const dueDate = customDate ? customDate : format(isRecorrente ? addByFrequency(baseDate, sale.frequency || "Mensal", i) : baseDate, "yyyy-MM-dd");
      synthetic.push({ amount: getParcelaValue(i), date: dueDate, type: "full", installmentNumber: i + 1, notes: `Parcela ${i + 1} (registro anterior)`, __synthetic: true } as any);
    }
    if ((sale.partialPaid || 0) > 0) {
      synthetic.push({ amount: sale.partialPaid, date: new Date().toISOString().slice(0, 10), type: "partial", notes: "Pagamento parcial (registro anterior)", __synthetic: true } as any);
    }
  }
  const sorted = [...(rawHistory.length > 0 ? rawHistory : synthetic)].sort((a, b) => {
    const ka = `${a.date}T${(a as any).time || "00:00"}`;
    const kb = `${b.date}T${(b as any).time || "00:00"}`;
    return ka.localeCompare(kb);
  });
  const totalPago = sorted.reduce((s, r) => s + r.amount, 0);
  const totalContrato = sale.total || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col bg-card/90 backdrop-blur-2xl border-white/10 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-success" />
            Histórico de Pagamentos
          </DialogTitle>
          <DialogDescription>
            {sorted.length > 0
              ? `${sorted.length} movimentação(ões) — do mais antigo ao mais recente.`
              : "Nenhum pagamento registrado ainda."}
          </DialogDescription>
        </DialogHeader>
        {sorted.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-success/20 bg-success/5 px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pago</p>
              <p className="text-sm font-bold text-success tabular-nums">{formatCurrency(totalPago)}</p>
            </div>
            <div className="rounded-xl border border-warning/20 bg-warning/5 px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Restante</p>
              <p className="text-sm font-bold text-warning tabular-nums">{formatCurrency(Math.max(0, totalContrato - totalPago))}</p>
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Contrato</p>
              <p className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(totalContrato)}</p>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1">
          {sorted.length > 0 ? (() => {
            let running = 0;
            return sorted.map((record, i) => {
              const method = record.paymentMethodId ? methodById.get(record.paymentMethodId) : null;
              const MethodIcon = method?.icon ? (LucideIcons as any)[method.icon] : Wallet;
              const isFull = record.type === "full";
              const isSynthetic = (record as any).__synthetic === true;
              const origIdx = isSynthetic ? -1 : (sale.paymentHistory || []).indexOf(record);
              running += record.amount;
              const saldoApos = Math.max(0, totalContrato - running);
              const time = (record as any).time as string | undefined;
              const userName = (record as any).userName as string | undefined;
              const instNum = (record as any).installmentNumber as number | undefined;
              return (
                <div key={`${record.date}-${i}`} className={`rounded-xl border p-3 ${isFull ? "border-success/20 bg-success/5" : "border-warning/20 bg-warning/5"}`}>
                  <div className="flex items-start gap-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isFull ? "bg-success/20 text-success" : "bg-warning/20 text-warning"}`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-base font-bold text-foreground tabular-nums">{formatCurrency(record.amount)}</p>
                          {instNum ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border/60">
                              Parcela {instNum}
                            </Badge>
                          ) : null}
                        </div>
                        <Badge className={`text-[10px] uppercase tracking-wide ${isFull ? "bg-success/20 text-success border-success/30" : "bg-warning/20 text-warning border-warning/30"}`}>
                          {isFull ? "Pago" : "Parcial"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                          <span>{format(new Date(record.date + "T00:00:00"), "dd/MM/yyyy")}{time ? ` • ${time}` : ""}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                          <MethodIcon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {method?.name || "Não informado"}
                            {method ? ` • ${method.kind === "cash" ? "Caixa" : "Conta"}` : ""}
                          </span>
                        </div>
                        {userName && (
                          <div className="flex items-center gap-1.5 text-muted-foreground col-span-2 min-w-0">
                            <User className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{userName}</span>
                          </div>
                        )}
                      </div>
                      {record.notes && (
                        <p className="text-xs text-muted-foreground italic border-t border-border/30 pt-1.5">
                          {record.notes}
                        </p>
                      )}
                      <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-border/30">
                        <span className="text-muted-foreground">Saldo após pagamento</span>
                        <span className="font-semibold text-foreground tabular-nums">{formatCurrency(saldoApos)}</span>
                      </div>
                    </div>
                    {!readOnly && !isSynthetic && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => {
                          const newHistory = (sale.paymentHistory || []).filter((_, idx) => idx !== origIdx);
                          let recalcPaid = 0;
                          let recalcPartial = 0;
                          const getVal = (idx: number) => amounts && amounts[idx] != null ? amounts[idx] : defaultVal;
                          let accumulated = 0;
                          let instIdx = 0;
                          for (const r of newHistory) {
                            accumulated += r.amount;
                            while (instIdx < sale.installments && accumulated >= getVal(instIdx) - 0.01) {
                              accumulated -= getVal(instIdx);
                              instIdx++;
                            }
                          }
                          recalcPaid = instIdx;
                          recalcPartial = accumulated > 0.01 ? accumulated : 0;
                          onUpdate({ paymentHistory: newHistory, paidInstallments: recalcPaid, partialPaid: recalcPartial });
                          if (newHistory.length === 0) onOpenChange(false);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            });
          })() : (
            <div className="text-center py-8">
              <Receipt className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhum pagamento registrado</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RegisterSalePaymentDialog({
  open,
  onOpenChange,
  sale,
  onUpdate,
  formatCurrency,
  initialMode = "full",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale;
  onUpdate: (data: Partial<Omit<Sale, "id">>) => void;
  formatCurrency: (v: number) => string;
  initialMode?: "full" | "partial";
}) {
  const { celebrate } = usePaymentCelebration();
  const { activeMethods } = usePaymentMethods();
  const methodById = useMemo(() => {
    const m = new Map<string, { name: string; kind: string }>();
    activeMethods.forEach((pm) => m.set(pm.id, { name: pm.name, kind: pm.kind }));
    return m;
  }, [activeMethods]);

  const isRecorrente = sale.paymentMode === "recorrente" && sale.installments > 1;
  const amounts = sale.installmentAmounts;
  const defaultVal = sale.installments > 0 ? Math.max(0, sale.total - (sale.downPayment || 0)) / sale.installments : sale.total;
  const getParcelaValue = (idx: number) => amounts && amounts[idx] != null ? amounts[idx] : defaultVal;

  const nextIdx = sale.paidInstallments;
  const parcelaTotal = getParcelaValue(nextIdx);
  const jaPagoParcela = sale.partialPaid || 0;
  const restanteParcela = Math.max(0, parcelaTotal - jaPagoParcela);

  const baseDate = new Date(sale.date + "T00:00:00");
  const customDate = sale.installmentDates && sale.installmentDates[nextIdx];
  const dueDate = customDate
    ? new Date(customDate + "T00:00:00")
    : (isRecorrente ? addByFrequency(baseDate, sale.frequency || "Mensal", nextIdx) : baseDate);
  const today = new Date();
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dueNorm = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const dayDiff = Math.floor((todayNorm.getTime() - dueNorm.getTime()) / (1000 * 60 * 60 * 24));
  let parcelaStatus: { label: string; cls: string };
  if (jaPagoParcela > 0) parcelaStatus = { label: "Parcial", cls: "bg-warning/20 text-warning border-warning/30" };
  else if (dayDiff > 0) parcelaStatus = { label: "Atrasada", cls: "bg-destructive/20 text-destructive border-destructive/30" };
  else if (dayDiff === 0) parcelaStatus = { label: "Vence hoje", cls: "bg-warning/20 text-warning border-warning/30" };
  else parcelaStatus = { label: "Pendente", cls: "bg-primary/20 text-primary border-primary/30" };

  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState<string>("");
  const [methodId, setMethodId] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>("");
  const [showMethodError, setShowMethodError] = useState(false);

  useEffect(() => {
    if (open) {
      const now = new Date();
      setDate(now);
      setTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
      setAmount(initialMode === "full" ? restanteParcela.toFixed(2) : "");
      setMethodId(null);
      setNotes("");
      setShowMethodError(false);
    }
  }, [open, initialMode, restanteParcela]);

  const valNum = parseFloat(amount) || 0;
  const willComplete = valNum + jaPagoParcela >= parcelaTotal - 0.01;
  // Se já havia parcial pago antes, o registro que fecha a parcela também é parcial
  // (é apenas a fração restante). Marcar como "full" gera dois pagamentos aparentes
  // no histórico — um "parcial" e outro "total" — para a mesma parcela.
  const detectedType: "full" | "partial" = willComplete && jaPagoParcela <= 0.01 ? "full" : "partial";
  const novoSaldoParcela = Math.max(0, parcelaTotal - jaPagoParcela - valNum);
  const canSubmit = valNum > 0 && !!date && !!methodId;

  const handleSubmit = async () => {
    if (!date) return;
    if (!methodId) { setShowMethodError(true); return; }
    if (valNum <= 0) return;

    let userName: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      userName = user?.email || (user?.user_metadata as any)?.display_name || null;
    } catch { /* ignore */ }

    const newRecord: SalePaymentRecord = {
      amount: valNum,
      date: format(date, "yyyy-MM-dd"),
      time: time || null,
      type: detectedType,
      paymentMethodId: methodId,
      notes: notes.trim() || null,
      installmentNumber: nextIdx + 1,
      userName,
    };
    const check = validateSalePayment(sale.paymentHistory || [], newRecord);
    if (!check.ok) {
      toast.error(check.reason);
      return;
    }
    const history = [...(sale.paymentHistory || []), newRecord];
    if (willComplete) {
      const remainder = valNum + jaPagoParcela - parcelaTotal;
      onUpdate({
        paidInstallments: Math.min(sale.installments, sale.paidInstallments + 1),
        partialPaid: remainder > 0.01 ? remainder : 0,
        paymentHistory: history,
      });
      celebrate({ kind: "sale", message: "Parcela paga!", amount: valNum });
    } else {
      onUpdate({ partialPaid: jaPagoParcela + valNum, paymentHistory: history });
      celebrate({ kind: "sale", message: "Pagamento recebido!", amount: valNum });
    }
    onOpenChange(false);
  };

  const methodInfo = methodId ? methodById.get(methodId) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md max-h-[92vh] overflow-y-auto bg-card/95 backdrop-blur-2xl border-white/10 shadow-2xl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-primary" />
            Registrar Pagamento
          </DialogTitle>
          <DialogDescription>
            Parcela {nextIdx + 1}{isRecorrente ? ` de ${sale.installments}` : ""} — vencimento {format(dueDate, "dd/MM/yyyy")}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl border border-border/60 bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Status</span>
            <Badge className={`text-[10px] uppercase tracking-wide ${parcelaStatus.cls}`}>{parcelaStatus.label}</Badge>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Total</p>
              <p className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(parcelaTotal)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Já pago</p>
              <p className="text-sm font-bold text-success tabular-nums">{formatCurrency(jaPagoParcela)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Restante</p>
              <p className="text-sm font-bold text-warning tabular-nums">{formatCurrency(restanteParcela)}</p>
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-1">
          <div>
            <Label className="text-sm">Valor pago (R$) <span className="text-destructive">*</span></Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
            />
            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">
                Detectado: <span className={`font-semibold ${detectedType === "full" ? "text-success" : "text-warning"}`}>
                  {detectedType === "full" ? "Pagamento total da parcela" : "Pagamento parcial"}
                </span>
              </span>
              <button
                type="button"
                className="text-primary underline-offset-2 hover:underline"
                onClick={() => setAmount(restanteParcela.toFixed(2))}
              >
                Usar restante
              </button>
            </div>
            {valNum > 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Novo saldo da parcela: <span className="font-semibold text-foreground tabular-nums">{formatCurrency(novoSaldoParcela)}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-sm">Data <span className="text-destructive">*</span></Label>
              <div className="mt-1">
                <NativeDatePicker
                  value={date ? format(date, "yyyy-MM-dd") : ""}
                  onChange={(v) => { if (v) setDate(new Date(`${v}T00:00:00`)); }}
                  placeholder="Selecionar"
                />
              </div>
            </div>
            <div>
              <Label className="text-sm flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Hora</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1" />
            </div>
          </div>

          <PaymentMethodPicker
            value={methodId}
            onChange={(id) => { setMethodId(id); setShowMethodError(false); }}
            required
            showError={showMethodError}
            label="Forma de pagamento / Conta de destino"
          />
          {methodInfo && (
            <p className="text-[11px] text-muted-foreground -mt-1">
              Conta de destino: <span className="font-semibold text-foreground">{methodInfo.name}</span> ({methodInfo.kind === "cash" ? "Caixa / Dinheiro" : "Conta bancária"})
            </p>
          )}

          <div>
            <Label className="text-sm">Observações (opcional)</Label>
            <Textarea
              rows={2}
              placeholder="Detalhes do pagamento..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button data-mutation onClick={handleSubmit} disabled={!canSubmit} className="bg-primary hover:bg-primary/90">
            <CheckCircle className="h-4 w-4 mr-1.5" />
            Confirmar {detectedType === "full" ? "pagamento total" : "parcial"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
