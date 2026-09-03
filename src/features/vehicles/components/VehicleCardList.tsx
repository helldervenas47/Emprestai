import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VehicleInfo } from "@/features/vehicles/hooks/useVehicleRegistry";
import { Pencil, Check, X, Trash2, Car, Search, Plus } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";

interface Props {
  vehicles: VehicleInfo[];
  onAdd: (v: Omit<VehicleInfo, "id">) => void;
  onUpdate: (id: string, v: Partial<Omit<VehicleInfo, "id">>) => void;
  onDelete: (id: string) => void;
  readOnly?: boolean;
}

export function VehicleCardList({ vehicles, onAdd, onUpdate, onDelete, readOnly = false }: Props) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ marcaModelo: "", ano: "", cor: "", placa: "", renavam: "" });
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({ marcaModelo: "", ano: "", cor: "", placa: "", renavam: "" });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = vehicles.filter((v) => {
    const q = search.toLowerCase();
    return (
      v.marcaModelo.toLowerCase().includes(q) ||
      v.placa.toLowerCase().includes(q) ||
      v.cor.toLowerCase().includes(q) ||
      v.renavam.toLowerCase().includes(q)
    );
  });

  const startEdit = (v: VehicleInfo) => {
    setEditingId(v.id);
    setEditForm({ marcaModelo: v.marcaModelo, ano: v.ano, cor: v.cor, placa: v.placa, renavam: v.renavam });
  };

  const saveEdit = (id: string) => {
    onUpdate(id, editForm);
    setEditingId(null);
    toast.success("Veículo atualizado!");
  };

  const handleAdd = () => {
    if (!addForm.marcaModelo) {
      toast.error("Informe a marca/modelo do veículo");
      return;
    }
    onAdd(addForm);
    setAddForm({ marcaModelo: "", ano: "", cor: "", placa: "", renavam: "" });
    setAdding(false);
    toast.success("Veículo cadastrado!");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
          <Input
            placeholder="Buscar veículo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {!readOnly && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="w-[25px] h-[25px] mr-1" /> Novo Veículo
          </Button>
        )}
      </div>

      {adding && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">Marca/Modelo *</Label>
                <Input value={addForm.marcaModelo} onChange={(e) => setAddForm((p) => ({ ...p, marcaModelo: e.target.value }))} placeholder="Honda CG 160" />
              </div>
              <div>
                <Label className="text-xs font-medium">Ano</Label>
                <Input value={addForm.ano} onChange={(e) => setAddForm((p) => ({ ...p, ano: e.target.value }))} placeholder="2024" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-medium">Cor</Label>
                <Input value={addForm.cor} onChange={(e) => setAddForm((p) => ({ ...p, cor: e.target.value }))} placeholder="Preta" />
              </div>
              <div>
                <Label className="text-xs font-medium">Placa</Label>
                <Input value={addForm.placa} onChange={(e) => setAddForm((p) => ({ ...p, placa: e.target.value }))} placeholder="ABC-1234" />
              </div>
              <div>
                <Label className="text-xs font-medium">Renavam</Label>
                <Input value={addForm.renavam} onChange={(e) => setAddForm((p) => ({ ...p, renavam: e.target.value }))} placeholder="00000000000" />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                <X className="h-4 w-4 mr-1" /> Cancelar
              </Button>
              <Button size="sm" onClick={handleAdd}>
                <Check className="h-4 w-4 mr-1" /> Cadastrar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((v) => (
          <Card key={v.id} className="border-border/50">
            <CardContent className="p-4">
              {editingId === v.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs font-medium">Marca/Modelo</Label>
                      <Input value={editForm.marcaModelo} onChange={(e) => setEditForm((p) => ({ ...p, marcaModelo: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs font-medium">Ano</Label>
                      <Input value={editForm.ano} onChange={(e) => setEditForm((p) => ({ ...p, ano: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs font-medium">Cor</Label>
                      <Input value={editForm.cor} onChange={(e) => setEditForm((p) => ({ ...p, cor: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs font-medium">Placa</Label>
                      <Input value={editForm.placa} onChange={(e) => setEditForm((p) => ({ ...p, placa: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs font-medium">Renavam</Label>
                      <Input value={editForm.renavam} onChange={(e) => setEditForm((p) => ({ ...p, renavam: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4 mr-1" /> Cancelar
                    </Button>
                    <Button size="sm" onClick={() => saveEdit(v.id)}>
                      <Check className="h-4 w-4 mr-1" /> Salvar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Car className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{v.marcaModelo || "Sem modelo"}</p>
                      <p className="text-xs text-muted-foreground">
                        {[v.ano && `Ano: ${v.ano}`, v.cor && `Cor: ${v.cor}`].filter(Boolean).join(" • ")}
                      </p>
                      {v.placa && <p className="text-xs text-muted-foreground">Placa: {v.placa}</p>}
                      {v.renavam && <p className="text-xs text-muted-foreground">Renavam: {v.renavam}</p>}
                    </div>
                  </div>
                  {!readOnly && (
                    <div className="shrink-0">
                      <RowActions
                        size="md"
                        actions={[
                          { label: "Editar", icon: <Pencil className="h-4 w-4" />, onClick: () => startEdit(v) },
                          { label: "Excluir", icon: <Trash2 className="h-4 w-4" />, destructive: true, onClick: () => setDeleteId(v.id) },
                        ]}
                      />
                    </div>
                  )}

                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && !adding && (
        <div className="text-center py-12">
          <Car className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">{search ? "Nenhum veículo encontrado" : "Nenhum veículo cadastrado"}</p>
        </div>
      )}
      <ConfirmDeleteDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) { onDelete(deleteId); setDeleteId(null); } }}
        title="Excluir veículo"
        description="Tem certeza que deseja excluir este veículo?"
      />
    </div>
  );
}
