import { useMemo, useState } from "react";
import { SuccessAnimation } from "@/components/SuccessAnimation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, Save } from "lucide-react";
import { Product } from "@/types/loan";

interface Props {
  onAdd?: (product: Omit<Product, "id" | "createdAt">) => void | Promise<unknown>;
  onUpdate?: (id: string, product: Partial<Omit<Product, "id" | "createdAt">>) => void | Promise<unknown>;
  onClose: () => void;
  product?: Product | null;
}

export function ProductForm({ onAdd, onUpdate, onClose, product }: Props) {
  const isEdit = !!product;
  const [form, setForm] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    cost: product ? String(product.cost ?? "") : "",
    price: product ? String(product.price ?? "") : "",
    lastPurchasePrice: product ? String(product.lastPurchasePrice ?? "") : "",
    suggestedStock: product ? String(product.suggestedStock ?? "") : "",
    stock: product ? String(product.stock ?? "") : "",
  });
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const cost = parseFloat(form.cost) || 0;
  const price = parseFloat(form.price) || 0;
  const margin = useMemo(() => {
    if (!cost || !price) return null;
    const pct = ((price - cost) / cost) * 100;
    const profit = price - cost;
    return { pct, profit };
  }, [cost, price]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.price) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        price: parseFloat(form.price) || 0,
        cost: parseFloat(form.cost) || 0,
        lastPurchasePrice: parseFloat(form.lastPurchasePrice) || 0,
        suggestedStock: parseInt(form.suggestedStock) || 0,
        stock: parseInt(form.stock) || 0,
        active: true,
      };
      if (isEdit && onUpdate && product) {
        await onUpdate(product.id, payload);
      } else if (onAdd) {
        await onAdd(payload);
      }
      setShowSuccess(true);
    } finally {
      setSubmitting(false);
    }
  };

  const update = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  return (
    <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-stretch justify-center p-0 sm:items-center sm:p-4">
      <SuccessAnimation show={showSuccess} onComplete={onClose} message={isEdit ? "Produto atualizado!" : "Produto cadastrado!"} />
      <Card className="!bg-card !backdrop-blur-none supports-[backdrop-filter]:!bg-card dark:!bg-card w-full h-[100dvh] max-h-[100dvh] rounded-none border-0 overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:h-auto sm:max-h-[90vh] sm:max-w-md sm:rounded-2xl sm:border sm:pt-0 sm:pb-0">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">{isEdit ? "Editar Produto" : "Novo Produto"}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nome do Produto</Label>
              <Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Ex: Celular Samsung" required />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Descrição do produto..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Preço de compra (R$)</Label>
                <Input type="number" step="0.01" value={form.cost} onChange={(e) => update("cost", e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <Label>Preço de venda (R$)</Label>
                <Input type="number" step="0.01" value={form.price} onChange={(e) => update("price", e.target.value)} placeholder="0,00" required />
              </div>
            </div>

            {margin && (
              <div className="rounded-lg bg-muted/40 p-3 text-sm flex items-center justify-between">
                <span className="text-muted-foreground">Margem de lucro</span>
                <span className={`font-semibold tabular-nums ${margin.pct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {margin.pct.toFixed(1)}% · R$ {margin.profit.toFixed(2)}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Último valor de compra (R$)</Label>
                <Input type="number" step="0.01" value={form.lastPurchasePrice} onChange={(e) => update("lastPurchasePrice", e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <Label>Estoque sugerido</Label>
                <Input type="number" min="0" value={form.suggestedStock} onChange={(e) => update("suggestedStock", e.target.value)} placeholder="0" />
              </div>
            </div>

            <div>
              <Label>Estoque atual</Label>
              <Input type="number" value={form.stock} onChange={(e) => update("stock", e.target.value)} placeholder="0" />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {isEdit ? <><Save className="h-4 w-4 mr-2" /> Salvar alterações</> : <><Plus className="h-4 w-4 mr-2" /> Cadastrar Produto</>}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
