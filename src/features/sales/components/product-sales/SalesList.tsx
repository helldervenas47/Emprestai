import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ShoppingCart, Folder } from "lucide-react";
import { Sale, Client } from "@/types/loan";
import { LocadorInfo } from "@/features/vehicles/hooks/useLocadorInfo";
import { VehicleInfo } from "@/features/vehicles/hooks/useVehicleRegistry";
import { SaleEditForm } from "@/features/sales/components/SaleEditForm";
import { ProductSalesSummaryCards } from "@/features/sales/components/product-sales/ProductSalesSummaryCards";
import { ProductSalesFilters } from "@/features/sales/components/product-sales/ProductSalesFilters";
import { ProductSalesTable } from "@/features/sales/components/product-sales/ProductSalesTable";
import { ProductSalesMobileCards } from "@/features/sales/components/product-sales/ProductSalesMobileCards";
import { useProductSalesController } from "@/features/sales/components/product-sales/useProductSalesController";
import { getSaleCategory } from "@/features/sales/components/product-sales/productSalesUtils";
import { SaleClientFolder } from "@/features/sales/components/product-sales/SaleClientFolder";
import { SalesFilterPanel } from "@/features/sales/components/product-sales/SalesFilterPanel";

export function SalesList({
  sales,
  onDeleteSale,
  onUpdateSale,
  clients = [],
  hideOnTrackCard = false,
  renderAfterCards,
  readOnly = false,
  locadorInfo,
  registeredVehicles = [],
  locadores = [],
  scopeKey = "sales",
}: {
  sales: Sale[];
  onDeleteSale: (id: string) => void;
  onUpdateSale: (id: string, data: Partial<Omit<Sale, "id">>) => void;
  clients?: Client[];
  hideOnTrackCard?: boolean;
  renderAfterCards?: React.ReactNode;
  readOnly?: boolean;
  locadorInfo?: LocadorInfo;
  registeredVehicles?: VehicleInfo[];
  locadores?: LocadorInfo[];
  /** Escopo usado para preservar os filtros ao alternar sub-abas. */
  scopeKey?: string;
}) {
  const {
    editingSale, setEditingSale,
    search, setSearch,
    categoryFilter, setCategoryFilter,
    incomeCategoryFilter,
    view, setView,
    breakdownCard, setBreakdownCard,
    filtersOpen, setFiltersOpen,
    advancedFilters, setAdvancedFilters, clearAdvancedFilters,
    activeFilterCount,
    paymentMethods,
    clientOptions,
    sellerOptions,
    categoryOptions,
    formatCurrency,
    incomeCategoryByName,
    counts,
    filtered,
    total,
    folderCount,
    saleGroups,
    listSorted,
    overdueSales,
    onTrackSales,
    dueTodaySales,
    paidContractsCount,
    totalOverdue,
    totalOnTrack,
    totalDueToday,
    totalPaid,
    totalAReceber,
    getSalePaidAmount,
    getRemaining,
    getOverdueInstallmentsValue,
    getFutureInstallmentsValue,
    getDueTodayInstallmentValue,
  } = useProductSalesController(sales, scopeKey);
  // incomeCategoryFilter setter currently unused inside this component (filter UI lives in ProductSalesFilters).
  void incomeCategoryFilter;

  return (
    <div className="space-y-4">
      {/* Dashboard cards */}
      <ProductSalesSummaryCards
        hideOnTrackCard={hideOnTrackCard}
        formatCurrency={formatCurrency}
        totalOverdue={totalOverdue}
        totalOnTrack={totalOnTrack}
        totalDueToday={totalDueToday}
        totalPaid={totalPaid}
        totalAReceber={totalAReceber}
        overdueCount={overdueSales.length}
        onTrackCount={onTrackSales.length}
        dueTodayCount={dueTodaySales.length}
        paidContractsCount={paidContractsCount}
        onSelect={setBreakdownCard}
      />


      {/* Breakdown dialog for clicked summary card */}
      {breakdownCard && (() => {
        const cfg = breakdownCard === "overdue"
          ? { title: "Vencidos", color: "text-destructive", total: totalOverdue,
              items: overdueSales.map((s) => ({ sale: s, value: getOverdueInstallmentsValue(s) })).filter((x) => x.value > 0) }
          : breakdownCard === "paid"
          ? { title: "Pagos", color: "text-success", total: totalPaid,
              items: sales.map((s) => ({ sale: s, value: getSalePaidAmount(s) })).filter((x) => x.value > 0) }
          : breakdownCard === "ontrack"
          ? { title: "No Prazo", color: "text-primary", total: totalOnTrack + totalDueToday,
              items: sales
                .filter((s) => getSaleCategory(s) !== "paid")
                .map((s) => {
                  const isRecorrente = s.paymentMode === "recorrente" && s.installments > 1;
                  const value = isRecorrente
                    ? getFutureInstallmentsValue(s) + getDueTodayInstallmentValue(s)
                    : (getSaleCategory(s) === "on_track" || getSaleCategory(s) === "due_today" ? getRemaining(s) : 0);
                  return { sale: s, value };
                })
                .filter((x) => x.value > 0) }
          : { title: "Total a Receber", color: "text-warning", total: totalAReceber,
              items: sales.filter((s) => getSaleCategory(s) !== "paid").map((s) => ({ sale: s, value: getRemaining(s) })).filter((x) => x.value > 0) };
        const sorted = [...cfg.items].sort((a, b) => b.value - a.value);
        return (
          <Dialog open={!!breakdownCard} onOpenChange={(o) => !o && setBreakdownCard(null)}>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle className={cfg.color}>Valores em "{cfg.title}"</DialogTitle>
                <DialogDescription>Detalhamento dos valores considerados neste card ({sorted.length} {sorted.length === 1 ? "item" : "itens"}).</DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {sorted.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">Nenhum valor considerado.</p>
                )}
                {sorted.map(({ sale, value }) => (
                  <div key={sale.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{sale.customerName || "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">{sale.productName || sale.description}</p>
                    </div>
                    <p className={`text-sm font-bold tabular-nums ${cfg.color}`}>{formatCurrency(value)}</p>
                  </div>
                ))}
              </div>
              <div className="border-t pt-3 flex items-center justify-between">
                <span className="text-sm font-semibold">Total</span>
                <span className={`text-base font-bold tabular-nums ${cfg.color}`}>{formatCurrency(cfg.total)}</span>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}


      {renderAfterCards}

      <ProductSalesFilters
        view={view}
        setView={setView}
        search={search}
        setSearch={setSearch}
        folderCount={folderCount}
        filteredCount={filtered.length}
        totalAmount={filtered.reduce(
          (acc, s) => acc + (categoryFilter === "paid" ? s.total : getRemaining(s)),
          0,
        )}
        formatCurrency={formatCurrency}
        activeFilterCount={activeFilterCount}
        showFilters={filtersOpen}
        onToggleFilters={() => setFiltersOpen(!filtersOpen)}
        onClearFilters={clearAdvancedFilters}
        filterPanel={(
          <SalesFilterPanel
            filters={advancedFilters}
            setFilters={setAdvancedFilters}
            onClear={clearAdvancedFilters}
            clientOptions={clientOptions}
            sellerOptions={sellerOptions}
            categoryOptions={categoryOptions}
            paymentMethods={paymentMethods}
            resultCount={filtered.length}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            counts={counts}
            totalSalesCount={sales.length}
          />
        )}
      />

      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">Nenhum lançamento encontrado</p>
        </CardContent></Card>
      ) : view === "folders" ? (
        saleGroups.length > 0 ? (
          <div className="space-y-4">
            {saleGroups.map((g) => (
              <SaleClientFolder
                key={g.name}
                group={g}
                onDeleteSale={onDeleteSale}
                onUpdateSale={onUpdateSale}
                formatCurrency={formatCurrency}
                onEdit={setEditingSale}
                readOnly={readOnly}
                clients={clients}
                locadorInfo={locadorInfo}
                registeredVehicles={registeredVehicles}
                locadores={locadores}
              />
            ))}
          </div>
        ) : (
          <Card no3d><CardContent className="py-12 text-center">
            <Folder className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">Nenhuma pasta encontrada</p>
          </CardContent></Card>
        )
      ) : (
        <ProductSalesMobileCards
          sales={filtered}
          formatCurrency={formatCurrency}
          readOnly={readOnly}
          clients={clients}
          locadorInfo={locadorInfo}
          registeredVehicles={registeredVehicles}
          locadores={locadores}
          onEdit={setEditingSale}
          onDeleteSale={onDeleteSale}
          onUpdateSale={onUpdateSale}
        />
      )}
      {editingSale && (
        <SaleEditForm
          sale={editingSale}
          onSave={(id, data) => {
            onUpdateSale(id, data);
            setEditingSale(null);
          }}
          onClose={() => setEditingSale(null)}
          clients={clients}
          registeredVehicles={registeredVehicles}
          locadores={locadores}
        />
      )}
    </div>
  );
}
