import { useState } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import {
  Calendar as CalendarIcon,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  HandCoins,
  Pencil,
  Receipt,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tag } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { WarrantyManager } from "@/components/warranty/WarrantyManager";
import { CustomIncomeCategory } from "@/features/financial/hooks/useIncomeCategories";
import { personalIconMap } from "@/features/financial/lib/personalExpenseCategories";
import { Sale } from "@/types/loan";
import {
  getNextDueDateHelper,
  getNextInstallmentValueHelper,
  getSaleCategory,
  getSalePaidAmountHelper,
  saleCategoryConfig,
} from "./productSalesUtils";
import { RegisterSalePaymentDialog, SalePaymentHistoryDialog } from "./ProductSalesDialogs";


export function SaleListRow({ sale, onEdit, onDelete, onUpdate, formatCurrency, readOnly = false, incomeCategoryByName, expanded, onToggle }: {
  sale: Sale;
  onEdit: () => void;
  onDelete: () => void;
  onUpdate: (data: Partial<Omit<Sale, "id">>) => void;
  formatCurrency: (v: number) => string;
  readOnly?: boolean;
  incomeCategoryByName?: Map<string, CustomIncomeCategory>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [confirmDeleteSale, setConfirmDeleteSale] = useState(false);
  const [showPartial, setShowPartial] = useState(false);
  const [showPayDatePicker, setShowPayDatePicker] = useState(false);
  const [showPayments, setShowPayments] = useState(false);
  const historyCount = (sale.paymentHistory || []).length;

  const category = getSaleCategory(sale);
  const catStyle = saleCategoryConfig[category];
  const isRecorrente = sale.paymentMode === "recorrente" && sale.installments > 1;
  const paidAmount = getSalePaidAmountHelper(sale);
  const remaining = Math.max(0, sale.total - paidAmount - (sale.partialPaid || 0));
  const isPaid = category === "paid";
  const nextDue = getNextDueDateHelper(sale);
  const nextInstValue = isPaid ? 0 : getNextInstallmentValueHelper(sale);
  const partialOnNext = isPaid
    ? 0
    : (sale.partialPaid || 0) > 0 ? Math.max(0, nextInstValue - (sale.partialPaid || 0)) : nextInstValue;

  const incomeCat = sale.category ? incomeCategoryByName?.get(sale.category) : undefined;
  const CatIcon = incomeCat ? (personalIconMap[incomeCat.icon] ?? personalIconMap.Package) : Tag;
  const catColor = incomeCat ? `hsl(${incomeCat.color})` : undefined;

  const totalPaidIncludingPartial = paidAmount + (sale.partialPaid || 0);
  const statusInfo = isPaid
    ? { label: "Quitado", cls: "bg-success/15 text-success border-success/30" }
    : category === "overdue"
    ? { label: "Atrasado", cls: "bg-destructive/15 text-destructive border-destructive/30" }
    : category === "due_today"
    ? { label: "Vence hoje", cls: "bg-warning/15 text-warning border-warning/30" }
    : { label: "Em dia", cls: "bg-primary/15 text-primary border-primary/30" };

   return (
    <div className="flex flex-col">
    <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 hover:bg-muted/30 transition-colors">
      <div
        className="contents text-left cursor-pointer"
        onClick={onToggle}
      >
        <div className={`h-8 w-8 sm:h-9 sm:w-9 rounded-full flex items-center justify-center text-primary-foreground font-bold text-[10px] sm:text-xs shrink-0 ${
          category === "paid" ? "bg-success" : category === "overdue" ? "bg-destructive" : category === "due_today" ? "bg-warning" : "gradient-primary"
        }`}>
          {(sale.customerName || sale.description || "?").charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0 md:basis-0 md:grow">

          <p className="text-xs sm:text-sm font-semibold text-foreground truncate">{sale.customerName || "—"}</p>
          <span
            className="md:hidden mt-0.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium max-w-full"
            style={incomeCat ? {
              borderColor: `hsl(${incomeCat.color} / 0.4)`,
              backgroundColor: `hsl(${incomeCat.color} / 0.12)`,
              color: catColor,
            } : undefined}
          >
            <CatIcon className="h-2.5 w-2.5 shrink-0" style={catColor ? { color: catColor } : undefined} />
            <span className="truncate">{incomeCat ? incomeCat.name : "Sem categoria"}</span>
          </span>
        </div>
        <div className="hidden md:flex flex-1 min-w-0 basis-0 items-center">
          <span
            className="inline-flex items-center gap-1 rounded-full border px-1.5 lg:px-2 py-0.5 text-[10px] lg:text-[11px] font-medium max-w-full"
            style={incomeCat ? {
              borderColor: `hsl(${incomeCat.color} / 0.4)`,
              backgroundColor: `hsl(${incomeCat.color} / 0.12)`,
              color: catColor,
            } : undefined}
          >
            <CatIcon className="h-3 w-3 shrink-0" style={catColor ? { color: catColor } : undefined} />
            <span className="truncate">{incomeCat ? incomeCat.name : "Sem categoria"}</span>
          </span>
        </div>
        <div className="hidden md:block flex-[2] min-w-0 basis-0">
          <p className="text-[11px] lg:text-sm font-bold text-foreground truncate">{sale.description || sale.productName || "—"}</p>
        </div>
        <div className="w-[78px] sm:w-[88px] lg:w-[110px] shrink-0">
          <p className="text-[11px] sm:text-xs text-foreground truncate">
            {!isPaid ? format(nextDue, "dd/MM/yyyy") : "Quitado"}{isRecorrente && ` • ${sale.paidInstallments}/${sale.installments}`}
          </p>
          {!isPaid && sale.businessType === "aluguel_veiculo" && (() => {
            const days = differenceInCalendarDays(nextDue, new Date());
            if (days < 0) return <p className="text-[10px] sm:text-[11px] font-semibold text-destructive truncate">{Math.abs(days)}d em atraso</p>;
            if (days === 0) return <p className="text-[10px] sm:text-[11px] font-semibold text-warning truncate">Vence hoje</p>;
            return <p className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground truncate">Faltam {days}d</p>;
          })()}
        </div>
        <div className="w-[102px] sm:w-[108px] lg:w-[140px] shrink-0 text-right tabular-nums">
          {isPaid ? (
            <p className="text-xs sm:text-sm font-bold text-success truncate">{formatCurrency(sale.total)}</p>
          ) : (
            <>
              <p className="text-xs sm:text-sm font-bold text-foreground truncate">{formatCurrency(partialOnNext)}</p>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground truncate">Rest. {formatCurrency(remaining)}</p>
            </>
          )}
        </div>
        <div className="shrink-0 pl-1">
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      <SalePaymentHistoryDialog
        open={showPayments}
        onOpenChange={setShowPayments}
        sale={sale}
        onUpdate={onUpdate}
        formatCurrency={formatCurrency}
        readOnly={readOnly}
      />
      {!isPaid && !readOnly && (
        <>
          <RegisterSalePaymentDialog
            open={showPartial}
            onOpenChange={setShowPartial}
            sale={sale}
            onUpdate={onUpdate}
            formatCurrency={formatCurrency}
            initialMode="partial"
          />
          <RegisterSalePaymentDialog
            open={showPayDatePicker}
            onOpenChange={setShowPayDatePicker}
            sale={sale}
            onUpdate={onUpdate}
            formatCurrency={formatCurrency}
            initialMode="full"
          />
        </>
      )}
    </div>

    {expanded && (() => {
      const pct = sale.total > 0 ? Math.min(100, (totalPaidIncludingPartial / sale.total) * 100) : 0;
      return (

      <div className="px-2.5 pb-2.5 pt-2 mx-2 mb-2 rounded-xl bg-muted/30 border border-border/40 animate-in slide-in-from-top-1 fade-in duration-200 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground leading-none">Valor total</p>
            <p className="font-bold text-foreground tabular-nums text-sm leading-tight">{formatCurrency(sale.total)}</p>
          </div>
          <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusInfo.cls}`}>
            {statusInfo.label}
          </span>
        </div>

        <div className="space-y-1 text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Cliente</span>
            <span className="font-semibold text-foreground truncate">{sale.customerName || "—"}</span>
          </div>
          {(sale.description || sale.productName) && (
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground text-[10px] uppercase tracking-wide shrink-0">Descrição</span>
              <span className="font-medium text-foreground text-right line-clamp-2 break-words">{sale.description || sale.productName}</span>
            </div>
          )}
        </div>

        {!isPaid && sale.total > 0 && (
          <div className="space-y-1">
            <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-success rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] tabular-nums">
              <span className="text-success font-semibold">{formatCurrency(totalPaidIncludingPartial)} pago</span>
              <span className="text-warning font-semibold">{formatCurrency(remaining)} restante</span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 text-[10px]">
          <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 font-semibold text-foreground tabular-nums">
            <Receipt className="h-3 w-3 text-muted-foreground" />
            {sale.paidInstallments}/{sale.installments} parcelas
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 font-semibold text-foreground tabular-nums">
            <CalendarIcon className="h-3 w-3 text-muted-foreground" />
            {isPaid ? "Quitado" : format(nextDue, "dd/MM/yyyy")}
          </span>
          {historyCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 font-semibold text-foreground tabular-nums">
              {historyCount} pgto{historyCount > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {sale.notes && (
          <p className="text-[11px] text-muted-foreground italic line-clamp-2 border-l-2 border-border/60 pl-2">
            {sale.notes}
          </p>
        )}

        {!readOnly && (
          <div className="pt-2 border-t border-border/40 grid grid-cols-6 gap-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <Button data-mutation
                  variant="outline"
                  size="sm"
                  className="col-span-2 h-8 text-[11px] px-2 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground w-full justify-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <HandCoins className="h-3.5 w-3.5 mr-1" /> Pagar
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-1" align="end">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowPayDatePicker(true); }}
                  className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground hover:bg-primary/10 transition-colors"
                >
                  <CheckCircle className="h-4 w-4 text-primary" />
                  <span>Pagar Parcela</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowPartial(true); }}
                  className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground hover:bg-warning/10 transition-colors"
                >
                  <HandCoins className="h-4 w-4 text-warning" />
                  <span>Pagar Parcial</span>
                </button>
              </PopoverContent>
            </Popover>
            <Button
              variant="outline"
              size="sm"
              className="col-span-2 h-8 text-[11px] px-2 border-success/30 text-success hover:bg-success hover:text-success-foreground relative w-full justify-center"
              onClick={(e) => { e.stopPropagation(); setShowPayments(true); }}
            >
              <Receipt className="h-3.5 w-3.5 mr-1" /> Histórico
              {historyCount > 0 && (
                <Badge variant="secondary" className="ml-1 text-[9px] px-1 py-0">
                  {historyCount}
                </Badge>
              )}
            </Button>
            {sale.businessType !== "aluguel_veiculo" ? (
              <div className="col-span-2 [&>button]:w-full [&>button]:justify-center [&>button]:h-8 [&>button]:text-[11px] [&>button]:px-2">
                <WarrantyManager sale={sale} />
              </div>
            ) : <div className="col-span-2" />}
            <Button data-mutation
              variant="outline"
              size="sm"
              className="col-span-3 h-8 text-[11px] px-2 border-secondary text-secondary-foreground hover:bg-secondary/80 w-full justify-center"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
            >
              <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
            </Button>
            <Button data-mutation
              variant="outline"
              size="sm"
              className="col-span-3 h-8 text-[11px] px-2 border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground w-full justify-center"
              onClick={(e) => { e.stopPropagation(); setConfirmDeleteSale(true); }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
            </Button>
          </div>
        )}
      </div>
      );
    })()}
    <ConfirmDeleteDialog
      open={confirmDeleteSale}
      onOpenChange={setConfirmDeleteSale}
      onConfirm={() => { onDelete(); setConfirmDeleteSale(false); }}
      title="Excluir venda"
      description="Tem certeza que deseja excluir esta venda?"
    />
    </div>
  );
}

export function ProductSalesTable({
  sales,
  formatCurrency,
  readOnly = false,
  incomeCategoryByName,
  onEdit,
  onDeleteSale,
  onUpdateSale,
}: {
  sales: Sale[];
  formatCurrency: (v: number) => string;
  readOnly?: boolean;
  incomeCategoryByName?: Map<string, CustomIncomeCategory>;
  onEdit: (sale: Sale) => void;
  onDeleteSale: (id: string) => void;
  onUpdateSale: (id: string, data: Partial<Omit<Sale, "id">>) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  return (
    <Card no3d className="overflow-hidden">
      <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 border-b border-border/50 bg-muted/40">
        <div className="h-8 w-8 sm:h-9 sm:w-9 shrink-0" aria-hidden />
        <p className="flex-1 min-w-0 md:basis-0 md:grow text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Cliente</p>
        <p className="hidden md:block flex-1 min-w-0 basis-0 text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Categoria</p>
        <p className="hidden md:block flex-[2] min-w-0 basis-0 text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Descrição</p>

        <p className="w-[78px] sm:w-[88px] lg:w-[110px] shrink-0 text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Vencimento</p>
        <p className="w-[102px] sm:w-[108px] lg:w-[140px] shrink-0 text-right text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Valor</p>
        <div className="w-4 shrink-0" aria-hidden />
      </div>
      <div className="divide-y divide-border/30">
        {sales.map((sale) => (
          <SaleListRow
            key={sale.id}
            sale={sale}
            onEdit={() => onEdit(sale)}
            onDelete={() => onDeleteSale(sale.id)}
            onUpdate={(data) => onUpdateSale(sale.id, data)}
            formatCurrency={formatCurrency}
            readOnly={readOnly}
            incomeCategoryByName={incomeCategoryByName}
            expanded={expandedId === sale.id}
            onToggle={() => setExpandedId((prev) => (prev === sale.id ? null : sale.id))}
          />
        ))}
      </div>
    </Card>
  );
}
