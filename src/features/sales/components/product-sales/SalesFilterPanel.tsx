import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { RotateCcw } from "lucide-react";
import type { PaymentMethod } from "@/hooks/usePaymentMethods";
import { SaleCategory, saleCategoryFilters } from "./productSalesTypes";
import {
  SalesAdvancedFilters,
  SalesStatus,
  countActiveSalesFilters,
  salesPeriodOptions,
  salesStatusOptions,
} from "./salesFilters";

interface Props {
  filters: SalesAdvancedFilters;
  setFilters: (updater: (prev: SalesAdvancedFilters) => SalesAdvancedFilters) => void;
  onClear: () => void;
  clientOptions: string[];
  sellerOptions: string[];
  categoryOptions: string[];
  paymentMethods: PaymentMethod[];
  resultCount: number;
  /** Chips de situação (Todos / Atrasados / Pagos / Vence Hoje / Em Dia) */
  categoryFilter: SaleCategory;
  setCategoryFilter: (v: SaleCategory) => void;
  counts: Record<string, number>;
  totalSalesCount: number;
}

export function SalesFilterPanel({
  filters,
  setFilters,
  onClear,
  clientOptions,
  sellerOptions,
  categoryOptions,
  paymentMethods,
  resultCount,
  categoryFilter,
  setCategoryFilter,
  counts,
  totalSalesCount,
}: Props) {
  const activeCount = useMemo(() => countActiveSalesFilters(filters), [filters]);

  const toggleStatus = (id: SalesStatus) => {
    setFilters((prev) => ({
      ...prev,
      statuses: prev.statuses.includes(id)
        ? prev.statuses.filter((s) => s !== id)
        : [...prev.statuses, id],
    }));
  };

  return (
    <Card className="animate-in fade-in-0 slide-in-from-top-1 duration-200">
      <CardContent className="p-4 space-y-5">
        {/* Situação (chips) */}
        <section className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Situação</Label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {saleCategoryFilters.map((cat) => {
              const count = cat.id === "all" ? totalSalesCount : counts[cat.id] || 0;
              const isActive = categoryFilter === cat.id;
              return (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  aria-pressed={isActive}
                  className={`px-2 py-1.5 rounded-xl text-[10px] sm:text-xs font-semibold border transition-all duration-200 whitespace-nowrap ${
                    isActive ? cat.activeColor : cat.color
                  }`}
                >
                  {cat.label} ({count})
                </button>
              );
            })}
          </div>
        </section>

        {/* Período */}
        <section className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Período</Label>
          <div className="flex flex-wrap gap-2">
            {salesPeriodOptions.map((p) => {
              const isActive = filters.period === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setFilters((prev) => ({ ...prev, period: p.id }))}
                  className={[
                    "h-9 px-3.5 rounded-full text-xs font-medium border transition-all duration-200",
                    isActive
                      ? "bg-primary text-primary-foreground border-primary shadow-sm scale-[1.02]"
                      : "bg-transparent border-border/70 dark:border-white/10 text-muted-foreground hover:bg-card hover:border-primary/30",
                  ].join(" ")}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          {filters.period === "custom" && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">De</Label>
                <DatePickerField
                  value={filters.dateFrom}
                  onChange={(v) => setFilters((prev) => ({ ...prev, dateFrom: v }))}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Até</Label>
                <DatePickerField
                  value={filters.dateTo}
                  onChange={(v) => setFilters((prev) => ({ ...prev, dateTo: v }))}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          )}
        </section>

        {/* Status da venda */}
        <section className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status da venda</Label>
          <div className="flex flex-wrap gap-2">
            {salesStatusOptions.map((s) => {
              const isActive = filters.statuses.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => toggleStatus(s.id)}
                  className={[
                    "h-9 px-3.5 rounded-full text-xs font-medium border transition-all duration-200",
                    isActive
                      ? `${s.activeColor} shadow-sm scale-[1.02]`
                      : `bg-transparent border-border/70 dark:border-white/10 ${s.color} hover:bg-card`,
                  ].join(" ")}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Seletores + valores */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Cliente</Label>
            <Select value={filters.client} onValueChange={(v) => setFilters((prev) => ({ ...prev, client: v }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">Todos</SelectItem>
                {clientOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Vendedor</Label>
            <Select value={filters.seller} onValueChange={(v) => setFilters((prev) => ({ ...prev, seller: v }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">Todos</SelectItem>
                {sellerOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Forma de pagamento</Label>
            <Select value={filters.paymentMethod} onValueChange={(v) => setFilters((prev) => ({ ...prev, paymentMethod: v }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">Todas</SelectItem>
                {paymentMethods.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Categoria</Label>
            <Select value={filters.category} onValueChange={(v) => setFilters((prev) => ({ ...prev, category: v }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="__none__">Sem categoria</SelectItem>
                {categoryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Valor Mínimo (R$)</Label>
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              placeholder="0"
              value={filters.amountMin}
              onChange={(e) => setFilters((prev) => ({ ...prev, amountMin: e.target.value }))}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Valor Máximo (R$)</Label>
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              placeholder="∞"
              value={filters.amountMax}
              onChange={(e) => setFilters((prev) => ({ ...prev, amountMax: e.target.value }))}
              className="h-9 text-sm"
            />
          </div>
        </section>

        <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-3">
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <span><span className="font-semibold text-foreground">{resultCount}</span> lançamento(s)</span>
            {activeCount > 0 && (
              <Badge className="h-5 rounded-full px-2 text-[10px]">
                {activeCount} filtro{activeCount > 1 ? "s" : ""} ativo{activeCount > 1 ? "s" : ""}
              </Badge>
            )}
          </p>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={onClear}>
            <RotateCcw className="h-3.5 w-3.5" />
            Limpar filtros
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
