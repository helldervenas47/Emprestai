import { useMemo, useState } from "react";
import { Sale, SalePaymentRecord } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { Receipt, User, CreditCard, Calendar as CalendarIcon, TrendingUp } from "lucide-react";
import { useHideValues } from "@/contexts/HideValuesContext";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { parseNotesWithMerchandise } from "@/features/sales/lib/saleMerchandise";
import { MonthNavigator, formatMonthLabel } from "@/components/ui/month-navigator";

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

export function SalesLedger({ sales }: { sales: Sale[] }) {
  const { hidden: hideValues } = useHideValues();
  const { methods } = usePaymentMethods();
  const today = new Date();
  const [monthKey, setMonthKey] = useState(() => format(today, "yyyy-MM"));

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
    return movements.filter((m) => m.date.startsWith(monthKey));
  }, [movements, monthKey]);

  const total = filtered.reduce((s, m) => s + m.amount, 0);
  const count = filtered.length;

  const statusBadge = (s: Movement["status"]) => {
    if (s === "paid") return <Badge className="bg-success/15 text-success border-success/30 text-[9px] px-1.5 py-0 h-4 font-semibold">Pago</Badge>;
    if (s === "partial") return <Badge className="bg-warning/15 text-warning border-warning/30 text-[9px] px-1.5 py-0 h-4 font-semibold">Parcial</Badge>;
    return <Badge className="bg-muted/40 text-muted-foreground border-border text-[9px] px-1.5 py-0 h-4 font-semibold">Pendente</Badge>;
  };

  const typeLabel = (t: Movement["type"]) =>
    t === "downpayment" ? "Entrada" : t === "full" ? "Parcela" : "Parcial";

  return (
    <div className="space-y-4">
      {/* Filtro por mês padrão do app + Resumo */}
      <Card no3d className="border border-border/50">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="w-full sm:w-auto sm:min-w-[280px]">
              <MonthNavigator value={monthKey} onChange={setMonthKey} className="w-full" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 w-full sm:w-auto">
              <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-center flex-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Movimentos</p>
                <p className="text-sm sm:text-base font-bold text-foreground">{count}</p>
              </div>
              <div className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-center flex-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Total recebido</p>
                <p className="text-sm sm:text-base font-bold text-success">{hideValues ? "•••" : fmt(total)}</p>
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
          {/* Mobile: linhas simplificadas e compactas */}
          <div className="space-y-1.5 sm:hidden">
            {filtered.map((m) => (
              <div
                key={m.id}
                className="rounded-xl border border-border/50 bg-card px-3 py-2 shadow-xs hover:border-primary/30 transition-colors space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">{m.customerName}</p>
                    {m.isAvulsa && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-primary/40 text-primary shrink-0">Avulsa</Badge>
                    )}
                  </div>
                  <p className="text-xs font-bold text-success tabular-nums shrink-0">{hideValues ? "•••" : fmt(m.amount)}</p>
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1.5 min-w-0 truncate">
                    <span className="truncate">{m.description}</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="truncate">{m.paymentMethodName}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-muted-foreground">{format(parseISO(m.date), "dd/MM/yyyy")}</span>
                    {statusBadge(m.status)}
                  </div>
                </div>
              </div>
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
                    <td colSpan={5} className="px-4 py-2.5 text-right text-muted-foreground">Total ({formatMonthLabel(monthKey)})</td>
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

