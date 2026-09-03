import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { personalIconMap, personalCategoryColors } from "@/features/financial/lib/personalExpenseCategories";
import { cn } from "@/lib/utils";
import { Check, Plus, Save, Trash2 } from "lucide-react";

interface ExistingCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (cat: { id: string; name: string; icon: string; color: string }) => void;
  onUpdated?: (cat: { id: string; name: string; icon: string; color: string }) => void;
  onDeleted?: (id: string) => void;
  createCategory?: (input: { name: string; icon: string; color: string }) => Promise<{ id: string; name: string; icon: string; color: string } | null>;
  updateCategory?: (id: string, input: { name: string; icon: string; color: string }) => Promise<{ id: string; name: string; icon: string; color: string } | null>;
  deleteCategory?: (id: string) => Promise<void>;
  /** When provided, the dialog runs in edit mode for this category. */
  editing?: ExistingCategory | null;
  /** When provided (and not editing), pre-fills the create form. */
  initial?: { name: string; icon: string; color: string } | null;
}

const iconNames = Object.keys(personalIconMap);

export function PersonalCategoryCreator({
  open,
  onOpenChange,
  onCreated,
  onUpdated,
  onDeleted,
  createCategory,
  updateCategory,
  deleteCategory,
  editing,
  initial,
}: Props) {
  const isEdit = !!editing;
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>("Package");
  const [color, setColor] = useState<string>(personalCategoryColors[0]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync state when opening / switching mode
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setIcon(editing.icon);
      setColor(editing.color);
    } else if (initial) {
      setName(initial.name);
      setIcon(initial.icon);
      setColor(initial.color);
    } else {
      setName("");
      setIcon("Package");
      setColor(personalCategoryColors[0]);
    }
    setConfirmDelete(false);
  }, [open, editing, initial]);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    if (isEdit && editing && updateCategory) {
      const updated = await updateCategory(editing.id, { name: name.trim(), icon, color });
      setSaving(false);
      if (updated) {
        onUpdated?.(updated);
        onOpenChange(false);
      }
    } else if (createCategory) {
      const created = await createCategory({ name: name.trim(), icon, color });
      setSaving(false);
      if (created) {
        onCreated?.(created);
        onOpenChange(false);
      }
    } else {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing || !deleteCategory) return;
    setSaving(true);
    await deleteCategory(editing.id);
    setSaving(false);
    onDeleted?.(editing.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar categoria" : "Nova categoria"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="cat-name">Nome</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Academia, Streaming, Viagem..."
              maxLength={40}
              autoFocus
            />
          </div>

          <div>
            <Label className="mb-2 block">Cor</Label>
            <div className="flex flex-wrap gap-2">
              {personalCategoryColors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-8 w-8 rounded-full border-2 transition-transform",
                    color === c ? "border-foreground scale-110" : "border-transparent",
                  )}
                  style={{ backgroundColor: `hsl(${c})` }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Ícone</Label>
            <div className="grid grid-cols-8 gap-2 rounded-md border border-border p-2 max-h-[180px] overflow-y-auto">
              {iconNames.map((n) => {
                const Ico = personalIconMap[n];
                const selected = icon === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setIcon(n)}
                    className={cn(
                      "relative flex h-9 w-9 items-center justify-center rounded-md border transition-colors",
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted",
                    )}
                    title={n}
                  >
                    <Ico className="h-4 w-4" style={{ color: `hsl(${color})` }} />
                    {selected && (
                      <Check className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-primary text-primary-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-md"
              style={{ backgroundColor: `hsl(${color} / 0.15)` }}
            >
              {(() => {
                const Ico = personalIconMap[icon] ?? personalIconMap.Package;
                return <Ico className="h-4 w-4" style={{ color: `hsl(${color})` }} />;
              })()}
            </div>
            <span className="text-sm font-medium">{name.trim() || "Pré-visualização"}</span>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {isEdit && deleteCategory ? (
            confirmDelete ? (
              <Button variant="destructive" onClick={handleDelete} disabled={saving}>
                <Trash2 className="mr-2 h-4 w-4" />
                Confirmar exclusão
              </Button>
            ) : (
              <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={saving}>
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </Button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || saving}>
              {isEdit ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
              {isEdit ? "Salvar" : "Criar categoria"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
