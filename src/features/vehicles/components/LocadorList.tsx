import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocadorInfo } from "@/features/vehicles/hooks/useLocadorInfo";
import { Pencil, Check, X, Trash2, Plus, User, Search } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { formatCPF, formatRG, onlyDigits } from "@/lib/brDocuments";

interface Props {
  locadores: LocadorInfo[];
  onSave: (info: LocadorInfo) => Promise<boolean> | void;
  onDelete: (id: string) => void;
  readOnly?: boolean;
}

const emptyForm: LocadorInfo = {
  nome: "", rg: "", cpf: "", nacionalidade: "Brasileiro(a)", profissao: "",
  endereco: "", bairro: "", cidade: "", estado: "",
};

export function LocadorList({ locadores, onSave, onDelete, readOnly = false }: Props) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LocadorInfo>(emptyForm);
  const [adding, setAdding] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = locadores.filter(l =>
    l.nome.toLowerCase().includes(search.toLowerCase()) ||
    (onlyDigits(l.cpf).includes(onlyDigits(search)) && onlyDigits(search).length > 0) || l.cpf.includes(search)
  );

  const startEdit = (l: LocadorInfo) => {
    setEditingId(l.id!);
    setForm(l);
    setAdding(false);
  };

  const saveEdit = async () => {
    if (!form.nome) { toast.error("Informe o nome do locador"); return; }
    const result = await onSave(form);
    if (result === false) {
      toast.error("Erro ao salvar locador. Tente novamente.");
      return;
    }
    setEditingId(null);
    setAdding(false);
    toast.success(form.id ? "Locador atualizado!" : "Locador cadastrado!");
    setForm(emptyForm);
  };

  const startAdd = () => {
    setAdding(true);
    setEditingId(null);
    setForm(emptyForm);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setAdding(false);
    setForm(emptyForm);
  };

  const confirmDelete = () => {
    if (deleteId) {
      onDelete(deleteId);
      setDeleteId(null);
      toast.success("Locador removido!");
    }
  };

  const renderForm = () => (
    <Card className="border-primary/30">
      <CardContent className="p-4 space-y-3">
        <h4 className="font-semibold text-sm">{form.id ? "Editar Locador" : "Novo Locador"}</h4>
        <div>
          <Label className="text-xs">Nome Completo</Label>
          <Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Nome do locador" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Nacionalidade</Label>
            <Input value={form.nacionalidade} onChange={e => setForm(p => ({ ...p, nacionalidade: e.target.value }))} placeholder="Brasileiro(a)" />
          </div>
          <div>
            <Label className="text-xs">Profissão</Label>
            <Input value={form.profissao} onChange={e => setForm(p => ({ ...p, profissao: e.target.value }))} placeholder="Empresário(a)" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">RG</Label>
            <Input value={formatRG(form.rg)} onChange={e => setForm(p => ({ ...p, rg: formatRG(e.target.value) }))} placeholder="00.000.000-0" maxLength={15} />
          </div>
          <div>
            <Label className="text-xs">CPF</Label>
            <Input value={formatCPF(form.cpf)} onChange={e => setForm(p => ({ ...p, cpf: formatCPF(e.target.value) }))} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Endereço</Label>
          <Input value={form.endereco} onChange={e => setForm(p => ({ ...p, endereco: e.target.value }))} placeholder="Rua, número" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Bairro</Label>
            <Input value={form.bairro} onChange={e => setForm(p => ({ ...p, bairro: e.target.value }))} placeholder="Centro" />
          </div>
          <div>
            <Label className="text-xs">Cidade</Label>
            <Input value={form.cidade} onChange={e => setForm(p => ({ ...p, cidade: e.target.value }))} placeholder="São Paulo" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Estado</Label>
          <Input value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))} placeholder="SP" />
        </div>
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={cancelEdit}>
            <X className="w-[25px] h-[25px] mr-1" /> Cancelar
          </Button>
          <Button size="sm" onClick={saveEdit}>
            <Check className="w-[25px] h-[25px] mr-1" /> Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
          <Input
            placeholder="Buscar locador..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        {!readOnly && (
          <Button size="sm" onClick={startAdd} className="h-9">
            <Plus className="w-[25px] h-[25px] mr-1" /> Novo
          </Button>
        )}
      </div>

      {adding && renderForm()}

      {filtered.length === 0 && !adding && (
        <Card>
          <CardContent className="py-8 text-center">
            <User className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum locador cadastrado</p>
          </CardContent>
        </Card>
      )}

      {filtered.map(l => (
        editingId === l.id ? (
          <div key={l.id}>{renderForm()}</div>
        ) : (
          <Card key={l.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="font-semibold text-sm">{l.nome}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    {l.cpf && <p>CPF: {formatCPF(l.cpf)}</p>}
                    {l.rg && <p>RG: {formatRG(l.rg)}</p>}
                    {l.nacionalidade && <p>Nac.: {l.nacionalidade}</p>}
                    {l.profissao && <p>Prof.: {l.profissao}</p>}
                    {(l.endereco || l.cidade) && (
                      <p className="col-span-2">End.: {[l.endereco, l.bairro, l.cidade, l.estado].filter(Boolean).join(", ")}</p>
                    )}
                  </div>
                </div>
                {!readOnly && (
                  <RowActions
                    size="md"
                    actions={[
                      { label: "Editar", icon: <Pencil className="h-4 w-4" />, onClick: () => startEdit(l) },
                      { label: "Excluir", icon: <Trash2 className="h-4 w-4" />, destructive: true, onClick: () => setDeleteId(l.id!) },
                    ]}
                  />
                )}

              </div>
            </CardContent>
          </Card>
        )
      ))}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Locador</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir este locador?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
