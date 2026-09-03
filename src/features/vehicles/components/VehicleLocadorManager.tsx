import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocadorInfo } from "@/features/vehicles/hooks/useLocadorInfo";
import { VehicleInfo } from "@/features/vehicles/hooks/useVehicleRegistry";
import { Pencil, Check, X, Plus, Trash2, Car, User, ChevronDown, ChevronUp } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { formatCPF, formatRG } from "@/lib/brDocuments";

interface Props {
  locador: LocadorInfo;
  onSaveLocador: (info: LocadorInfo) => void;
  vehicles: VehicleInfo[];
  onAddVehicle: (v: Omit<VehicleInfo, "id">) => void;
  onUpdateVehicle: (id: string, v: Partial<Omit<VehicleInfo, "id">>) => void;
  onDeleteVehicle: (id: string) => void;
  readOnly?: boolean;
}

export function VehicleLocadorManager({
  locador, onSaveLocador,
  vehicles, onAddVehicle, onUpdateVehicle, onDeleteVehicle,
  readOnly = false,
}: Props) {
  const [showLocador, setShowLocador] = useState(false);
  const [showVehicles, setShowVehicles] = useState(false);
  const [editingLocador, setEditingLocador] = useState(false);
  const [locadorForm, setLocadorForm] = useState<LocadorInfo>(locador);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({ marcaModelo: "", ano: "", cor: "", placa: "", renavam: "" });
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [editVehicleForm, setEditVehicleForm] = useState({ marcaModelo: "", ano: "", cor: "", placa: "", renavam: "" });
  const [deleteVehicleId, setDeleteVehicleId] = useState<string | null>(null);

  const handleSaveLocador = () => {
    onSaveLocador(locadorForm);
    setEditingLocador(false);
    toast.success("Dados do locador salvos!");
  };

  const handleAddVehicle = () => {
    if (!vehicleForm.marcaModelo) {
      toast.error("Informe a marca/modelo do veículo");
      return;
    }
    onAddVehicle(vehicleForm);
    setVehicleForm({ marcaModelo: "", ano: "", cor: "", placa: "", renavam: "" });
    setAddingVehicle(false);
    toast.success("Veículo cadastrado!");
  };

  const startEditVehicle = (v: VehicleInfo) => {
    setEditingVehicleId(v.id);
    setEditVehicleForm({ marcaModelo: v.marcaModelo, ano: v.ano, cor: v.cor, placa: v.placa, renavam: v.renavam });
  };

  const saveEditVehicle = (id: string) => {
    onUpdateVehicle(id, editVehicleForm);
    setEditingVehicleId(null);
    toast.success("Veículo atualizado!");
  };

  const hasLocadorData = locador.nome || locador.cpf || locador.rg;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* Locador Section */}
      <div className="rounded-xl border border-border overflow-hidden">
        <button type="button"
          onClick={() => setShowLocador(!showLocador)}
          className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm text-foreground">Dados do Locador</span>
            {hasLocadorData && (
              <span className="text-xs text-muted-foreground">— {locador.nome}</span>
            )}
          </div>
          {showLocador ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showLocador && (
          <div className="p-4 space-y-3 border-t border-border/50">
            {editingLocador || !hasLocadorData ? (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Nome Completo</Label>
                  <Input value={locadorForm.nome} onChange={(e) => setLocadorForm(p => ({ ...p, nome: e.target.value }))} placeholder="Nome do locador" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Nacionalidade</Label>
                    <Input value={locadorForm.nacionalidade} onChange={(e) => setLocadorForm(p => ({ ...p, nacionalidade: e.target.value }))} placeholder="Brasileiro(a)" />
                  </div>
                  <div>
                    <Label className="text-xs">Profissão</Label>
                    <Input value={locadorForm.profissao} onChange={(e) => setLocadorForm(p => ({ ...p, profissao: e.target.value }))} placeholder="Empresário(a)" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">RG</Label>
                    <Input value={formatRG(locadorForm.rg)} onChange={(e) => setLocadorForm(p => ({ ...p, rg: formatRG(e.target.value) }))} placeholder="00.000.000-0" maxLength={15} />
                  </div>
                  <div>
                    <Label className="text-xs">CPF</Label>
                    <Input value={formatCPF(locadorForm.cpf)} onChange={(e) => setLocadorForm(p => ({ ...p, cpf: formatCPF(e.target.value) }))} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Endereço</Label>
                  <Input value={locadorForm.endereco} onChange={(e) => setLocadorForm(p => ({ ...p, endereco: e.target.value }))} placeholder="Rua, número" />
                </div>
                <div>
                  <Label className="text-xs">Cidade</Label>
                  <Input value={locadorForm.cidade} onChange={(e) => setLocadorForm(p => ({ ...p, cidade: e.target.value }))} placeholder="São Paulo" />
                </div>
                {!readOnly && (
                  <div className="flex gap-2 justify-end">
                    {hasLocadorData && (
                      <Button size="sm" variant="ghost" onClick={() => { setEditingLocador(false); setLocadorForm(locador); }}>
                        <X className="w-[25px] h-[25px] mr-1" /> Cancelar
                      </Button>
                    )}
                    <Button data-mutation size="sm" onClick={handleSaveLocador}>
                      <Check className="w-[25px] h-[25px] mr-1" /> Salvar
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <p><span className="text-muted-foreground">Nome:</span> {locador.nome}</p>
                  <p><span className="text-muted-foreground">Nacionalidade:</span> {locador.nacionalidade}</p>
                  <p><span className="text-muted-foreground">Profissão:</span> {locador.profissao || "—"}</p>
                  <p><span className="text-muted-foreground">RG:</span> {formatRG(locador.rg) || "—"}</p>
                  <p><span className="text-muted-foreground">CPF:</span> {formatCPF(locador.cpf) || "—"}</p>
                  <p><span className="text-muted-foreground">Endereço:</span> {[locador.endereco, locador.cidade].filter(Boolean).join(", ") || "—"}</p>
                </div>
                {!readOnly && (
                  <Button data-mutation size="sm" variant="outline" onClick={() => { setLocadorForm(locador); setEditingLocador(true); }}>
                    <Pencil className="w-[25px] h-[25px] mr-1" /> Editar
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Vehicles Section */}
      <div className="rounded-xl border border-border overflow-hidden">
        <button type="button"
          onClick={() => setShowVehicles(!showVehicles)}
          className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Car className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm text-foreground">Veículos Cadastrados ({vehicles.length})</span>
          </div>
          {showVehicles ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showVehicles && (
          <div className="p-4 space-y-3 border-t border-border/50">
            {vehicles.map((v) => (
              <Card key={v.id} className="border-border/50">
                <CardContent className="p-3">
                  {editingVehicleId === v.id ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Marca/Modelo</Label>
                          <Input value={editVehicleForm.marcaModelo} onChange={(e) => setEditVehicleForm(p => ({ ...p, marcaModelo: e.target.value }))} />
                        </div>
                        <div>
                          <Label className="text-xs">Ano</Label>
                          <Input value={editVehicleForm.ano} onChange={(e) => setEditVehicleForm(p => ({ ...p, ano: e.target.value }))} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">Cor</Label>
                          <Input value={editVehicleForm.cor} onChange={(e) => setEditVehicleForm(p => ({ ...p, cor: e.target.value }))} />
                        </div>
                        <div>
                          <Label className="text-xs">Placa</Label>
                          <Input value={editVehicleForm.placa} onChange={(e) => setEditVehicleForm(p => ({ ...p, placa: e.target.value }))} />
                        </div>
                        <div>
                          <Label className="text-xs">Renavam</Label>
                          <Input value={editVehicleForm.renavam} onChange={(e) => setEditVehicleForm(p => ({ ...p, renavam: e.target.value }))} />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => setEditingVehicleId(null)}>
                          <X className="w-[25px] h-[25px] mr-1" /> Cancelar
                        </Button>
                        <Button data-mutation size="sm" onClick={() => saveEditVehicle(v.id)}>
                          <Check className="w-[25px] h-[25px] mr-1" /> Salvar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{v.marcaModelo || "Sem modelo"}</p>
                        <p className="text-xs text-muted-foreground">
                          {[v.ano && `Ano: ${v.ano}`, v.cor && `Cor: ${v.cor}`, v.placa && `Placa: ${v.placa}`].filter(Boolean).join(" • ")}
                        </p>
                        {v.renavam && <p className="text-xs text-muted-foreground">Renavam: {v.renavam}</p>}
                      </div>
                      {!readOnly && (
                        <RowActions
                          size="md"
                          actions={[
                            { label: "Editar", icon: <Pencil className="h-4 w-4" />, onClick: () => startEditVehicle(v) },
                            { label: "Excluir", icon: <Trash2 className="h-4 w-4" />, destructive: true, onClick: () => setDeleteVehicleId(v.id) },
                          ]}
                        />
                      )}

                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {addingVehicle ? (
              <Card className="border-primary/30">
                <CardContent className="p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Marca/Modelo *</Label>
                      <Input value={vehicleForm.marcaModelo} onChange={(e) => setVehicleForm(p => ({ ...p, marcaModelo: e.target.value }))} placeholder="Honda CG 160" />
                    </div>
                    <div>
                      <Label className="text-xs">Ano</Label>
                      <Input value={vehicleForm.ano} onChange={(e) => setVehicleForm(p => ({ ...p, ano: e.target.value }))} placeholder="2024" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Cor</Label>
                      <Input value={vehicleForm.cor} onChange={(e) => setVehicleForm(p => ({ ...p, cor: e.target.value }))} placeholder="Preta" />
                    </div>
                    <div>
                      <Label className="text-xs">Placa</Label>
                      <Input value={vehicleForm.placa} onChange={(e) => setVehicleForm(p => ({ ...p, placa: e.target.value }))} placeholder="ABC-1234" />
                    </div>
                    <div>
                      <Label className="text-xs">Renavam</Label>
                      <Input value={vehicleForm.renavam} onChange={(e) => setVehicleForm(p => ({ ...p, renavam: e.target.value }))} placeholder="00000000000" />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setAddingVehicle(false)}>
                      <X className="w-[25px] h-[25px] mr-1" /> Cancelar
                    </Button>
                    <Button data-mutation size="sm" onClick={handleAddVehicle}>
                      <Check className="w-[25px] h-[25px] mr-1" /> Cadastrar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              !readOnly && (
                <Button data-mutation variant="outline" className="w-full" onClick={() => setAddingVehicle(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Novo Veículo
                </Button>
              )
            )}

            {vehicles.length === 0 && !addingVehicle && (
              <div className="text-center py-4">
                <Car className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum veículo cadastrado</p>
              </div>
            )}
          </div>
        )}
      </div>
      <ConfirmDeleteDialog
        open={!!deleteVehicleId}
        onOpenChange={() => setDeleteVehicleId(null)}
        onConfirm={() => { if (deleteVehicleId) { onDeleteVehicle(deleteVehicleId); setDeleteVehicleId(null); } }}
        title="Excluir veículo"
        description="Tem certeza que deseja excluir este veículo?"
      />
    </div>
  );
}
