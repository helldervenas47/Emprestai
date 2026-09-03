import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ChevronDown } from "lucide-react";
import type { Loan, Payment, Expense } from "@/types/loan";

interface SaleWithReceived {
  id: string;
  productName: string;
  customerName?: string;
  received: number;
}

interface BreakdownData {
  filteredPayments: Payment[];
  filteredLoans: Loan[];
  filteredExpenses: Expense[];
  salesWithReceived: SaleWithReceived[];
  incomeFromPayments: number;
  incomeFromSales: number;
  totalIncome: number;
  totalLoanOutgoing: number;
  totalExpenses: number;
  totalOutgoing: number;
}

interface Props {
  data: BreakdownData;
  loans: Loan[];
  includeSales: boolean;
  setIncludeSales: (value: boolean) => void;
  expandedBreakdown: string | null;
  setExpandedBreakdown: (value: string | null) => void;
  formatCurrency: (value: number) => string;
}

export function DashboardBreakdownSection({
  data,
  loans,
  includeSales,
  setIncludeSales,
  expandedBreakdown,
  setExpandedBreakdown,
  formatCurrency,
}: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Card no3d>
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Detalhamento de Entradas</h3>
          <div className="space-y-1">
            <button type="button"
              className="flex justify-between text-sm w-full py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => setExpandedBreakdown(expandedBreakdown === "payments" ? null : "payments")}
            >
              <span className="text-muted-foreground flex items-center gap-1">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedBreakdown === "payments" ? "rotate-0" : "-rotate-90"}`} />
                Parcelas recebidas ({data.filteredPayments.length})
              </span>
              <span className="font-medium whitespace-nowrap shrink-0 ml-2">{formatCurrency(data.incomeFromPayments)}</span>
            </button>
            {expandedBreakdown === "payments" && (
              <div className="ml-5 space-y-1">
                {data.filteredPayments.map((p) => {
                  const loan = loans.find((l) => l.id === p.loanId);
                  return (
                    <div key={p.id} className="flex justify-between text-xs py-1 border-b border-border/20 last:border-0">
                      <span className="text-muted-foreground truncate mr-2">Parcela {p.installmentNumber} — {loan?.borrowerName || "Empréstimo"}</span>
                      <span className="font-medium shrink-0 whitespace-nowrap text-success">{formatCurrency(p.amount)}</span>
                    </div>
                  );
                })}
                {data.filteredPayments.length === 0 && <p className="text-xs text-muted-foreground py-1">Nenhuma parcela no período</p>}
              </div>
            )}
            <button type="button"
              className="flex justify-between items-center text-sm w-full py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => setExpandedBreakdown(expandedBreakdown === "sales" ? null : "sales")}
            >
              <span className={`text-muted-foreground flex items-center gap-1 ${!includeSales ? "line-through opacity-50" : ""}`}>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedBreakdown === "sales" ? "rotate-0" : "-rotate-90"}`} />
                Vendas de produtos ({data.salesWithReceived.length})
              </span>
              <span className="flex items-center gap-2">
                <Switch checked={includeSales} onCheckedChange={setIncludeSales} className="scale-75" onClick={(e) => e.stopPropagation()} />
                <span className={`font-medium whitespace-nowrap shrink-0 ${!includeSales ? "opacity-50" : ""}`}>{formatCurrency(data.incomeFromSales)}</span>
              </span>
            </button>
            {expandedBreakdown === "sales" && (
              <div className="ml-5 space-y-1">
                {data.salesWithReceived.map((s) => (
                  <div key={s.id} className="flex justify-between text-xs py-1 border-b border-border/20 last:border-0">
                    <span className="text-muted-foreground truncate mr-2">{s.productName}{s.customerName ? ` — ${s.customerName}` : ""}</span>
                    <span className="font-medium shrink-0 whitespace-nowrap text-success">{formatCurrency(s.received)}</span>
                  </div>
                ))}
                {data.salesWithReceived.length === 0 && <p className="text-xs text-muted-foreground py-1">Nenhuma venda no período</p>}
              </div>
            )}
            <div className="border-t pt-2 flex justify-between text-sm font-semibold px-2">
              <span>Total</span>
              <span className="text-success whitespace-nowrap">{formatCurrency(data.totalIncome)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card no3d>
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Detalhamento de Saídas</h3>
          <div className="space-y-1">
            <button type="button"
              className="flex justify-between text-sm w-full py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => setExpandedBreakdown(expandedBreakdown === "loans" ? null : "loans")}
            >
              <span className="text-muted-foreground flex items-center gap-1">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedBreakdown === "loans" ? "rotate-0" : "-rotate-90"}`} />
                Empréstimos concedidos ({data.filteredLoans.length})
              </span>
              <span className="font-medium whitespace-nowrap shrink-0 ml-2">{formatCurrency(data.totalLoanOutgoing)}</span>
            </button>
            {expandedBreakdown === "loans" && (
              <div className="ml-5 space-y-1">
                {data.filteredLoans.map((l) => (
                  <div key={l.id} className="flex justify-between text-xs py-1 border-b border-border/20 last:border-0">
                    <span className="text-muted-foreground truncate mr-2">{l.borrowerName}</span>
                    <span className="font-medium shrink-0 whitespace-nowrap text-destructive">{formatCurrency(l.amount)}</span>
                  </div>
                ))}
                {data.filteredLoans.length === 0 && <p className="text-xs text-muted-foreground py-1">Nenhum empréstimo no período</p>}
              </div>
            )}
            <button type="button"
              className="flex justify-between text-sm w-full py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => setExpandedBreakdown(expandedBreakdown === "expenses" ? null : "expenses")}
            >
              <span className="text-muted-foreground flex items-center gap-1">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedBreakdown === "expenses" ? "rotate-0" : "-rotate-90"}`} />
                Despesas pagas ({data.filteredExpenses.length})
              </span>
              <span className="font-medium whitespace-nowrap shrink-0 ml-2">{formatCurrency(data.totalExpenses)}</span>
            </button>
            {expandedBreakdown === "expenses" && (
              <div className="ml-5 space-y-1">
                {data.filteredExpenses.map((e) => (
                  <div key={e.id} className="flex justify-between text-xs py-1 border-b border-border/20 last:border-0">
                    <span className="text-muted-foreground truncate mr-2">{e.description}</span>
                    <span className="font-medium shrink-0 whitespace-nowrap text-destructive">{formatCurrency(e.amount)}</span>
                  </div>
                ))}
                {data.filteredExpenses.length === 0 && <p className="text-xs text-muted-foreground py-1">Nenhuma despesa no período</p>}
              </div>
            )}
            <div className="border-t pt-2 flex justify-between text-sm font-semibold px-2">
              <span>Total</span>
              <span className="text-destructive whitespace-nowrap">{formatCurrency(data.totalOutgoing)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
