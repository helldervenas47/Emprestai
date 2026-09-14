import { useState } from "react";
import { todayInAppTz } from "@/lib/timezone";
import { SuccessAnimation } from "@/components/SuccessAnimation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NativeDatePicker } from "@/components/ui/native-date-picker";
import { Plus, X, Calendar as CalendarIcon, ShoppingBag, Car, Tv, Loader2, Sparkles } from "lucide-react";
import { Sale, BusinessType, PaymentMode, Client, Product } from "@/types/loan";
import { format, addMonths, addWeeks, addDays } from "date-fns";
import { VehicleInfo } from "@/features/vehicles/hooks/useVehicleRegistry";
import { LocadorInfo } from "@/features/vehicles/hooks/useLocadorInfo";
import { formatCPF } from "@/lib/brDocuments";
import { cn } from "@/lib/utils";
import { encodeNotesWithMerchandise } from "@/features/sales/lib/saleMerchandise";
import { ClientCombobox } from "@/components/ui/client-combobox";
import { ProductCombobox } from "@/components/ui/product-combobox";
import { CityCombobox } from "@/components/ui/city-combobox";
import { SaleCategoryPicker } from "@/features/sales/components/SaleCategoryPicker";
import { FormModalOverlay } from "@/components/ui/form-modal-overlay";
import { useAuth } from "@/hooks/useAuth";


const businessTypeLabels: Record<BusinessType, string> = {
  venda: "Venda",
  streaming: "Streaming",
  aluguel_veiculo: "Aluguel de Veículo",
};

function addByFrequency(date: Date, frequency: string, n: number): Date {
  if (frequency === "Semanal") return addWeeks(date, n);
  if (frequency === "Quinzenal") return addDays(date, n * 15);
  if (frequency === "Diário") return addDays(date, n);
  return addMonths(date, n);
}

interface Props {
  onAdd: (sale: Omit<Sale, "id">) => void;
  onClose: () => void;
  defaultBusinessType?: BusinessType;
  clients?: Client[];
  registeredVehicles?: VehicleInfo[];
  locadores?: LocadorInfo[];
  products?: Product[];
}

export function SaleForm({ onAdd, onClose, defaultBusinessType = "venda", clients = [], registeredVehicles = [], locadores = [], products = [] }: Props) {
  const { user, dataOwnerId } = useAuth();
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const defaultLocadorId = locadores.length === 1 ? (locadores[0].id || "") : "";
  const [form, setForm] = useState({
    description: "",
    productId: "",
    quantity: "0",
    total: "",
    discount: "",
    installmentValue: "",
    customerName: "",
    notes: "",
    businessType: defaultBusinessType,
    paymentMode: (defaultBusinessType === "aluguel_veiculo" ? "recorrente" : "fixa") as PaymentMode,
    installments: defaultBusinessType === "aluguel_veiculo" ? "1" : "1",
    frequency: defaultBusinessType === "aluguel_veiculo" ? "Diário" : "Mensal",
    firstInstallmentDate: todayInAppTz(),
    locadorId: defaultLocadorId,
    foroCity: "",
    category: defaultBusinessType === "venda" ? "Venda" : "",
    paymentDate: todayInAppTz(),
    paymentStatus: "pago" as "pago" | "pendente",
  });
  const [merchEnabled, setMerchEnabled] = useState(false);
  const [merchDescricao, setMerchDescricao] = useState("");
  const [merchValor, setMerchValor] = useState("");
  const [merchError, setMerchError] = useState<string | null>(null);

  type ExtraItem = {
    productId: string;
    isAvulsa: boolean;
    description: string;
    quantity: number;
    total: number;
  };
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);
  const canAddExtra = form.businessType === "venda" && form.paymentMode === "fixa";

  const handleAddExtraItem = async () => {
    const qty = parseInt(form.quantity) || 1;
    const totalVal = parseFloat(form.total) || 0;
    if (!form.productId) {
      const { toast } = await import("sonner");
      toast.error('Selecione um produto ou marque como "Venda avulsa" para adicionar.');
      return;
    }
    if (!form.description) {
      const { toast } = await import("sonner");
      toast.error("Descrição do item é obrigatória.");
      return;
    }
    if (totalVal <= 0) {
      const { toast } = await import("sonner");
      toast.error("Informe um valor maior que zero.");
      return;
    }
    if (!isAvulsa) {
      const prod = products.find((p) => p.id === form.productId);
      if (!prod) return;
      const alreadyQty = extraItems
        .filter((it) => it.productId === form.productId)
        .reduce((s, it) => s + it.quantity, 0);
      if (qty + alreadyQty > prod.stock) {
        const { toast } = await import("sonner");
        toast.error(`Estoque insuficiente de "${prod.name}" (disponível: ${prod.stock - alreadyQty}).`);
        return;
      }
    }
    setExtraItems((prev) => [
      ...prev,
      {
        productId: form.productId,
        isAvulsa,
        description: form.description,
        quantity: qty,
        total: totalVal,
      },
    ]);
    setForm((p) => ({
      ...p,
      productId: "",
      description: "",
      quantity: "0",
      discount: "",
      total: "",
    }));
  };

  const removeExtraItem = (idx: number) => {
    setExtraItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const [installmentRows, setInstallmentRows] = useState<{ date: string; value: string; manualDate?: boolean; manualValue?: boolean }[]>([]);

  const isVehicleRental = form.businessType === "aluguel_veiculo";
  const installmentsNum = parseInt(form.installments) || 1;
  const firstDate = new Date(form.firstInstallmentDate + "T00:00:00");
  const totalNum = parseFloat(form.total) || 0;

  const rebuildRows = (count: number, baseDate: Date, freq: string, total: number) => {
    const defaultVal = count > 0 ? (total / count).toFixed(2) : "0";
    setInstallmentRows((prev) => {
      return Array.from({ length: count }, (_, i) => {
        const existing = prev[i];
        const autoDate = addByFrequency(baseDate, freq, i).toISOString().split("T")[0];
        return {
          date: existing?.manualDate ? existing.date : autoDate,
          value: existing?.manualValue ? existing.value : defaultVal,
          manualDate: existing?.manualDate || false,
          manualValue: existing?.manualValue || false,
        };
      });
    });
    if (count > 0) {
      setForm((p) => ({ ...p, installmentValue: defaultVal }));
    }
  };

  const isAvulsa = form.productId === "__avulsa__";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const valorRecebido = parseFloat(form.total) || 0;
    const hasExtrasEarly = canAddExtra && extraItems.length > 0;
    const hasMain = valorRecebido > 0 && !!form.description;

    if (!form.customerName) {
      setSubmitting(false);
      return;
    }

    if (form.businessType === "aluguel_veiculo" && !form.foroCity?.trim()) {
      const { toast } = await import("sonner");
      toast.error("Informe a Comarca do Foro para o contrato de locação.");
      setSubmitting(false);
      return;
    }

    if (!hasMain && !hasExtrasEarly) {
      setSubmitting(false);
      return;
    }

    // Para vendas de produto cadastrado (item principal): valida estoque.
    if (hasMain && form.businessType === "venda" && !isAvulsa && form.productId) {
      const selectedProduct = products.find((p) => p.id === form.productId);
      if (!selectedProduct) {
        const { toast } = await import("sonner");
        toast.error("Selecione um produto ou use Venda avulsa.");
        setSubmitting(false);
        return;
      }
      const qty = parseInt(form.quantity) || 1;
      if (selectedProduct.stock <= 0) {
        const { toast } = await import("sonner");
        toast.error(`"${selectedProduct.name}" está sem estoque.`);
        setSubmitting(false);
        return;
      }
      if (qty > selectedProduct.stock) {
        const { toast } = await import("sonner");
        toast.error(`Estoque insuficiente (disponível: ${selectedProduct.stock}).`);
        setSubmitting(false);
        return;
      }
    }
    if (hasMain && form.businessType === "venda" && !form.productId) {
      const { toast } = await import("sonner");
      toast.error('Selecione um produto ou marque como "Venda avulsa".');
      setSubmitting(false);
      return;
    }


    // Validate merchandise (only available for "venda")
    const allowMerch = form.businessType === "venda";
    let merchandise: { descricao: string; valor: number } | null = null;
    if (allowMerch && merchEnabled) {
      const valor = parseFloat(merchValor) || 0;
      const descricao = merchDescricao.trim();
      if (valor < 0) {
        setMerchError("Valor da mercadoria deve ser maior ou igual a zero.");
        setSubmitting(false);
        return;
      }
      if (valor > 0 && !descricao) {
        setMerchError("Descrição da mercadoria é obrigatória quando há valor.");
        setSubmitting(false);
        return;
      }
      if (valor > 0 && descricao) {
        merchandise = { descricao, valor };
      }
    }
    setMerchError(null);

    const merchValorNum = merchandise?.valor || 0;
    const total = valorRecebido + merchValorNum;

    setSubmitting(true);
    try {
      const isRecorrente = form.paymentMode === "recorrente";
      const amounts = isRecorrente && installmentRows.length > 0
        ? installmentRows.map(r => parseFloat(r.value) || 0)
        : null;
      const dates = isRecorrente && installmentRows.length > 0
        ? installmentRows.map(r => r.date)
        : null;
      const encodedNotes = encodeNotesWithMerchandise(form.notes, merchandise);

      // Status pago/pendente aplica-se a vendas à vista (fixa) que não sejam aluguel
      const useStatus = !isVehicleRental && !isRecorrente;
      const isPaid = useStatus ? form.paymentStatus === "pago" : false;
      const saleDate = useStatus ? form.paymentDate : form.firstInstallmentDate;
      const paymentHistory = isPaid
        ? [{
            amount: total,
            date: form.paymentDate,
            type: "full" as const,
            installmentNumber: 1,
          }]
        : undefined;

      // Itens combinados em UMA única venda (venda à vista).
      // Soma SEMPRE: item principal (se preenchido) + extras adicionados.
      const hasExtras = hasExtrasEarly;
      const mainItem = hasMain
        ? { productId: form.productId, isAvulsa, description: form.description, quantity: parseInt(form.quantity) || 1, total: valorRecebido }
        : null;
      const allItems = hasExtras
        ? (mainItem ? [mainItem, ...extraItems] : [...extraItems])
        : null;

      const isComposite = hasExtras; // qualquer extra => venda composta
      const combinedDescription = isComposite
        ? allItems!.map((it) => `${it.quantity}x ${it.description}`).join(", ")
        : form.description;
      const combinedQuantity = isComposite
        ? allItems!.reduce((s, it) => s + it.quantity, 0)
        : parseInt(form.quantity) || 1;
      const combinedSubtotal = isComposite
        ? allItems!.reduce((s, it) => s + it.total, 0)
        : valorRecebido;
      const discountNum = parseFloat(form.discount) || 0;
      const combinedTotal = Math.max(0, combinedSubtotal + merchValorNum - discountNum);

      // Quando há múltiplos itens, a venda fica sem product_id (pois é composta).
      // A baixa de estoque dos produtos cadastrados é feita manualmente abaixo.
      const finalProductId = isComposite
        ? undefined
        : (form.businessType === "venda" && !isAvulsa ? (form.productId || undefined) : undefined);

      const finalPaymentHistory = isPaid
        ? [{
            amount: combinedTotal,
            date: form.paymentDate,
            type: "full" as const,
            installmentNumber: 1,
          }]
        : undefined;

      onAdd({
        productId: finalProductId,
        productName: combinedDescription,
        description: combinedDescription,
        quantity: combinedQuantity,
        unitPrice: combinedTotal,
        cost: 0,
        total: combinedTotal,
        customerName: form.customerName,
        date: saleDate,
        notes: encodedNotes,
        businessType: form.businessType as BusinessType,
        paymentMode: form.paymentMode,
        installments: isRecorrente ? installmentsNum : 1,
        paidInstallments: isPaid ? 1 : 0,
        downPayment: 0,
        frequency: isRecorrente ? form.frequency : "Mensal",
        installmentValue: null,
        installmentAmounts: amounts,
        installmentDates: dates,
        partialPaid: 0,
        paymentHistory: hasExtras ? finalPaymentHistory : paymentHistory,
        locadorId: form.businessType === "aluguel_veiculo" ? (form.locadorId || null) : null,
        foroCity: form.businessType === "aluguel_veiculo" ? (form.foroCity || null) : null,
        category: form.category || null,
      });

      // Baixa de estoque manual dos produtos cadastrados da venda combinada
      if (hasExtras && user && dataOwnerId) {
        const productAggregates = new Map<string, number>();
        for (const it of allItems!) {
          if (!it.isAvulsa && it.productId) {
            productAggregates.set(it.productId, (productAggregates.get(it.productId) || 0) + it.quantity);
          }
        }
        for (const [pid, qty] of productAggregates) {
          const prod = products.find((p) => p.id === pid);
          if (!prod) continue;
          // Decremento atômico (lock FOR UPDATE + validação server-side).
          const { error: rpcErr } = await supabase.rpc("decrement_stock_atomic" as any, {
            p_product_id: pid,
            p_owner_id: dataOwnerId,
            p_user_id: user.id,
            p_quantity: qty,
            p_sale_id: null,
            p_notes: "Venda combinada",
            p_total_value: null,
          });
          if (rpcErr) {
            const msg = String(rpcErr.message || "");
            const fnMissing = /decrement_stock_atomic|function .* does not exist|PGRST202/i.test(msg);
            if (fnMissing) {
              const newStock = Math.max(0, prod.stock - qty);
              await supabase.from("products").update({ stock: newStock }).eq("id", pid);
              await supabase.from("stock_movements" as any).insert({
                owner_id: dataOwnerId,
                user_id: user.id,
                product_id: pid,
                product_name: prod.name,
                movement_type: "venda",
                quantity: -qty,
                notes: "Venda combinada",
              } as any);
            } else {
              console.error("[SaleForm] decrement_stock_atomic failed:", rpcErr);
            }
          }
        }
      }
      setShowSuccess(true);
    } finally {
      setSubmitting(false);
    }
  };

  const update = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  const handleBusinessTypeChange = (value: string) => {
    update("businessType", value);
    if (value === "aluguel_veiculo") {
      setForm((p) => ({ ...p, businessType: value, paymentMode: "recorrente" as PaymentMode, frequency: "Diário", category: p.category === "Venda" ? "" : p.category }));
      rebuildRows(installmentsNum, firstDate, "Diário", totalNum);
    } else {
      const nextCategory = value === "venda" ? (form.category || "Venda") : (form.category === "Venda" ? "" : form.category);
      // Volta para Mensal ao sair de aluguel para outros tipos
      if (form.frequency === "Diário") {
        setForm((p) => ({ ...p, businessType: value as BusinessType, frequency: "Mensal", category: nextCategory }));
        rebuildRows(installmentsNum, firstDate, "Mensal", totalNum);
      } else {
        setForm((p) => ({ ...p, businessType: value as BusinessType, category: nextCategory }));
      }
    }
  };

  // Auto status (pago/pendente) ao mudar a data de pagamento
  const handlePaymentDateChange = (newDate: string) => {
    const today = todayInAppTz();
    setForm((p) => ({
      ...p,
      paymentDate: newDate,
      paymentStatus: newDate > today ? "pendente" : p.paymentStatus,
    }));
  };

  // Labels adaptados por tipo
  const descriptionLabel = isVehicleRental ? "Veículo / Descrição" : "Descrição";
  const descriptionPlaceholder = isVehicleRental ? "Ex: Fiat Uno 2020 - Placa ABC1234" : "Descreva o produto ou serviço";
  const isVenda = form.businessType === "venda";
  const totalLabel = isVehicleRental
    ? "Valor Total do Contrato (R$)"
    : (isVenda && merchEnabled ? "Valor Recebido em Dinheiro (R$)" : "Valor Total (R$)");
  const formTitle = isVehicleRental ? "Novo Aluguel de Veículo" : "Novo Lançamento";

  const frequencyOptions = isVehicleRental
    ? [
        { value: "Diário", label: "Diária" },
        { value: "Semanal", label: "Semanal" },
      ]
    : [
        { value: "Semanal", label: "Semanal" },
        { value: "Quinzenal", label: "Quinzenal" },
        { value: "Mensal", label: "Mensal" },
      ];

  const getHeaderIcon = () => {
    if (isVehicleRental) return <Car className="w-4 h-4" />;
    if (form.businessType === "streaming") return <Tv className="w-4 h-4" />;
    return <ShoppingBag className="w-4 h-4" />;
  };

  return (
    <FormModalOverlay className="flex items-center justify-center p-0 sm:p-4">
      <SuccessAnimation show={showSuccess} onComplete={onClose} message={isVehicleRental ? "Aluguel registrado!" : "Lançamento registrado!"} />
      <Card no3d className="modal-form-scrollable w-full h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-lg rounded-none sm:rounded-2xl border-0 sm:border border-border/80 shadow-2xl flex flex-col bg-card overflow-hidden">
        {/* Sticky Header com Safe Area Top */}
        <div className="sticky top-0 z-20 bg-card border-b border-border/60 px-4 pt-[max(env(safe-area-inset-top),0.875rem)] pb-3.5 sm:px-6 sm:py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shadow-xs">
              {getHeaderIcon()}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-foreground leading-tight">
                {formTitle}
              </h2>
              <p className="text-[11px] sm:text-xs text-muted-foreground">
                {isVehicleRental ? "Contrato e cobranças de locação de veículo" : "Cadastre uma nova venda ou serviço"}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 rounded-full hover:bg-muted/80 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
          <form id="sale-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Bloco 1: Tipo de Negócio */}
            <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tipo de Negócio *
              </Label>
              <select
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-medium"
                value={form.businessType}
                onChange={(e) => handleBusinessTypeChange(e.target.value)}
              >
                {Object.entries(businessTypeLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {isVehicleRental ? (
              /* Bloco: Aluguel de Veículos */
              <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs space-y-3.5">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Veículo *
                  </Label>
                  <Select value={form.description} onValueChange={(v) => update("description", v)}>
                    <SelectTrigger className="h-10 text-sm font-medium">
                      <SelectValue placeholder="Selecione um veículo cadastrado" />
                    </SelectTrigger>
                    <SelectContent>
                      {registeredVehicles.map((v) => (
                        <SelectItem key={v.id} value={v.marcaModelo}>
                          {v.marcaModelo}{v.placa ? ` - ${v.placa}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {locadores.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Locador *
                    </Label>
                    <Select
                      value={form.locadorId}
                      onValueChange={(v) => {
                        const loc = locadores.find((l) => l.id === v);
                        setForm((prev) => {
                          let autoForo = prev.foroCity;
                          if (!prev.foroCity && loc?.cidade) {
                            autoForo = `${loc.cidade}${loc.estado ? ` - ${loc.estado}` : ""}`;
                          }
                          return { ...prev, locadorId: v, foroCity: autoForo };
                        });
                      }}
                    >
                      <SelectTrigger className="h-10 text-sm">
                        <SelectValue placeholder="Selecione o locador" />
                      </SelectTrigger>
                      <SelectContent>
                        {locadores.map((l) => (
                          <SelectItem key={l.id} value={l.id!}>
                            {l.nome}{l.cpf ? ` - ${formatCPF(l.cpf)}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Locatário *
                  </Label>
                  <ClientCombobox
                    value={form.customerName}
                    onChange={(v) => {
                      const matched = clients.find((c) => c.name.toLowerCase() === v.toLowerCase());
                      setForm((prev) => {
                        let autoForo = prev.foroCity;
                        if (!prev.foroCity && matched?.city) {
                          autoForo = `${matched.city}${matched.state ? ` - ${matched.state}` : ""}`;
                        }
                        return { ...prev, customerName: v, foroCity: autoForo };
                      });
                    }}
                    options={clients
                      .filter((c) => c.active)
                      .map((c) => ({ id: c.id, name: c.name }))}
                    placeholder="Digite ou selecione o locatário"
                    emptyHint="Nenhum cliente cadastrado. Digite um nome para adicionar."
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Busque um cliente cadastrado ou digite um novo nome.
                  </p>
                </div>

                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2">
                  <Label className="text-xs font-semibold text-primary uppercase tracking-wider">
                    📍 Comarca do Foro (Contrato) *
                  </Label>
                  <CityCombobox
                    value={form.foroCity}
                    onChange={(v) => update("foroCity", v)}
                    placeholder="Selecione ou digite a cidade..."
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Comarca obrigatória que constará na <strong>Cláusula 8ª</strong> e na <strong>data</strong> do contrato.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {totalLabel} *
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={form.total}
                    onChange={(e) => {
                      update("total", e.target.value);
                      const totalVal = parseFloat(e.target.value) || 0;
                      const count = parseInt(form.installments) || 1;
                      if (totalVal > 0 && count > 0) {
                        const newInstVal = (totalVal / count).toFixed(2);
                        update("installmentValue", newInstVal);
                        setInstallmentRows((prev) => prev.map((r) => r.manualValue ? r : { ...r, value: newInstVal }));
                      }
                    }}
                    placeholder="0,00"
                    className="h-10 text-sm font-medium"
                    required
                  />
                </div>
              </div>
            ) : form.businessType === "venda" ? (
              /* Bloco: Vendas */
              <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs space-y-3.5">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Produto *
                  </Label>
                  <ProductCombobox
                    value={form.productId}
                    products={products}
                    onChange={(v, prod) => {
                      if (v === "__avulsa__") {
                        setForm((p) => ({
                          ...p,
                          productId: "__avulsa__",
                          description: "",
                          discount: "",
                        }));
                        return;
                      }
                      if (!v) {
                        setForm((p) => ({
                          ...p,
                          productId: "",
                          description: "",
                          total: "",
                        }));
                        return;
                      }
                      const qty = parseInt(form.quantity) || 1;
                      const newTotal = prod ? (prod.price * qty).toFixed(2) : form.total;
                      setForm((p) => ({
                        ...p,
                        productId: v,
                        description: prod?.name || "",
                        total: prod ? newTotal : p.total,
                      }));
                      if (prod && form.paymentMode === "recorrente") {
                        const count = parseInt(form.installments) || 1;
                        const totalVal = parseFloat(newTotal);
                        if (totalVal > 0 && count > 0) {
                          const newInstVal = (totalVal / count).toFixed(2);
                          setForm((pp) => ({ ...pp, installmentValue: newInstVal }));
                          setInstallmentRows((prev) => prev.map((r) => r.manualValue ? r : { ...r, value: newInstVal }));
                        }
                      }
                    }}
                    placeholder="Selecione um produto ou venda avulsa"
                  />
                </div>

                {isAvulsa && (
                  <div className="space-y-1.5 animate-in fade-in-50 duration-200">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Descrição do item *
                    </Label>
                    <Input
                      value={form.description}
                      onChange={(e) => update("description", e.target.value)}
                      placeholder="Ex: Serviço de instalação, item sem cadastro..."
                      className="h-10 text-sm font-medium"
                      required
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Venda avulsa não consome estoque nem exige cadastro de produto.
                    </p>
                  </div>
                )}

                {/* Grid 2x2 no mobile: Quantidade e Valor Total */}
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Quantidade *
                    </Label>
                    {(() => {
                      const mainQty = parseInt(form.quantity) || 0;
                      const extrasQty = extraItems.reduce((s, it) => s + it.quantity, 0);
                      const hasExtras = extrasQty > 0;
                      const displayQty = hasExtras ? String(mainQty + extrasQty) : form.quantity;
                      return (
                        <Input
                          type="number"
                          min="0"
                          value={displayQty}
                          readOnly={hasExtras}
                          className="h-10 text-sm font-medium"
                          onChange={(e) => {
                            const qStr = e.target.value;
                            const qty = parseInt(qStr) || 1;
                            const prod = products.find((p) => p.id === form.productId);
                            if (prod && isVenda) {
                              const newTotal = (prod.price * qty).toFixed(2);
                              setForm((p) => ({ ...p, quantity: qStr, total: newTotal }));
                              const count = parseInt(form.installments) || 1;
                              if (form.paymentMode === "recorrente" && count > 0) {
                                const newInstVal = (parseFloat(newTotal) / count).toFixed(2);
                                setInstallmentRows((prev) => prev.map((r) => r.manualValue ? r : { ...r, value: newInstVal }));
                                setForm((p) => ({ ...p, installmentValue: newInstVal }));
                              }
                            } else {
                              update("quantity", qStr);
                            }
                          }}
                          required
                        />
                      );
                    })()}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {totalLabel} *
                    </Label>
                    {(() => {
                      const mainVal = parseFloat(form.total) || 0;
                      const extrasSum = extraItems.reduce((s, it) => s + it.total, 0);
                      const merchVal = isVenda && merchEnabled ? (parseFloat(merchValor) || 0) : 0;
                      const disc = isVenda ? (parseFloat(form.discount) || 0) : 0;
                      const hasAdjustments = extrasSum > 0 || merchVal > 0 || disc > 0;
                      const finalDisplay = Math.max(0, mainVal + extrasSum + merchVal - disc);
                      const displayValue = hasAdjustments ? finalDisplay.toFixed(2) : form.total;
                      return (
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={displayValue}
                          readOnly={hasAdjustments}
                          className="h-10 text-sm font-medium"
                          onChange={(e) => {
                            update("total", e.target.value);
                            const totalVal = parseFloat(e.target.value) || 0;
                            const count = parseInt(form.installments) || 1;
                            if (form.paymentMode === "recorrente" && totalVal > 0 && count > 0) {
                              const newInstVal = (totalVal / count).toFixed(2);
                              update("installmentValue", newInstVal);
                              setInstallmentRows((prev) => prev.map((r) => r.manualValue ? r : { ...r, value: newInstVal }));
                            }
                          }}
                          placeholder="0,00"
                          required
                        />
                      );
                    })()}
                  </div>
                </div>

                {/* Desconto */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Desconto (R$)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.discount}
                    onChange={(e) => update("discount", e.target.value)}
                    placeholder="0,00"
                    className="h-10"
                  />
                </div>

                {/* Itens adicionais */}
                {canAddExtra && extraItems.length > 0 && (
                  <div className="space-y-2">
                    <div className="border border-border/70 rounded-xl overflow-hidden shadow-xs">
                      <div className="px-3 py-2 bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Itens adicionais ({extraItems.length})
                      </div>
                      <div className="divide-y divide-border/40">
                        {extraItems.map((it, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2 px-3 py-2 text-sm bg-card">
                            <div className="flex-1 min-w-0">
                              <p className="truncate font-medium text-foreground">{it.description}</p>
                              <p className="text-xs text-muted-foreground">
                                {it.quantity}x · {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(it.total)}
                                {it.isAvulsa ? " · avulsa" : ""}
                              </p>
                            </div>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeExtraItem(idx)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {canAddExtra && (
                  <Button type="button" variant="outline" size="sm" className="w-full h-9 rounded-xl border-dashed" onClick={handleAddExtraItem}>
                    <Plus className="h-4 w-4 mr-2" /> Adicionar outro produto à venda
                  </Button>
                )}

                {/* Resumo da Venda */}
                {(() => {
                  const mainVal = parseFloat(form.total) || 0;
                  const extrasSum = extraItems.reduce((s, it) => s + it.total, 0);
                  const merchVal = merchEnabled ? (parseFloat(merchValor) || 0) : 0;
                  const disc = parseFloat(form.discount) || 0;
                  const subtotal = mainVal + extrasSum + merchVal;
                  const finalTotal = Math.max(0, subtotal - disc);
                  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
                  return (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-1.5 shadow-xs">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Subtotal</span>
                        <span>{fmt(subtotal)}</span>
                      </div>
                      {disc > 0 && (
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Desconto</span>
                          <span className="text-destructive">− {fmt(disc)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-bold text-foreground pt-1.5 border-t border-border/40">
                        <span>Valor total da venda</span>
                        <span className="text-primary text-base">{fmt(finalTotal)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              /* Bloco: Outros tipos (ex: Streaming) */
              <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs space-y-3.5">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {descriptionLabel} *
                  </Label>
                  <Input
                    value={form.description}
                    onChange={(e) => update("description", e.target.value)}
                    placeholder={descriptionPlaceholder}
                    className="h-10 text-sm font-medium"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Quantidade *
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      value={form.quantity}
                      onChange={(e) => update("quantity", e.target.value)}
                      className="h-10 text-sm font-medium"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {totalLabel} *
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={form.total}
                      onChange={(e) => update("total", e.target.value)}
                      placeholder="0,00"
                      className="h-10 text-sm font-medium"
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Bloco: Tipo de Pagamento */}
            {!isVehicleRental && (
              <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Tipo de Pagamento *
                </Label>
                <select
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-medium"
                  value={form.paymentMode}
                  onChange={(e) => update("paymentMode", e.target.value)}
                >
                  <option value="fixa">À vista (pagamento único)</option>
                  <option value="recorrente">Parcelado</option>
                </select>
              </div>
            )}

            {/* Status de pagamento (à vista) */}
            {!isVehicleRental && form.paymentMode === "fixa" && (
              <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs space-y-3.5">
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Data de Pagamento *
                    </Label>
                    <NativeDatePicker
                      value={form.paymentDate}
                      onChange={(v) => { if (v) handlePaymentDateChange(v); }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Status *
                    </Label>
                    <Select
                      value={form.paymentStatus}
                      onValueChange={(v) => update("paymentStatus", v)}
                    >
                      <SelectTrigger className="h-10 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pago">Pago</SelectItem>
                        <SelectItem value="pendente">Pendente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {form.paymentDate > todayInAppTz() && form.paymentStatus === "pendente" && (
                  <p className="text-[11px] text-muted-foreground">
                    Data futura: a venda será registrada como valor a receber.
                  </p>
                )}
              </div>
            )}

            {/* Campos de parcelamento/recorrência */}
            {(form.paymentMode === "recorrente" || isVehicleRental) && (
              <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs space-y-3.5">
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {isVehicleRental ? "Período" : "Frequência"} *
                    </Label>
                    <Select value={form.frequency} onValueChange={(v) => {
                      update("frequency", v);
                      rebuildRows(installmentsNum, firstDate, v, totalNum);
                    }}>
                      <SelectTrigger className="h-10 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {frequencyOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {isVehicleRental ? "Início" : "1ª Parcela"} *
                    </Label>
                    <NativeDatePicker
                      value={format(firstDate, "yyyy-MM-dd")}
                      onChange={(v) => {
                        if (!v) return;
                        const d = new Date(`${v}T00:00:00`);
                        update("firstInstallmentDate", v);
                        rebuildRows(installmentsNum, d, form.frequency, totalNum);
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {isVehicleRental ? "Nº de Períodos" : "Nº de Parcelas"} *
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      value={form.installments}
                      onChange={(e) => {
                        const newCount = parseInt(e.target.value) || 1;
                        update("installments", e.target.value);
                        rebuildRows(newCount, firstDate, form.frequency, totalNum);
                      }}
                      className="h-10"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {isVehicleRental ? "Valor Período (R$)" : "Valor Parcela (R$)"}
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={form.installmentValue}
                      onChange={(e) => {
                        const parcVal = parseFloat(e.target.value) || 0;
                        const count = parseInt(form.installments) || 1;
                        update("installmentValue", e.target.value);
                        if (parcVal > 0) {
                          update("total", (parcVal * count).toFixed(2));
                          setInstallmentRows((prev) => prev.map((r) => r.manualValue ? r : { ...r, value: parcVal.toFixed(2) }));
                        }
                      }}
                      placeholder="0,00"
                      className="h-10"
                    />
                  </div>
                </div>

                {isVehicleRental && installmentsNum > 0 && (
                  <div className="rounded-xl border border-border/70 bg-muted/30 px-3.5 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CalendarIcon className="h-4 w-4 text-primary" />
                      <span>Término do contrato:</span>
                    </div>
                    <span className="text-xs font-semibold text-foreground">
                      {format(addByFrequency(firstDate, form.frequency, installmentsNum), "dd/MM/yyyy")}
                    </span>
                  </div>
                )}

                {/* Parcelas editáveis */}
                {installmentsNum >= 2 && installmentRows.length > 0 && (
                  <div className="border border-border/70 rounded-xl overflow-hidden shadow-xs">
                    <div className="px-3.5 py-2 bg-muted/40">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {isVehicleRental ? `Cobranças (${installmentRows.length})` : `Parcelas (${installmentRows.length})`}
                      </span>
                    </div>
                    <div className="divide-y divide-border/40 max-h-48 overflow-y-auto">
                      {installmentRows.map((row, idx) => (
                        <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-card">
                          <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-muted/60 text-muted-foreground shrink-0">
                            {idx + 1}ª
                          </span>
                          <NativeDatePicker
                            value={row.date}
                            onChange={(v) => {
                              if (v) {
                                setInstallmentRows((prev) => {
                                  const rows = [...prev];
                                  rows[idx] = { ...rows[idx], date: v, manualDate: true };
                                  return rows;
                                });
                              }
                            }}
                            className="h-8 text-xs flex-1"
                          />
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.value}
                            onChange={(e) => {
                              setInstallmentRows((prev) => {
                                const rows = [...prev];
                                const newVal = e.target.value;
                                rows[idx] = { ...rows[idx], value: newVal, manualValue: true };
                                const nonManualIndexes = rows.map((r, i) => i).filter(i => i !== idx && !rows[i].manualValue);
                                if (nonManualIndexes.length > 0) {
                                  const manualSum = rows.reduce((s, r, i) => (i === idx || r.manualValue) ? s + (parseFloat(r.value) || 0) : s, 0);
                                  const remaining = Math.max(0, totalNum - manualSum);
                                  const otherVal = (remaining / nonManualIndexes.length).toFixed(2);
                                  for (const i of nonManualIndexes) {
                                    rows[i] = { ...rows[i], value: otherVal };
                                  }
                                }
                                return rows;
                              });
                            }}
                            className="h-8 w-24 text-xs text-right"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="px-3.5 py-2 bg-muted/40">
                      <p className="text-xs text-muted-foreground">
                        Total: <span className="font-bold text-foreground">
                          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                            installmentRows.reduce((s, r) => s + (parseFloat(r.value) || 0), 0)
                          )}
                        </span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Cliente */}
            {!isVehicleRental && (
              <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Cliente *
                </Label>
                <ClientCombobox
                  value={form.customerName}
                  onChange={(v) => update("customerName", v)}
                  options={clients
                    .filter((c) => c.active)
                    .map((c) => ({ id: c.id, name: c.name }))}
                  placeholder="Digite ou selecione um cliente"
                  emptyHint="Nenhum cliente cadastrado. Digite um nome para adicionar."
                />
              </div>
            )}

            {/* Mercadoria como Pagamento */}
            {isVenda && (
              <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wider text-foreground">
                      Mercadoria como parte do pagamento
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Abate o valor da venda com um produto dado em troca
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMerchEnabled((v) => !v);
                      setMerchError(null);
                    }}
                    className={cn(
                      "text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors",
                      merchEnabled
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted/40"
                    )}
                  >
                    {merchEnabled ? "Ativado" : "Adicionar"}
                  </button>
                </div>
                {merchEnabled && (
                  <div className="space-y-3 pt-2 border-t border-border/40 animate-in fade-in-50 duration-200">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Descrição do produto</Label>
                      <Input
                        value={merchDescricao}
                        onChange={(e) => setMerchDescricao(e.target.value)}
                        placeholder="Ex: Celular usado, bicicleta..."
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Valor da mercadoria (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={merchValor}
                        onChange={(e) => setMerchValor(e.target.value)}
                        placeholder="0,00"
                        className="h-10"
                      />
                    </div>
                    {merchError && (
                      <p className="text-xs text-destructive">{merchError}</p>
                    )}
                    {(parseFloat(merchValor) || 0) > 0 && (
                      <div className="text-xs text-muted-foreground border-t border-border/40 pt-2 space-y-0.5">
                        <p>Recebido em dinheiro: <span className="font-medium text-foreground">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(form.total) || 0)}</span></p>
                        <p>Mercadoria: <span className="font-medium text-foreground">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(merchValor) || 0)}</span></p>
                        <p>Total da venda: <span className="font-bold text-primary">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((parseFloat(form.total) || 0) + (parseFloat(merchValor) || 0))}</span></p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Categoria */}
            <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Categoria
              </Label>
              <SaleCategoryPicker value={form.category} onChange={(v) => update("category", v)} />
            </div>

            {/* Observações */}
            <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Observações
              </Label>
              <Input
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Notas ou detalhes desta venda..."
                className="h-10"
              />
            </div>
          </form>
        </div>

        {/* Sticky Footer com Safe Area Bottom */}
        <div className="sticky bottom-0 z-20 bg-card border-t border-border/60 p-4 sm:p-6 pb-[max(env(safe-area-inset-bottom),1rem)] sm:pb-6 shrink-0">
          <Button
            type="submit"
            form="sale-form"
            className="w-full h-12 text-sm font-semibold rounded-xl shadow-md transition-all active:scale-[0.99]"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Registrando...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                {isVehicleRental ? "Registrar Aluguel" : "Registrar Lançamento"}
              </>
            )}
          </Button>
        </div>
      </Card>
    </FormModalOverlay>
  );
}

