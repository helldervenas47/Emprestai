import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIncomeCategories, CustomIncomeCategory } from "@/features/financial/hooks/useIncomeCategories";
import { PersonalCategoryCreator } from "@/features/financial/components/PersonalCategoryCreator";
import { personalIconMap } from "@/features/financial/lib/personalExpenseCategories";
import { Pencil, Plus, Tag, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function SaleCategoryPicker({ value, onChange, placeholder = "Selecione uma categoria" }: Props) {
  const { categories, create, update, remove } = useIncomeCategories();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [editing, setEditing] = useState<CustomIncomeCategory | null>(null);

  const selected = categories.find((c) => c.name === value);
  const SelectedIcon = selected ? (personalIconMap[selected.icon] ?? personalIconMap.Package) : Tag;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories;
  }, [categories, search]);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
          >
            <span className="flex items-center gap-2 truncate">
              <SelectedIcon
                className="h-4 w-4 shrink-0"
                style={selected ? { color: `hsl(${selected.color})` } : undefined}
              />
              <span className={cn("truncate", !selected && "text-muted-foreground")}>
                {selected ? selected.name : placeholder}
              </span>
            </span>
            {value && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                className="ml-2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Limpar categoria"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="p-2 border-b border-border">
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar categoria..."
              className="h-8 text-sm"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground text-center">Nenhuma categoria.</p>
            ) : (
              filtered.map((c) => {
                const Ico = personalIconMap[c.icon] ?? personalIconMap.Package;
                const isSel = c.name === value;
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent/50 cursor-pointer"
                    onClick={() => {
                      onChange(c.name);
                      setOpen(false);
                    }}
                  >
                    <Ico className="h-4 w-4 shrink-0" style={{ color: `hsl(${c.color})` }} />
                    <span className="flex-1 text-sm truncate">{c.name}</span>
                    {isSel && <Check className="h-3.5 w-3.5 text-primary" />}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(c);
                        setCreatorOpen(true);
                        setOpen(false);
                      }}
                      className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                      aria-label="Editar categoria"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
          <div className="border-t border-border p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                setEditing(null);
                setCreatorOpen(true);
                setOpen(false);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Nova categoria
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <PersonalCategoryCreator
        open={creatorOpen}
        onOpenChange={setCreatorOpen}
        editing={editing}
        createCategory={create}
        updateCategory={update}
        deleteCategory={remove}
        onCreated={(c) => onChange(c.name)}
        onUpdated={(c) => {
          if (editing && value === editing.name) onChange(c.name);
        }}
        onDeleted={(id) => {
          if (editing && value === editing.name) onChange("");
        }}
      />
    </>
  );
}
