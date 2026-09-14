import React, { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { Client } from "@/types/loan";
import { FormModalOverlay } from "@/components/ui/form-modal-overlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { formatCPF, formatCNPJ, formatRG, onlyDigits, isValidCPF, isValidCNPJ } from "@/lib/brDocuments";
import { computeAvailableLimit, formatBRL } from "@/features/creditCards/lib/creditLimit";
import {
  X,
  Check,
  User,
  Phone,
  Mail,
  MapPin,
  Wallet,
  Percent,
  MessageSquare,
  Car,
  Briefcase,
  FileText,
  Loader2,
  ShieldCheck,
  HelpCircle,
  FileBadge,
} from "lucide-react";
import { toast } from "sonner";

const ClientDocuments = lazy(() =>
  import("@/features/clients/components/ClientDocuments").then((m) => ({ default: m.ClientDocuments }))
);

interface Props {
  isOpen: boolean;
  onClose: () => void;
  client: Client;
  usedLimit?: number;
  initialCreditLimit?: number | null;
  docCount?: number;
  initialTab?: "data" | "docs";
  onSave: (id: string, data: Partial<Omit<Client, "id" | "createdAt">>, creditLimitValue?: number | null) => Promise<void> | void;
}

export function ClientEditModal({
  isOpen,
  onClose,
  client,
  usedLimit = 0,
  initialCreditLimit = null,
  docCount = 0,
  initialTab = "data",
  onSave,
}: Props) {
  const [activeTab, setActiveTab] = useState<"data" | "docs">(initialTab);
  const [saving, setSaving] = useState(false);

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
    bairro: "",
    nacionalidade: "",
    estadoCivil: "",
    profissao: "",
    notes: "",
    isVehicleRental: false,
    isManager: false,
    defaultInterestRate: "",
    creditLimit: "",
    autoBillingEnabled: true,
  });

  useEffect(() => {
    if (isOpen && client) {
      setActiveTab(initialTab);
      setForm({
        name: client.name || "",
        phone: client.phone || "",
        email: client.email || "",
        cpf: client.cpf || "",
        cnpj: client.cnpj || "",
        rg: client.rg || "",
        address: client.address || "",
        city: client.city || "",
        state: client.state || "",
        bairro: client.bairro || "",
        nacionalidade: client.nacionalidade || "",
        estadoCivil: client.estadoCivil || "",
        profissao: client.profissao || "",
        notes: client.notes || "",
        isVehicleRental: client.isVehicleRental || false,
        isManager: client.isManager || false,
        defaultInterestRate: client.defaultInterestRate != null ? String(client.defaultInterestRate) : "",
        creditLimit: initialCreditLimit != null ? String(initialCreditLimit) : "",
        autoBillingEnabled: client.autoBillingEnabled ?? true,
      });
    }
  }, [isOpen, client, initialCreditLimit, initialTab]);

  const update = useCallback((field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  if (!isOpen || !client) return null;

  const totalLimitNum = parseFloat(String(form.creditLimit).replace(",", ".")) || 0;
  const availableLimit = computeAvailableLimit(totalLimitNum, usedLimit);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("O nome do cliente é obrigatório");
      return;
    }

    if (form.cpf && !isValidCPF(form.cpf)) {
      toast.error("CPF informado é inválido");
      return;
    }

    if (form.cnpj && !isValidCNPJ(form.cnpj)) {
      toast.error("CNPJ informado é inválido");
      return;
    }

    const { defaultInterestRate, creditLimit, cpf, cnpj, rg, ...rest } = form;
    const parsedRate = defaultInterestRate.trim() === "" ? null : parseFloat(defaultInterestRate);
    const parsedLimit = creditLimit.trim() === "" ? null : parseFloat(String(creditLimit).replace(",", "."));

    setSaving(true);
    try {
      await onSave(
        client.id,
        {
          ...rest,
          cpf: onlyDigits(cpf),
          cnpj: onlyDigits(cnpj),
          rg: formatRG(rg),
          defaultInterestRate: parsedRate !== null && !isNaN(parsedRate) ? parsedRate : null,
        },
        parsedLimit !== null && !isNaN(parsedLimit) && parsedLimit >= 0 ? parsedLimit : null
      );
      toast.success("Cadastro do cliente atualizado com sucesso!");
      onClose();
    } catch (err: any) {
      toast.error("Erro ao salvar cadastro: " + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModalOverlay className="flex items-stretch justify-center p-0 md:items-center md:p-4">
      <div className="modal-form-scrollable !bg-card !backdrop-blur-none supports-[backdrop-filter]:!bg-card dark:!bg-card w-full h-[100dvh] max-h-[100dvh] rounded-none border-0 flex flex-col overflow-hidden md:h-auto md:max-h-[92svh] md:max-w-2xl md:rounded-2xl md:border md:shadow-2xl animate-fade-in">
        {/* Header Fixo */}
        <div className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border/60 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),0.875rem)] pb-3.5 sm:px-6 sm:py-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
              <User className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-foreground truncate">
                  {form.name || client.name || "Editar Cliente"}
                </h2>
                {client.active !== false ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Ativo
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-destructive/10 text-destructive border border-destructive/20">
                    Inativo
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                Edite os dados cadastrais, financeiros e preferências
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground shrink-0"
            onClick={onClose}
            disabled={saving}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Abas de Navegação */}
        <div className="px-4 sm:px-6 py-2.5 shrink-0 bg-card border-b border-border/40">
          <div className="w-full flex items-center gap-1.5 p-1 bg-muted/50 dark:bg-muted/30 rounded-xl border border-border/40">
            <button
              type="button"
              onClick={() => setActiveTab("data")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 h-9 px-3 rounded-lg text-xs font-semibold transition-all duration-150",
                activeTab === "data"
                  ? "bg-background text-foreground shadow-xs ring-1 ring-border/50 font-bold"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/40"
              )}
            >
              <User className={cn("h-3.5 w-3.5 shrink-0", activeTab === "data" ? "text-primary" : "")} />
              <span>Dados do Cliente</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("docs")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 h-9 px-3 rounded-lg text-xs font-semibold transition-all duration-150",
                activeTab === "docs"
                  ? "bg-background text-foreground shadow-xs ring-1 ring-border/50 font-bold"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/40"
              )}
            >
              <FileBadge className={cn("h-3.5 w-3.5 shrink-0", activeTab === "docs" ? "text-primary" : "")} />
              <span>Documentos</span>
              {docCount > 0 && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 text-[10px] rounded-full font-bold leading-none",
                    activeTab === "docs"
                      ? "bg-primary/15 text-primary border border-primary/25"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {docCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Conteúdo com Rolagem */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {activeTab === "data" ? (
            <form id="client-edit-form" onSubmit={handleSubmit} className="space-y-5">
              {/* Seção 1: Identificação e Contato */}
              <div className="bg-card/70 dark:bg-white/[0.02] border border-border/60 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                  <User className="h-4 w-4 text-primary" />
                  <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-foreground">
                    Identificação & Contato
                  </h3>
                </div>

                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-foreground">Nome Completo *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => update("name", e.target.value)}
                      placeholder="Nome do cliente"
                      className="h-10 text-sm bg-background/80"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-foreground">CPF</Label>
                      <Input
                        value={formatCPF(form.cpf)}
                        onChange={(e) => update("cpf", formatCPF(e.target.value))}
                        placeholder="000.000.000-00"
                        inputMode="numeric"
                        maxLength={14}
                        className="h-10 text-sm bg-background/80"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-emerald-500" />
                        Telefone / WhatsApp
                      </Label>
                      <Input
                        value={form.phone}
                        onChange={(e) => update("phone", e.target.value)}
                        placeholder="(00) 00000-0000"
                        className="h-10 text-sm bg-background/80"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-blue-500" />
                        E-mail
                      </Label>
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(e) => update("email", e.target.value)}
                        placeholder="cliente@exemplo.com"
                        className="h-10 text-sm bg-background/80"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-amber-500" />
                        Endereço
                      </Label>
                      <Input
                        value={form.address}
                        onChange={(e) => update("address", e.target.value)}
                        placeholder="Rua, número, complemento"
                        className="h-10 text-sm bg-background/80"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Seção 2: Parâmetros Financeiros & Limite de Crédito */}
              <div className="bg-card/70 dark:bg-white/[0.02] border border-border/60 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                  <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-foreground">
                    Condições Financeiras & Crédito
                  </h3>
                </div>

                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-foreground flex items-center gap-1">
                      <Percent className="h-3.5 w-3.5 text-primary" />
                      Taxa de juros padrão (% ao mês)
                    </Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={form.defaultInterestRate}
                      onChange={(e) => update("defaultInterestRate", e.target.value)}
                      placeholder="30"
                      className="h-10 text-sm bg-background/80"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Se não preenchido, será utilizado 30% como padrão nos novos empréstimos.
                    </p>
                  </div>

                  {/* Card de Limite de Crédito Otimizado */}
                  <div className="rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/[0.03] p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Wallet className="h-4 w-4 text-primary" />
                        Limite de Crédito Disponível
                      </Label>
                      {client.active === false && (
                        <span className="text-[10px] text-destructive font-semibold">
                          Cliente Inativo
                        </span>
                      )}
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.creditLimit}
                      onChange={(e) => update("creditLimit", e.target.value)}
                      placeholder="0,00"
                      disabled={client.active === false}
                      className="h-10 text-sm bg-background font-semibold"
                    />
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40 text-xs">
                      <div className="bg-background/60 rounded-lg p-2 border border-border/30">
                        <p className="text-[10px] text-muted-foreground uppercase font-medium">Utilizado</p>
                        <p className="font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                          {formatBRL(usedLimit)}
                        </p>
                      </div>
                      <div className="bg-background/60 rounded-lg p-2 border border-border/30">
                        <p className="text-[10px] text-muted-foreground uppercase font-medium">Disponível</p>
                        <p className={`font-bold tabular-nums ${availableLimit < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                          {formatBRL(availableLimit)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Seção 3: Preferências, Notificações & Módulos */}
              <div className="bg-card/70 dark:bg-white/[0.02] border border-border/60 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                  <Briefcase className="h-4 w-4 text-amber-500" />
                  <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-foreground">
                    Preferências & Módulos
                  </h3>
                </div>

                <div className="space-y-3">
                  {/* Cobrança Automática */}
                  <div className="flex items-start justify-between gap-3 p-3 rounded-xl border border-border/60 bg-background/60 hover:bg-background transition-colors">
                    <div className="space-y-0.5">
                      <Label htmlFor="edit-autobilling-toggle" className="text-xs sm:text-sm font-semibold cursor-pointer flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-emerald-500" />
                        Cobrança Automática por WhatsApp
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        Habilita envio de mensagens automáticas de vencimento e atraso para este cliente.
                      </p>
                    </div>
                    <Switch
                      id="edit-autobilling-toggle"
                      checked={form.autoBillingEnabled}
                      onCheckedChange={(val) => update("autoBillingEnabled", val)}
                      className="shrink-0"
                    />
                  </div>

                  {/* Cliente é Gerente */}
                  <div className="flex items-start justify-between gap-3 p-3 rounded-xl border border-border/60 bg-background/60 hover:bg-background transition-colors">
                    <div className="space-y-0.5">
                      <Label htmlFor="edit-manager-toggle" className="text-xs sm:text-sm font-semibold cursor-pointer flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                        Cliente é Gerente
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        Permite vincular este cliente como gerente para receber comissão sobre empréstimos.
                      </p>
                    </div>
                    <Switch
                      id="edit-manager-toggle"
                      checked={form.isManager}
                      onCheckedChange={(val) => update("isManager", val)}
                      className="shrink-0"
                    />
                  </div>

                  {/* Aluguel de Veículos */}
                  <div className="rounded-xl border border-border/60 bg-background/60 transition-colors overflow-hidden">
                    <div className="flex items-start justify-between gap-3 p-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="edit-vehicle-toggle" className="text-xs sm:text-sm font-semibold cursor-pointer flex items-center gap-1.5">
                          <Car className="h-3.5 w-3.5 text-blue-500" />
                          Módulo de Aluguel de Veículos
                        </Label>
                        <p className="text-[11px] text-muted-foreground">
                          Habilita campos complementares para contratos de locação de veículos.
                        </p>
                      </div>
                      <Switch
                        id="edit-vehicle-toggle"
                        checked={form.isVehicleRental}
                        onCheckedChange={(val) => update("isVehicleRental", val)}
                        className="shrink-0"
                      />
                    </div>

                    {form.isVehicleRental && (
                      <div className="p-3 pt-0 border-t border-border/40 space-y-3 bg-muted/20 animate-fade-in">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">RG</Label>
                            <Input
                              value={formatRG(form.rg)}
                              onChange={(e) => update("rg", formatRG(e.target.value))}
                              placeholder="00.000.000-0"
                              className="h-9 text-xs bg-background"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Cidade</Label>
                            <Input
                              value={form.city}
                              onChange={(e) => update("city", e.target.value)}
                              placeholder="Cidade"
                              className="h-9 text-xs bg-background"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Bairro</Label>
                            <Input
                              value={form.bairro}
                              onChange={(e) => update("bairro", e.target.value)}
                              placeholder="Bairro"
                              className="h-9 text-xs bg-background"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Profissão</Label>
                            <Input
                              value={form.profissao}
                              onChange={(e) => update("profissao", e.target.value)}
                              placeholder="Profissão / Ocupação"
                              className="h-9 text-xs bg-background"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Nacionalidade</Label>
                            <Input
                              value={form.nacionalidade}
                              onChange={(e) => update("nacionalidade", e.target.value)}
                              placeholder="Brasileiro(a)"
                              className="h-9 text-xs bg-background"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Estado Civil</Label>
                            <Input
                              value={form.estadoCivil}
                              onChange={(e) => update("estadoCivil", e.target.value)}
                              placeholder="Solteiro(a)"
                              className="h-9 text-xs bg-background"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Seção 4: Observações Gerais */}
              <div className="bg-card/70 dark:bg-white/[0.02] border border-border/60 rounded-2xl p-4 sm:p-5 space-y-2.5">
                <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-xs sm:text-sm font-bold uppercase tracking-wider text-foreground">
                    Observações Internas
                  </Label>
                </div>
                <Textarea
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  placeholder="Informações adicionais, histórico ou notas sobre o cliente..."
                  rows={3}
                  className="text-sm bg-background/80 resize-none"
                />
              </div>
            </form>
          ) : (
            <div className="py-2 animate-fade-in">
              <Suspense
                fallback={
                  <div className="flex items-center justify-center p-8 text-xs text-muted-foreground gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Carregando documentos do cliente...
                  </div>
                }
              >
                <ClientDocuments clientId={client.id} />
              </Suspense>
            </div>
          )}
        </div>

        {/* Footer Fixo */}
        <div className="sticky bottom-0 z-20 bg-card/95 backdrop-blur-md border-t border-border/60 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between gap-3 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl px-4 text-xs font-semibold"
          >
            Cancelar
          </Button>

          {activeTab === "data" ? (
            <Button
              type="submit"
              form="client-edit-form"
              disabled={saving}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl px-5 text-xs shadow-md shadow-primary/20 flex items-center gap-1.5"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Salvar Alterações
                </>
              )}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={onClose}
              className="rounded-xl px-5 text-xs font-semibold"
            >
              Fechar
            </Button>
          )}
        </div>
      </div>
    </FormModalOverlay>
  );
}
