import React, { useEffect, useMemo, useState } from "react";
import { useProducts } from "@/features/sales/hooks/useProducts";
import { useExpenses } from "@/features/financial/hooks/useExpenses";
import {
  useStockMovements,
  StockMovement,
  StockMovementType,
} from "@/features/sales/hooks/useStockMovements";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Boxes,
  PackagePlus,
  ShoppingBag,
  History,
  ShoppingCart,
  Wrench,
  AlertTriangle,
  Pencil,
  Plus,
  Trash2,
  MoreVertical,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  CheckCircle2,
  TrendingUp,
  SlidersHorizontal,
  RotateCcw,
  DollarSign,
  AlertCircle,
  Package,
  ArrowLeft,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProductForm } from "@/features/sales/components/ProductForm";
import type { Product } from "@/types/loan";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { todayInAppTz } from "@/lib/timezone";
import { useDataOwner } from "@/hooks/useDataOwner";
import { supabase } from "@/integrations/supabase/userClient";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { confirmWithScroll } from "@/lib/confirmWithScroll";
import { onAppUIEvent } from "@/lib/appUIEvents";

const movementMeta: Record<
  StockMovementType,
  { label: string; icon: any; cls: string; sign: "+" | "-" }
> = {
  entrada_manual: {
    label: "Entrada manual",
    icon: PackagePlus,
    cls: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    sign: "+",
  },
  compra: {
    label: "Compra",
    icon: ShoppingBag,
    cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    sign: "+",
  },
  venda: {
    label: "Venda",
    icon: ShoppingCart,
    cls: "bg-rose-500/10 text-rose-600 border-rose-500/20",
    sign: "-",
  },
  ajuste: {
    label: "Baixa / Ajuste",
    icon: Wrench,
    cls: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    sign: "-",
  },
};

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface Props {
  readOnly?: boolean;
}

export function StockManager({ readOnly = false }: Props) {
  const { products, addProduct, updateProduct, deleteProduct } = useProducts(true);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const { movements, recordMovement, deleteMovement } = useStockMovements(true);
  const ownerId = useDataOwner();

  // Abas internas
  const [activeMainTab, setActiveMainTab] = useState<"estoque" | "historico">("estoque");

  // Modais de ações
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryInitialMode, setEntryInitialMode] = useState<"entrada" | "saida">("entrada");
  const [entryInitialProductId, setEntryInitialProductId] = useState<string | undefined>(undefined);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const handleOpenEntry = (mode: "entrada" | "saida" = "entrada", productId?: string) => {
    setEntryInitialMode(mode);
    setEntryInitialProductId(productId);
    setEntryOpen(true);
  };

  // Listener para evento global de Ajuste de Estoque (ex: SpeedDial FAB)
  useEffect(() => {
    const handler = (e?: any) => {
      const targetProductId = e?.detail?.productId;
      handleOpenEntry("saida", targetProductId);
    };
    window.addEventListener("open-stock-adjust", handler);
    const unbind = onAppUIEvent("OPEN_STOCK_ADJUST", () => handleOpenEntry("saida"));
    return () => {
      window.removeEventListener("open-stock-adjust", handler);
      unbind();
    };
  }, []);

  // Filtros de Estoque
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "todos" | "em_estoque" | "estoque_baixo" | "sem_estoque" | "inativos"
  >("todos");
  const [sortBy, setSortBy] = useState<string>("name-asc");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minCost, setMinCost] = useState("");
  const [maxCost, setMaxCost] = useState("");
  const [minMargin, setMinMargin] = useState("");

  // Filtros de Movimentações
  const [filterType, setFilterType] = useState<string>("all");
  const [filterProduct, setFilterProduct] = useState<string>("all");
  const [filterReason, setFilterReason] = useState<string>("all");

  // Mobile Accordion
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Estatísticas de Produtos
  const activeProducts = useMemo(
    () => products.filter((p) => p.active !== false),
    [products]
  );
  const inactiveProducts = useMemo(
    () => products.filter((p) => p.active === false),
    [products]
  );

  // Totais do Estoque (KPIs)
  const totalSaleValue = useMemo(
    () =>
      activeProducts.reduce(
        (s, p) => s + (p.price || 0) * Math.max(0, p.stock || 0),
        0
      ),
    [activeProducts]
  );

  const totalCostValue = useMemo(
    () =>
      activeProducts.reduce(
        (s, p) => s + (p.cost || 0) * Math.max(0, p.stock || 0),
        0
      ),
    [activeProducts]
  );

  const potentialProfit = useMemo(
    () => totalSaleValue - totalCostValue,
    [totalSaleValue, totalCostValue]
  );

  const totalUnits = useMemo(
    () => activeProducts.reduce((s, p) => s + Math.max(0, p.stock || 0), 0),
    [activeProducts]
  );

  // Produtos que precisam de atenção (estoque baixo ou sem estoque)
  const lowStockProducts = useMemo(() => {
    return activeProducts.filter((p) => {
      const threshold =
        p.suggestedStock && p.suggestedStock > 0 ? p.suggestedStock : 5;
      return p.stock > 0 && p.stock <= threshold;
    });
  }, [activeProducts]);

  const outOfStockProducts = useMemo(() => {
    return activeProducts.filter((p) => p.stock <= 0);
  }, [activeProducts]);

  const inStockProducts = useMemo(() => {
    return activeProducts.filter((p) => {
      const threshold =
        p.suggestedStock && p.suggestedStock > 0 ? p.suggestedStock : 5;
      return p.stock > threshold;
    });
  }, [activeProducts]);

  // Contagem de filtros ativos avançados
  const activeAdvancedFilterCount = useMemo(() => {
    let count = 0;
    if (minPrice) count++;
    if (maxPrice) count++;
    if (minCost) count++;
    if (maxCost) count++;
    if (minMargin) count++;
    return count;
  }, [minPrice, maxPrice, minCost, maxCost, minMargin]);

  // Filtragem e Ordenação da Lista de Produtos
  const sortedProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minP = parseFloat(minPrice) || 0;
    const maxP = parseFloat(maxPrice) || Infinity;
    const minC = parseFloat(minCost) || 0;
    const maxC = parseFloat(maxCost) || Infinity;
    const minM = parseFloat(minMargin) || -Infinity;

    const arr = products.filter((p) => {
      // Busca textual
      if (
        q &&
        !p.name.toLowerCase().includes(q) &&
        !p.description.toLowerCase().includes(q)
      ) {
        return false;
      }

      // Status
      const threshold =
        p.suggestedStock && p.suggestedStock > 0 ? p.suggestedStock : 5;
      const isOut = p.stock <= 0;
      const isLow = p.stock > 0 && p.stock <= threshold;
      const isInStock = p.stock > threshold;
      const isInactive = p.active === false;

      if (statusFilter === "inativos") {
        if (!isInactive) return false;
      } else if (statusFilter === "sem_estoque") {
        if (isInactive || !isOut) return false;
      } else if (statusFilter === "estoque_baixo") {
        if (isInactive || !isLow) return false;
      } else if (statusFilter === "em_estoque") {
        if (isInactive || !isInStock) return false;
      } else if (statusFilter === "todos") {
        // Mostra todos
      }

      // Filtros avançados
      if (minPrice && p.price < minP) return false;
      if (maxPrice && p.price > maxP) return false;
      if (minCost && p.cost < minC) return false;
      if (maxCost && p.cost > maxC) return false;

      if (minMargin) {
        const hasMargin = p.cost > 0 && p.price > 0;
        const marginPct = hasMargin
          ? ((p.price - p.cost) / p.cost) * 100
          : 0;
        if (marginPct < minM) return false;
      }

      return true;
    });

    // Ordenação
    switch (sortBy) {
      case "name-asc":
        arr.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        break;
      case "name-desc":
        arr.sort((a, b) => b.name.localeCompare(a.name, "pt-BR"));
        break;
      case "stock-desc":
        arr.sort((a, b) => (b.stock || 0) - (a.stock || 0));
        break;
      case "stock-asc":
        arr.sort((a, b) => (a.stock || 0) - (b.stock || 0));
        break;
      case "price-desc":
        arr.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case "price-asc":
        arr.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case "cost-desc":
        arr.sort((a, b) => (b.cost || 0) - (a.cost || 0));
        break;
      case "cost-asc":
        arr.sort((a, b) => (a.cost || 0) - (b.cost || 0));
        break;
      case "margin-desc":
        arr.sort((a, b) => {
          const ma =
            a.cost > 0 && a.price > 0 ? ((a.price - a.cost) / a.cost) * 100 : -Infinity;
          const mb =
            b.cost > 0 && b.price > 0 ? ((b.price - b.cost) / b.cost) * 100 : -Infinity;
          return mb - ma;
        });
        break;
      case "margin-asc":
        arr.sort((a, b) => {
          const ma =
            a.cost > 0 && a.price > 0 ? ((a.price - a.cost) / a.cost) * 100 : Infinity;
          const mb =
            b.cost > 0 && b.price > 0 ? ((b.price - b.cost) / b.cost) * 100 : Infinity;
          return ma - mb;
        });
        break;
      case "last-purchase-desc":
        arr.sort((a, b) => (b.lastPurchasePrice || 0) - (a.lastPurchasePrice || 0));
        break;
      default:
        arr.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    }

    return arr;
  }, [
    products,
    search,
    statusFilter,
    sortBy,
    minPrice,
    maxPrice,
    minCost,
    maxCost,
    minMargin,
  ]);

  const lastMovementByProduct = useMemo(() => {
    const map = new Map<string, StockMovement>();
    for (const m of movements) {
      if (!m.productId) continue;
      if (!map.has(m.productId)) map.set(m.productId, m);
    }
    return map;
  }, [movements]);

  const extractReason = (notes: string | null): string => {
    if (!notes) return "";
    const m = notes.match(/Motivo:\s*([^|]+?)(?:\s*\||$)/i);
    return m ? m[1].trim() : "";
  };

  const adjustmentReasons = useMemo(() => {
    const set = new Set<string>();
    movements.forEach((m) => {
      if (m.type !== "ajuste") return;
      const r = extractReason(m.notes);
      if (r) set.add(r);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [movements]);

  const filteredMovements = useMemo(
    () =>
      movements.filter(
        (m) =>
          (filterType === "all" || m.type === filterType) &&
          (filterProduct === "all" || m.productId === filterProduct) &&
          (filterReason === "all" ||
            (m.type === "ajuste" && extractReason(m.notes) === filterReason))
      ),
    [movements, filterType, filterProduct, filterReason]
  );

  const clearAllFilters = () => {
    setSearch("");
    setStatusFilter("todos");
    setSortBy("name-asc");
    setMinPrice("");
    setMaxPrice("");
    setMinCost("");
    setMaxCost("");
    setMinMargin("");
  };

  // Abrir histórico de um produto específico
  const handleViewProductHistory = (productId: string) => {
    setFilterProduct(productId);
    setActiveMainTab("historico");
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Top Header */}
        <div className="flex items-center justify-between gap-3 pb-1 border-b border-border/40">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Boxes className="h-6 w-6 text-primary" />
              Painel de Estoque
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gestão de produtos, controle de saldos, entradas manuais e compras.
            </p>
          </div>
        </div>

        {activeMainTab === "estoque" ? (
          <div className="space-y-4">
            {/* 1. Indicadores do Estoque (4 KPIs) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Valor de Venda */}
              <Card className="border border-border/60 bg-card/80 shadow-xs hover:border-emerald-500/40 transition-colors">
                <CardContent className="p-3.5 sm:p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Valor de Venda</span>
                    <span className="h-7 w-7 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                      <DollarSign className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="text-lg sm:text-2xl font-extrabold text-foreground tabular-nums tracking-tight">
                    {fmtBRL(totalSaleValue)}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Total a realizar em vendas
                  </p>
                </CardContent>
              </Card>

              {/* Custo do Estoque */}
              <Card className="border border-border/60 bg-card/80 shadow-xs hover:border-slate-500/40 transition-colors">
                <CardContent className="p-3.5 sm:p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Custo do Estoque</span>
                    <span className="h-7 w-7 rounded-lg bg-slate-500/10 text-slate-600 dark:text-slate-400 flex items-center justify-center">
                      <ShoppingCart className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="text-lg sm:text-2xl font-extrabold text-foreground tabular-nums tracking-tight">
                    {fmtBRL(totalCostValue)}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Capital investido em produtos
                  </p>
                </CardContent>
              </Card>

              {/* Lucro Potencial */}
              <Card className="border border-border/60 bg-card/80 shadow-xs hover:border-primary/40 transition-colors">
                <CardContent className="p-3.5 sm:p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help flex items-center gap-1">
                          Lucro Potencial
                          <AlertCircle className="h-3 w-3 text-muted-foreground/70" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          Valor total de venda - Custo total do estoque
                        </p>
                      </TooltipContent>
                    </Tooltip>
                    <span className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <TrendingUp className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="text-lg sm:text-2xl font-extrabold text-primary tabular-nums tracking-tight">
                    {fmtBRL(potentialProfit)}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Retorno estimado nas vendas
                  </p>
                </CardContent>
              </Card>

              {/* Unidades em Estoque */}
              <Card className="border border-border/60 bg-card/80 shadow-xs hover:border-blue-500/40 transition-colors">
                <CardContent className="p-3.5 sm:p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Unidades</span>
                    <span className="h-7 w-7 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center">
                      <Package className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="text-lg sm:text-2xl font-extrabold text-foreground tabular-nums tracking-tight">
                    {totalUnits}{" "}
                    <span className="text-xs font-semibold text-muted-foreground">
                      itens
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {activeProducts.length} produto
                    {activeProducts.length === 1 ? "" : "s"} cadastrado
                    {activeProducts.length === 1 ? "" : "s"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* 2. Banner de Alerta de Reposição (se houver estoque baixo ou sem estoque) */}
            {(lowStockProducts.length > 0 || outOfStockProducts.length > 0) && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-200">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-foreground">
                      Atenção para reposição de estoque
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {outOfStockProducts.length > 0 && (
                        <strong className="text-rose-600 dark:text-rose-400 font-semibold">
                          {outOfStockProducts.length}{" "}
                          {outOfStockProducts.length === 1
                            ? "produto sem estoque"
                            : "produtos sem estoque"}
                        </strong>
                      )}
                      {outOfStockProducts.length > 0 &&
                        lowStockProducts.length > 0 &&
                        " e "}
                      {lowStockProducts.length > 0 && (
                        <strong className="text-amber-700 dark:text-amber-400 font-semibold">
                          {lowStockProducts.length}{" "}
                          {lowStockProducts.length === 1
                            ? "produto abaixo do mínimo"
                            : "produtos abaixo do mínimo"}
                        </strong>
                      )}
                      .
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {outOfStockProducts.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setStatusFilter("sem_estoque")}
                      className="h-8 text-xs rounded-xl bg-background/80 border-amber-500/40 text-rose-600 hover:bg-rose-500/10"
                    >
                      Ver sem estoque ({outOfStockProducts.length})
                    </Button>
                  )}
                  {lowStockProducts.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setStatusFilter("estoque_baixo")}
                      className="h-8 text-xs rounded-xl bg-background/80 border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                    >
                      Ver estoque baixo ({lowStockProducts.length})
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* 3. Ações Principais e Barra de Ferramentas */}
            <div className="flex items-center justify-between gap-1.5 sm:gap-3 overflow-x-auto no-scrollbar py-0.5 sm:py-0">
              {/* Botões de Ação */}
              {!readOnly && (
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-nowrap sm:flex-wrap">
                  <Button
                    onClick={() => handleOpenEntry("saida")}
                    disabled={products.length === 0}
                    variant="outline"
                    className="h-8 sm:h-10 px-2.5 sm:px-4 rounded-lg sm:rounded-xl font-medium gap-1 sm:gap-1.5 border-border/80 hover:border-amber-500/50 hover:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs shrink-0"
                  >
                    <Wrench className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span>Ajuste<span className="hidden sm:inline"> de estoque</span></span>
                  </Button>

                  <Button
                    onClick={() => handleOpenEntry("entrada")}
                    disabled={products.length === 0}
                    className="h-8 sm:h-10 px-2.5 sm:px-4 rounded-lg sm:rounded-xl font-semibold gap-1 sm:gap-1.5 shadow-sm text-xs shrink-0"
                  >
                    <PackagePlus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span><span className="sm:hidden">+ </span>Entrada<span className="hidden sm:inline"> manual</span></span>
                  </Button>

                  <Button
                    onClick={() => setPurchaseOpen(true)}
                    disabled={products.length === 0}
                    variant="outline"
                    className="h-8 sm:h-10 px-2.5 sm:px-4 rounded-lg sm:rounded-xl font-medium gap-1 sm:gap-1.5 border-border/80 hover:border-primary/50 text-xs shrink-0"
                  >
                    <ShoppingBag className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-600" />
                    <span><span className="hidden sm:inline">Registrar </span>Compra</span>
                  </Button>
                </div>
              )}

              {/* Botão de Filtros Avançados */}
              <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                <Button
                  variant={
                    showAdvancedFilters || activeAdvancedFilterCount > 0
                      ? "default"
                      : "outline"
                  }
                  size="sm"
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className="h-8 sm:h-10 rounded-lg sm:rounded-xl px-2.5 sm:px-3.5 gap-1 sm:gap-1.5 text-xs font-medium shrink-0"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Filtros<span className="hidden sm:inline"> avançados</span></span>
                  {activeAdvancedFilterCount > 0 && !showAdvancedFilters && (
                    <Badge className="bg-primary-foreground text-primary h-3.5 px-1 text-[9px] rounded-full font-bold">
                      {activeAdvancedFilterCount}
                    </Badge>
                  )}
                  {showAdvancedFilters ? (
                    <ChevronUp className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            {/* 4. Barra de Busca, Chips de Status e Ordenação */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
                {/* Input de Busca */}
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground z-10 pointer-events-none" />
                  <Input
                    placeholder="Buscar produtos..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 sm:pl-10 h-9 sm:h-10 rounded-lg sm:rounded-xl bg-card/60 border-border/70 focus-visible:border-primary/50 text-xs sm:text-sm"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 sm:h-6 sm:w-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                      title="Limpar busca"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Seletor de Ordenação */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground font-medium hidden sm:inline">
                    Ordenar por:
                  </span>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="h-9 sm:h-10 w-full sm:w-[210px] rounded-lg sm:rounded-xl text-xs bg-card/60 border-border/70 font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name-asc">Descrição (A-Z)</SelectItem>
                      <SelectItem value="name-desc">Descrição (Z-A)</SelectItem>
                      <SelectItem value="stock-desc">Maior estoque</SelectItem>
                      <SelectItem value="stock-asc">Menor estoque</SelectItem>
                      <SelectItem value="margin-desc">Maior margem</SelectItem>
                      <SelectItem value="margin-asc">Menor margem</SelectItem>
                      <SelectItem value="price-desc">
                        Preço de venda (maior)
                      </SelectItem>
                      <SelectItem value="price-asc">
                        Preço de venda (menor)
                      </SelectItem>
                      <SelectItem value="cost-desc">
                        Preço de compra (maior)
                      </SelectItem>
                      <SelectItem value="cost-asc">
                        Preço de compra (menor)
                      </SelectItem>
                      <SelectItem value="last-purchase-desc">
                        Última compra
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Chips de Status Rápidos */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {[
                  {
                    id: "todos" as const,
                    label: "Todos",
                    count: products.length,
                    badgeClass: "bg-muted text-muted-foreground",
                  },
                  {
                    id: "em_estoque" as const,
                    label: "Em estoque",
                    count: inStockProducts.length,
                    badgeClass: "bg-emerald-500/10 text-emerald-600",
                  },
                  {
                    id: "estoque_baixo" as const,
                    label: "Estoque baixo",
                    count: lowStockProducts.length,
                    badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                  },
                  {
                    id: "sem_estoque" as const,
                    label: "Sem estoque",
                    count: outOfStockProducts.length,
                    badgeClass: "bg-rose-500/10 text-rose-600",
                  },
                  {
                    id: "inativos" as const,
                    label: "Inativos",
                    count: inactiveProducts.length,
                    badgeClass: "bg-muted text-muted-foreground",
                  },
                ].map((st) => {
                  const isActive = statusFilter === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setStatusFilter(st.id)}
                      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm scale-[1.02]"
                          : "bg-card/70 border border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/60"
                      }`}
                    >
                      <span>{st.label}</span>
                      <span
                        className={`inline-flex items-center justify-center min-w-[18px] h-4.5 px-1.5 rounded-full text-[10px] font-bold tabular-nums ${
                          isActive
                            ? "bg-black/20 text-current"
                            : st.badgeClass
                        }`}
                      >
                        {st.count}
                      </span>
                    </button>
                  );
                })}

                {(statusFilter !== "todos" ||
                  search ||
                  activeAdvancedFilterCount > 0) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllFilters}
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive gap-1 ml-auto"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Limpar filtros</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Painel Expansível de Filtros Avançados */}
            {showAdvancedFilters && (
              <Card className="border border-border/70 bg-card/90 shadow-sm rounded-2xl animate-in fade-in duration-200">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-foreground">
                    <span className="flex items-center gap-1.5">
                      <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                      Filtros Avançados de Estoque
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setMinPrice("");
                        setMaxPrice("");
                        setMinCost("");
                        setMaxCost("");
                        setMinMargin("");
                      }}
                      className="h-6 text-xs text-muted-foreground hover:text-destructive"
                    >
                      Limpar avançados
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Faixa de Preço de Venda */}
                    <div className="space-y-1 p-2.5 rounded-xl bg-muted/30 border border-border/40">
                      <Label className="text-[11px] font-semibold text-muted-foreground">
                        Preço de Venda (R$)
                      </Label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <Input
                          type="number"
                          placeholder="Mínimo"
                          value={minPrice}
                          onChange={(e) => setMinPrice(e.target.value)}
                          className="h-8 text-xs"
                        />
                        <Input
                          type="number"
                          placeholder="Máximo"
                          value={maxPrice}
                          onChange={(e) => setMaxPrice(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    {/* Faixa de Preço de Compra */}
                    <div className="space-y-1 p-2.5 rounded-xl bg-muted/30 border border-border/40">
                      <Label className="text-[11px] font-semibold text-muted-foreground">
                        Preço de Compra (R$)
                      </Label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <Input
                          type="number"
                          placeholder="Mínimo"
                          value={minCost}
                          onChange={(e) => setMinCost(e.target.value)}
                          className="h-8 text-xs"
                        />
                        <Input
                          type="number"
                          placeholder="Máximo"
                          value={maxCost}
                          onChange={(e) => setMaxCost(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    {/* Margem Mínima */}
                    <div className="space-y-1 p-2.5 rounded-xl bg-muted/30 border border-border/40">
                      <Label className="text-[11px] font-semibold text-muted-foreground">
                        Margem Mínima (%)
                      </Label>
                      <Input
                        type="number"
                        placeholder="Ex: 50"
                        value={minMargin}
                        onChange={(e) => setMinMargin(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 5. Tabela / Cards de Produtos */}
            {products.length === 0 ? (
              <Card className="border border-dashed border-border/70 rounded-2xl">
                <CardContent className="py-16 text-center space-y-3">
                  <div className="h-14 w-14 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center">
                    <Boxes className="h-7 w-7" />
                  </div>
                  <div className="max-w-sm mx-auto">
                    <h3 className="text-base font-bold text-foreground">
                      Seu estoque está vazio
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Cadastre seu primeiro produto para começar a controlar o
                      estoque e registrar movimentações de compra e venda.
                    </p>
                  </div>
                  {!readOnly && (
                    <Button
                      onClick={() => setNewProductOpen(true)}
                      className="h-9 px-4 rounded-xl gap-1.5 font-semibold text-xs"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Cadastrar produto</span>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : sortedProducts.length === 0 ? (
              <Card className="border border-dashed border-border/70 rounded-2xl">
                <CardContent className="py-12 text-center text-muted-foreground space-y-2">
                  <Boxes className="h-10 w-10 mx-auto text-muted-foreground/40" />
                  <p className="text-sm font-medium">
                    Nenhum produto encontrado com os filtros atuais.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearAllFilters}
                    className="h-8 text-xs rounded-xl"
                  >
                    Limpar todos os filtros
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Desktop: Tabela de Produtos */}
                <div className="hidden sm:block rounded-2xl border border-border/70 bg-card overflow-hidden shadow-xs">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground border-b border-border/60">
                      <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:font-semibold">
                        <th className="text-left">Produto</th>
                        <th className="text-right">Venda</th>
                        <th className="text-right">Custo</th>
                        <th className="text-right">Estoque</th>
                        <th className="text-right">Mínimo</th>
                        <th className="text-right">Margem</th>
                        <th className="text-left pl-6">Status</th>
                        {!readOnly && <th className="w-24 text-right pr-4">Ações</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {sortedProducts.map((p) => {
                        const threshold =
                          p.suggestedStock && p.suggestedStock > 0
                            ? p.suggestedStock
                            : 5;
                        const out = p.stock <= 0;
                        const low = p.stock > 0 && p.stock <= threshold;
                        const hasMargin = p.cost > 0 && p.price > 0;
                        const marginPct = hasMargin
                          ? ((p.price - p.cost) / p.cost) * 100
                          : null;
                        const profitUnit = hasMargin ? p.price - p.cost : 0;
                        const isInactive = p.active === false;

                        return (
                          <tr
                            key={p.id}
                            className={`hover:bg-muted/30 transition-colors [&>td]:px-4 [&>td]:py-3 ${
                              isInactive ? "opacity-60 bg-muted/10" : ""
                            }`}
                          >
                            {/* Produto */}
                            <td className="font-medium">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-foreground">
                                  {p.name}
                                </span>
                                {isInactive && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] py-0 px-1.5 text-muted-foreground border-border/60"
                                  >
                                    Inativo
                                  </Badge>
                                )}
                              </div>
                              {p.description && (
                                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                  {p.description}
                                </p>
                              )}
                            </td>

                            {/* Venda */}
                            <td className="text-right font-semibold text-foreground tabular-nums">
                              {fmtBRL(p.price)}
                            </td>

                            {/* Custo */}
                            <td className="text-right tabular-nums text-muted-foreground">
                              {p.cost > 0 ? fmtBRL(p.cost) : "—"}
                            </td>

                            {/* Estoque */}
                            <td className="text-right">
                              <span
                                className={`font-extrabold tabular-nums text-sm ${
                                  out
                                    ? "text-rose-600 dark:text-rose-400"
                                    : low
                                    ? "text-amber-700 dark:text-amber-400"
                                    : "text-foreground"
                                }`}
                              >
                                {p.stock}{" "}
                                <span className="text-xs font-normal text-muted-foreground">
                                  un.
                                </span>
                              </span>
                            </td>

                            {/* Mínimo */}
                            <td className="text-right tabular-nums text-muted-foreground text-xs">
                              {p.suggestedStock > 0 ? (
                                <span>{p.suggestedStock} un.</span>
                              ) : (
                                "—"
                              )}
                            </td>

                            {/* Margem com Tooltip */}
                            <td className="text-right">
                              {marginPct != null ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span
                                      className={`inline-block tabular-nums font-bold text-xs cursor-help px-2 py-0.5 rounded-md ${
                                        marginPct >= 0
                                          ? "text-emerald-600 bg-emerald-500/10"
                                          : "text-rose-600 bg-rose-500/10"
                                      }`}
                                    >
                                      {marginPct.toFixed(1)}%
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="space-y-1 text-xs">
                                    <p>
                                      <strong>Preço de Venda:</strong>{" "}
                                      {fmtBRL(p.price)}
                                    </p>
                                    <p>
                                      <strong>Custo Médio:</strong>{" "}
                                      {fmtBRL(p.cost)}
                                    </p>
                                    <p className="border-t border-border/50 pt-1 text-emerald-500 font-semibold">
                                      <strong>Lucro Unitário:</strong>{" "}
                                      {fmtBRL(profitUnit)}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground text-xs">
                                  —
                                </span>
                              )}
                            </td>

                            {/* Status */}
                            <td className="pl-6">
                              {isInactive ? (
                                <Badge
                                  variant="secondary"
                                  className="text-[11px] font-medium"
                                >
                                  <EyeOff className="h-3 w-3 mr-1" />
                                  Inativo
                                </Badge>
                              ) : out ? (
                                <Badge
                                  variant="destructive"
                                  className="text-[11px] font-semibold"
                                >
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Sem estoque
                                </Badge>
                              ) : low ? (
                                <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[11px] font-semibold">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Estoque baixo
                                </Badge>
                              ) : (
                                <Badge
                                  variant="secondary"
                                  className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                                >
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Em estoque
                                </Badge>
                              )}
                            </td>

                            {/* Ações */}
                            {!readOnly && (
                              <td className="text-right pr-4">
                                <div className="flex items-center justify-end gap-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-amber-600"
                                        onClick={() => handleOpenEntry("saida", p.id)}
                                      >
                                        <Wrench className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Ajustar estoque</TooltipContent>
                                  </Tooltip>

                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                        onClick={() => setEditingProduct(p)}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Editar produto</TooltipContent>
                                  </Tooltip>

                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-purple"
                                        onClick={() =>
                                          handleViewProductHistory(p.id)
                                        }
                                      >
                                        <History className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Ver movimentações
                                    </TooltipContent>
                                  </Tooltip>

                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                        onClick={() =>
                                          updateProduct(p.id, {
                                            active: !(p.active !== false),
                                          })
                                        }
                                      >
                                        {p.active !== false ? (
                                          <EyeOff className="h-4 w-4" />
                                        ) : (
                                          <Eye className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {p.active !== false
                                        ? "Inativar produto"
                                        : "Ativar produto"}
                                    </TooltipContent>
                                  </Tooltip>

                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                        onClick={() => setDeletingProduct(p)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Excluir produto
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile: Cards Expansíveis de Produtos */}
                <div className="sm:hidden space-y-2.5">
                  {sortedProducts.map((p) => {
                    const threshold =
                      p.suggestedStock && p.suggestedStock > 0
                        ? p.suggestedStock
                        : 5;
                    const out = p.stock <= 0;
                    const low = p.stock > 0 && p.stock <= threshold;
                    const hasMargin = p.cost > 0 && p.price > 0;
                    const marginPct = hasMargin
                      ? ((p.price - p.cost) / p.cost) * 100
                      : null;
                    const expanded = expandedIds.has(p.id);
                    const lastMov = lastMovementByProduct.get(p.id);
                    const meta = lastMov ? movementMeta[lastMov.type] : null;

                    return (
                      <div
                        key={p.id}
                        className="rounded-2xl border border-border/70 bg-card overflow-hidden shadow-xs"
                      >
                        <button
                          type="button"
                          onClick={() => toggleExpanded(p.id)}
                          className="w-full text-left p-4 flex items-start gap-3 active:bg-muted/40 transition-colors"
                          aria-expanded={expanded}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-bold text-sm text-foreground break-words flex-1 min-w-0">
                                {p.name}
                              </span>
                              <span
                                className={`font-extrabold tabular-nums text-base shrink-0 ${
                                  out
                                    ? "text-rose-600"
                                    : low
                                    ? "text-amber-600"
                                    : "text-foreground"
                                }`}
                              >
                                {p.stock} un.
                              </span>
                            </div>

                            {p.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                {p.description}
                              </p>
                            )}

                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-bold text-foreground tabular-nums">
                                {fmtBRL(p.price)}
                              </span>

                              {marginPct != null && (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] py-0 px-1.5 font-bold ${
                                    marginPct >= 0
                                      ? "text-emerald-600 border-emerald-500/30"
                                      : "text-rose-600 border-rose-500/30"
                                  }`}
                                >
                                  {marginPct.toFixed(0)}% margem
                                </Badge>
                              )}

                              {p.active === false ? (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] py-0 px-1.5"
                                >
                                  Inativo
                                </Badge>
                              ) : out ? (
                                <Badge
                                  variant="destructive"
                                  className="text-[10px] py-0 px-1.5 font-bold"
                                >
                                  Sem estoque
                                </Badge>
                              ) : low ? (
                                <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px] py-0 px-1.5 font-bold">
                                  Estoque baixo
                                </Badge>
                              ) : null}
                            </div>
                          </div>

                          <ChevronDown
                            className={`h-4 w-4 text-muted-foreground shrink-0 mt-1 transition-transform duration-200 ${
                              expanded ? "rotate-180" : ""
                            }`}
                          />
                        </button>

                        {expanded && (
                          <div className="px-4 pb-4 pt-1 border-t border-border/40 bg-muted/20 space-y-3 animate-in fade-in duration-150">
                            <dl className="grid grid-cols-2 gap-2.5 text-xs pt-2">
                              <div className="p-2 rounded-xl bg-card border border-border/40">
                                <dt className="text-muted-foreground text-[10px]">
                                  Preço de Venda
                                </dt>
                                <dd className="font-bold text-sm text-foreground tabular-nums mt-0.5">
                                  {fmtBRL(p.price)}
                                </dd>
                              </div>

                              <div className="p-2 rounded-xl bg-card border border-border/40">
                                <dt className="text-muted-foreground text-[10px]">
                                  Custo de Compra
                                </dt>
                                <dd className="font-bold text-sm text-muted-foreground tabular-nums mt-0.5">
                                  {p.cost > 0 ? fmtBRL(p.cost) : "—"}
                                </dd>
                              </div>

                              <div className="p-2 rounded-xl bg-card border border-border/40">
                                <dt className="text-muted-foreground text-[10px]">
                                  Estoque Mínimo
                                </dt>
                                <dd className="font-semibold text-foreground tabular-nums mt-0.5">
                                  {p.suggestedStock > 0
                                    ? `${p.suggestedStock} un.`
                                    : "Não definido"}
                                </dd>
                              </div>

                              <div className="p-2 rounded-xl bg-card border border-border/40">
                                <dt className="text-muted-foreground text-[10px]">
                                  Última Compra
                                </dt>
                                <dd className="font-semibold text-foreground tabular-nums mt-0.5">
                                  {p.lastPurchasePrice && p.lastPurchasePrice > 0
                                    ? fmtBRL(p.lastPurchasePrice)
                                    : "—"}
                                </dd>
                              </div>

                              <div className="col-span-2 p-2 rounded-xl bg-card border border-border/40">
                                <dt className="text-muted-foreground text-[10px]">
                                  Última Movimentação
                                </dt>
                                <dd className="font-medium text-foreground mt-0.5">
                                  {lastMov && meta ? (
                                    <span className="flex items-center gap-1">
                                      <Badge
                                        variant="outline"
                                        className={`text-[10px] py-0 px-1.5 ${meta.cls}`}
                                      >
                                        {meta.label}
                                      </Badge>
                                      <span className="font-bold tabular-nums">
                                        {meta.sign}
                                        {Math.abs(lastMov.quantity)} un.
                                      </span>
                                      <span className="text-muted-foreground">
                                        •{" "}
                                        {format(
                                          new Date(lastMov.createdAt),
                                          "dd/MM/yyyy HH:mm",
                                          { locale: ptBR }
                                        )}
                                      </span>
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </dd>
                              </div>
                            </dl>

                            {!readOnly && (
                              <div className="flex items-center gap-2 pt-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenEntry("saida", p.id)}
                                  className="h-8 px-2.5 text-xs rounded-xl gap-1 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                                  title="Ajustar estoque"
                                >
                                  <Wrench className="h-3.5 w-3.5" /> Ajustar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingProduct(p)}
                                  className="flex-1 h-8 text-xs rounded-xl gap-1"
                                >
                                  <Pencil className="h-3.5 w-3.5" /> Editar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleViewProductHistory(p.id)
                                  }
                                  className="h-8 px-2.5 text-xs rounded-xl gap-1 text-purple"
                                  title="Ver movimentações"
                                >
                                  <History className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    updateProduct(p.id, {
                                      active: !(p.active !== false),
                                    })
                                  }
                                  className="h-8 px-2.5 text-xs rounded-xl"
                                >
                                  {p.active !== false ? (
                                    <EyeOff className="h-3.5 w-3.5" />
                                  ) : (
                                    <Eye className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setDeletingProduct(p)}
                                  className="h-8 px-2.5 text-xs rounded-xl text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : (
          /* 6. Aba de Movimentações (Histórico) */
          <div className="space-y-4">
            {/* Header da aba de Movimentações */}
            <div className="flex items-center justify-between gap-3 pb-2 border-b border-border/40">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" />
                  Movimentações de Estoque ({movements.length})
                </h3>
                <p className="text-xs text-muted-foreground">
                  Histórico completo de entradas, saídas, compras, vendas e ajustes.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveMainTab("estoque")}
                className="h-8 px-3 rounded-xl text-xs gap-1.5 font-medium shrink-0"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Voltar ao estoque</span>
              </Button>
            </div>

            {/* Filtros de Histórico */}
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-48 h-9 rounded-xl text-xs">
                  <SelectValue placeholder="Tipo de movimentação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="entrada_manual">Entrada manual</SelectItem>
                  <SelectItem value="compra">Compra</SelectItem>
                  <SelectItem value="venda">Venda</SelectItem>
                  <SelectItem value="ajuste">Baixa / Ajuste</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterProduct} onValueChange={setFilterProduct}>
                <SelectTrigger className="w-full sm:w-64 h-9 rounded-xl text-xs">
                  <SelectValue placeholder="Filtrar por produto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os produtos</SelectItem>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {adjustmentReasons.length > 0 && (
                <Select value={filterReason} onValueChange={setFilterReason}>
                  <SelectTrigger className="w-full sm:w-56 h-9 rounded-xl text-xs">
                    <SelectValue placeholder="Motivo do ajuste" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os motivos</SelectItem>
                    {adjustmentReasons.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {(filterType !== "all" ||
                filterProduct !== "all" ||
                filterReason !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilterType("all");
                    setFilterProduct("all");
                    setFilterReason("all");
                  }}
                  className="h-8 text-xs text-muted-foreground hover:text-destructive sm:ml-auto"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Limpar filtros
                </Button>
              )}
            </div>

            {/* Lista de Movimentações */}
            {filteredMovements.length === 0 ? (
              <Card className="border border-dashed border-border/70 rounded-2xl">
                <CardContent className="py-12 text-center text-muted-foreground space-y-2">
                  <History className="h-10 w-10 mx-auto text-muted-foreground/40" />
                  <p className="text-sm font-medium">
                    Nenhuma movimentação encontrada com os filtros selecionados.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2.5">
                {filteredMovements.map((m) => {
                  const meta = movementMeta[m.type];
                  const Icon = meta.icon;
                  return (
                    <Card
                      key={m.id}
                      className="border border-border/60 bg-card/80 shadow-xs hover:border-primary/30 transition-colors rounded-2xl"
                    >
                      <CardContent className="p-3.5 flex items-center gap-3.5">
                        <div
                          className={`h-10 w-10 rounded-xl flex items-center justify-center border shrink-0 ${meta.cls}`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-foreground truncate">
                              {m.productName}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] py-0 px-2 font-semibold ${meta.cls}`}
                            >
                              {meta.label}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>
                              {format(
                                new Date(m.createdAt),
                                "dd/MM/yyyy 'às' HH:mm",
                                { locale: ptBR }
                              )}
                            </span>
                            {m.notes && <span>• {m.notes}</span>}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div
                            className={`font-extrabold text-sm sm:text-base tabular-nums ${
                              meta.sign === "+"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            {meta.sign}
                            {Math.abs(m.quantity)} un.
                          </div>
                          {m.totalValue != null && (
                            <div className="text-xs text-muted-foreground font-semibold tabular-nums">
                              {fmtBRL(m.totalValue)}
                            </div>
                          )}
                        </div>

                        {!readOnly && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={async () => {
                              if (
                                !confirmWithScroll(
                                  `Excluir esta movimentação de ${m.productName}? O estoque será recalculado.`
                                )
                              )
                                return;
                              const ok = await deleteMovement(m.id);
                              if (!ok) {
                                toast.error("Erro ao excluir movimentação");
                                return;
                              }
                              const prod = products.find(
                                (p) => p.id === m.productId
                              );
                              if (prod) {
                                const qty = Math.abs(m.quantity);
                                const delta = meta.sign === "+" ? -qty : qty;
                                const newStock = Math.max(
                                  0,
                                  (prod.stock ?? 0) + delta
                                );
                                await updateProduct(prod.id, {
                                  stock: newStock,
                                });
                              }
                              toast.success(
                                "Movimentação excluída e estoque recalculado"
                              );
                            }}
                            title="Excluir movimentação"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Modal de Entrada Manual (+ Entrada / - Saída / Ajuste) */}
        <ManualEntryDialog
          open={entryOpen}
          onOpenChange={(v) => {
            setEntryOpen(v);
            if (!v) {
              setEntryInitialProductId(undefined);
            }
          }}
          initialMode={entryInitialMode}
          initialProductId={entryInitialProductId}
          products={products}
          onSubmit={async ({ items, mode, reason, notes }) => {
            for (const it of items) {
              const product = products.find((p) => p.id === it.productId);
              if (!product) continue;
              const isExit = mode === "saida";
              const delta = isExit ? -it.quantity : it.quantity;
              const newStock = Math.max(0, product.stock + delta);
              await updateProduct(it.productId, { stock: newStock });

              const movType: StockMovementType = isExit
                ? "ajuste"
                : "entrada_manual";
              const fullNotes = isExit
                ? `Motivo: ${reason}${notes ? ` | Obs: ${notes}` : ""}`
                : notes || null;

              await recordMovement({
                productId: it.productId,
                productName: product.name,
                type: movType,
                quantity: delta,
                notes: fullNotes,
              });
            }
            toast.success(
              `${
                mode === "saida" ? "Saída / Baixa" : "Entrada"
              } de ${items.length} item(ns) registrada com sucesso!`
            );
          }}
        />

        {/* Modal de Registrar Compra */}
        <PurchaseDialog
          open={purchaseOpen}
          onOpenChange={setPurchaseOpen}
          products={products}
          onSubmit={async ({ items, date, notes }) => {
            const validItems = items.filter(
              (it) => it.productId && it.quantity > 0 && it.unitCost > 0
            );
            if (validItems.length === 0) return;
            const totalAll = validItems.reduce(
              (s, it) => s + it.quantity * it.unitCost,
              0
            );
            const descParts = validItems.map((it) => {
              const prod = products.find((p) => p.id === it.productId);
              return `${prod?.name || "?"} x${it.quantity}`;
            });

            // 1) Registra a despesa correspondente no financeiro
            const purchaseDate = date || todayInAppTz();
            try {
              if (ownerId) {
                const { data: inserted, error: insErr } = await supabase
                  .from("expenses")
                  .insert({
                    user_id: ownerId,
                    description: `Compra de estoque: ${descParts.join(", ")}`,
                    amount: totalAll,
                    type: "fixa",
                    category: "Compra de mercadoria",
                    due_date: purchaseDate,
                    paid: true,
                    paid_date: purchaseDate,
                    notes: notes || null,
                    scope: "personal",
                  })
                  .select("id, paid, scope")
                  .single();

                if (
                  !insErr &&
                  inserted &&
                  (!inserted.paid || inserted.scope !== "personal")
                ) {
                  await supabase
                    .from("expenses")
                    .update({
                      paid: true,
                      paid_date: purchaseDate,
                      scope: "personal",
                    })
                    .eq("id", inserted.id);
                }
              }
            } catch (e) {
              /* prossegue mesmo se a despesa falhar */
            }

            // 2) Atualiza estoque + custo de compra + registra movimentação
            for (const it of validItems) {
              const product = products.find((p) => p.id === it.productId);
              if (!product) continue;
              const total = it.quantity * it.unitCost;
              await updateProduct(it.productId, {
                stock: product.stock + it.quantity,
                lastPurchasePrice: it.unitCost,
              });
              await recordMovement({
                productId: it.productId,
                productName: product.name,
                type: "compra",
                quantity: it.quantity,
                unitCost: it.unitCost,
                totalValue: total,
                expenseId: null,
                notes: notes || null,
              });
            }
            toast.success(
              `Compra de ${validItems.length} item(ns) registrada (${fmtBRL(
                totalAll
              )})`
            );
          }}
        />

        {/* Modal de Cadastro de Novo Produto */}
        {newProductOpen && (
          <ProductForm
            onAdd={async (data) => {
              await addProduct(data);
              setNewProductOpen(false);
            }}
            onClose={() => setNewProductOpen(false)}
          />
        )}

        {/* Modal de Edição de Produto */}
        {editingProduct && (
          <ProductForm
            product={editingProduct}
            onUpdate={async (id, data) => {
              await updateProduct(id, data);
            }}
            onClose={() => setEditingProduct(null)}
          />
        )}

        {/* Diálogo de Confirmação de Exclusão de Produto */}
        <ConfirmDeleteDialog
          open={!!deletingProduct}
          onOpenChange={(o) => {
            if (!o) setDeletingProduct(null);
          }}
          title="Excluir produto"
          description={
            deletingProduct
              ? `Tem certeza que deseja excluir "${deletingProduct.name}"? Esta ação não pode ser desfeita e removerá o produto do catálogo.`
              : ""
          }
          onConfirm={async () => {
            if (!deletingProduct) return;
            const id = deletingProduct.id;
            setDeletingProduct(null);
            await deleteProduct(id);
            toast.success("Produto excluído");
          }}
        />

        {/* Botão Flutuante de Movimentações de Estoque (apenas ícone, acima do botão +) */}
        <div
          className="fixed z-40 bottom-[132px] md:bottom-[76px]"
          style={{ right: `calc(env(safe-area-inset-right) + 16px)` }}
        >
          <button
            type="button"
            onClick={() =>
              setActiveMainTab((prev) =>
                prev === "estoque" ? "historico" : "estoque"
              )
            }
            aria-label={
              activeMainTab === "estoque"
                ? "Movimentações de Estoque"
                : "Voltar ao Estoque"
            }
            title={
              activeMainTab === "estoque"
                ? "Movimentações de Estoque"
                : "Voltar ao Estoque"
            }
            className="group h-11 w-11 md:h-12 md:w-12 rounded-full flex items-center justify-center border border-border/80 bg-card/95 backdrop-blur-md shadow-lg hover:shadow-xl transition-all duration-150 ease-out hover:scale-105 active:scale-95 text-foreground hover:border-primary/50"
          >
            {activeMainTab === "estoque" ? (
              <History className="h-5 w-5 text-primary shrink-0 transition-transform group-hover:rotate-[-30deg]" />
            ) : (
              <Boxes className="h-5 w-5 text-primary shrink-0" />
            )}
          </button>
        </div>
      </div>
    </TooltipProvider>
  );
}

/* -------------------------------------------------------------------------- */
/*                       MODAL: ENTRADA / BAIXA MANUAL                        */
/* -------------------------------------------------------------------------- */

function ManualEntryDialog({
  open,
  onOpenChange,
  products,
  initialMode = "entrada",
  initialProductId,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: { id: string; name: string; stock: number }[];
  initialMode?: "entrada" | "saida";
  initialProductId?: string;
  onSubmit: (v: {
    items: { productId: string; quantity: number }[];
    mode: "entrada" | "saida";
    reason: string;
    notes: string;
  }) => Promise<void>;
}) {
  const [mode, setMode] = useState<"entrada" | "saida">(initialMode);
  const [items, setItems] = useState<{ productId: string; quantity: string }[]>([
    { productId: initialProductId || "", quantity: "" },
  ]);
  const [reason, setReason] = useState("Ajuste de inventário");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setItems([{ productId: initialProductId || "", quantity: "" }]);
      setReason("Ajuste de inventário");
      setNotes("");
    }
  }, [open, initialMode, initialProductId]);

  const updateItem = (
    idx: number,
    patch: Partial<{ productId: string; quantity: string }>
  ) =>
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    );
  const addItem = () =>
    setItems((prev) => [...prev, { productId: "", quantity: "" }]);
  const removeItem = (idx: number) =>
    setItems((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)
    );

  const reset = () => {
    setItems([{ productId: initialProductId || "", quantity: "" }]);
    setNotes("");
    setMode(initialMode);
    setReason("Ajuste de inventário");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = items
      .map((it) => ({
        productId: it.productId,
        quantity: parseInt(it.quantity) || 0,
      }))
      .filter((it) => it.productId && it.quantity > 0);

    if (parsed.length === 0) {
      toast.error("Adicione ao menos um produto com quantidade válida");
      return;
    }

    if (mode === "saida") {
      for (const it of parsed) {
        const prod = products.find((p) => p.id === it.productId);
        if (prod && it.quantity > prod.stock) {
          toast.error(
            `Quantidade de saída maior que o estoque atual de "${prod.name}" (${prod.stock} un.)`
          );
          return;
        }
      }
    }

    setBusy(true);
    try {
      await onSubmit({ items: parsed, mode, reason, notes });
      reset();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {mode === "saida" ? (
              <Wrench className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            ) : (
              <PackagePlus className="h-5 w-5 text-primary" />
            )}
            {mode === "saida"
              ? "Ajuste / Baixa de Estoque"
              : "Entrada Manual de Estoque"}
          </DialogTitle>
          <DialogDescription>
            {mode === "saida"
              ? "Registre ajustes, perdas, avarias ou baixas de quantidade no estoque. Não gera lançamentos financeiros."
              : "Registre entradas rápidas de quantidade no estoque. Não gera lançamentos financeiros."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Seletor de Modo: Entrada ou Saída */}
          <div className="bg-muted/60 p-1 rounded-xl grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setMode("entrada")}
              className={`h-8 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                mode === "entrada"
                  ? "bg-card text-emerald-600 dark:text-emerald-400 shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Plus className="h-3.5 w-3.5" />
              + Entrada de Estoque
            </button>
            <button
              type="button"
              onClick={() => setMode("saida")}
              className={`h-8 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                mode === "saida"
                  ? "bg-card text-amber-600 dark:text-amber-400 shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Wrench className="h-3.5 w-3.5" />
              - Baixa / Ajuste Manual
            </button>
          </div>

          {/* Lista de Itens */}
          <div className="space-y-2.5">
            {items.map((it, idx) => {
              const selectedProd = products.find((p) => p.id === it.productId);
              return (
                <div
                  key={idx}
                  className="flex gap-2 items-end p-2.5 rounded-xl bg-muted/30 border border-border/50"
                >
                  <div className="flex-1">
                    {idx === 0 && (
                      <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                        Produto
                      </Label>
                    )}
                    <Select
                      value={it.productId}
                      onValueChange={(v) => updateItem(idx, { productId: v })}
                    >
                      <SelectTrigger className="h-9 rounded-xl text-xs bg-background">
                        <SelectValue placeholder="Selecione o produto" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} (Atual: {p.stock} un.)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-28">
                    {idx === 0 && (
                      <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                        Quantidade
                      </Label>
                    )}
                    <Input
                      type="number"
                      min="1"
                      placeholder="Qtd"
                      value={it.quantity}
                      onChange={(e) =>
                        updateItem(idx, { quantity: e.target.value })
                      }
                      className="h-9 rounded-xl text-xs bg-background"
                    />
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(idx)}
                    disabled={items.length === 1}
                    className="h-9 w-9 text-muted-foreground hover:text-destructive"
                    title="Remover linha"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addItem}
              className="h-8 text-xs rounded-xl gap-1 border-dashed"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar outro produto
            </Button>
          </div>

          {/* Motivo (para baixas) */}
          {mode === "saida" && (
            <div>
              <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                Motivo da baixa
              </Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="h-9 rounded-xl text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ajuste de inventário">
                    Ajuste de inventário
                  </SelectItem>
                  <SelectItem value="Perda">Perda</SelectItem>
                  <SelectItem value="Avaria / Defeito">
                    Avaria / Defeito
                  </SelectItem>
                  <SelectItem value="Vencimento">Vencimento</SelectItem>
                  <SelectItem value="Consumo interno">Consumo interno</SelectItem>
                  <SelectItem value="Outro">Outro motivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Observação */}
          <div>
            <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
              Observação (opcional)
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: contagem de rotina, lote danificado..."
              rows={2}
              className="rounded-xl text-xs"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-9 text-xs rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={busy}
              className="h-9 px-4 text-xs font-semibold rounded-xl"
            >
              {busy
                ? "Salvando..."
                : mode === "saida"
                ? "Registrar ajuste / baixa"
                : "Registrar entrada"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*                        MODAL: REGISTRAR COMPRA                             */
/* -------------------------------------------------------------------------- */

function PurchaseDialog({
  open,
  onOpenChange,
  products,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: { id: string; name: string }[];
  onSubmit: (v: {
    items: { productId: string; quantity: number; unitCost: number }[];
    date: string;
    notes: string;
  }) => Promise<void>;
}) {
  const [items, setItems] = useState<
    { productId: string; quantity: string; unitCost: string }[]
  >([{ productId: "", quantity: "", unitCost: "" }]);
  const [date, setDate] = useState(todayInAppTz());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const updateItem = (
    idx: number,
    patch: Partial<{ productId: string; quantity: string; unitCost: string }>
  ) =>
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    );
  const addItem = () =>
    setItems((prev) => [
      ...prev,
      { productId: "", quantity: "", unitCost: "" },
    ]);
  const removeItem = (idx: number) =>
    setItems((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)
    );

  const total = items.reduce(
    (s, it) =>
      s +
      (parseFloat(it.unitCost) || 0) * (parseInt(it.quantity) || 0),
    0
  );

  const reset = () => {
    setItems([{ productId: "", quantity: "", unitCost: "" }]);
    setDate(todayInAppTz());
    setNotes("");
  };

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = items
      .map((it) => ({
        productId: it.productId,
        quantity: parseInt(it.quantity) || 0,
        unitCost: parseFloat(it.unitCost) || 0,
      }))
      .filter((it) => it.productId && it.quantity > 0 && it.unitCost > 0);

    if (parsed.length === 0) {
      toast.error(
        "Preencha produto, quantidade e custo unitário em ao menos um item"
      );
      return;
    }

    setBusy(true);
    try {
      await onSubmit({ items: parsed, date, notes });
      reset();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <ShoppingBag className="h-5 w-5 text-emerald-600" />
            Registrar Compra de Mercadoria
          </DialogTitle>
          <DialogDescription>
            Adicione os itens comprados. Será criada uma despesa paga no financeiro e o estoque será incrementado.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handle} className="space-y-4">
          <div className="space-y-2.5">
            {items.map((it, idx) => (
              <div
                key={idx}
                className="flex gap-2 items-end p-2.5 rounded-xl bg-muted/30 border border-border/50"
              >
                <div className="flex-1">
                  {idx === 0 && (
                    <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                      Produto
                    </Label>
                  )}
                  <Select
                    value={it.productId}
                    onValueChange={(v) => updateItem(idx, { productId: v })}
                  >
                    <SelectTrigger className="h-9 rounded-xl text-xs bg-background">
                      <SelectValue placeholder="Selecione o produto" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-24">
                  {idx === 0 && (
                    <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                      Qtd
                    </Label>
                  )}
                  <Input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={it.quantity}
                    onChange={(e) =>
                      updateItem(idx, { quantity: e.target.value })
                    }
                    className="h-9 rounded-xl text-xs bg-background"
                  />
                </div>

                <div className="w-32">
                  {idx === 0 && (
                    <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                      Custo Unit. (R$)
                    </Label>
                  )}
                  <MoneyInput
                    value={it.unitCost}
                    onChange={(v) => updateItem(idx, { unitCost: v })}
                    className="h-9 rounded-xl text-xs bg-background"
                  />
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeItem(idx)}
                  disabled={items.length === 1}
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  title="Remover item"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addItem}
              className="h-8 text-xs rounded-xl gap-1 border-dashed"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar outro produto
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                Data da Compra
              </Label>
              <DatePickerField value={date} onChange={setDate} />
            </div>

            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 flex flex-col justify-center">
              <span className="text-[11px] text-muted-foreground font-semibold">
                Total da Compra (Financeiro)
              </span>
              <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {fmtBRL(total)}
              </span>
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
              Observação ou Fornecedor (opcional)
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Fornecedor X, nota fiscal 123..."
              rows={2}
              className="rounded-xl text-xs"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-9 text-xs rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={busy}
              className="h-9 px-4 text-xs font-semibold rounded-xl"
            >
              {busy ? "Salvando..." : `Confirmar Compra (${fmtBRL(total)})`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
