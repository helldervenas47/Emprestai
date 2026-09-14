import { useState } from "react";
import { Check, ChevronsUpDown, Package, ShoppingBag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Product } from "@/types/loan";

interface Props {
  value: string; // productId ou "__avulsa__"
  onChange: (productId: string, product?: Product | null) => void;
  products: Product[];
  placeholder?: string;
  emptyHint?: string;
  className?: string;
  allowAvulsa?: boolean;
}

export function ProductCombobox({
  value,
  onChange,
  products,
  placeholder = "Selecione um produto ou venda avulsa",
  emptyHint = "Nenhum produto com estoque disponível",
  className,
  allowAvulsa = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const availableProducts = products
    .filter((p) => p.stock > 0)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));

  const selectedProduct = products.find((p) => p.id === value);

  const getDisplayLabel = () => {
    if (value === "__avulsa__") return "📝 Venda avulsa (sem cadastro)";
    if (selectedProduct) {
      const formattedPrice = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(selectedProduct.price);
      return `${selectedProduct.name} — ${formattedPrice}`;
    }
    return "";
  };

  const displayLabel = getDisplayLabel();

  const handleSelectProduct = (prod: Product) => {
    onChange(prod.id, prod);
    setOpen(false);
  };

  const handleSelectAvulsa = () => {
    onChange("__avulsa__", null);
    setOpen(false);
  };

  const handleClear = () => {
    onChange("", null);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between h-10 font-medium rounded-2xl border border-border bg-card px-3 text-sm text-foreground hover:border-primary/40 focus:border-accent touch-manipulation",
            !displayLabel && "text-muted-foreground",
            className
          )}
        >
          <span className="flex items-center gap-2 min-w-0">
            {value === "__avulsa__" ? (
              <span className="text-base">📝</span>
            ) : (
              <ShoppingBag className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{displayLabel || placeholder}</span>
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {displayLabel && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Remover produto selecionado"
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleClear(); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); handleClear(); } }}
                className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="ml-1 h-4 w-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] min-w-[280px] max-w-[calc(100vw-2rem)] p-0 z-[250] shadow-xl rounded-2xl border border-border bg-popover"
        align="start"
      >
        <Command shouldFilter>
          <CommandInput
            placeholder="Buscar produto por nome..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-64 sm:max-h-72 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]">
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
              {emptyHint}
            </CommandEmpty>

            {value && (
              <CommandGroup>
                <CommandItem
                  value="__clear_selection__"
                  onSelect={() => { handleClear(); setOpen(false); }}
                  className="text-destructive font-medium cursor-pointer"
                >
                  <X className="mr-2 w-4 h-4" />
                  Remover seleção
                </CommandItem>
              </CommandGroup>
            )}

            {allowAvulsa && (
              <CommandGroup heading="Modalidade">
                <CommandItem
                  value="venda avulsa sem cadastro avulso"
                  onSelect={handleSelectAvulsa}
                  className="cursor-pointer font-medium text-foreground py-2.5 px-3 flex items-center justify-between"
                >
                  <span className="flex items-center gap-2 truncate">
                    <Check
                      className={cn(
                        "h-4 w-4 shrink-0 text-primary",
                        value === "__avulsa__" ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span>📝 Venda avulsa (sem cadastro)</span>
                  </span>
                </CommandItem>
              </CommandGroup>
            )}

            {availableProducts.length > 0 && (
              <CommandGroup heading="Produtos com estoque">
                {availableProducts.map((p) => {
                  const isSelected = value === p.id;
                  const formattedPrice = new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(p.price);
                  return (
                    <CommandItem
                      key={p.id}
                      value={`${p.name} ${formattedPrice}`}
                      onSelect={() => handleSelectProduct(p)}
                      className="cursor-pointer py-2.5 px-3 flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Check
                          className={cn(
                            "h-4 w-4 shrink-0 text-primary",
                            isSelected ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span className="truncate font-medium">{p.name}</span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0 text-xs ml-2">
                        <span className="font-semibold text-primary">{formattedPrice}</span>
                        <span className="text-[11px] text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded">
                          est: {p.stock}
                        </span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
