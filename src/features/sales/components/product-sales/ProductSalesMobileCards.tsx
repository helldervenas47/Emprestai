import { Client, Sale } from "@/types/loan";
import { LocadorInfo } from "@/features/vehicles/hooks/useLocadorInfo";
import { VehicleInfo } from "@/features/vehicles/hooks/useVehicleRegistry";
import { SaleListMiniCard } from "./SaleListMiniCard";

export function ProductSalesMobileCards({
  sales,
  formatCurrency,
  readOnly = false,
  clients = [],
  locadorInfo,
  registeredVehicles = [],
  locadores = [],
  onEdit,
  onDeleteSale,
  onUpdateSale,
}: {
  sales: Sale[];
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
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {sales.map((sale, i) => (
        <div
          key={sale.id}
          className="animate-fade-in"
          style={{ animationDelay: `${i * 40}ms`, animationFillMode: "backwards" }}
        >
          <SaleListMiniCard
            sale={sale}
            formatCurrency={formatCurrency}
            readOnly={readOnly}
            clients={clients}
            locadorInfo={locadorInfo}
            registeredVehicles={registeredVehicles}
            locadores={locadores}
            onEdit={onEdit}
            onDeleteSale={onDeleteSale}
            onUpdateSale={onUpdateSale}
          />
        </div>
      ))}
    </div>
  );
}
