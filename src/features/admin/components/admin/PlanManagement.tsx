import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { MoneyInput } from "@/components/ui/money-input";
import { Pencil, Plus, Trash2, Star, Loader2, Check } from "lucide-react";
import { usePlans, PlanRecord } from "@/features/admin/hooks/usePlans";
import { calcCyclePrice, calcSavings, equivalentMonthly, formatBRL } from "@/features/admin/lib/planPricing";
import { LIMIT_KEYS, PERMISSION_GROUPS, PlanLimits, PlanPermissions } from "@/features/admin/lib/planEntitlements";
import { confirmWithScroll } from "@/lib/confirmWithScroll";

const BADGE_OPTIONS = [
  { value: "__none__", label: "Nenhum" },
  { value: "Mais Popular", label: "Mais Popular" },
  { value: "Melhor Custo-Benefício", label: "Melhor Custo-Benefício" },
  { value: "Mais Vendido", label: "Mais Vendido" },
];

interface FormState {
  name: string;
  description: string;
  price: string;
  price_semestral: string;
  price_anual: string;
  discount_semestral: number;
  discount_anual: number;
  badge: string;
  promo_text: string;
  highlight_color: string;
  highlight: boolean;
  recommended: boolean;
  active: boolean;
  sort_order: number;
  features: string;
  override_semestral: boolean;
  override_anual: boolean;
  show_monthly: boolean;
  show_semestral: boolean;
  show_anual: boolean;
  trial_days: number;
  limits: PlanLimits;
  permissions: PlanPermissions;
  expiration_action: "block_all" | "readonly" | "force_upgrade";
}

const emptyForm: FormState = {
  name: "",
  description: "",
  price: "",
  price_semestral: "",
  price_anual: "",
  discount_semestral: 10,
  discount_anual: 20,
  badge: "__none__",
  promo_text: "",
  highlight_color: "#7c3aed",
  highlight: false,
  recommended: false,
  active: true,
  sort_order: 0,
  features: "",
  override_semestral: false,
  override_anual: false,
  show_monthly: true,
  show_semestral: true,
  show_anual: true,
  trial_days: 0,
  limits: {},
  permissions: {},
  expiration_action: "force_upgrade",
};

function toForm(p: PlanRecord): FormState {
  return {
    name: p.name,
    description: p.description ?? "",
    price: String(p.price ?? ""),
    price_semestral: p.price_semestral != null ? String(p.price_semestral) : "",
    price_anual: p.price_anual != null ? String(p.price_anual) : "",
    discount_semestral: p.discount_semestral ?? 0,
    discount_anual: p.discount_anual ?? 0,
    badge: p.badge || "__none__",
    promo_text: p.promo_text ?? "",
    highlight_color: p.highlight_color ?? "#7c3aed",
    highlight: !!p.highlight,
    recommended: !!p.recommended,
    active: p.active ?? true,
    sort_order: p.sort_order ?? 0,
    features: (p.features ?? []).join("\n"),
    override_semestral: p.price_semestral != null,
    override_anual: p.price_anual != null,
    show_monthly: p.show_monthly ?? true,
    show_semestral: p.show_semestral ?? true,
    show_anual: p.show_anual ?? true,
    trial_days: (p as any).trial_days ?? 0,
    limits: ((p as any).limits ?? {}) as PlanLimits,
    permissions: ((p as any).permissions ?? {}) as PlanPermissions,
    expiration_action: ((p as any).expiration_action ?? "force_upgrade") as FormState["expiration_action"],
  };
}

export function PlanManagement() {
  const { plans, loading, create, update, remove, setRecommended } = usePlans();
  const [editing, setEditing] = useState<PlanRecord | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };
  const openEdit = (p: PlanRecord) => {
    setEditing(p);
    setForm(toForm(p));
    setOpen(true);
  };

  const monthly = parseFloat(form.price) || 0;
  const semestralAuto = calcCyclePrice(monthly, 6, form.discount_semestral);
  const anualAuto = calcCyclePrice(monthly, 12, form.discount_anual);
  const semestralPrice = form.override_semestral && form.price_semestral
    ? parseFloat(form.price_semestral) || 0
    : semestralAuto;
  const anualPrice = form.override_anual && form.price_anual
    ? parseFloat(form.price_anual) || 0
    : anualAuto;
  const semestralSavings = calcSavings(monthly, semestralPrice, 6);
  const anualSavings = calcSavings(monthly, anualPrice, 12);

  const handleSave = async () => {
    if (!form.name.trim() || !form.price) return;
    if (!form.show_monthly && !form.show_semestral && !form.show_anual) {
      alert("Selecione pelo menos uma modalidade de exibição (Mensal, Semestral ou Anual).");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description || null,
      price: parseFloat(form.price) || 0,
      price_semestral: form.override_semestral ? parseFloat(form.price_semestral) || null : null,
      price_anual: form.override_anual ? parseFloat(form.price_anual) || null : null,
      discount_semestral: Math.min(Math.max(form.discount_semestral, 0), 100),
      discount_anual: Math.min(Math.max(form.discount_anual, 0), 100),
      badge: form.badge === "__none__" ? null : form.badge,
      promo_text: form.promo_text || null,
      highlight_color: form.highlight_color || null,
      highlight: form.highlight,
      recommended: form.recommended,
      active: form.active,
      sort_order: form.sort_order,
      features: form.features.split("\n").map((s) => s.trim()).filter(Boolean),
      show_monthly: form.show_monthly,
      show_semestral: form.show_semestral,
      show_anual: form.show_anual,
      trial_days: Math.max(0, Math.floor(form.trial_days || 0)),
      limits: form.limits,
      permissions: form.permissions,
      expiration_action: form.expiration_action,
    };
    let ok = false;
    if (editing) ok = await update(editing.id, payload as any);
    else ok = await create(payload as any);
    setSaving(false);
    if (ok) {
      setOpen(false);
      if (form.recommended && editing) await setRecommended(editing.id);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Planos de assinatura</CardTitle>
            <CardDescription>
              Configure preços, descontos semestral/anual, selos e o plano recomendado.
              As alterações refletem automaticamente na página pública de planos.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Novo plano
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : plans.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum plano cadastrado.</p>
          ) : (
            <div className="space-y-3">
              {plans.map((p) => {
                const sem = calcCyclePrice(p.price, 6, p.discount_semestral ?? 0, p.price_semestral);
                const an = calcCyclePrice(p.price, 12, p.discount_anual ?? 0, p.price_anual);
                return (
                  <div
                    key={p.id}
                    className="border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    style={p.recommended && p.highlight_color
                      ? { borderColor: p.highlight_color, boxShadow: `0 0 0 1px ${p.highlight_color}` }
                      : undefined}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-foreground">{p.name}</h4>
                        {p.badge && <Badge variant="secondary">{p.badge}</Badge>}
                        {p.recommended && (
                          <Badge className="gap-1"><Star className="h-3 w-3" /> Recomendado</Badge>
                        )}
                        {!p.active && <Badge variant="outline">Inativo</Badge>}
                      </div>
                      {p.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>
                      )}
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                        <span>Mensal: <b className="text-foreground">{formatBRL(p.price)}</b></span>
                        <span>Semestral: <b className="text-foreground">{formatBRL(sem)}</b> ({p.discount_semestral ?? 0}% off)</span>
                        <span>Anual: <b className="text-foreground">{formatBRL(an)}</b> ({p.discount_anual ?? 0}% off)</span>
                        <span>Ordem: {p.sort_order ?? 0}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {!p.recommended && (
                        <Button size="sm" variant="outline" onClick={() => setRecommended(p.id)}>
                          <Star className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => update(p.id, { active: !p.active } as any)}>
                        {p.active ? "Desativar" : "Ativar"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (confirmWithScroll(`Excluir o plano "${p.name}"?`)) remove(p.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar plano" : "Novo plano"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <Label>Nome*</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div>
                <Label>Valor mensal*</Label>
                <MoneyInput value={form.price} onChange={(v) => setForm({ ...form, price: v })} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Desconto semestral (%)</Label>
                  <Input
                    type="number" min={0} max={100}
                    value={form.discount_semestral}
                    onChange={(e) => setForm({ ...form, discount_semestral: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Desconto anual (%)</Label>
                  <Input
                    type="number" min={0} max={100}
                    value={form.discount_anual}
                    onChange={(e) => setForm({ ...form, discount_anual: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="space-y-2 border rounded p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Sobrescrever valor semestral</Label>
                  <Switch
                    checked={form.override_semestral}
                    onCheckedChange={(c) => setForm({ ...form, override_semestral: c })}
                  />
                </div>
                {form.override_semestral && (
                  <MoneyInput
                    value={form.price_semestral}
                    onChange={(v) => setForm({ ...form, price_semestral: v })}
                  />
                )}
                <div className="flex items-center justify-between pt-2">
                  <Label className="text-xs">Sobrescrever valor anual</Label>
                  <Switch
                    checked={form.override_anual}
                    onCheckedChange={(c) => setForm({ ...form, override_anual: c })}
                  />
                </div>
                {form.override_anual && (
                  <MoneyInput
                    value={form.price_anual}
                    onChange={(v) => setForm({ ...form, price_anual: v })}
                  />
                )}
              </div>

              <div>
                <Label>Selo (badge)</Label>
                <Select value={form.badge} onValueChange={(v) => setForm({ ...form, badge: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BADGE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Texto promocional</Label>
                <Input
                  placeholder="Ex: 2 meses grátis"
                  value={form.promo_text}
                  onChange={(e) => setForm({ ...form, promo_text: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div>
                  <Label>Cor de destaque</Label>
                  <Input type="color" value={form.highlight_color}
                    onChange={(e) => setForm({ ...form, highlight_color: e.target.value })} />
                </div>
                <div>
                  <Label>Ordem</Label>
                  <Input type="number" value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
                </div>
              </div>

              <div>
                <Label>Recursos (um por linha)</Label>
                <Textarea rows={4} value={form.features}
                  onChange={(e) => setForm({ ...form, features: e.target.value })} />
              </div>

              <div className="border rounded p-3 space-y-2">
                <Label className="text-sm">Períodos de exibição</Label>
                <p className="text-[11px] text-muted-foreground">
                  Selecione em quais modalidades este plano será exibido na tela de assinatura.
                </p>
                {([
                  ["show_monthly", "Mensal"],
                  ["show_semestral", "Semestral"],
                  ["show_anual", "Anual"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={form[key]}
                      onCheckedChange={(c) => setForm({ ...form, [key]: !!c })}
                    />
                    {label}
                  </label>
                ))}
                {!form.show_monthly && !form.show_semestral && !form.show_anual && (
                  <p className="text-xs text-destructive">
                    Selecione ao menos uma modalidade.
                  </p>
                )}
              </div>

              <div className="border rounded p-3 space-y-3">
                <div>
                  <Label className="text-sm">Permissões e limites do plano</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Configure limites de uso e quais ações o usuário poderá executar.
                  </p>
                </div>

                <div>
                  <Label className="text-xs">Dias de teste gratuito (0 = sem teste)</Label>
                  <Input
                    type="number" min={0}
                    value={form.trial_days}
                    onChange={(e) => setForm({ ...form, trial_days: parseInt(e.target.value) || 0 })}
                  />
                </div>

                <div>
                  <Label className="text-xs">Ao expirar o teste</Label>
                  <Select
                    value={form.expiration_action}
                    onValueChange={(v) => setForm({ ...form, expiration_action: v as FormState["expiration_action"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="force_upgrade">Forçar upgrade (redireciona para /planos)</SelectItem>
                      <SelectItem value="readonly">Somente leitura (bloqueia criar/editar/excluir)</SelectItem>
                      <SelectItem value="block_all">Bloquear totalmente (tela de assinatura obrigatória)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Dados cadastrados permanecem salvos em todos os casos.
                  </p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Limites (vazio = ilimitado)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {LIMIT_KEYS.map(({ key, label }) => (
                      <div key={key} className="space-y-0.5">
                        <Label className="text-[11px] text-muted-foreground">{label}</Label>
                        <Input
                          type="number" min={0}
                          value={form.limits[key] ?? ""}
                          placeholder="∞"
                          onChange={(e) => {
                            const raw = e.target.value;
                            setForm({
                              ...form,
                              limits: {
                                ...form.limits,
                                [key]: raw === "" ? null : Math.max(0, parseInt(raw) || 0),
                              },
                            });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Ações permitidas</Label>
                  {PERMISSION_GROUPS.map((group) => (
                    <div key={group.module} className="border rounded p-2 space-y-1">
                      <p className="text-[11px] font-semibold text-muted-foreground">{group.module}</p>
                      {group.perms.map((p) => {
                        const allowed = form.permissions[p.key] !== false;
                        return (
                          <label key={p.key} className="flex items-center justify-between text-sm cursor-pointer">
                            <span>{p.label}</span>
                            <Switch
                              checked={allowed}
                              onCheckedChange={(c) =>
                                setForm({
                                  ...form,
                                  permissions: { ...form.permissions, [p.key]: c },
                                })
                              }
                            />
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>




              <div className="flex items-center justify-between">
                <Label>Plano recomendado</Label>
                <Switch checked={form.recommended} onCheckedChange={(c) => setForm({ ...form, recommended: c })} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Destaque (highlight)</Label>
                <Switch checked={form.highlight} onCheckedChange={(c) => setForm({ ...form, highlight: c })} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Ativo</Label>
                <Switch checked={form.active} onCheckedChange={(c) => setForm({ ...form, active: c })} />
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-3">
              <Label>Pré-visualização</Label>
              <div
                className="rounded-xl border-2 p-5 bg-card"
                style={{
                  borderColor: form.recommended ? form.highlight_color : undefined,
                  boxShadow: form.recommended ? `0 0 30px -8px ${form.highlight_color}` : undefined,
                }}
              >
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {form.badge && form.badge !== "__none__" && (
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                      style={{ background: form.highlight_color }}
                    >{form.badge}</span>
                  )}
                  {form.recommended && <Badge variant="outline" className="gap-1"><Star className="h-3 w-3"/>Recomendado</Badge>}
                </div>
                <h3 className="text-xl font-bold">{form.name || "Nome do plano"}</h3>
                {form.description && <p className="text-xs text-muted-foreground mt-1">{form.description}</p>}

                <div className="mt-4 space-y-3">
                  <PreviewRow label="Mensal" price={monthly} months={1} />
                  <PreviewRow
                    label="Semestral"
                    price={semestralPrice}
                    months={6}
                    savings={semestralSavings}
                  />
                  <PreviewRow
                    label="Anual"
                    price={anualPrice}
                    months={12}
                    savings={anualSavings}
                  />
                </div>

                {form.promo_text && (
                  <p className="text-xs mt-3 font-medium" style={{ color: form.highlight_color }}>
                    {form.promo_text}
                  </p>
                )}

                {form.features && (
                  <ul className="mt-4 space-y-1.5">
                    {form.features.split("\n").filter(Boolean).map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />{f}
                      </li>
                    ))}
                  </ul>
                )}
                <Button className="w-full mt-6 rounded-full" disabled>
                  {(!form.price || parseFloat(form.price) === 0 || /grátis|gratis|teste|trial|free/i.test(form.name) || /grátis|gratis|teste|trial|free/i.test(form.badge || "")) ? "Testar agora" : "Assinar agora"}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.price || (!form.show_monthly && !form.show_semestral && !form.show_anual)}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PreviewRow({
  label, price, months, savings,
}: { label: string; price: number; months: number; savings?: { saved: number; percent: number } }) {
  return (
    <div className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <div className="text-right">
        <div className="font-semibold text-foreground">{formatBRL(price)}</div>
        {months > 1 && (
          <div className="text-[10px] text-muted-foreground">
            {formatBRL(equivalentMonthly(price, months))}/mês
            {savings && savings.saved > 0 && (
              <> · economiza {formatBRL(savings.saved)} ({savings.percent.toFixed(0)}%)</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
