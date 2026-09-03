import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Wallet, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { usePaymentMethods, PaymentMethod } from "@/hooks/usePaymentMethods";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";

interface Props {
  readOnly?: boolean;
}

export function PaymentMethodsManager({ readOnly = false }: Props) {
  const { methods, add, update, remove, loading } = usePaymentMethods();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    await add(name);
    setNewName("");
  };

  const startEdit = (m: PaymentMethod) => {
    setEditingId(m.id);
    setEditName(m.name);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) {
      setEditingId(null);
      return;
    }
    await update(editingId, { name });
    setEditingId(null);
    setEditName("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-primary" /> Formas de pagamento
        </CardTitle>
        <CardDescription>
          Cadastre as formas usadas ao receber pagamentos dos contratos. As inativas não aparecem no momento de receber.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!readOnly && (
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="new-method" className="text-xs">Nova forma</Label>
              <Input
                id="new-method"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: PicPay"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleAdd} disabled={!newName.trim()} size="sm">
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Carregando…</p>
        ) : methods.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhuma forma cadastrada. Crie a primeira para registrar pagamentos.
          </p>
        ) : (
          <div className="space-y-2">
            {methods.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  {editingId === m.id ? (
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                      className="h-8"
                    />
                  ) : (
                    <p className={`text-sm font-medium ${!m.active ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {m.name}
                    </p>
                  )}
                </div>

                {!readOnly && editingId === m.id ? (
                  <>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveEdit}>
                      <Check className="h-4 w-4 text-success" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                      <X className="w-[25px] h-[25px]" />
                    </Button>
                  </>
                ) : !readOnly ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={m.active}
                        onCheckedChange={(checked) => update(m.id, { active: checked })}
                      />
                      <span className="text-[10px] text-muted-foreground hidden sm:inline">
                        {m.active ? "Ativa" : "Inativa"}
                      </span>
                    </div>
                    <RowActions
                      actions={[
                        { label: "Editar", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => startEdit(m) },
                        { label: "Excluir", icon: <Trash2 className="h-3.5 w-3.5" />, destructive: true, onClick: () => setDeleteId(m.id) },
                      ]}
                    />

                  </>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ConfirmDeleteDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Excluir forma de pagamento?"
        description="Pagamentos antigos vinculados a esta forma ficarão sem forma definida. Esta ação não pode ser desfeita."
        onConfirm={async () => {
          if (deleteId) await remove(deleteId);
          setDeleteId(null);
        }}
      />
    </Card>
  );
}
