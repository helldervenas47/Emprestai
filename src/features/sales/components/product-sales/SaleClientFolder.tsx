import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Sale, Client } from "@/types/loan";
import { LocadorInfo } from "@/features/vehicles/hooks/useLocadorInfo";
import { VehicleInfo } from "@/features/vehicles/hooks/useVehicleRegistry";
import { SaleClientGroup } from "@/features/sales/components/product-sales/productSalesTypes";
import { getSaleCategory } from "@/features/sales/components/product-sales/productSalesUtils";
import { ProductSaleCard } from "@/features/sales/components/product-sales/ProductSaleCard";

export function SaleClientFolder({
  group, onDeleteSale, onUpdateSale, formatCurrency, onEdit, readOnly = false, clients = [], locadorInfo, registeredVehicles = [], locadores = [],
}: {
  group: SaleClientGroup;
  onDeleteSale: (id: string) => void;
  onUpdateSale: (id: string, data: Partial<Omit<Sale, "id">>) => void;
  formatCurrency: (v: number) => string;
  onEdit: (sale: Sale) => void;
  readOnly?: boolean;
  clients?: Client[];
  locadorInfo?: LocadorInfo;
  registeredVehicles?: VehicleInfo[];
  locadores?: LocadorInfo[];
}) {
  const [open, setOpen] = useState(false);
  const activeCount = group.sales.filter((s) => getSaleCategory(s) !== "paid").length;
  const paidCount = group.sales.filter((s) => getSaleCategory(s) === "paid").length;

  return (
    <Card no3d className={`overflow-hidden transition-shadow hover:shadow-lg ${open ? "ring-1 ring-primary/20" : ""} ${group.hasOverdue ? "border-destructive/40" : ""}`}>
      <button type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0 shadow-md ${group.hasOverdue ? "bg-destructive" : "gradient-primary"}`}>
          {group.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-foreground text-sm truncate">{group.name}</h3>
            {group.hasOverdue && <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">Atrasado</Badge>}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="outline" className="text-[10px]">{group.sales.length}</Badge>
            {activeCount > 0 && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">{activeCount} ativos</Badge>}
            {paidCount > 0 && <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/20">{paidCount} pagos</Badge>}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs shrink-0">
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase">Total</p>
            <p className="font-bold text-foreground">{formatCurrency(group.totalAmount)}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase">PAGO</p>
            <p className="font-bold text-success">{formatCurrency(group.totalPaid)}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase">A Receber</p>
            <p className={`font-bold ${group.hasOverdue ? "text-destructive" : "text-warning"}`}>{formatCurrency(group.totalReceivable)}</p>
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <CardContent className="pt-0 pb-3 px-3 space-y-3">
          {/* Mobile summary */}
          <div className="flex sm:hidden items-center justify-between text-xs border-b border-border/30 pb-3">
            <div className="text-center flex-1">
              <p className="text-[9px] text-muted-foreground uppercase">Total</p>
              <p className="font-bold text-foreground">{formatCurrency(group.totalAmount)}</p>
            </div>
            <div className="text-center flex-1">
              <p className="text-[9px] text-muted-foreground uppercase">PAGO</p>
              <p className="font-bold text-success">{formatCurrency(group.totalPaid)}</p>
            </div>
            <div className="text-center flex-1">
              <p className="text-[9px] text-muted-foreground uppercase">A Receber</p>
              <p className={`font-bold ${group.hasOverdue ? "text-destructive" : "text-warning"}`}>{formatCurrency(group.totalReceivable)}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.sales.map((sale) => (
              <ProductSaleCard
                key={sale.id}
                sale={sale}
                onDelete={() => onDeleteSale(sale.id)}
                onEdit={() => onEdit(sale)}
                onUpdate={(data) => onUpdateSale(sale.id, data)}
                formatCurrency={formatCurrency}
                readOnly={readOnly}
                clients={clients}
                locadorInfo={locadorInfo}
                registeredVehicles={registeredVehicles}
                locadores={locadores}
              />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
