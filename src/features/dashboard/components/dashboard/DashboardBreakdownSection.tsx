import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ChevronRight, ArrowDownRight, CreditCard, Receipt, ShoppingBag } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  const currentModal = expandedBreakdown === "payments" ? {
    title: "Parcelas Recebidas",
    subtitle: `${data.filteredPayments.length} parcelas no período`,
    total: data.incomeFromPayments,
    isIncome: true,
    icon: <ArrowDownRight className="h-5 w-5 text-success" />,
    items: data.filteredPayments.map((p) => {
      const loan = loans.find((l) => l.id === p.loanId);
      return {
        id: p.id,
        title: `Parcela ${p.installmentNumber} — ${loan?.borrowerName || "Empréstimo"}`,
        subtitle: p.paidAt ? new Date(p.paidAt).toLocaleDateString("pt-BR") : undefined,
        amount: p.amount,
      };
    }),
    emptyMessage: "Nenhuma parcela no período",
  } : expandedBreakdown === "sales" ? {
    title: "Vendas de Produtos",
    subtitle: `${data.salesWithReceived.length} vendas no período`,
    total: data.incomeFromSales,
    isIncome: true,
    icon: <ShoppingBag className="h-5 w-5 text-success" />,
    items: data.salesWithReceived.map((s) => ({
      id: s.id,
      title: s.productName,
      subtitle: s.customerName || undefined,
      amount: s.received,
    })),
    emptyMessage: "Nenhuma venda no período",
  } : expandedBreakdown === "loans" ? {
    title: "Empréstimos Concedidos",
    subtitle: `${data.filteredLoans.length} empréstimos no período`,
    total: data.totalLoanOutgoing,
    isIncome: false,
    icon: <CreditCard className="h-5 w-5 text-destructive" />,
    items: data.filteredLoans.map((l) => ({
      id: l.id,
      title: l.borrowerName,
      subtitle: l.startDate ? new Date(l.startDate).toLocaleDateString("pt-BR") : undefined,
      amount: l.amount,
    })),
    emptyMessage: "Nenhum empréstimo no período",
  } : expandedBreakdown === "expenses" ? {
    title: "Despesas Pagas",
    subtitle: `${data.filteredExpenses.length} despesas no período`,
    total: data.totalExpenses,
    isIncome: false,
    icon: <Receipt className="h-5 w-5 text-destructive" />,
    items: data.filteredExpenses.map((e) => ({
      id: e.id,
      title: e.description,
      subtitle: e.category || undefined,
      amount: e.amount,
    })),
    emptyMessage: "Nenhuma despesa no período",
  } : null;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        {/* Card Entradas */}
        <Card no3d>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Detalhamento de Entradas</h3>
            <div className="space-y-1">
              <button
                type="button"
                className="flex justify-between items-center text-sm w-full py-2 px-2.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                onClick={() => setExpandedBreakdown("payments")}
              >
                <span className="text-muted-foreground group-hover:text-foreground flex items-center gap-1.5 transition-colors">
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  Parcelas recebidas ({data.filteredPayments.length})
                </span>
                <span className="font-medium whitespace-nowrap shrink-0 ml-2">{formatCurrency(data.incomeFromPayments)}</span>
              </button>

              <button
                type="button"
                className="flex justify-between items-center text-sm w-full py-2 px-2.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                onClick={() => setExpandedBreakdown("sales")}
              >
                <span className={`text-muted-foreground group-hover:text-foreground flex items-center gap-1.5 transition-colors ${!includeSales ? "line-through opacity-50" : ""}`}>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  Vendas de produtos ({data.salesWithReceived.length})
                </span>
                <span className="flex items-center gap-2">
                  <Switch checked={includeSales} onCheckedChange={setIncludeSales} className="scale-75" onClick={(e) => e.stopPropagation()} />
                  <span className={`font-medium whitespace-nowrap shrink-0 ${!includeSales ? "opacity-50" : ""}`}>{formatCurrency(data.incomeFromSales)}</span>
                </span>
              </button>

              <div className="border-t border-border/50 pt-2.5 mt-2 flex justify-between text-sm font-semibold px-2.5">
                <span>Total</span>
                <span className="text-success whitespace-nowrap">{formatCurrency(data.totalIncome)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card Saídas */}
        <Card no3d>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Detalhamento de Saídas</h3>
            <div className="space-y-1">
              <button
                type="button"
                className="flex justify-between items-center text-sm w-full py-2 px-2.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                onClick={() => setExpandedBreakdown("loans")}
              >
                <span className="text-muted-foreground group-hover:text-foreground flex items-center gap-1.5 transition-colors">
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  Empréstimos concedidos ({data.filteredLoans.length})
                </span>
                <span className="font-medium whitespace-nowrap shrink-0 ml-2">{formatCurrency(data.totalLoanOutgoing)}</span>
              </button>

              <button
                type="button"
                className="flex justify-between items-center text-sm w-full py-2 px-2.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                onClick={() => setExpandedBreakdown("expenses")}
              >
                <span className="text-muted-foreground group-hover:text-foreground flex items-center gap-1.5 transition-colors">
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  Despesas pagas ({data.filteredExpenses.length})
                </span>
                <span className="font-medium whitespace-nowrap shrink-0 ml-2">{formatCurrency(data.totalExpenses)}</span>
              </button>

              <div className="border-t border-border/50 pt-2.5 mt-2 flex justify-between text-sm font-semibold px-2.5">
                <span>Total</span>
                <span className="text-destructive whitespace-nowrap">{formatCurrency(data.totalOutgoing)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modal de Detalhamento dos Itens */}
      <Dialog open={!!currentModal} onOpenChange={(open) => !open && setExpandedBreakdown(null)}>
        {currentModal && (
          <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden">
            <DialogHeader className="p-5 pb-3 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-muted/60">
                  {currentModal.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-base font-semibold">
                    {currentModal.title}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    {currentModal.subtitle}
                  </DialogDescription>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Total</p>
                  <p className={`text-base font-bold ${currentModal.isIncome ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(currentModal.total)}
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 overscroll-contain">
              {currentModal.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/40 bg-card/60 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">{item.title}</p>
                    {item.subtitle && (
                      <p className="text-[11px] text-muted-foreground truncate">{item.subtitle}</p>
                    )}
                  </div>
                  <span className={`text-xs font-semibold shrink-0 ${currentModal.isIncome ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              ))}
              {currentModal.items.length === 0 && (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  {currentModal.emptyMessage}
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
