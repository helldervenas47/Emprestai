import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, History, Filter, X, TrendingUp, TrendingDown, Wallet, ChevronLeft, ChevronRight } from "lucide-react";
import { Expense, Sale } from "@/types/loan";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { VehicleInfo } from "@/features/vehicles/hooks/useVehicleRegistry";

interface PaymentEntry {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  category: string;
  vehicle: string;
  amount: number;
  paymentMethodId?: string | null;
  paymentMethodName?: string;
  notes?: string;
  kind: "pagamento" | "recebimento";
}

interface Props {
  sales: Sale[];
  allVehicleExpenses: Expense[];
  registeredVehicles: VehicleInfo[];
  formatCurrency: (v: number) => string;
}

const parseDate = (s?: string | null) => (s ? new Date(s + "T00:00:00") : null);
const fmtDate = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("pt-BR");

function detectVehicle(text: string, vehicles: VehicleInfo[]) {
  if (!text) return "";
  const t = text.toLowerCase();
  for (const v of vehicles) {
    if (v.placa && t.includes(v.placa.toLowerCase())) return `${v.marcaModelo} (${v.placa})`;
    if (v.marcaModelo && t.includes(v.marcaModelo.toLowerCase())) return `${v.marcaModelo}${v.placa ? ` (${v.placa})` : ""}`;
  }
  return "";
}

type SortKey = "date" | "amount" | "description" | "category" | "vehicle";

export function VehiclePaymentHistoryView({
  sales,
  allVehicleExpenses,
  registeredVehicles,
  formatCurrency,
}: Props) {
  const { methods } = usePaymentMethods();
  const methodName = (id?: string | null) => methods.find((m) => m.id === id)?.name || "—";

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const currentYm = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  })();
  const [monthFilter, setMonthFilter] = useState<string>(currentYm); // "YYYY-MM" or "__all__"
  const [vehicleFilter, setVehicleFilter] = useState("__all__");
  const [categoryFilter, setCategoryFilter] = useState("__all__");
  const [methodFilter, setMethodFilter] = useState("__all__");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Build unified list of payments
  const payments = useMemo<PaymentEntry[]>(() => {
    const items: PaymentEntry[] = [];

    // 1) Vehicle expenses — only rows explicitly marked as paid.
    // Recurring parents are skipped: each installment is stored as a child
    // expense row with its own `paid` flag, so relying on `exp.paid` avoids
    // duplicates and prevents unpaid installments from leaking in via a
    // stale `paidInstallments` counter.
    for (const exp of allVehicleExpenses) {
      if (!exp.paid) continue;
      const vehicle = detectVehicle(`${exp.description} ${exp.notes ?? ""}`, registeredVehicles);
      items.push({
        id: exp.id,
        date: exp.paidDate || exp.dueDate,
        description: exp.description,
        category: exp.category,
        vehicle,
        amount: exp.amount,
        paymentMethodId: exp.paymentMethodId,
        paymentMethodName: methodName(exp.paymentMethodId),
        notes: exp.notes,
        kind: "pagamento",
      });
    }

    // 2) Vehicle rental sales — payment history (each entry = actual receipt).
    for (const s of sales) {
      if (s.businessType !== "aluguel_veiculo") continue;
      const vehicle = detectVehicle(`${s.description ?? ""} ${s.productName ?? ""} ${s.notes ?? ""}`, registeredVehicles);
      const history = s.paymentHistory ?? [];
      for (let i = 0; i < history.length; i++) {
        const p = history[i];
        const amt = Number(p.amount) || 0;
        if (amt <= 0) continue;
        items.push({
          id: `${s.id}-pay-${i}`,
          date: p.date,
          description: `${s.productName || s.description || "Aluguel"} — ${s.customerName}`,
          category: s.category || "Aluguel de Veículo",
          vehicle,
          amount: amt,
          paymentMethodId: p.paymentMethodId,
          paymentMethodName: methodName(p.paymentMethodId),
          notes: p.notes ?? undefined,
          kind: "recebimento",
        });
      }
    }

    return items;
  }, [allVehicleExpenses, sales, registeredVehicles, methods]);

  // Filter options
  const vehicleOptions = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => p.vehicle && set.add(p.vehicle));
    return Array.from(set).sort();
  }, [payments]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => p.category && set.add(p.category));
    return Array.from(set).sort();
  }, [payments]);

  const methodOptions = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => p.paymentMethodName && set.add(p.paymentMethodName));
    return Array.from(set).sort();
  }, [payments]);

  // Month options derived from data (YYYY-MM), most-recent first
  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => p.date && set.add(p.date.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [payments]);

  const monthLabel = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, (m || 1) - 1, 1);
    const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const shiftMonth = (delta: number) => {
    const base = monthFilter === "__all__" ? currentYm : monthFilter;
    const [y, m] = base.split("-").map(Number);
    const d = new Date(y, (m || 1) - 1 + delta, 1);
    setMonthFilter(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const filtered = useMemo(() => {
    const from = dateFrom ? parseDate(dateFrom) : null;
    const to = dateTo ? parseDate(dateTo) : null;
    let list = payments.filter((p) => {
      const d = parseDate(p.date);
      if (!d) return false;
      if (monthFilter !== "__all__" && !p.date.startsWith(monthFilter)) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (vehicleFilter !== "__all__" && p.vehicle !== vehicleFilter) return false;
      if (categoryFilter !== "__all__" && p.category !== categoryFilter) return false;
      if (methodFilter !== "__all__" && p.paymentMethodName !== methodFilter) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "date": cmp = a.date.localeCompare(b.date); break;
        case "amount": cmp = a.amount - b.amount; break;
        case "description": cmp = a.description.localeCompare(b.description); break;
        case "category": cmp = a.category.localeCompare(b.category); break;
        case "vehicle": cmp = a.vehicle.localeCompare(b.vehicle); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [payments, monthFilter, dateFrom, dateTo, vehicleFilter, categoryFilter, methodFilter, sortKey, sortDir]);

  const entradas = filtered.filter((p) => p.kind === "recebimento");
  const saidas = filtered.filter((p) => p.kind === "pagamento");
  const totalEntradas = entradas.reduce((s, p) => s + p.amount, 0);
  const totalSaidas = saidas.reduce((s, p) => s + p.amount, 0);
  const saldo = totalEntradas - totalSaidas;

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "date" ? "desc" : "asc"); }
  };

  const clearFilters = () => {
    setDateFrom(""); setDateTo(""); setMonthFilter("__all__");
    setVehicleFilter("__all__"); setCategoryFilter("__all__"); setMethodFilter("__all__");
  };

  const hasFilters = dateFrom || dateTo || monthFilter !== "__all__" || vehicleFilter !== "__all__" || categoryFilter !== "__all__" || methodFilter !== "__all__";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center sm:justify-end gap-1 sm:gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftMonth(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={() => setMonthFilter(currentYm)}
          title="Clique para voltar ao mês atual"
          className="text-xs sm:text-sm font-medium text-foreground min-w-[140px] sm:min-w-[160px] text-center capitalize cursor-pointer hover:text-primary transition-colors"
        >
          {monthFilter === "__all__" ? "Todos os meses" : monthLabel(monthFilter)}
        </button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftMonth(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>


      {/* Summary — Entradas x Saídas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 auto-rows-fr">
        <Card className="border-success/30">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-success" /> Entradas
              </p>
              <span className="text-[10px] text-muted-foreground">({entradas.length})</span>
            </div>
            <p className="text-lg font-bold text-success">{formatCurrency(totalEntradas)}</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/30">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <TrendingDown className="h-3.5 w-3.5 text-destructive" /> Saídas
              </p>
              <span className="text-[10px] text-muted-foreground">({saidas.length})</span>
            </div>
            <p className="text-lg font-bold text-destructive">{formatCurrency(totalSaidas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5 text-primary" /> Saldo
              </p>
              <span className="text-[10px] text-muted-foreground">({filtered.length})</span>
            </div>
            <p className={`text-lg font-bold ${saldo >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency(saldo)}
            </p>
          </CardContent>
        </Card>
      </div>



      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <History className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhum pagamento encontrado.</p>
        </div>
      ) : (
        <>
          {/* Table for md+ */}
          <div className="hidden md:block rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button type="button" className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("date")}>
                      Data <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button type="button" className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("description")}>
                      Descrição <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button type="button" className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("category")}>
                      Categoria <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button type="button" className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("vehicle")}>
                      Veículo <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead className="text-right">
                    <button type="button" className="flex items-center gap-1 ml-auto hover:text-foreground" onClick={() => toggleSort("amount")}>
                      Valor <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap text-sm">{fmtDate(p.date)}</TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant={p.kind === "recebimento" ? "default" : "secondary"} className="text-[10px]">
                          {p.kind === "recebimento" ? "Recebimento" : "Pagamento"}
                        </Badge>
                        <span className="truncate max-w-[280px]">{p.description}</span>
                      </div>
                      {p.notes && <p className="text-xs text-muted-foreground truncate max-w-[320px]">{p.notes}</p>}
                    </TableCell>
                    <TableCell className="text-sm">{p.category}</TableCell>
                    <TableCell className="text-sm">{p.vehicle || "—"}</TableCell>
                    <TableCell className="text-sm">{p.paymentMethodName || "—"}</TableCell>
                    <TableCell className={`text-right font-semibold text-sm ${p.kind === "recebimento" ? "text-success" : "text-foreground"}`}>
                      {formatCurrency(p.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Cards for mobile */}
          <div className="md:hidden grid gap-3">
            {filtered.map((p) => (
              <Card key={p.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={p.kind === "recebimento" ? "default" : "secondary"} className="text-[10px]">
                          {p.kind === "recebimento" ? "Recebimento" : "Pagamento"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{fmtDate(p.date)}</span>
                      </div>
                      <p className="font-medium text-sm truncate">{p.description}</p>
                    </div>
                    <p className={`font-bold text-sm shrink-0 ${p.kind === "recebimento" ? "text-success" : "text-foreground"}`}>
                      {formatCurrency(p.amount)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground pt-2 border-t border-border/40">
                    <span>{p.category}</span>
                    {p.vehicle && <span>{p.vehicle}</span>}
                    {p.paymentMethodName && p.paymentMethodName !== "—" && <span>{p.paymentMethodName}</span>}
                  </div>
                  {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
