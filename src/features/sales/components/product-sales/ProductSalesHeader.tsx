import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Wallet, Receipt, Check, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  selectedMonth: string;
  setSelectedMonth: (v: string) => void;
  selYear: number;
  selMonthNum: number;
  readOnly?: boolean;
  balance: number;
  editingBalance: boolean;
  balanceInput: string;
  setBalanceInput: (v: string) => void;
  setEditingBalance: (v: boolean) => void;
  handleSaveBalance: () => void;
  formatCurrency: (v: number) => string;
  monthlyTotal: number;
}

export function ProductSalesHeader({
  selectedMonth,
  setSelectedMonth,
  selYear,
  selMonthNum,
  readOnly = false,
  balance,
  editingBalance,
  balanceInput,
  setBalanceInput,
  setEditingBalance,
  handleSaveBalance,
  formatCurrency,
  monthlyTotal,
}: Props) {
  return (
    <div className="space-y-3">
      {/* Month filter - full width */}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            const [y, m] = selectedMonth.split("-").map(Number);
            const prev = new Date(y, m - 2, 1);
            setSelectedMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`);
          }}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button type="button"
          className="text-sm font-medium text-foreground min-w-[140px] text-center capitalize hover:text-primary transition-colors"
          onClick={() => {
            const n = new Date();
            setSelectedMonth(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`);
          }}
        >
          {format(new Date(selYear, selMonthNum - 1, 1), "MMMM yyyy", { locale: ptBR })}
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            const [y, m] = selectedMonth.split("-").map(Number);
            const next = new Date(y, m, 1);
            setSelectedMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
          }}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {!readOnly && (
        <div className="grid grid-cols-2 gap-3 items-stretch">
          {/* Saldo em Conta */}
          <div className="rounded-xl border p-4 bg-card flex flex-col items-center justify-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <p className="text-xs font-medium text-muted-foreground">Saldo em Conta</p>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </div>
            {editingBalance ? (
              <div className="flex items-center justify-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  value={balanceInput}
                  onChange={(e) => setBalanceInput(e.target.value)}
                  className="h-8 text-sm w-28"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveBalance();
                    if (e.key === "Escape") setEditingBalance(false);
                  }}
                />
                <Button data-mutation size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleSaveBalance}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button data-mutation size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditingBalance(false)}>
                  <XIcon className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <p
                className={`text-xl font-bold cursor-pointer hover:opacity-70 transition-opacity ${balance < 0 ? "text-destructive" : ""}`}
                onClick={() => {
                  setBalanceInput(String(balance));
                  setEditingBalance(true);
                }}
                title="Clique para editar"
              >
                {formatCurrency(balance)}
              </p>
            )}
          </div>

          {/* Despesas Mensais */}
          <div className="rounded-xl border p-4 bg-card flex flex-col items-center justify-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <p className="text-xs font-medium text-muted-foreground">Despesas Mensais</p>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-xl font-bold text-destructive">{formatCurrency(monthlyTotal)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
