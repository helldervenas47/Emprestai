import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, MapPin, X } from "lucide-react";
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
import { useBrazilianCities, searchCities } from "@/hooks/useBrazilianCities";

interface Props {
  value: string;
  onChange: (city: string) => void;
  placeholder?: string;
  className?: string;
}

export function CityCombobox({
  value,
  onChange,
  placeholder = "Selecione ou digite a cidade...",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { cities, loading } = useBrazilianCities();

  const filteredCities = useMemo(() => {
    return searchCities(search, cities, 50);
  }, [search, cities]);

  const trimmedSearch = search.trim();
  const exactMatch = filteredCities.some(
    (c) => c.toLowerCase() === trimmedSearch.toLowerCase()
  );
  const showCustomOption = trimmedSearch.length > 0 && !exactMatch;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between h-10 font-normal bg-background text-sm",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="flex items-center gap-2 min-w-0">
            <MapPin className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{value || placeholder}</span>
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {value && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Limpar comarca"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onChange("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    e.preventDefault();
                    onChange("");
                  }
                }}
                className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="ml-1 h-4 w-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[280px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar cidade (ex: Feira de Santana, Salvador)..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-64 overflow-y-auto overscroll-contain">
            {showCustomOption && (
              <CommandGroup heading="Personalizado">
                <CommandItem
                  value={trimmedSearch}
                  onSelect={() => {
                    onChange(trimmedSearch);
                    setOpen(false);
                  }}
                  className="font-medium text-primary cursor-pointer"
                >
                  <MapPin className="h-4 w-4 mr-2" />
                  Usar &quot;{trimmedSearch}&quot;
                </CommandItem>
              </CommandGroup>
            )}

            <CommandGroup heading={loading ? "Carregando municípios..." : "Cidades / Comarcas"}>
              {filteredCities.map((city) => (
                <CommandItem
                  key={city}
                  value={city}
                  onSelect={() => {
                    onChange(city);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value.toLowerCase() === city.toLowerCase() ? "opacity-100 text-primary" : "opacity-0"
                    )}
                  />
                  <span>{city}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            {filteredCities.length === 0 && !showCustomOption && (
              <CommandEmpty>Nenhuma cidade encontrada.</CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
