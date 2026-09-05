import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NativeDatePicker } from "@/components/ui/native-date-picker";
import { Save, X, Calendar as CalendarIcon } from "lucide-react";
import { Sale, BusinessType, PaymentMode, Client } from "@/types/loan";
import { LocadorInfo } from "@/features/vehicles/hooks/useLocadorInfo";
import { VehicleInfo } from "@/features/vehicles/hooks/useVehicleRegistry";
import { format, addMonths, addWeeks, addDays } from "date-fns";
import { formatCPF } from "@/lib/brDocuments";

function addByFrequency(date: Date, frequency: string, n: number): Date {
  if (["Diário", "Diária", "Diario", "Diaria", "daily"].includes(frequency)) return addDays(date, n);
  if (frequency === "Semanal") return addWeeks(date, n);
  if (frequency === "Quinzenal") return addDays(date, n * 15);
  return addMonths(date, n);
}
import { cn } from "@/lib/utils";
import { encodeNotesWithMerchandise, parseNotesWithMerchandise } from "@/features/sales/lib/saleMerchandise";
import { ClientCombobox } from "@/components/ui/client-combobox";
import { CityCombobox } from "@/components/ui/city-combobox";
import { SaleCategoryPicker } from "@/features/sales/components/SaleCategoryPicker";
import { toast } from "sonner";

const businessTypeLabels: Record<BusinessType, string> = {
  venda: "Venda",
  streaming: "Streaming",
  aluguel_veiculo: "Aluguel de Veículo",
};

interface Props {
  sale: Sale;
  onSave: (id: string, data: Partial<Omit<Sale, "id">>) => void;
  onClose: () => void;
  clients?: Client[];
  registeredVehicles?: VehicleInfo[];
  locadores?: LocadorInfo[];
}

export function SaleEditForm({ sale, onSave, onClose, clients = [], registeredVehicles = [], locadores = [] }: Props) {
  const initInstVal = () => {
    if (sale.installmentValue != null && sale.installmentValue > 0) return sale.installmentValue.toFixed(2);
    const count = sale.installments || 1;
    const down = sale.downPayment || 0;
    return count > 0 ? ((sale.total - down) / count).toFixed(2) : "0";
  };

  const initialParsed = parseNotesWithMerchandise(sale.notes);
  const [form, setForm] = useState({
    description: sale.description || sale.productName,
    customerName: sale.customerName,
    cost: String(sale.cost || 0),
    total: String(sale.total),
    quantity: String(sale.quantity),
    installments: String(sale.installments),
    paidInstallments: String(sale.paidInstallments),
    downPayment: String(sale.downPayment || 0),
    installmentValue: initInstVal(),
    paymentMode: sale.paymentMode,
    businessType: sale.businessType,
    date: sale.date,
    notes: initialParsed.userNotes,
    frequency: sale.frequency || "Mensal",
    locadorId: sale.locadorId || (locadores.length === 1 ? (locadores[0].id || "") : ""),
    foroCity: sale.foroCity || "",
    category: sale.category || "",
  });
  const initialMerchValue = initialParsed.merchandise?.valor || 0;
  const [merchEnabled, setMerchEnabled] = useState<boolean>(!!initialParsed.merchandise);
  const [merchDescricao, setMerchDescricao] = useState<string>(initialParsed.merchandise?.descricao || "");
  const [merchValor, setMerchValor] = useState<string>(initialParsed.merchandise ? String(initialParsed.merchandise.valor) : "");
  const [cashValor, setCashValor] = useState<string>(Math.max(0, sale.total - initialMerchValue).toFixed(2));
  const [merchError, setMerchError] = useState<string | null>(null);

  // Generate initial installment rows
  const initRows = (): { date: string; value: string; manualDate?: boolean; manualValue?: boolean }[] => {
    const count = sale.installments || 1;
    const baseDate = new Date(sale.date + "T00:00:00");
    const down = sale.downPayment || 0;
    const freq = sale.frequency || "Mensal";
    const baseValue = count > 0 ? Math.max(0, sale.total - down) / count : 0;
    const amounts = sale.installmentAmounts;
    const dates = sale.installmentDates;
    return Array.from({ length: count }, (_, i) => ({
      date: dates && dates[i] ? dates[i] : addByFrequency(baseDate, freq, i).toISOString().split("T")[0],
      value: amounts && amounts[i] != null ? amounts[i].toFixed(2) : baseValue.toFixed(2),
      manualDate: dates && dates[i] ? true : false,
      manualValue: amounts && amounts[i] != null ? true : false,
    }));
  };
  const [installmentRows, setInstallmentRows] = useState(initRows);

  const totalNum = parseFloat(form.total) || 0;
  const costNum = parseFloat(form.cost) || 0;
  const downPaymentNum = parseFloat(form.downPayment) || 0;
  const installmentsNum = parseInt(form.installments) || 1;
  const remainingForInstallments = Math.max(0, totalNum - downPaymentNum);
  const installmentValue = installmentsNum > 0 ? remainingForInstallments / installmentsNum : 0;
  const lucro = totalNum - costNum;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.businessType === "aluguel_veiculo" && !form.foroCity?.trim()) {
      toast.error("Informe a Comarca do Foro para o contrato de locação.");
      return;
    }
    const allowMerch = form.businessType === "venda";
    let merchandise: { descricao: string; valor: number } | null = null;
    let finalTotal = totalNum;
    if (allowMerch && merchEnabled) {
      const cash = parseFloat(cashValor) || 0;
      const valor = parseFloat(merchValor) || 0;
      const descricao = merchDescricao.trim();
      if (cash < 0) {
        setMerchError("Valor recebido em dinheiro deve ser maior ou igual a zero.");
        return;
      }
      if (valor < 0) {
        setMerchError("Valor da mercadoria deve ser maior ou igual a zero.");
        return;
      }
      if (valor > 0 && !descricao) {
        setMerchError("Descrição da mercadoria é obrigatória quando há valor.");
        return;
      }
      finalTotal = Number((cash + valor).toFixed(2));
      if (valor > 0 && descricao) merchandise = { descricao, valor };
    }
    setMerchError(null);
    const amounts = form.paymentMode === "recorrente" && installmentRows.length > 0
      ? installmentRows.map(r => parseFloat(r.value) || 0)
      : null;
    const dates = form.paymentMode === "recorrente" && installmentRows.length > 0
      ? installmentRows.map(r => r.date)
      : null;
    const encodedNotes = encodeNotesWithMerchandise(form.notes, merchandise);
    onSave(sale.id, {
      description: form.description,
      productName: form.description,
      customerName: form.customerName,
      cost: costNum,
      total: finalTotal,
      quantity: parseInt(form.quantity) || 1,
      installments: form.paymentMode === "recorrente" ? installmentsNum : 1,
      paidInstallments: parseInt(form.paidInstallments) || 0,
      downPayment: downPaymentNum,
      paymentMode: form.paymentMode as PaymentMode,
      businessType: form.businessType as BusinessType,
      date: form.date,
      notes: encodedNotes,
      frequency: form.paymentMode === "recorrente" ? form.frequency : "Mensal",
      installmentValue: null,
      installmentAmounts: amounts,
      installmentDates: dates,
      locadorId: form.businessType === "aluguel_veiculo" ? (form.locadorId || null) : null,
      foroCity: form.businessType === "aluguel_veiculo" ? (form.foroCity || null) : null,
      category: form.category || null,
    });
    onClose();
  };

  const update = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));
  const syncMixedTotal = (cashRaw: string, merchRaw: string) => {
    const cash = parseFloat(cashRaw) || 0;
    const merch = parseFloat(merchRaw) || 0;
    update("total", Math.max(0, cash + merch).toFixed(2));
  };

  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-stretch justify-center p-0 sm:items-center sm:p-4">
      <Card className="modal-form-scrollable !bg-card !backdrop-blur-none supports-[backdrop-filter]:!bg-card dark:!bg-card w-full h-[100dvh] max-h-[100dvh] rounded-none border-0 overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:h-auto sm:max-h-[90vh] sm:max-w-md sm:rounded-2xl sm:border sm:pt-0 sm:pb-0">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">Editar Venda</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
        </CardHeader>
        <CardContent className="pb-8 sm:pb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Tipo de Negócio</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.businessType}
                onChange={(e) => update("businessType", e.target.value)}
              >
                {Object.entries(businessTypeLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>{form.businessType === "aluguel_veiculo" ? "Locatário" : "Cliente"}</Label>
              <ClientCombobox
                value={form.customerName}
                onChange={(v) => {
                  const matched = clients.find((c) => c.name.toLowerCase() === v.toLowerCase());
                  setForm((prev) => {
                    let autoForo = prev.foroCity;
                    if (form.businessType === "aluguel_veiculo" && !prev.foroCity && matched?.city) {
                      autoForo = `${matched.city}${matched.state ? ` - ${matched.state}` : ""}`;
                    }
                    return { ...prev, customerName: v, foroCity: autoForo };
                  });
                }}
                options={clients
                  .filter((c) => c.active)
                  .map((c) => ({ id: c.id, name: c.name }))}
                placeholder={form.businessType === "aluguel_veiculo" ? "Digite ou selecione o locatário" : "Digite ou selecione um cliente"}
                emptyHint="Nenhum cliente cadastrado. Digite um nome para adicionar."
              />
            </div>

            {form.businessType === "aluguel_veiculo" ? (
              <>
              <div>
                <Label>Veículo</Label>
                <Select value={form.description} onValueChange={(v) => update("description", v)}>
                  <SelectTrigger>
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
                <div>
                  <Label>Locador</Label>
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
                    <SelectTrigger>
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
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                <Label className="text-xs font-semibold text-primary">📍 Comarca do Foro (Contrato) *</Label>
                <CityCombobox
                  value={form.foroCity}
                  onChange={(v) => update("foroCity", v)}
                  placeholder="Selecione ou digite a cidade..."
                />
                <p className="text-[11px] text-muted-foreground">
                  Comarca obrigatória que constará na <strong>Cláusula 8ª</strong> e na <strong>data</strong> do contrato.
                </p>
              </div>
              </>
            ) : (
              <div>
                <Label>Produto / Descrição</Label>
                <Input value={form.description} onChange={(e) => update("description", e.target.value)} required />
              </div>
            )}

            <div>
              <Label>Data da Venda</Label>
              <NativeDatePicker
                value={form.date || ""}
                onChange={(v) => { if (v) update("date", v); }}
                placeholder="Selecione"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valor Custo (R$)</Label>
                <Input type="number" step="0.01" min="0" value={form.cost} onChange={(e) => update("cost", e.target.value)} />
              </div>
              <div>
                <Label>Valor Venda (R$)</Label>
                <Input type="number" step="0.01" min="0.01" value={form.total} onChange={(e) => {
                  update("total", e.target.value);
                  const totalVal = parseFloat(e.target.value) || 0;
                  const down = parseFloat(form.downPayment) || 0;
                  const count = parseInt(form.installments) || 1;
                  if (form.paymentMode === "recorrente" && count > 0) {
                    const newInstVal = ((totalVal - down) / count).toFixed(2);
                    update("installmentValue", newInstVal);
                  }
                }} required />
              </div>
            </div>

            {/* Lucro calculado */}
            <div className={`rounded-lg px-3 py-2 border ${lucro >= 0 ? "bg-success/5 border-success/20" : "bg-destructive/5 border-destructive/20"}`}>
              <p className="text-xs text-muted-foreground">Lucro estimado</p>
              <p className={`text-sm font-bold ${lucro >= 0 ? "text-success" : "text-destructive"}`}>{fmt(lucro)}</p>
            </div>

            <div>
              <Label>Quantidade</Label>
              <Input type="number" min="1" value={form.quantity} onChange={(e) => update("quantity", e.target.value)} />
            </div>

            <div>
              <Label>Tipo de Pagamento</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.paymentMode}
                onChange={(e) => update("paymentMode", e.target.value)}
              >
                <option value="fixa">Fixa (pagamento único)</option>
                <option value="recorrente">Recorrente (parcelado)</option>
              </select>
            </div>

            {form.paymentMode === "recorrente" && (
              <>
                <div>
                  <Label>Frequência</Label>
                  <Select value={form.frequency} onValueChange={(v) => {
                    update("frequency", v);
                    // Recalculate only non-manual dates
                    setInstallmentRows((prev) => {
                      const baseDate = new Date(form.date + "T00:00:00");
                      return prev.map((r, i) => ({
                        ...r,
                        date: r.manualDate ? r.date : addByFrequency(baseDate, v, i).toISOString().split("T")[0],
                      }));
                    });
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {form.businessType === "aluguel_veiculo" ? (
                        <>
                          <SelectItem value="Diário">Diária</SelectItem>
                          <SelectItem value="Semanal">Semanal</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="Semanal">Semanal</SelectItem>
                          <SelectItem value="Quinzenal">Quinzenal</SelectItem>
                          <SelectItem value="Mensal">Mensal</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Entrada (R$)</Label>
                  <Input type="number" step="0.01" min="0" value={form.downPayment} onChange={(e) => update("downPayment", e.target.value)} placeholder="0,00" />
                </div>
                <div>
                  <Label>Valor da Parcela (R$)</Label>
                  <Input type="number" step="0.01" min="0.01" value={form.installmentValue} onChange={(e) => {
                    const parcVal = parseFloat(e.target.value) || 0;
                    const count = parseInt(form.installments) || 1;
                    const down = parseFloat(form.downPayment) || 0;
                    update("installmentValue", e.target.value);
                    const newTotal = parcVal * count + down;
                    update("total", newTotal.toFixed(2));
                    setInstallmentRows((prev) => prev.map((r) => ({ ...r, value: parcVal.toFixed(2) })));
                  }} placeholder="0,00" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Qtd. Parcelas</Label>
                    <Input type="number" min="1" value={form.installments} onChange={(e) => {
                      const newCount = parseInt(e.target.value) || 1;
                      update("installments", e.target.value);
                      const instVal = parseFloat(form.installmentValue) || (remainingForInstallments / newCount);
                      update("installmentValue", instVal.toFixed(2));
                      setInstallmentRows((prev) => {
                        const rows = [...prev];
                        const baseDate = new Date(form.date + "T00:00:00");
                        while (rows.length < newCount) {
                          const d = addByFrequency(baseDate, form.frequency, rows.length);
                          rows.push({ date: d.toISOString().split("T")[0], value: instVal.toFixed(2), manualDate: false, manualValue: false });
                        }
                        while (rows.length > newCount) rows.pop();
                        return rows.map((r) => ({ ...r, value: r.manualValue ? r.value : instVal.toFixed(2) }));
                      });
                    }} />
                  </div>
                  <div>
                    <Label>Parcelas Pagas</Label>
                    <Input type="number" min="0" max={form.installments} value={form.paidInstallments} onChange={(e) => update("paidInstallments", e.target.value)} />
                  </div>
                </div>

                {form.businessType === "aluguel_veiculo" && (parseInt(form.installments) || 0) > 0 && (
                  <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <CalendarIcon className="h-4 w-4 text-primary" />
                      <span className="text-muted-foreground">Data fim do contrato:</span>
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      {format(addByFrequency(new Date(form.date + "T00:00:00"), form.frequency, parseInt(form.installments) || 0), "dd/MM/yyyy")}
                    </span>
                  </div>
                )}

                {/* Individual installments */}
                <div className="border border-border/50 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/20">
                    <span className="text-sm font-medium text-foreground">Parcelas ({installmentRows.length})</span>
                    <div className="flex gap-3">
                      <span className="text-xs font-medium text-success">{parseInt(form.paidInstallments) || 0} pagas</span>
                      <span className="text-xs font-medium text-warning">{Math.max(0, installmentRows.length - (parseInt(form.paidInstallments) || 0))} pendentes</span>
                    </div>
                  </div>
                  <div className="divide-y divide-border/30 max-h-64 overflow-y-auto">
                    {installmentRows.map((row, idx) => {
                      const isPaid = idx < (parseInt(form.paidInstallments) || 0);
                      return (
                        <div key={idx} className="flex items-center gap-2 px-3 py-2.5">
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            isPaid ? "bg-success/20 text-success" : "bg-muted/40 text-muted-foreground"
                          }`}>
                            {idx + 1}ª
                          </span>
                          <div className="flex-1">
                            <NativeDatePicker
                              value={row.date}
                              onChange={(v) => {
                                if (!v) return;
                                setInstallmentRows((prev) => {
                                  const rows = [...prev];
                                  rows[idx] = { ...rows[idx], date: v, manualDate: true };
                                  return rows;
                                });
                              }}
                              className="h-8 text-xs"
                            />
                          </div>
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
                                // Auto-adjust: redistribute across non-manual rows
                                const nonManualIndexes = rows.map((r, i) => i).filter(i => i !== idx && !rows[i].manualValue);
                                if (nonManualIndexes.length > 0) {
                                  const manualSum = rows.reduce((s, r, i) => (i === idx || r.manualValue) ? s + (parseFloat(r.value) || 0) : s, 0);
                                  const remaining = Math.max(0, remainingForInstallments - manualSum);
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
                          <span className={`text-xs font-medium w-16 text-right shrink-0 ${isPaid ? "text-success" : "text-muted-foreground"}`}>
                            {isPaid ? "Paga" : "Pendente"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-muted/30 border border-border/50 rounded-lg p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Total das parcelas</p>
                      <p className="text-sm font-bold text-foreground">{fmt(installmentRows.reduce((s, r) => s + (parseFloat(r.value) || 0), 0))}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total restante</p>
                      <p className="text-sm font-bold text-foreground">{fmt(
                        installmentRows.reduce((s, r, i) => i >= (parseInt(form.paidInstallments) || 0) ? s + (parseFloat(r.value) || 0) : s, 0)
                      )}</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {form.businessType === "venda" && (
              <div className="border border-border/50 rounded-lg p-3 space-y-3 bg-muted/10">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Mercadoria como pagamento</Label>
                  <button
                    type="button"
                    onClick={() => { setMerchEnabled((v) => !v); setMerchError(null); }}
                    className={cn(
                      "text-xs px-2 py-1 rounded-md border transition-colors",
                      merchEnabled
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted/40"
                    )}
                  >
                    {merchEnabled ? "Ativada" : "Adicionar"}
                  </button>
                </div>
                {merchEnabled && (
                  <>
                    <div>
                      <Label className="text-xs">Descrição do produto</Label>
                      <Input value={merchDescricao} onChange={(e) => setMerchDescricao(e.target.value)} placeholder="Ex: Celular usado..." />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Valor da mercadoria (R$)</Label>
                        <Input type="number" step="0.01" min="0" value={merchValor} onChange={(e) => {
                          const nextMerch = e.target.value;
                          setMerchValor(nextMerch);
                          syncMixedTotal(cashValor, nextMerch);
                        }} placeholder="0,00" />
                      </div>
                      <div>
                        <Label className="text-xs">Recebido em dinheiro (R$)</Label>
                        <Input type="number" step="0.01" min="0" value={cashValor} onChange={(e) => {
                          const nextCash = e.target.value;
                          setCashValor(nextCash);
                          syncMixedTotal(nextCash, merchValor);
                        }} placeholder="0,00" />
                      </div>
                    </div>
                    {merchError && <p className="text-xs text-destructive">{merchError}</p>}
                    <p className="text-[11px] text-muted-foreground">
                      Total da venda: <span className="font-medium text-foreground">{fmt(totalNum)}</span> (dinheiro + mercadoria, atualizado automaticamente).
                    </p>
                  </>
                )}
              </div>
            )}

            <div>
              <Label>Categoria</Label>
              <SaleCategoryPicker value={form.category} onChange={(v) => update("category", v)} />
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Anotações sobre esta venda..."
                rows={3}
              />
            </div>

            <Button type="submit" className="w-full">
              <Save className="h-4 w-4 mr-2" /> Salvar Alterações
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
