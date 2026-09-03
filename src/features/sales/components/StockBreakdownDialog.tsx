import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Package, Boxes } from "lucide-react";
import type { Product } from "@/types/loan";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: Product[];
}

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function StockBreakdownDialog({ open, onOpenChange, products }: Props) {
  const rows = useMemo(() => {
    return products
      .filter((p) => (p.stock ?? 0) > 0)
      .map((p) => {
        const qty = Math.max(0, p.stock || 0);
        const unit = p.price || 0;
        return {
          id: p.id,
          name: p.name,
          qty,
          unit,
          total: qty * unit,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [products]);

  const totalGeral = rows.reduce((s, r) => s + r.total, 0);
  const totalItens = rows.reduce((s, r) => s + r.qty, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:flex max-sm:flex-col">
        <DialogHeader
          className="px-5 pt-5 pb-3 border-b"
          style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}
        >
          <DialogTitle className="flex items-center gap-2 text-base">
            <Boxes className="h-4 w-4 text-primary" />
            Detalhamento do Estoque
          </DialogTitle>
          <div className="mt-3 rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 shadow-sm">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Valor total em estoque
            </p>
            <p className="text-3xl font-bold tabular-nums leading-tight mt-1">
              {fmt(totalGeral)}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Package className="h-3 w-3" />
                {rows.length} {rows.length === 1 ? "produto" : "produtos"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Boxes className="h-3 w-3" />
                {totalItens.toLocaleString("pt-BR")} unidades
              </span>
            </div>
          </div>
        </DialogHeader>
        <ScrollArea
          className="max-h-[60vh] max-sm:max-h-none max-sm:flex-1 max-sm:h-full px-5 py-4"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum produto em estoque.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const pct = totalGeral > 0 ? (r.total / totalGeral) * 100 : 0;
                return (
                  <div
                    key={r.id}
                    className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm p-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground truncate min-w-0">
                        {r.name}
                      </p>
                      <span className="text-sm font-bold tabular-nums text-foreground shrink-0">
                        {fmt(r.total)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground tabular-nums">
                      <span>
                        {r.qty.toLocaleString("pt-BR")} un × {fmt(r.unit)}
                      </span>
                      <span>{pct.toFixed(1)}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
