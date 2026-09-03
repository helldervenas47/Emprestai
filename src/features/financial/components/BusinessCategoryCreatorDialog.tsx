import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tag, Plus, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (categoryName: string) => void;
  addCategory: (name: string) => string | null;
}

export function BusinessCategoryCreatorDialog({
  open,
  onOpenChange,
  onCreated,
  addCategory,
}: Props) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;

    setSubmitting(true);
    const createdName = addCategory(name.trim());
    setSubmitting(false);

    if (createdName) {
      onCreated(createdName);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Tag className="h-4 w-4" />
            </span>
            <div>
              <DialogTitle className="text-base font-bold">Nova Categoria Empresarial</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Crie uma categoria personalizada para classificar suas despesas corporativas.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="category-name" className="text-xs font-semibold">
              Nome da categoria
            </Label>
            <Input
              id="category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Marketing, Consultoria, Fretes, Software..."
              autoFocus
              required
            />
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={!name.trim() || submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Criar Categoria
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
