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

interface ClientOption {
  id: string;
  name: string;
}

interface Props {
  value: string;
  onChange: (name: string) => void;
  options: ClientOption[];
  placeholder?: string;
  emptyHint?: string;
  className?: string;
}

export function ClientCombobox({
  value,
  onChange,
  options,
  placeholder = "Digite ou selecione um cliente",
  emptyHint = "Nenhum cliente cadastrado",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const trimmedSearch = search.trim();
  const sortedOptions = [...options].sort((a, b) => a.name.localeCompare(b.name));
  const exactMatch = sortedOptions.some(
    (o) => o.name.toLowerCase() === trimmedSearch.toLowerCase()
  );
  const showCreate = trimmedSearch.length > 0 && !exactMatch;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between h-11 font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="flex items-center gap-2 min-w-0">
            <User className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{value || placeholder}</span>
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {value && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Remover cliente"
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); onChange(""); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); onChange(""); } }}
                className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="ml-1 h-4 w-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter>
          <CommandInput
            placeholder="Buscar ou digitar nome..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-72 overflow-y-auto overscroll-contain">
            <CommandEmpty>
              {trimmedSearch
                ? "Nenhum resultado. Pressione Enter para usar este nome."
                : emptyHint}
            </CommandEmpty>
            {value && (
              <CommandGroup>
                <CommandItem
                  value="__clear__"
                  onSelect={() => { onChange(""); setOpen(false); }}
                  className="text-destructive"
                >
                  <X className="mr-2 w-[25px] h-[25px]" />
                  Remover cliente selecionado
                </CommandItem>
              </CommandGroup>
            )}
            {showCreate && (
              <CommandGroup heading="Novo">
                <CommandItem
                  value={`__create__${trimmedSearch}`}
                  onSelect={() => {
                    onChange(trimmedSearch);
                    setOpen(false);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4 text-primary" />
                  Usar "{trimmedSearch}"
                </CommandItem>
              </CommandGroup>
            )}
            {sortedOptions.length > 0 && (
              <CommandGroup heading="Clientes cadastrados">
                {sortedOptions.map((opt) => (
                  <CommandItem
                    key={opt.id}
                    value={opt.name}
                    onSelect={() => {
                      onChange(opt.name);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === opt.name ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {opt.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
