import { useMemo, useState } from "react";
import { Sale, SalePaymentRecord } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Receipt, User, CreditCard, Calendar as CalendarIcon, TrendingUp } from "lucide-react";
import { useHideValues } from "@/contexts/HideValuesContext";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { parseNotesWithMerchandise } from "@/features/sales/lib/saleMerchandise";

interface Movement {
  id: string;
  saleId: string;
  date: string; // ISO yyyy-mm-dd
  customerName: string;
  description: string;
  amount: number;
  type: SalePaymentRecord["type"] | "downpayment";
  paymentMethodName: string;
  status: "paid" | "partial" | "pending";
  isAvulsa: boolean;
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const monthLabels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function SalesLedger({ sales }: { sales: Sale[] }) {
  const { hidden: hideValues } = useHideValues();
  const { methods } = usePaymentMethods();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-11

  const methodNameById = useMemo(() => {
    const m = new Map<string, string>();
    methods.forEach((pm) => m.set(pm.id, pm.name));
    return m;
  }, [methods]);

  const movements = useMemo<Movement[]>(() => {
    const list: Movement[] = [];
    sales.forEach((sale) => {
      const pmName = (sale as any).paymentMethodId
        ? methodNameById.get((sale as any).paymentMethodId) || "—"
        : "—";
      const isPaid = sale.paymentMode === "recorrente" && sale.installments > 1
        ? sale.paidInstallments >= sale.installments
        : sale.paidInstallments >= 1;
      const status: Movement["status"] = isPaid
        ? "paid"
        : (sale.paidInstallments > 0 || (sale.partialPaid || 0) > 0 || (sale.downPayment || 0) > 0)
          ? "partial"
          : "pending";
      const isAvulsa = sale.businessType === "venda" && !sale.productId;

      // Merchandise as part of payment: subtract proportional share from each cash movement
      const parsed = parseNotesWithMerchandise(sale.notes);
      const merchValue = parsed.merchandise?.valor || 0;
      const totalVal = Number(sale.total) || 0;
      const cashRatio = merchValue > 0 && totalVal > 0
        ? Math.max(0, (totalVal - merchValue) / totalVal)
        : 1;
      const toCash = (v: number) => Number((v * cashRatio).toFixed(2));

      if ((sale.downPayment || 0) > 0) {
        const cashAmt = toCash(sale.downPayment);
        if (cashAmt > 0) {
          list.push({
            id: `${sale.id}-down`,
            saleId: sale.id,
            date: sale.date,
            customerName: sale.customerName || "—",
            description: sale.description || sale.productName || "Venda",
            amount: cashAmt,
            type: "downpayment",
            paymentMethodName: pmName,
            status,
            isAvulsa,
          });
        }
      }
      (sale.paymentHistory || []).forEach((p, idx) => {
        const cashAmt = toCash(p.amount);
        if (cashAmt <= 0) return;
        list.push({
          id: `${sale.id}-p${idx}`,
          saleId: sale.id,
          date: p.date,
          customerName: sale.customerName || "—",
          description: sale.description || sale.productName || "Venda",
          amount: cashAmt,
          type: p.type,
          paymentMethodName: pmName,
          status,
          isAvulsa,
        });
      });
    });
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [sales, methodNameById]);

  const filtered = useMemo(() => {
    return movements.filter((m) => {
      const d = parseISO(m.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }, [movements, year, month]);

  const total = filtered.reduce((s, m) => s + m.amount, 0);
  const count = filtered.length;

  const years = useMemo(() => {
    const set = new Set<number>([today.getFullYear()]);
    movements.forEach((m) => set.add(parseISO(m.date).getFullYear()));
    return Array.from(set).sort((a, b) => b - a);
  }, [movements]);

  const goPrev = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1);
  };
  const goNext = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1);
  };

  const statusBadge = (s: Movement["status"]) => {
    if (s === "paid") return <Badge className="bg-success/20 text-success border-success/30 text-[10px]">Pago</Badge>;
    if (s === "partial") return <Badge className="bg-warning/20 text-warning border-warning/30 text-[10px]">Parcial</Badge>;
    return <Badge className="bg-muted/40 text-muted-foreground border-border text-[10px]">Pendente</Badge>;
  };

  const typeLabel = (t: Movement["type"]) =>
    t === "downpayment" ? "Entrada" : t === "full" ? "Parcela" : "Parcial";

  return (
    <div className="space-y-4">
      {/* Filtro por mês/ano */}
      <Card no3d className="border border-border/50">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={goPrev} aria-label="Mês anterior">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2 flex-1">
                <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                  <SelectTrigger className="h-9 w-[110px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthLabels.map((label, idx) => (
                      <SelectItem key={idx} value={String(idx)}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                  <SelectTrigger className="h-9 w-[100px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={goNext} aria-label="Próximo mês">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Movimentos</p>
                <p className="text-sm font-bold text-foreground">{count}</p>
              </div>
              <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total recebido</p>
                <p className="text-sm font-bold text-success">{hideValues ? "•••" : fmt(total)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de movimentos */}
      {filtered.length === 0 ? (
        <Card no3d className="border-dashed">
          <CardContent className="py-10 flex flex-col items-center text-center gap-2">
            <Receipt className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Nenhuma movimentação de venda neste período</p>
            <p className="text-xs text-muted-foreground">Selecione outro mês ou registre pagamentos de vendas.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="space-y-2 sm:hidden">
            {filtered.map((m) => (
              <Card key={m.id} no3d className="border border-border/50">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{m.customerName}</p>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-xs text-muted-foreground truncate">{m.description}</p>
                        {m.isAvulsa && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-primary/40 text-primary shrink-0">Avulsa</Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-success tabular-nums">{hideValues ? "•••" : fmt(m.amount)}</p>
                      <p className="text-[10px] text-muted-foreground">{format(parseISO(m.date), "dd/MM/yyyy")}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
                      <CreditCard className="h-3 w-3 shrink-0" />
                      <span className="truncate">{m.paymentMethodName}</span>
                      <span className="text-muted-foreground/50">·</span>
                      <span className="truncate">{typeLabel(m.type)}</span>
                    </div>
                    {statusBadge(m.status)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop: tabela */}
          <Card no3d className="hidden sm:block border border-border/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-2.5"><div className="flex items-center gap-1.5"><CalendarIcon className="h-3.5 w-3.5" />Data</div></th>
                    <th className="text-left font-medium px-4 py-2.5"><div className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />Cliente</div></th>
                    <th className="text-left font-medium px-4 py-2.5">Descrição</th>
                    <th className="text-left font-medium px-4 py-2.5"><div className="flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" />Forma</div></th>
                    <th className="text-left font-medium px-4 py-2.5">Tipo</th>
                    <th className="text-right font-medium px-4 py-2.5"><div className="flex items-center gap-1.5 justify-end"><TrendingUp className="h-3.5 w-3.5" />Valor</div></th>
                    <th className="text-center font-medium px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filtered.map((m) => (
                    <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 text-foreground tabular-nums">{format(parseISO(m.date), "dd/MM/yyyy")}</td>
                      <td className="px-4 py-2.5 text-foreground">{m.customerName}</td>
                      <td className="px-4 py-2.5 text-muted-foreground max-w-[260px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{m.description}</span>
                          {m.isAvulsa && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-primary/40 text-primary shrink-0">Avulsa</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-foreground">{m.paymentMethodName}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{typeLabel(m.type)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-success tabular-nums">{hideValues ? "•••" : fmt(m.amount)}</td>
                      <td className="px-4 py-2.5 text-center">{statusBadge(m.status)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/20 font-semibold">
                  <tr>
                    <td colSpan={5} className="px-4 py-2.5 text-right text-muted-foreground">Total ({format(new Date(year, month, 1), "MMMM 'de' yyyy", { locale: ptBR })})</td>
                    <td className="px-4 py-2.5 text-right text-success tabular-nums">{hideValues ? "•••" : fmt(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
