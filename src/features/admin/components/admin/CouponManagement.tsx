import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tag,
  Plus,
  Percent,
  DollarSign,
  CheckCircle2,
  XCircle,
  Pencil,
  Power,
  Trash2,
  Copy,
  Check,
  Layers,
  Sparkles,
  TrendingDown,
  Loader2,
  RefreshCw,
  Globe,
  Calendar,
} from "lucide-react";
import { useCoupons, CouponRecord, CreateCouponInput, UpdateCouponInput } from "@/features/admin/hooks/useCoupons";
import { usePlans } from "@/features/admin/hooks/usePlans";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { toast } from "sonner";

export function CouponManagement() {
  const { coupons, metrics, loading, createCoupon, updateCoupon, deleteCoupon, toggleStatus, refetch } = useCoupons();
  const { plans, loading: loadingPlans } = usePlans();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<CouponRecord | null>(null);
  const [saving, setSaving] = useState(false);

  // Estado para exclusão
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [couponToDelete, setCouponToDelete] = useState<CouponRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Estado de cópia de código
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Form State
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState<string>("10");
  const [isActive, setIsActive] = useState(true);
  const [appliesToAll, setAppliesToAll] = useState(true);
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [maxUses, setMaxUses] = useState<string>("");

  const handleCopyCode = (cCode: string) => {
    navigator.clipboard.writeText(cCode).then(() => {
      setCopiedCode(cCode);
      toast.success(`Código "${cCode}" copiado para a área de transferência!`);
      setTimeout(() => setCopiedCode(null), 2500);
    });
  };

  const handleOpenCreate = () => {
    setEditingCoupon(null);
    setCode("");
    setDiscountType("percentage");
    setDiscountValue("10");
    setIsActive(true);
    setAppliesToAll(true);
    setSelectedPlanIds([]);
    setMaxUses("");
    setModalOpen(true);
  };

  const handleOpenEdit = (c: CouponRecord) => {
    setEditingCoupon(c);
    setCode(c.code);
    setDiscountType(c.discount_type);
    setDiscountValue(String(c.discount_value));
    setIsActive(c.is_active);
    setAppliesToAll(c.applies_to_all_plans);
    setSelectedPlanIds(c.plan_ids || []);
    setMaxUses(c.max_uses !== null ? String(c.max_uses) : "");
    setModalOpen(true);
  };

  const handlePromptDelete = (c: CouponRecord) => {
    setCouponToDelete(c);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!couponToDelete) return;
    setDeleting(true);
    try {
      const ok = await deleteCoupon(couponToDelete.id, couponToDelete.code);
      if (ok) {
        setDeleteDialogOpen(false);
        setCouponToDelete(null);
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleTogglePlan = (planId: string) => {
    if (selectedPlanIds.includes(planId)) {
      setSelectedPlanIds(selectedPlanIds.filter((id) => id !== planId));
    } else {
      setSelectedPlanIds([...selectedPlanIds, planId]);
    }
  };

  const handleSave = async () => {
    const cleanCode = code.trim().toUpperCase().replace(/\s+/g, "");
    if (!cleanCode) {
      toast.error("Informe o código do cupom.");
      return;
    }

    const val = parseFloat(discountValue) || 0;
    if (val <= 0) {
      toast.error("O valor do desconto deve ser maior que zero.");
      return;
    }

    if (discountType === "percentage" && val > 100) {
      toast.error("O desconto percentual não pode ultrapassar 100%.");
      return;
    }

    if (!appliesToAll && selectedPlanIds.length === 0) {
      toast.error("Selecione ao menos um plano ou marque a opção para todos os planos.");
      return;
    }

    setSaving(true);
    try {
      if (editingCoupon) {
        const updatePayload: UpdateCouponInput = {
          code: cleanCode,
          discount_type: discountType,
          discount_value: val,
          is_active: isActive,
          applies_to_all_plans: appliesToAll,
          plan_ids: appliesToAll ? [] : selectedPlanIds,
          max_uses: maxUses ? parseInt(maxUses, 10) || null : null,
        };
        const ok = await updateCoupon(editingCoupon.id, updatePayload);
        if (ok) setModalOpen(false);
      } else {
        const createPayload: CreateCouponInput = {
          code: cleanCode,
          discount_type: discountType,
          discount_value: val,
          is_active: isActive,
          applies_to_all_plans: appliesToAll,
          plan_ids: appliesToAll ? [] : selectedPlanIds,
          max_uses: maxUses ? parseInt(maxUses, 10) || null : null,
        };
        const ok = await createCoupon(createPayload);
        if (ok) setModalOpen(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  return (
    <div className="space-y-6">
      {/* Cards de Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card no3d className="border-border/60 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Cupons Ativos</span>
              <div className="text-2xl font-bold text-emerald-500">{metrics.activeCoupons}</div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card no3d className="border-border/60 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Cupons Cadastrados</span>
              <div className="text-2xl font-bold text-foreground">{metrics.totalCoupons}</div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Tag className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card no3d className="border-border/60 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Total de Usos</span>
              <div className="text-2xl font-bold text-blue-500">{metrics.totalUsages}</div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card no3d className="border-border/60 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Descontos Concedidos</span>
              <div className="text-lg sm:text-xl font-bold text-amber-500">
                {formatCurrency(metrics.totalDiscountGivenCents)}
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <TrendingDown className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gerenciamento de Cupons */}
      <Card no3d className="border-border/60">
        <CardHeader className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50">
          <div className="space-y-1">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              <span>Cupons de Desconto</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Crie e gerencie cupons promocionais para planos e add-ons com validação no checkout.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={loading}
              className="h-9 px-3 flex-1 sm:flex-initial"
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button onClick={handleOpenCreate} size="sm" className="h-9 font-semibold flex-1 sm:flex-initial">
              <Plus className="h-4 w-4 mr-1.5" />
              Criar cupom
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center space-y-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Carregando cupons...</span>
            </div>
          ) : coupons.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Tag className="h-10 w-10 text-muted-foreground/40 mx-auto" />
              <h4 className="text-sm font-semibold">Nenhum cupom cadastrado</h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Crie seu primeiro cupom de desconto para campanhas ou promoções especiais.
              </p>
              <Button onClick={handleOpenCreate} size="sm" variant="outline" className="mt-2">
                <Plus className="h-4 w-4 mr-1.5" />
                Criar primeiro cupom
              </Button>
            </div>
          ) : (
            <>
              {/* Visualização Mobile: Cards Otimizados */}
              <div className="block lg:hidden divide-y divide-border/50">
                {coupons.map((c) => {
                  const planNames = c.applies_to_all_plans
                    ? ["Todos os planos"]
                    : c.plan_ids.map((pid) => {
                        const pl = plans.find((p) => p.id === pid);
                        return pl ? pl.name : "Plano específico";
                      });

                  const isCopied = copiedCode === c.code;

                  return (
                    <div key={c.id} className="p-4 space-y-3 hover:bg-muted/20 transition-colors">
                      {/* Topo do Card: Código e Status */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => handleCopyCode(c.code)}
                            title="Clique para copiar o código"
                            className="inline-flex items-center gap-1.5 font-mono font-bold text-xs tracking-wider bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap"
                          >
                            <span>{c.code}</span>
                            {isCopied ? (
                              <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                            ) : (
                              <Copy className="h-3 w-3 text-primary/70 shrink-0" />
                            )}
                          </button>
                        </div>

                        <Badge
                          variant={c.is_active ? "default" : "secondary"}
                          className={`text-[11px] px-2 py-0.5 whitespace-nowrap shrink-0 ${
                            c.is_active
                              ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                              : "text-muted-foreground"
                          }`}
                        >
                          {c.is_active ? "🟢 Ativo" : "⚪ Inativo"}
                        </Badge>
                      </div>

                      {/* Informações de Desconto e Usos */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="outline" className="font-semibold text-xs gap-1 py-0.5 whitespace-nowrap">
                          {c.discount_type === "percentage" ? (
                            <>
                              <Percent className="h-3 w-3 text-blue-500" />
                              <span>{c.discount_value}% de desconto</span>
                            </>
                          ) : (
                            <>
                              <DollarSign className="h-3 w-3 text-emerald-500" />
                              <span>R$ {c.discount_value.toFixed(2)} de desconto</span>
                            </>
                          )}
                        </Badge>

                        <div className="text-muted-foreground text-[11px] flex items-center gap-1 ml-auto">
                          <Sparkles className="h-3 w-3 text-blue-500" />
                          <span>
                            Usos: <strong>{c.used_count}</strong>
                            {c.max_uses ? ` / ${c.max_uses}` : " (ilimitado)"}
                          </span>
                        </div>
                      </div>

                      {/* Planos Permitidos */}
                      <div className="text-xs space-y-1">
                        <span className="text-[11px] text-muted-foreground">Planos:</span>
                        <div className="flex flex-wrap gap-1">
                          {c.applies_to_all_plans ? (
                            <Badge variant="secondary" className="text-[10px] py-0">
                              🌐 Todos os planos
                            </Badge>
                          ) : planNames.length > 0 ? (
                            planNames.map((pName, idx) => (
                              <Badge key={idx} variant="outline" className="text-[10px] py-0 truncate max-w-[150px]">
                                {pName}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-[11px] text-muted-foreground italic">Nenhum plano</span>
                          )}
                        </div>
                      </div>

                      {/* Rodapé de Ações do Card */}
                      <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                        <span className="text-[11px] text-muted-foreground">
                          Criado em {new Date(c.created_at).toLocaleDateString("pt-BR")}
                        </span>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleStatus(c)}
                            title={c.is_active ? "Inativar cupom" : "Ativar cupom"}
                            className="h-8 px-2 text-xs gap-1"
                          >
                            <Power className={`h-3.5 w-3.5 ${c.is_active ? "text-amber-500" : "text-emerald-500"}`} />
                            <span className="text-[11px]">{c.is_active ? "Inativar" : "Ativar"}</span>
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(c)}
                            title="Editar cupom"
                            className="h-8 w-8 p-0"
                          >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePromptDelete(c)}
                            title="Excluir cupom"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Visualização Desktop: Tabela Fluida */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[160px]">Código</TableHead>
                      <TableHead className="min-w-[150px]">Desconto</TableHead>
                      <TableHead className="min-w-[180px]">Planos Permitidos</TableHead>
                      <TableHead className="min-w-[110px]">Status</TableHead>
                      <TableHead className="min-w-[90px] text-center">Usos</TableHead>
                      <TableHead className="min-w-[110px]">Criado em</TableHead>
                      <TableHead className="min-w-[130px] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coupons.map((c) => {
                      const planNames = c.applies_to_all_plans
                        ? ["Todos os planos"]
                        : c.plan_ids.map((pid) => {
                            const pl = plans.find((p) => p.id === pid);
                            return pl ? pl.name : "Plano específico";
                          });

                      const isCopied = copiedCode === c.code;

                      return (
                        <TableRow key={c.id} className="hover:bg-muted/30">
                          {/* Código com Badge Otimizado e Copiar */}
                          <TableCell className="font-mono font-bold text-sm tracking-wide">
                            <button
                              type="button"
                              onClick={() => handleCopyCode(c.code)}
                              title="Clique para copiar o código"
                              className="inline-flex items-center gap-1.5 font-mono font-bold text-xs tracking-wider bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap cursor-pointer group"
                            >
                              <span>{c.code}</span>
                              {isCopied ? (
                                <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0 animate-in zoom-in" />
                              ) : (
                                <Copy className="h-3.5 w-3.5 text-primary/60 group-hover:text-primary shrink-0" />
                              )}
                            </button>
                          </TableCell>

                          {/* Tipo e Valor de Desconto */}
                          <TableCell>
                            <Badge variant="outline" className="font-semibold text-xs gap-1 py-0.5 whitespace-nowrap">
                              {c.discount_type === "percentage" ? (
                                <>
                                  <Percent className="h-3 w-3 text-blue-500" />
                                  <span>{c.discount_value}% de desconto</span>
                                </>
                              ) : (
                                <>
                                  <DollarSign className="h-3 w-3 text-emerald-500" />
                                  <span>R$ {c.discount_value.toFixed(2)} de desconto</span>
                                </>
                              )}
                            </Badge>
                          </TableCell>

                          {/* Planos Permitidos */}
                          <TableCell>
                            <div className="flex flex-wrap gap-1 max-w-[280px]">
                              {c.applies_to_all_plans ? (
                                <Badge variant="secondary" className="text-[11px] whitespace-nowrap">
                                  🌐 Todos os planos
                                </Badge>
                              ) : planNames.length > 0 ? (
                                planNames.map((pName, idx) => (
                                  <Badge key={idx} variant="outline" className="text-[11px] truncate max-w-[130px]">
                                    {pName}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-xs text-muted-foreground italic">Nenhum plano</span>
                              )}
                            </div>
                          </TableCell>

                          {/* Status */}
                          <TableCell>
                            <Badge
                              variant={c.is_active ? "default" : "secondary"}
                              className={`text-xs whitespace-nowrap ${
                                c.is_active
                                  ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {c.is_active ? "🟢 Ativo" : "⚪ Inativo"}
                            </Badge>
                          </TableCell>

                          {/* Usos */}
                          <TableCell className="text-center font-medium text-xs whitespace-nowrap">
                            <span className="font-bold text-foreground">{c.used_count}</span>
                            {c.max_uses ? (
                              <span className="text-muted-foreground text-[10px]"> / {c.max_uses}</span>
                            ) : (
                              ""
                            )}
                          </TableCell>

                          {/* Data de Criação */}
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(c.created_at).toLocaleDateString("pt-BR")}
                          </TableCell>

                          {/* Ações: Status, Editar e Excluir */}
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleStatus(c)}
                                title={c.is_active ? "Inativar cupom" : "Ativar cupom"}
                                className="h-8 w-8 p-0"
                              >
                                <Power className={`h-4 w-4 ${c.is_active ? "text-amber-500" : "text-emerald-500"}`} />
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenEdit(c)}
                                title="Editar cupom"
                                className="h-8 w-8 p-0"
                              >
                                <Pencil className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handlePromptDelete(c)}
                                title="Excluir cupom"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Modal de Criação / Edição */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-6 bg-card text-card-foreground border-border">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              <span>{editingCoupon ? "Editar Cupom de Desconto" : "Novo Cupom de Desconto"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Configure as regras, tipo de desconto e planos permitidos para este cupom.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Código do Cupom */}
            <div className="space-y-1.5">
              <Label htmlFor="coupon-code" className="text-xs font-semibold">
                Código do Cupom *
              </Label>
              <Input
                id="coupon-code"
                placeholder="Ex: PROMO20, BEMVINDO10"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, ""))}
                className="font-mono uppercase font-bold text-sm tracking-wider"
              />
              <p className="text-[11px] text-muted-foreground">
                Convertido automaticamente para maiúsculas e sem espaços.
              </p>
            </div>

            {/* Tipo e Valor do Desconto */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Tipo de Desconto</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={discountType === "percentage" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDiscountType("percentage")}
                    className="text-xs gap-1.5"
                  >
                    <Percent className="h-3.5 w-3.5" />
                    Percentual (%)
                  </Button>
                  <Button
                    type="button"
                    variant={discountType === "fixed" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDiscountType("fixed")}
                    className="text-xs gap-1.5"
                  >
                    <DollarSign className="h-3.5 w-3.5" />
                    Fixo (R$)
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="coupon-value" className="text-xs font-semibold">
                  Valor do Desconto *
                </Label>
                <div className="relative">
                  <Input
                    id="coupon-value"
                    type="number"
                    min="0.01"
                    max={discountType === "percentage" ? "100" : undefined}
                    step={discountType === "percentage" ? "1" : "0.01"}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    className="text-sm font-bold pl-8"
                  />
                  <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-bold">
                    {discountType === "percentage" ? "%" : "R$"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {discountType === "percentage" ? "De 1% a 100%" : "Valor bruto em reais"}
                </p>
              </div>
            </div>

            {/* Planos Elegíveis */}
            <div className="space-y-2.5 pt-1">
              <Label className="text-xs font-semibold flex items-center justify-between">
                <span>Planos Elegíveis</span>
                <span className="text-[11px] text-muted-foreground font-normal">
                  Selecione onde o cupom pode ser usado
                </span>
              </Label>

              <div className="p-3 rounded-lg border border-border/70 bg-muted/20 space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="all-plans"
                    checked={appliesToAll}
                    onCheckedChange={(checked) => {
                      setAppliesToAll(Boolean(checked));
                      if (checked) setSelectedPlanIds([]);
                    }}
                  />
                  <Label htmlFor="all-plans" className="text-xs font-semibold cursor-pointer">
                    Válido para todos os planos ativos
                  </Label>
                </div>

                {!appliesToAll && (
                  <div className="pt-2 border-t border-border/50 space-y-2 max-h-40 overflow-y-auto pr-1">
                    {plans.map((p) => {
                      const isChecked = selectedPlanIds.includes(p.id);
                      return (
                        <div key={p.id} className="flex items-center space-x-2 py-0.5">
                          <Checkbox
                            id={`plan-${p.id}`}
                            checked={isChecked}
                            onCheckedChange={() => handleTogglePlan(p.id)}
                          />
                          <Label
                            htmlFor={`plan-${p.id}`}
                            className="text-xs text-foreground cursor-pointer flex-1 truncate"
                          >
                            {p.name}
                            <span className="text-muted-foreground ml-1.5 text-[11px]">
                              (R$ {Number(p.price).toFixed(2)}/mês)
                            </span>
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Limite de Usos e Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="coupon-max-uses" className="text-xs font-semibold">
                  Limite de Usos (Opcional)
                </Label>
                <Input
                  id="coupon-max-uses"
                  type="number"
                  placeholder="Ilimitado se vazio"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5 flex flex-col justify-end">
                <Label className="text-xs font-semibold mb-2">Status Inicial</Label>
                <div className="flex items-center space-x-2 h-9">
                  <Switch id="coupon-status" checked={isActive} onCheckedChange={setIsActive} />
                  <Label htmlFor="coupon-status" className="text-xs font-medium cursor-pointer">
                    {isActive ? "🟢 Cupom Ativo" : "⚪ Cupom Inativo"}
                  </Label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-border/50 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving} className="font-semibold">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : editingCoupon ? (
                "Salvar Alterações"
              ) : (
                "Criar Cupom"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Confirmação de Exclusão */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title={`Excluir cupom ${couponToDelete?.code || ""}?`}
        description="Tem certeza que deseja excluir permanentemente este cupom de desconto? Esta ação não pode ser desfeita."
      />
    </div>
  );
}
