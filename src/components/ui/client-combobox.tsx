import { useState } from "react";
import { Check, ChevronsUpDown, Plus, User, X } from "lucide-react";
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

import { normalizeSearchText, matchesSearch } from "@/lib/searchUtils";

export interface ClientOption {
  id: string;
  name: string;
  isManager?: boolean;
}

interface Props {
  value: string;
  onChange: (value: string, client?: ClientOption | null) => void;
  options: ClientOption[];
  valueKey?: "id" | "name";
  placeholder?: string;
  emptyHint?: string;
  className?: string;
  allowCreate?: boolean;
}

export function ClientCombobox({
  value,
  onChange,
  options,
  valueKey = "name",
  placeholder = "Digite ou selecione um cliente",
  emptyHint = "Nenhum cliente cadastrado",
  className,
  allowCreate = true,
  }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const trimmedSearch = search.trim();
  const sortedOptions = [...options].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const selectedOption = valueKey === "id"
    ? sortedOptions.find((o) => o.id === value)
    : sortedOptions.find((o) => normalizeSearchText(o.name) === normalizeSearchText(value));

  const displayLabel = selectedOption
    ? `${selectedOption.name}${selectedOption.isManager ? " 👔 (Gerente)" : ""}`
    : (valueKey === "name" && value ? value : "");

  const exactMatch = sortedOptions.some(
    (o) => normalizeSearchText(o.name) === normalizeSearchText(trimmedSearch)
  );
  const showCreate = allowCreate && trimmedSearch.length > 0 && !exactMatch;

  const handleSelect = (opt: ClientOption) => {
    const selectedVal = valueKey === "id" ? opt.id : opt.name;
    onChange(selectedVal, opt);
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
            "w-full justify-between h-10 font-normal rounded-2xl border border-border bg-card px-3 text-sm text-foreground hover:border-primary/40 focus:border-accent touch-manipulation",
            !displayLabel && "text-muted-foreground",
            className
          )}
        >
          <span className="flex items-center gap-2 min-w-0">
            <User className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{displayLabel || placeholder}</span>
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {displayLabel && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Remover cliente"
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
        <Command shouldFilter filter={(v, s) => (matchesSearch(v, s) ? 1 : 0)}>
          <CommandInput
            placeholder="Buscar ou digitar nome..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-64 sm:max-h-72 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]">
            <CommandEmpty>
              {trimmedSearch
                ? (allowCreate ? "Nenhum resultado. Pressione Enter para usar este nome." : "Nenhum cliente encontrado.")
                : emptyHint}
            </CommandEmpty>
            {value && (
              <CommandGroup>
                <CommandItem
                  value="__clear__"
                  onSelect={() => { handleClear(); setOpen(false); }}
                  className="text-destructive font-medium cursor-pointer"
                >
                  <X className="mr-2 w-4 h-4" />
                  Remover seleção
                </CommandItem>
              </CommandGroup>
            )}
            {showCreate && (
              <CommandGroup heading="Novo">
                <CommandItem
                  value={`__create__${trimmedSearch}`}
                  onSelect={() => {
                    onChange(trimmedSearch, null);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Plus className="mr-2 h-4 w-4 text-primary" />
                  Usar "{trimmedSearch}"
                </CommandItem>
              </CommandGroup>
            )}
            {sortedOptions.length > 0 && (
              <CommandGroup heading="Clientes cadastrados">
                {sortedOptions.map((opt) => {
                  const isSelected = valueKey === "id" ? value === opt.id : value === opt.name;
                  return (
                    <CommandItem
                      key={opt.id}
                      value={`${opt.name} ${opt.isManager ? "gerente" : ""}`}
                      onSelect={() => handleSelect(opt)}
                      className="cursor-pointer py-2.5 px-3 flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Check
                          className={cn(
                            "h-4 w-4 shrink-0 text-primary",
                            isSelected ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span className="truncate">{opt.name}</span>
                        {opt.isManager && (
                          <span className="text-[11px] font-semibold text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded ml-1">
                            👔 Gerente
                          </span>
                        )}
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
