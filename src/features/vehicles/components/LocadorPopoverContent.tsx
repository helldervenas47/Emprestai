import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocadorInfo } from "@/features/vehicles/hooks/useLocadorInfo";
import { Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { formatCPF, formatRG } from "@/lib/brDocuments";

interface Props {
  locador: LocadorInfo;
  onSave: (info: LocadorInfo) => void;
  readOnly?: boolean;
}

export function LocadorPopoverContent({ locador, onSave, readOnly = false }: Props) {
  const hasData = locador.nome || locador.cpf || locador.rg;
  const [editing, setEditing] = useState(!hasData);
  const [form, setForm] = useState<LocadorInfo>(locador);

  const handleSave = () => {
    onSave(form);
    setEditing(false);
    toast.success("Dados do locador salvos!");
  };

  if (editing || !hasData) {
    return (
      <div className="space-y-3">
        <h4 className="font-semibold text-sm">Dados do Locador</h4>
        <div>
          <Label className="text-xs">Nome Completo</Label>
          <Input value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} placeholder="Nome do locador" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Nacionalidade</Label>
            <Input value={form.nacionalidade} onChange={(e) => setForm((p) => ({ ...p, nacionalidade: e.target.value }))} placeholder="Brasileiro(a)" />
          </div>
          <div>
            <Label className="text-xs">Profissão</Label>
            <Input value={form.profissao} onChange={(e) => setForm((p) => ({ ...p, profissao: e.target.value }))} placeholder="Empresário(a)" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">RG</Label>
            <Input value={formatRG(form.rg)} onChange={(e) => setForm((p) => ({ ...p, rg: formatRG(e.target.value) }))} placeholder="00.000.000-0" maxLength={15} />
          </div>
          <div>
            <Label className="text-xs">CPF</Label>
            <Input value={formatCPF(form.cpf)} onChange={(e) => setForm((p) => ({ ...p, cpf: formatCPF(e.target.value) }))} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Endereço</Label>
          <Input value={form.endereco} onChange={(e) => setForm((p) => ({ ...p, endereco: e.target.value }))} placeholder="Rua, número" />
        </div>
        <div>
          <Label className="text-xs">Cidade</Label>
          <Input value={form.cidade} onChange={(e) => setForm((p) => ({ ...p, cidade: e.target.value }))} placeholder="São Paulo" />
        </div>
        {!readOnly && (
          <div className="flex gap-2 justify-end">
            {hasData && (
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setForm(locador); }}>
                <X className="w-[25px] h-[25px] mr-1" /> Cancelar
              </Button>
            )}
            <Button size="sm" onClick={handleSave}>
              <Check className="w-[25px] h-[25px] mr-1" /> Salvar
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="font-semibold text-sm">Dados do Locador</h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <p><span className="text-muted-foreground">Nome:</span> {locador.nome}</p>
        <p><span className="text-muted-foreground">Nacionalidade:</span> {locador.nacionalidade}</p>
        <p><span className="text-muted-foreground">Profissão:</span> {locador.profissao || "—"}</p>
        <p><span className="text-muted-foreground">RG:</span> {formatRG(locador.rg) || "—"}</p>
        <p><span className="text-muted-foreground">CPF:</span> {formatCPF(locador.cpf) || "—"}</p>
        <p><span className="text-muted-foreground">Endereço:</span> {[locador.endereco, locador.cidade].filter(Boolean).join(", ") || "—"}</p>
      </div>
      {!readOnly && (
        <Button size="sm" variant="outline" onClick={() => { setForm(locador); setEditing(true); }}>
          <Pencil className="w-[25px] h-[25px] mr-1" /> Editar
        </Button>
      )}
    </div>
  );
}
