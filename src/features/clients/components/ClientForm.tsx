import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, X, Check, UserPlus, FileText, MapPin, Settings2 } from "lucide-react";
import { Client } from "@/types/loan";
import { ClientDocuments } from "@/features/clients/components/ClientDocuments";
import { toast } from "sonner";
import { formatCPF, formatCNPJ, formatRG, onlyDigits, isValidCPF, isValidCNPJ } from "@/lib/brDocuments";
import { FormModalOverlay } from "@/components/ui/form-modal-overlay";

interface Props {
  onAdd: (client: Omit<Client, "id" | "createdAt">) => Promise<string | null> | string | null | void;
  onClose: () => void;
}

export function ClientForm({ onAdd, onClose }: Props) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    cpf: "",
    cnpj: "",
    rg: "",
    address: "",
    city: "",
    state: "",
    score: "",
    notes: "",
    isVehicleRental: false,
    nacionalidade: "",
    estadoCivil: "",
    profissao: "",
    bairro: "",
    isManager: false,
    defaultInterestRate: "",
    autoBillingEnabled: true,
  });
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || saving) return;
    if (form.cpf && !isValidCPF(form.cpf)) {
      toast.error("CPF inválido");
      return;
    }
    if (form.cnpj && !isValidCNPJ(form.cnpj)) {
      toast.error("CNPJ inválido");
      return;
    }
    const { defaultInterestRate, ...rest } = form;
    const parsedRate = defaultInterestRate.trim() === "" ? null : parseFloat(defaultInterestRate);
    setSaving(true);
    try {
      const result = await onAdd({
        ...rest,
        cpf: onlyDigits(rest.cpf),
        cnpj: onlyDigits(rest.cnpj),
        rg: formatRG(rest.rg),
        active: true,
        defaultInterestRate: parsedRate !== null && !isNaN(parsedRate) ? parsedRate : null,
      });
      if (typeof result === "string" && result) {
        setCreatedId(result);
      } else {
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const update = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const inputCls = "w-full max-w-full text-sm h-10";
  const labelCls = "text-xs font-medium text-foreground";
  const fieldCls = "space-y-1 min-w-0";

  return (
    <FormModalOverlay className="flex items-stretch justify-center p-0 md:items-center md:p-4">
      <Card className="modal-form-scrollable !bg-card !backdrop-blur-none supports-[backdrop-filter]:!bg-card dark:!bg-card w-full h-[100dvh] max-h-[100dvh] rounded-none border-0 flex flex-col overflow-hidden md:h-auto md:max-h-[92svh] md:max-w-xl md:rounded-2xl md:border md:shadow-xl">
        <CardHeader className="sticky top-0 z-20 bg-card border-b border-border/60 flex flex-row items-center justify-between px-4 pt-[max(env(safe-area-inset-top),0.875rem)] pb-3.5 sm:px-6 sm:py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold leading-tight">Novo Cliente</CardTitle>
              <p className="text-xs text-muted-foreground">Cadastre as informações cadastrais e financeiras</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <CardContent className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {/* Bloco 1: Identificação & Contato */}
            <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3.5 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground pb-1 border-b border-border/40">
                <UserPlus className="w-3.5 h-3.5 text-primary" />
                <span>Identificação & Contato</span>
              </div>

              <div className={fieldCls}>
                <Label htmlFor="name" className={labelCls}>Nome completo *</Label>
                <Input id="name" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Ex: João Silva" required className={inputCls} autoComplete="name" />
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
                <div className={fieldCls}>
                  <Label htmlFor="cpf" className={labelCls}>CPF</Label>
                  <Input id="cpf" value={formatCPF(form.cpf)} onChange={(e) => update("cpf", formatCPF(e.target.value))} placeholder="000.000.000-00" className={inputCls} inputMode="numeric" maxLength={14} />
                </div>
                <div className={fieldCls}>
                  <Label htmlFor="cnpj" className={labelCls}>CNPJ</Label>
                  <Input id="cnpj" value={formatCNPJ(form.cnpj)} onChange={(e) => update("cnpj", formatCNPJ(e.target.value))} placeholder="00.000.000/0000-00" className={inputCls} inputMode="numeric" maxLength={18} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
                <div className={fieldCls}>
                  <Label htmlFor="phone" className={labelCls}>Telefone</Label>
                  <Input id="phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="(00) 00000-0000" className={inputCls} inputMode="tel" autoComplete="tel" />
                </div>
                <div className={fieldCls}>
                  <Label htmlFor="email" className={labelCls}>E-mail</Label>
                  <Input id="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="joao@email.com" className={inputCls} inputMode="email" autoComplete="email" />
                </div>
              </div>
            </div>

            {/* Bloco 2: Localização & Score */}
            <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3.5 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground pb-1 border-b border-border/40">
                <MapPin className="w-3.5 h-3.5 text-primary" />
                <span>Localização & Score</span>
              </div>

              <div className={fieldCls}>
                <Label htmlFor="address" className={labelCls}>Endereço</Label>
                <Input id="address" value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="Rua, número, bairro" className={inputCls} autoComplete="street-address" />
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
                <div className={fieldCls}>
                  <Label htmlFor="state" className={labelCls}>Estado (UF)</Label>
                  <Input id="state" value={form.state} onChange={(e) => update("state", e.target.value.toUpperCase())} placeholder="SP" className={inputCls} maxLength={2} />
                </div>
                <div className={fieldCls}>
                  <Label htmlFor="score" className={labelCls}>Score</Label>
                  <Input id="score" value={form.score} onChange={(e) => update("score", e.target.value)} placeholder="0-1000" className={inputCls} inputMode="numeric" />
                </div>
              </div>
            </div>

            {/* Bloco 3: Configurações Financeiras */}
            <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3.5 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground pb-1 border-b border-border/40">
                <Settings2 className="w-3.5 h-3.5 text-primary" />
                <span>Configurações Financeiras & Opções</span>
              </div>

              <div className={fieldCls}>
                <Label htmlFor="defaultInterestRate" className={labelCls}>Taxa de juros padrão (% ao mês)</Label>
                <Input
                  id="defaultInterestRate"
                  type="number"
                  step="0.1"
                  min="0"
                  inputMode="decimal"
                  value={form.defaultInterestRate}
                  onChange={(e) => update("defaultInterestRate", e.target.value)}
                  placeholder="30"
                  className={inputCls}
                />
                <p className="text-[11px] text-muted-foreground">
                  Se vazio, será usado 30% padrão ao criar novos empréstimos para este cliente.
                </p>
              </div>

              <div className="space-y-3 divide-y divide-border/40 pt-1">
                {/* Switch: Cliente é Gerente */}
                <div className="pt-2.5 first:pt-0 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isManager" className="text-sm font-medium cursor-pointer">
                      Cliente é Gerente
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Habilita receber comissão sobre empréstimos vinculados
                    </p>
                  </div>
                  <Switch
                    id="isManager"
                    checked={form.isManager}
                    onCheckedChange={(checked) => update("isManager", !!checked)}
                  />
                </div>

                {/* Switch: Aluguel de Veículos */}
                <div className="pt-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="isVehicleRental" className="text-sm font-medium cursor-pointer">
                        Aluguel de Veículos
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Habilita campos de contrato de locação (RG, Cidade, Estado civil)
                      </p>
                    </div>
                    <Switch
                      id="isVehicleRental"
                      checked={form.isVehicleRental}
                      onCheckedChange={(checked) => update("isVehicleRental", !!checked)}
                    />
                  </div>

                  {form.isVehicleRental && (
                    <div className="rounded-lg border border-primary/20 bg-primary/[0.02] p-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
                        <div className={fieldCls}>
                          <Label htmlFor="rg" className={labelCls}>RG</Label>
                          <Input id="rg" value={formatRG(form.rg)} onChange={(e) => update("rg", formatRG(e.target.value))} placeholder="00.000.000-0" className={inputCls} inputMode="text" maxLength={15} />
                        </div>
                        <div className={fieldCls}>
                          <Label htmlFor="city" className={labelCls}>Cidade</Label>
                          <Input id="city" value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="São Paulo" className={inputCls} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
                        <div className={fieldCls}>
                          <Label htmlFor="nacionalidade" className={labelCls}>Nacionalidade</Label>
                          <Input id="nacionalidade" value={form.nacionalidade} onChange={(e) => update("nacionalidade", e.target.value)} placeholder="Brasileiro(a)" className={inputCls} />
                        </div>
                        <div className={fieldCls}>
                          <Label htmlFor="estadoCivil" className={labelCls}>Estado civil</Label>
                          <Input id="estadoCivil" value={form.estadoCivil} onChange={(e) => update("estadoCivil", e.target.value)} placeholder="Solteiro(a)" className={inputCls} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
                        <div className={fieldCls}>
                          <Label htmlFor="profissao" className={labelCls}>Profissão</Label>
                          <Input id="profissao" value={form.profissao} onChange={(e) => update("profissao", e.target.value)} placeholder="Ex: Motorista" className={inputCls} />
                        </div>
                        <div className={fieldCls}>
                          <Label htmlFor="bairro" className={labelCls}>Bairro</Label>
                          <Input id="bairro" value={form.bairro} onChange={(e) => update("bairro", e.target.value)} placeholder="Centro" className={inputCls} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Switch: Cobrança Automática */}
                <div className="pt-3 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="autoBillingEnabled" className="text-sm font-medium cursor-pointer">
                      Cobrança automática por WhatsApp
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Enviar lembretes automáticos de cobrança no vencimento
                    </p>
                  </div>
                  <Switch
                    id="autoBillingEnabled"
                    checked={form.autoBillingEnabled}
                    onCheckedChange={(checked) => update("autoBillingEnabled", !!checked)}
                  />
                </div>
              </div>
            </div>

            {/* Bloco 4: Observações */}
            <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2 shadow-xs">
              <Label htmlFor="notes" className={labelCls}>Observações (opcional)</Label>
              <Textarea id="notes" value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Notas ou informações adicionais sobre o cliente..." rows={2} className="w-full text-sm resize-none" />
            </div>

            <ClientDocuments
              clientId={createdId}
              disabledHint="Cadastre o cliente para começar a anexar documentos."
            />
          </CardContent>

          {/* Rodapé Fixo de Ação */}
          <div className="sticky bottom-0 z-20 bg-card border-t border-border/60 p-4 sm:p-6 pb-[max(env(safe-area-inset-bottom),1rem)] sm:pb-6 shrink-0">
            {createdId ? (
              <Button type="button" className="w-full h-12 text-sm font-semibold rounded-xl shadow-md gap-2" onClick={onClose}>
                <Check className="h-4 w-4" />
                Concluir
              </Button>
            ) : (
              <Button type="submit" className="w-full h-12 text-sm font-semibold rounded-xl shadow-md gap-2" disabled={saving}>
                <Plus className="h-4 w-4" />
                {saving ? "Salvando…" : "Cadastrar Cliente"}
              </Button>
            )}
          </div>
        </form>
      </Card>
    </FormModalOverlay>
  );
}

