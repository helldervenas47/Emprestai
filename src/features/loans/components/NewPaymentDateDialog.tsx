import * as React from "react";
import { CalendarClock, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeDatePicker } from "@/components/ui/native-date-picker";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/userClient";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Props = {
  loanId: string;
  clientId?: string | null;
  installmentNumber: number;
  className?: string;
  compact?: boolean;
};

const formatDate = (value: string) => value ? value.split("-").reverse().join("-") : "";

const promiseDatesByOwner = new Map<string, Map<string, string>>();
const promiseDateRequests = new Map<string, Promise<void>>();
const promiseDateListeners = new Map<string, Set<(value: string) => void>>();

const promiseKey = (ownerId: string, loanId: string, installmentNumber: number) => `${ownerId}:${loanId}:${installmentNumber}`;

function publishPromiseDate(key: string, value: string) {
  promiseDateListeners.get(key)?.forEach((listener) => listener(value));
}

function loadOwnerPromiseDates(ownerId: string) {
  if (promiseDatesByOwner.has(ownerId)) return Promise.resolve();
  const pending = promiseDateRequests.get(ownerId);
  if (pending) return pending;
  const request = supabase.from("whatsapp_payment_promises")
    .select("loan_id, installment_number, promised_date")
    .eq("user_id", ownerId)
    .then(({ data, error }) => {
      if (error) throw error;
      const dates = new Map<string, string>();
      for (const row of data || []) {
        dates.set(promiseKey(ownerId, row.loan_id, Number(row.installment_number)), row.promised_date || "");
      }
      promiseDatesByOwner.set(ownerId, dates);
      dates.forEach((value, key) => publishPromiseDate(key, value));
    })
    .finally(() => promiseDateRequests.delete(ownerId));
  promiseDateRequests.set(ownerId, request);
  return request;
}

export function NewPaymentDateDialog({ loanId, clientId, installmentNumber, className, compact = false }: Props) {
  const { dataOwnerId } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [savedValue, setSavedValue] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const key = dataOwnerId ? promiseKey(dataOwnerId, loanId, installmentNumber) : "";

  React.useEffect(() => {
    if (!dataOwnerId || !key) return;
    let active = true;
    const applyValue = (next: string) => {
      if (!active) return;
      setValue((current) => (!open || !current ? next : current));
      setSavedValue(next);
    };
    const listeners = promiseDateListeners.get(key) || new Set<(value: string) => void>();
    listeners.add(applyValue);
    promiseDateListeners.set(key, listeners);
    const cached = promiseDatesByOwner.get(dataOwnerId);
    if (cached) applyValue(cached.get(key) || "");
    else {
      setLoading(true);
      loadOwnerPromiseDates(dataOwnerId).then(() => {
        applyValue(promiseDatesByOwner.get(dataOwnerId)?.get(key) || "");
      }).catch(() => {
        if (active) toast.error("Não foi possível carregar a Nova Data.");
      }).finally(() => {
        if (active) setLoading(false);
      });
    }
    return () => {
      active = false;
      listeners.delete(applyValue);
      if (!listeners.size) promiseDateListeners.delete(key);
    };
  }, [dataOwnerId, key, open]);

  const save = async () => {
    if (!dataOwnerId) return;
    setSaving(true);
    const query = value
      ? supabase.from("whatsapp_payment_promises").upsert({
          user_id: dataOwnerId,
          client_id: clientId || null,
          loan_id: loanId,
          installment_number: installmentNumber,
          promised_date: value,
          notes: "Nova Data informada na aba Empréstimos",
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,loan_id,installment_number" })
      : supabase.from("whatsapp_payment_promises")
          .delete()
          .eq("user_id", dataOwnerId)
          .eq("loan_id", loanId)
          .eq("installment_number", installmentNumber);
    const { error } = await query;
    setSaving(false);
    if (error) return toast.error("Não foi possível salvar a Nova Data.");
    const ownerDates = promiseDatesByOwner.get(dataOwnerId) || new Map<string, string>();
    if (value) ownerDates.set(key, value);
    else ownerDates.delete(key);
    promiseDatesByOwner.set(dataOwnerId, ownerDates);
    publishPromiseDate(key, value);
    window.dispatchEvent(new CustomEvent("payment-promise-updated", { detail: { loanId, value } }));
    setSavedValue(value);
    setOpen(false);
    toast.success(value ? "Nova Data salva" : "Nova Data removida");
  };

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <button
        type="button"
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-muted/50 font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
          compact ? "h-7 px-2 text-[11px]" : "h-8 px-2.5 text-xs",
          className,
        )}
        aria-label="Definir Nova Data de pagamento"
      >
        <CalendarClock className="h-3.5 w-3.5" />
        <span>{savedValue ? formatDate(savedValue) : "Nova Data"}</span>
      </button>
    </DialogTrigger>
    <DialogContent className="w-[calc(100vw-2rem)] max-w-sm p-4" onClick={(event) => event.stopPropagation()}>
      <DialogHeader className="text-left">
        <DialogTitle>Nova Data</DialogTitle>
        <DialogDescription>Defina quando esta cobrança deve aparecer na Central. O vencimento original e os dias de atraso não serão alterados.</DialogDescription>
      </DialogHeader>
      {loading ? <div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : <div className="space-y-2">
        <Label htmlFor={`new-payment-date-${loanId}`}>Data prevista para pagamento</Label>
        <NativeDatePicker id={`new-payment-date-${loanId}`} value={value} onChange={setValue} displaySeparator="-" autoOpen placeholder="DD-MM-AAAA" />
      </div>}
      <DialogFooter className="flex-row gap-2">
        {savedValue && <Button type="button" variant="ghost" className="mr-auto text-destructive hover:text-destructive" onClick={() => setValue("")}><Trash2 className="mr-1.5 h-4 w-4" />Remover</Button>}
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button type="button" disabled={loading || saving} onClick={save}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Salvar</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
