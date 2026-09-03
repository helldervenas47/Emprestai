import { useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { History, Trash2, User as UserIcon } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  useMyBoletos, type MyBoleto, type MyBoletoPayment,
} from "@/features/boletos/hooks/useMyBoletos";
import { focusWithoutScrollOnNextFrame } from "@/lib/focusWithoutScroll";

const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  boleto: MyBoleto | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  readOnly?: boolean;
}

export function BoletoHistoryDialog({ boleto, open, onOpenChange, readOnly }: Props) {
  const { listPayments, deletePayment } = useMyBoletos();
  const [payments, setPayments] = useState<MyBoletoPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const dialogStartRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!boleto) return;
    setLoading(true);
    const list = await listPayments(boleto.id);
    setPayments(list);
    setLoading(false);
  };

  useEffect(() => {
    if (open && boleto) load();
    else setPayments([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, boleto?.id]);

  const handleDelete = async (id: string) => {
    try {
      await deletePayment(id);
      toast.success("Registro removido");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao remover");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[85vh] overflow-y-auto"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          focusWithoutScrollOnNextFrame(dialogStartRef.current);
        }}
      >
        <div ref={dialogStartRef} tabIndex={-1} className="outline-none" />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" /> Histórico de pagamentos
          </DialogTitle>
          <DialogDescription>
            Consulte os pagamentos registrados para este boleto.
          </DialogDescription>
        </DialogHeader>
        {boleto && (
          <div className="text-xs text-muted-foreground mb-2">
            <span className="font-medium text-foreground">{boleto.description}</span>
            {boleto.beneficiary && <> · {boleto.beneficiary}</>}
          </div>
        )}
        {loading ? (
          <div className="text-sm text-muted-foreground py-4 text-center">Carregando…</div>
        ) : payments.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center border rounded-md border-dashed">
            Nenhum pagamento registrado ainda.
          </div>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="rounded-md border p-2.5 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{BRL(Number(p.amount) || 0)}</span>
                      <Badge
                        variant="outline"
                        className={
                          p.status === "pago"
                            ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]"
                            : p.status === "estornado"
                            ? "bg-rose-500/15 text-rose-600 border-rose-500/30 text-[10px]"
                            : "bg-amber-500/15 text-amber-600 border-amber-500/30 text-[10px]"
                        }
                      >
                        {p.status}
                      </Badge>
                      {p.payment_method && (
                        <Badge variant="outline" className="text-[10px]">{p.payment_method}</Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {format(parseISO(p.paid_at), "dd/MM/yyyy", { locale: ptBR })}
                      {p.user_name && (
                        <span className="inline-flex items-center gap-1 ml-2">
                          <UserIcon className="h-3 w-3" /> {p.user_name}
                        </span>
                      )}
                    </div>
                    {p.notes && (
                      <div className="text-[11px] mt-1 text-foreground/80 whitespace-pre-wrap">{p.notes}</div>
                    )}
                  </div>
                  {!readOnly && (
                    <Button
                      type="button"
                      size="sm" variant="ghost"
                      className="h-7 w-7 p-0 text-destructive shrink-0"
                      aria-label="Remover pagamento"
                      onClick={() => handleDelete(p.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
