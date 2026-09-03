// Mini horizontal card for Vendas — visual parity with LoanListMiniCard.
// Presentation-only: expands inline to render the full ProductSaleCard,
// preserving all existing dialogs, handlers and business logic.
import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, ShoppingCart, Tv, Car } from "lucide-react";
import { Client, Sale } from "@/types/loan";
import { LocadorInfo } from "@/features/vehicles/hooks/useLocadorInfo";
import { VehicleInfo } from "@/features/vehicles/hooks/useVehicleRegistry";
import { useHideValues } from "@/contexts/HideValuesContext";
import { ProductSaleCard } from "./ProductSaleCard";
import {
  getSaleCategory,
  getNextDueDateHelper,
  getNextInstallmentValueHelper,
  getSalePaidAmountHelper,
  rawFormatCurrency,
} from "./productSalesUtils";

type Cat = "paid" | "overdue" | "due_today" | "on_track";

const toneByCat: Record<Cat, { text: string; dot: string; stripe: string; avatarBg: string }> = {
  overdue:   { text: "text-destructive", dot: "bg-destructive", stripe: "bg-destructive", avatarBg: "bg-destructive/15 text-destructive" },
  due_today: { text: "text-warning",     dot: "bg-warning",     stripe: "bg-warning",     avatarBg: "bg-warning/15 text-warning" },
  on_track:  { text: "text-primary",     dot: "bg-primary",     stripe: "bg-primary",     avatarBg: "bg-primary/15 text-primary" },
  paid:      { text: "text-success",     dot: "bg-success",     stripe: "bg-success",     avatarBg: "bg-success/15 text-success" },
};

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function fmtDateBR(d: Date) {
  return d.toLocaleDateString("pt-BR");
}

export function SaleListMiniCard(props: {
  sale: Sale;
  formatCurrency: (v: number) => string;
  readOnly?: boolean;
  clients?: Client[];
  locadorInfo?: LocadorInfo;
  registeredVehicles?: VehicleInfo[];
  locadores?: LocadorInfo[];
  onEdit: (sale: Sale) => void;
  onDeleteSale: (id: string) => void;
  onUpdateSale: (id: string, data: Partial<Omit<Sale, "id">>) => void;
}) {
  const { sale, formatCurrency } = props;
  const [open, setOpen] = useState(false);
  const { mask } = useHideValues();

  const rawCat = getSaleCategory(sale);
  const isRecorrente = sale.paymentMode === "recorrente" && sale.installments > 1;
  const category: Cat = rawCat;
  const tone = toneByCat[category];

  const totalPaid = useMemo(() => getSalePaidAmountHelper(sale), [sale]);
  const nextDue = useMemo(() => getNextDueDateHelper(sale), [sale]);

  // Em vendas parceladas, o valor exibido como "Restante" deve ser o valor da
  // próxima parcela pendente; em vendas à vista, continua sendo o saldo total.
  // Contratos quitados não têm nada a pagar: exibem sempre zero.
  const remaining = category === "paid"
    ? 0
    : isRecorrente
      ? Math.max(0, getNextInstallmentValueHelper(sale) - (sale.partialPaid || 0))
      : Math.max(0, sale.total - totalPaid - (sale.partialPaid || 0));

  const displayRemaining = remaining;
  const remainingLabel = isRecorrente ? "Próx. parcela" : "Restante";

  const progressPct = sale.total > 0
    ? Math.min(100, Math.max(0, Math.round(((totalPaid + (sale.partialPaid || 0)) / sale.total) * 100)))
    : 0;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dueNorm = new Date(nextDue.getFullYear(), nextDue.getMonth(), nextDue.getDate());
  const daysDiff = Math.floor((today.getTime() - dueNorm.getTime()) / (1000 * 60 * 60 * 24));

  const statusText =
    category === "overdue" ? "Atrasado"
      : category === "due_today" ? "Vence hoje"
      : category === "paid" ? "Recebida"
      : "Em dia";


  const clientName = sale.customerName || sale.description || sale.productName || "—";
  const subtitle = sale.description || sale.productName || "";

  const AvatarIcon =
    sale.businessType === "streaming" ? Tv :
    sale.businessType === "aluguel_veiculo" ? Car :
    ShoppingCart;

  return (
    <div
      className={[
        "group relative rounded-2xl border border-border/60 dark:border-white/[0.06]",
        "bg-card/80 dark:bg-white/[0.03] backdrop-blur-sm",
        "shadow-[0_1px_2px_hsl(220_40%_2%/0.04)]",
        "transition-all duration-200 hover:border-primary/30 hover:-translate-y-[1px]",
        "overflow-hidden",
      ].join(" ")}
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] ${tone.stripe}`} aria-hidden />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-left px-3 py-2.5 sm:px-4 sm:py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-2xl"
        aria-label={`${open ? "Recolher" : "Expandir"} detalhes de ${clientName}`}
      >
        {/* Row 1 — identity + total */}
        <div className="flex items-start gap-2.5">
          <div className={`h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold shrink-0 ${tone.avatarBg}`}>
            {sale.customerName ? initials(sale.customerName) : <AvatarIcon className="h-4 w-4" />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <h3 className="font-semibold text-foreground text-sm sm:text-[15px] truncate leading-tight">
                {clientName}
              </h3>
            </div>
            {subtitle && (
              <p className="mt-0.5 text-xs sm:text-[13px] font-medium text-foreground/90 truncate leading-tight">
                {subtitle}
              </p>
            )}
          </div>

          <div className="text-right shrink-0 flex items-start gap-1">
            <div>
              <p className={`text-[10px] sm:text-[11px] leading-none ${tone.text}`}>{remainingLabel}</p>
              <p className={`text-sm sm:text-[15px] font-bold tabular-nums mt-0.5 ${tone.text}`}>
                {mask(rawFormatCurrency(displayRemaining))}
              </p>
            </div>
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground mt-0.5 transition-transform" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5 transition-transform" aria-hidden />
            )}
          </div>
        </div>

        {/* Row 2 — total / next / progress */}
        <div className="mt-2.5 grid grid-cols-3 gap-2 items-center">
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground leading-none">Valor total</p>
            <p className={`text-xs sm:text-sm font-semibold tabular-nums mt-1 ${tone.text} truncate`}>
              {mask(rawFormatCurrency(sale.total))}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground leading-none">
              {isRecorrente ? "Próx. vencimento" : "Vencimento"}
            </p>
            <p className="text-xs sm:text-sm font-medium text-foreground/90 tabular-nums mt-1 truncate">
              {fmtDateBR(nextDue)}
            </p>
          </div>
          <div className="min-w-0">
            <p className={`leading-none truncate ${category === "overdue" && daysDiff > 0 ? `text-[11px] font-semibold ${tone.text}` : "text-[10px] text-muted-foreground"}`}>
              {category === "overdue" && daysDiff > 0
                ? `${statusText} · ${daysDiff} dia${daysDiff > 1 ? "s" : ""}`
                : isRecorrente ? `Parcelas ${sale.paidInstallments}/${sale.installments}` : "Progresso"}
            </p>

            <div className="mt-1 flex items-center gap-1.5">
              <span className={`text-[11px] sm:text-xs font-semibold tabular-nums ${tone.text} shrink-0`}>
                {progressPct}%
              </span>
              <div className="h-1.5 flex-1 rounded-full bg-muted/60 overflow-hidden">
                <div
                  className={`h-full ${tone.stripe} transition-all`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </button>

      {open && (
        <div
          className="border-t border-border/50 dark:border-white/[0.06] bg-muted/20 dark:bg-white/[0.02] p-2 sm:p-3 animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <ProductSaleCard
            sale={sale}
            onDelete={() => props.onDeleteSale(sale.id)}
            onEdit={() => props.onEdit(sale)}
            onUpdate={(data) => props.onUpdateSale(sale.id, data)}
            formatCurrency={formatCurrency}
            readOnly={props.readOnly}
            clients={props.clients}
            locadorInfo={props.locadorInfo}
            registeredVehicles={props.registeredVehicles}
            locadores={props.locadores}
          />
        </div>
      )}
    </div>
  );
}
