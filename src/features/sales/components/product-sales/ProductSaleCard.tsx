import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Clock,
  FileText,
  HandCoins,
  Pencil,
  Receipt,
  ShoppingCart,
  Trash2,
  User,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { WarrantyManager } from "@/components/warranty/WarrantyManager";
import { usePaymentCelebration } from "@/hooks/usePaymentCelebration";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { Client, Sale } from "@/types/loan";
import { LocadorInfo } from "@/features/vehicles/hooks/useLocadorInfo";
import { VehicleInfo } from "@/features/vehicles/hooks/useVehicleRegistry";
import { parseNotesWithMerchandise } from "@/features/sales/lib/saleMerchandise";
import { generateContract } from "@/lib/generateContract";
import { addByFrequency, businessTabs, getSaleCategory, rawFormatCurrency, saleCategoryConfig } from "./productSalesUtils";
import { RegisterSalePaymentDialog, SalePaymentHistoryDialog } from "./ProductSalesDialogs";
import { AdjustSaleDueDateDialog } from "./AdjustSaleDueDateDialog";
import { toast } from "sonner";

export function ProductSaleCard({
  sale,
  onDelete,
  onEdit,
  onUpdate,
  formatCurrency,
  readOnly = false,
  clients = [],
  locadorInfo,
  registeredVehicles = [],
  locadores = [],
}: {
  sale: Sale;
  onDelete: () => void;
  onEdit: () => void;
  onUpdate: (data: Partial<Omit<Sale, "id">>) => void;
  formatCurrency: (v: number) => string;
  readOnly?: boolean;
  clients?: Client[];
  locadorInfo?: LocadorInfo;
  registeredVehicles?: VehicleInfo[];
  locadores?: LocadorInfo[];
}) {
  const { celebrate } = usePaymentCelebration();
  const { activeMethods } = usePaymentMethods();
  const methodById = useMemo(() => {
    const m = new Map<string, { name: string; icon: string | null }>();
    activeMethods.forEach((pm) => m.set(pm.id, { name: pm.name, icon: pm.icon }));
    return m;
  }, [activeMethods]);
  const [showPartial, setShowPartial] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [partialDate, setPartialDate] = useState<Date | undefined>(undefined);
  const [partialMethodId, setPartialMethodId] = useState<string | null>(null);
  const [partialNotes, setPartialNotes] = useState("");
  const [fullMethodId, setFullMethodId] = useState<string | null>(null);
  const [fullNotes, setFullNotes] = useState("");
  const [fullDate, setFullDate] = useState<Date | undefined>(undefined);
  const [showParcelas, setShowParcelas] = useState(false);
  const [showPayDatePicker, setShowPayDatePicker] = useState(false);
  const [showAdjustDue, setShowAdjustDue] = useState(false);
  const [showPayments, setShowPayments] = useState(false);
  const [confirmDeleteSale, setConfirmDeleteSale] = useState(false);
  const TabIcon = businessTabs.find((t) => t.type === sale.businessType)?.icon || ShoppingCart;
  const isRecorrente = sale.paymentMode === "recorrente" && sale.installments > 1;
  const amounts = sale.installmentAmounts;
  const defaultValorParcela = sale.installments > 0 ? Math.max(0, sale.total - (sale.downPayment || 0)) / sale.installments : sale.total;
  const getParcelaValue = (idx: number) => amounts && amounts[idx] != null ? amounts[idx] : defaultValorParcela;
  const valorParcela = defaultValorParcela;
  const isPaid = isRecorrente ? sale.paidInstallments >= sale.installments : sale.paidInstallments >= 1;
  const pendentes = isRecorrente ? sale.installments - sale.paidInstallments : (sale.paidInstallments >= 1 ? 0 : 1);
  const category = getSaleCategory(sale);
  const catStyle = saleCategoryConfig[category];
  const normalizeClientName = (value?: string) =>
    (value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  const saleClientName = normalizeClientName(sale.customerName);
  const matchedClients = saleClientName
    ? clients.filter((client) => normalizeClientName(client.name) === saleClientName)
    : [];
  const matchedClient =
    matchedClients.find((client) => client.isVehicleRental || client.rg || client.city) ?? matchedClients[0];

  const totalParcelas = isRecorrente ? sale.installments : 1;
  const parcelas = Array.from({ length: totalParcelas }, (_, i) => {
    const instBaseDate = new Date(sale.date + "T00:00:00");
    const customDate = sale.installmentDates && sale.installmentDates[i];
    const dueDate = customDate ? new Date(customDate + "T00:00:00") : (isRecorrente ? addByFrequency(instBaseDate, sale.frequency || "Mensal", i) : instBaseDate);
    const baseValue = getParcelaValue(i);
    const isNextPending = i === sale.paidInstallments;
    const displayValue = isNextPending && (sale.partialPaid || 0) > 0 ? Math.max(0, baseValue - (sale.partialPaid || 0)) : baseValue;
    return {
      number: i + 1,
      date: format(dueDate, "dd/MM/yyyy"),
      rawDate: dueDate,
      value: displayValue,
      fullValue: baseValue,
      paid: i < sale.paidInstallments,
    };
  });

  return (
    <>
    <Card no3d className={`overflow-hidden hover:shadow-[0_4px_16px_-6px_hsl(0_0%_0%/0.08)] hover:-translate-y-[1px] transition-all duration-400 ease-out border ${catStyle.border} ${catStyle.bg} h-full flex flex-col`}>
      <div className={`border-b px-4 py-2.5 text-center ${catStyle.header}`}>
        <h3 className="font-bold text-foreground text-sm truncate">{sale.customerName || sale.description || sale.productName}</h3>
      </div>

      <CardContent className="p-4 flex-1 flex flex-col gap-3">
        <div className="flex items-center gap-3 h-10">
          <div className={`h-10 w-10 rounded-full flex items-center justify-center text-primary-foreground font-bold text-xs shrink-0 ${
            isPaid ? "bg-success" : "gradient-primary"
          }`}>
            <TabIcon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{sale.description || sale.productName}</p>
            {sale.customerName ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                <User className="h-3 w-3 shrink-0" />{sale.customerName}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">&nbsp;</p>
            )}
          </div>
          <Badge className={`${catStyle.badge} text-xs shrink-0`}>{catStyle.label}</Badge>
        </div>

        {!isPaid && (() => {
          const nextIdx = sale.paidInstallments;
          const nextParcela = parcelas[nextIdx];
          if (!nextParcela) return null;
          const dueDate = nextParcela.rawDate;
          const today = new Date();
          const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const dueNorm = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
          const diff = Math.floor((todayNorm.getTime() - dueNorm.getTime()) / (1000 * 60 * 60 * 24));
          const isOverdue = diff > 0;
          const isToday = diff === 0;
          return (
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 border ${
              isOverdue ? "bg-destructive/10 border-destructive/30" : isToday ? "bg-warning/10 border-warning/30" : "bg-primary/10 border-primary/30"
            }`}>
              <Clock className={`h-4 w-4 shrink-0 ${isOverdue ? "text-destructive" : isToday ? "text-warning" : "text-primary"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Vencimento ({nextIdx + 1}ª parcela)</p>
                <p className={`text-sm font-bold ${isOverdue ? "text-destructive" : isToday ? "text-warning" : "text-primary"}`}>
                  {format(dueDate, "dd/MM/yyyy")}
                  {isOverdue && <span className="text-xs font-normal ml-1">({diff} dias atrás)</span>}
                  {isToday && <span className="text-xs font-normal ml-1">(hoje)</span>}
                </p>
              </div>
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 shrink-0 gap-1 text-xs"
                  onClick={() => setShowAdjustDue(true)}
                  aria-label="Alterar data de vencimento"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Alterar
                </Button>
              )}
            </div>
          );
        })()}

        <div className="grid grid-cols-2 gap-3 border border-border/30 rounded-xl p-3">
          <div>
            <p className="text-xs text-muted-foreground">Valor Total</p>
            <p className="text-sm font-bold text-foreground">{formatCurrency(sale.total)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{isRecorrente ? "Valor Parcela" : "Quantidade"}</p>
            <p className="text-sm font-bold text-foreground">{isRecorrente ? (amounts ? "Variável" : formatCurrency(valorParcela)) : sale.quantity}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Valor Pago</p>
            <p className="text-sm font-bold text-success">{formatCurrency(parcelas.filter(p => p.paid).reduce((s, p) => s + p.fullValue, 0) + (sale.downPayment || 0) + (sale.partialPaid || 0))}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Restante</p>
            <p className="text-sm font-bold text-warning">{formatCurrency(Math.max(0, parcelas.filter(p => !p.paid).reduce((s, p) => s + p.fullValue, 0) - (sale.partialPaid || 0)))}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 h-[52px]">
          <div className="bg-success/5 border border-success/20 rounded-lg px-3 py-2">
            <p className="text-xs text-muted-foreground">Pagas</p>
            <p className="text-sm font-bold text-success">{sale.paidInstallments}/{sale.installments}</p>
          </div>
          <div className="bg-muted/30 border border-border/50 rounded-lg px-3 py-2">
            <p className="text-xs text-muted-foreground">Pendentes</p>
            <p className="text-sm font-bold text-foreground">{pendentes}</p>
          </div>
        </div>

        <div className="border border-border/50 rounded-lg overflow-hidden">
            <button type="button"
              onClick={() => setShowParcelas(!showParcelas)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/20 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-foreground">Parcelas ({totalParcelas})</span>
              </div>
              <div className="flex items-center gap-2">
                {showParcelas ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>
            {showParcelas && (
              <div className="divide-y divide-border/30 max-h-48 overflow-y-auto">
                {parcelas.map((p) => (
                  <div key={p.number} className="flex items-center gap-3 px-3 py-2.5">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      p.paid ? "bg-success/20 text-success" : "bg-muted/40 text-muted-foreground"
                    }`}>
                      {p.number}ª
                    </span>
                    <span className="text-sm text-foreground flex-1">{p.date}</span>
                    <span className="text-sm font-medium text-foreground tabular-nums">{formatCurrency(p.value)}</span>
                    {(() => {
                      const today = new Date(); today.setHours(0,0,0,0);
                      const isOverdue = !p.paid && p.rawDate < today;
                      const hasPartial = !p.paid && p.number === sale.paidInstallments + 1 && (sale.partialPaid || 0) > 0;
                      const label = p.paid ? "Paga" : hasPartial ? `${formatCurrency(sale.partialPaid)} pago` : isOverdue ? "Vencida" : "Pendente";
                      const cls = p.paid ? "text-success" : isOverdue ? "text-destructive" : "text-muted-foreground";
                      return <span className={`text-xs font-medium w-16 text-right ${cls}`}>{label}</span>;
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>

        <SalePaymentHistoryDialog
          open={showPayments}
          onOpenChange={setShowPayments}
          sale={sale}
          onUpdate={onUpdate}
          formatCurrency={formatCurrency}
          readOnly={readOnly}
        />

        <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => setShowPayments(true)}
            className="flex-1 flex items-center justify-between px-3 py-2.5 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2 text-sm">
              <Receipt className="h-4 w-4 text-success" />
              <span className="font-medium text-foreground">Histórico de Pagamentos</span>
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                {(sale.paymentHistory || []).length}
              </Badge>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
          {sale.businessType !== "aluguel_veiculo" && <WarrantyManager sale={sale} />}
        </div>

        <div className="mt-auto space-y-2">
          {(() => {
            const totalPaid = parcelas.filter(p => p.paid).reduce((s, p) => s + p.fullValue, 0)
              + (sale.downPayment || 0) + (sale.partialPaid || 0);
            const pct = sale.total > 0 ? Math.min(100, Math.round((totalPaid / sale.total) * 100)) : 0;
            const hasPartial = (sale.partialPaid || 0) > 0;
            const nextIdx = sale.paidInstallments;
            const nextParcela = parcelas[nextIdx];
            let state: "paid" | "partial" | "overdue" | "pending" = "pending";
            if (isPaid) state = "paid";
            else if (nextParcela) {
              const today = new Date(); today.setHours(0,0,0,0);
              if (nextParcela.rawDate < today) state = "overdue";
              else if (hasPartial) state = "partial";
              else state = "pending";
            } else if (hasPartial) state = "partial";

            const stateConfig = {
              paid: { label: "Quitado", icon: CheckCircle2, cls: "bg-success/15 text-success border-success/30", bar: "bg-success" },
              partial: { label: "Parcial", icon: HandCoins, cls: "bg-warning/15 text-warning border-warning/30", bar: "bg-warning" },
              overdue: { label: "Atrasado", icon: Clock, cls: "bg-destructive/15 text-destructive border-destructive/30", bar: "bg-destructive" },
              pending: { label: "Pendente", icon: Clock, cls: "bg-primary/15 text-primary border-primary/30", bar: "bg-primary" },
            }[state];
            const StIcon = stateConfig.icon;

            return (
              <div className="rounded-2xl border border-border/40 bg-card/40 backdrop-blur-sm p-2.5 space-y-2.5 transition-all duration-300">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${stateConfig.cls} transition-colors duration-300`}>
                    <StIcon className="h-3 w-3" />
                    {stateConfig.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                      <span className="tabular-nums font-medium">{formatCurrency(totalPaid)}</span>
                      <span className="tabular-nums font-semibold">{pct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                      <div
                        className={`h-full ${stateConfig.bar} rounded-full transition-all duration-700 ease-out`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {!isPaid && (
                  <>
                    <RegisterSalePaymentDialog
                      open={showPartial}
                      onOpenChange={setShowPartial}
                      sale={sale}
                      onUpdate={onUpdate}
                      formatCurrency={formatCurrency}
                      initialMode="partial"
                    />
                    <RegisterSalePaymentDialog
                      open={showPayDatePicker}
                      onOpenChange={setShowPayDatePicker}
                      sale={sale}
                      onUpdate={onUpdate}
                      formatCurrency={formatCurrency}
                      initialMode="full"
                    />
                    {!readOnly && (
                      <div className="flex flex-col xs:flex-row gap-2">
                        <Button data-mutation
                          variant="success"
                          size="sm"
                          className="w-full xs:flex-[2] xs:min-w-[130px] h-10 text-xs font-semibold rounded-xl shadow-[0_6px_18px_-8px_hsl(var(--success)/0.6)] hover:shadow-[0_10px_24px_-8px_hsl(var(--success)/0.85)] hover:-translate-y-[1px] transition-all duration-200"
                          onClick={() => setShowPayDatePicker(true)}
                        >
                          <CheckCircle2 className="h-4 w-4" /> Pagar Parcela
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full xs:flex-1 xs:min-w-[100px] h-10 text-xs font-semibold rounded-xl border-warning/40 text-warning hover:bg-warning hover:text-warning-foreground hover:border-warning transition-all duration-200"
                          onClick={() => setShowPartial(true)}
                        >
                          <HandCoins className="h-4 w-4" /> Parcial
                        </Button>
                      </div>
                    )}
                  </>
                )}

                {isPaid && (
                  <div className="flex items-center justify-center gap-2 py-1.5 text-success animate-fade-in">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-xs font-semibold">Pagamento concluído</span>
                  </div>
                )}
              </div>
            );
          })()}

          {(() => {
            const parsed = parseNotesWithMerchandise(sale.notes);
            const merch = parsed.merchandise;
            const userNotes = parsed.userNotes;
            const totalVal = sale.total || 0;
            const merchValor = merch?.valor || 0;
            const dinheiroTotal = Math.max(0, totalVal - merchValor);
            const cashRatio = merchValor > 0 && totalVal > 0 ? dinheiroTotal / totalVal : 1;
            const pagoBruto = parcelas.filter(p => p.paid).reduce((s, p) => s + p.fullValue, 0)
              + (sale.downPayment || 0) + (sale.partialPaid || 0);
            const pagoDinheiro = pagoBruto * cashRatio;
            return (
              <>
                {merch && (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 space-y-0.5">
                    <p className="text-[11px] font-semibold text-primary uppercase tracking-wide">Pagamento misto</p>
                    <p className="text-xs text-muted-foreground">
                      Total contrato: <span className="font-bold text-primary">{rawFormatCurrency(totalVal)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Em dinheiro: <span className="font-medium text-foreground">{rawFormatCurrency(dinheiroTotal)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Mercadoria: <span className="font-medium text-foreground">{merch.descricao}</span> ({rawFormatCurrency(merchValor)})
                    </p>
                    <p className="text-xs text-muted-foreground pt-1 border-t border-primary/10 mt-1">
                      PAGO em dinheiro: <span className="font-bold text-success">{rawFormatCurrency(pagoDinheiro)}</span>
                    </p>
                  </div>
                )}
                {userNotes && (
                  <div className="bg-muted/20 border border-border/30 rounded-lg px-3 py-2">
                    <p className="text-xs text-muted-foreground italic truncate">{userNotes}</p>
                  </div>
                )}
              </>
            );
          })()}

          <div className="flex items-center justify-between pt-1 border-t border-border/50">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" />
              {new Date(sale.date + "T00:00:00").toLocaleDateString("pt-BR")}
            </p>
            <div className="flex items-center gap-1">
              {sale.businessType === "aluguel_veiculo" && (
                <Button size="icon" variant="ghost" className="h-8 w-8 text-primary hover:bg-primary/10" onClick={() => {
                  const rawForo = (sale.foroCity || "").trim();
                  const clientCity = matchedClient?.city ? `${matchedClient.city}${matchedClient.state ? ` - ${matchedClient.state}` : ""}` : "";
                  const saleLocador = sale.locadorId ? locadores.find(l => l.id === sale.locadorId) : undefined;
                  const locadorCity = (saleLocador || locadorInfo)?.cidade ? `${(saleLocador || locadorInfo)!.cidade}${(saleLocador || locadorInfo)!.estado ? ` - ${(saleLocador || locadorInfo)!.estado}` : ""}` : "";
                  const effectiveForo = rawForo || clientCity || locadorCity;

                  if (!effectiveForo) {
                    toast.error("Para gerar o contrato, é obrigatório definir a Comarca do Foro. Edite a locação para preencher.");
                    return;
                  }

                  const descNorm = (sale.description || sale.productName || "").toLowerCase().trim();
                  const matchedVehicle = registeredVehicles.find(v => v.marcaModelo.toLowerCase().trim() === descNorm);
                  generateContract(sale, matchedClient, saleLocador || locadorInfo, matchedVehicle);
                }} title="Gerar Contrato">
                  <FileText className="h-4 w-4" />
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-8 w-8 text-success hover:bg-success/10" onClick={() => setShowPayments(true)} title="Ver Pagamentos">
                <CircleCheck className="h-4 w-4" />
              </Button>
              {!readOnly && (
                <>
                  <Button data-mutation size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={onEdit}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => setConfirmDeleteSale(true)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
    <ConfirmDeleteDialog
      open={confirmDeleteSale}
      onOpenChange={setConfirmDeleteSale}
      onConfirm={() => { onDelete(); setConfirmDeleteSale(false); }}
      title="Excluir venda"
      description="Tem certeza que deseja excluir esta venda?"
    />
    <AdjustSaleDueDateDialog
      open={showAdjustDue}
      onOpenChange={setShowAdjustDue}
      sale={sale}
      onUpdate={onUpdate}
    />
    </>
  );
}
