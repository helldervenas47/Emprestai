import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Star, LayoutGrid } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { APP_TABS, APP_TAB_IDS, sanitizeAllowedTabs } from "@/lib/appTabs";

const ALL_TABS = APP_TABS;

interface Plan {
  id: string;
  name: string;
  price: number;
  highlight: boolean;
  features: string[];
  max_loans: number | null;
  max_users: number | null;
  sort_order: number;
  active: boolean;
  allowed_tabs: string[];
}

export function PlanManagement() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [tabsPlan, setTabsPlan] = useState<Plan | null>(null);
  const [selectedTabs, setSelectedTabs] = useState<string[]>([]);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [highlight, setHighlight] = useState(false);
  const [features, setFeatures] = useState("");
  const [maxLoans, setMaxLoans] = useState("");
  const [maxUsers, setMaxUsers] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [active, setActive] = useState(true);

  const fetchPlans = async () => {
    const { data, error } = await supabase
      .from("plans")
      .select(
        "id, name, price, highlight, features, max_loans, max_users, sort_order, active, allowed_tabs",
      )
      .order("sort_order");
    if (!error && data) setPlans(data);
    setLoading(false);
  };

  useEffect(() => { fetchPlans(); }, []);

  const resetForm = () => {
    setName("");
    setPrice("");
    setHighlight(false);
    setFeatures("");
    setMaxLoans("");
    setMaxUsers("");
    setSortOrder("");
    setActive(true);
    setEditingPlan(null);
  };

  const openCreate = () => {
    resetForm();
    setSortOrder(String(plans.length + 1));
    setDialogOpen(true);
  };

  const openEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setName(plan.name);
    setPrice(String(plan.price));
    setHighlight(plan.highlight);
    setFeatures(plan.features.join("\n"));
    setMaxLoans(plan.max_loans != null ? String(plan.max_loans) : "");
    setMaxUsers(plan.max_users != null ? String(plan.max_users) : "");
    setSortOrder(String(plan.sort_order));
    setActive(plan.active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name || !price) {
      toast.error("Nome e preço são obrigatórios");
      return;
    }
    const featuresArr = features.split("\n").map(f => f.trim()).filter(Boolean);
    const payload = {
      name,
      price: Number(price),
      highlight,
      features: featuresArr,
      max_loans: maxLoans ? Number(maxLoans) : null,
      max_users: maxUsers ? Number(maxUsers) : null,
      sort_order: Number(sortOrder) || 0,
      active,
    };

    if (editingPlan) {
      const { error } = await supabase.from("plans").update(payload).eq("id", editingPlan.id);
      if (error) { toast.error("Erro ao atualizar plano"); return; }
      toast.success("Plano atualizado!");
    } else {
      const { error } = await supabase.from("plans").insert(payload);
      if (error) { toast.error("Erro ao criar plano"); return; }
      toast.success("Plano criado!");
    }
    setDialogOpen(false);
    resetForm();
    fetchPlans();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("plans").delete().eq("id", deleteId);
    if (error) { toast.error("Erro ao excluir plano"); return; }
    toast.success("Plano excluído!");
    setDeleteId(null);
    fetchPlans();
  };

  const openTabsConfig = (plan: Plan) => {
    setTabsPlan(plan);
    setSelectedTabs(plan.allowed_tabs ? sanitizeAllowedTabs(plan.allowed_tabs) : APP_TAB_IDS.slice());
  };

  const toggleTab = (tabId: string) => {
    setSelectedTabs(prev =>
      prev.includes(tabId) ? prev.filter(t => t !== tabId) : [...prev, tabId]
    );
  };

  const saveTabsConfig = async () => {
    if (!tabsPlan) return;
    const cleaned = sanitizeAllowedTabs(selectedTabs);
    const { error } = await supabase.from("plans").update({ allowed_tabs: cleaned }).eq("id", tabsPlan.id);
    if (error) { toast.error("Erro ao salvar abas"); return; }
    toast.success("Abas do plano atualizadas!");
    setTabsPlan(null);
    fetchPlans();
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground">Carregando planos...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Gestão de Planos</h2>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Novo plano
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <Card key={plan.id} no3d className={!plan.active ? "opacity-60" : ""}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  {plan.highlight && <Star className="h-4 w-4 text-primary fill-primary" />}
                  {plan.name}
                </CardTitle>
                <RowActions
                  size="md"
                  actions={[
                    { label: "Abas permitidas", icon: <LayoutGrid className="h-4 w-4" />, onClick: () => openTabsConfig(plan) },
                    { label: "Editar", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(plan) },
                    { label: "Excluir", icon: <Trash2 className="h-4 w-4" />, destructive: true, onClick: () => setDeleteId(plan.id) },
                  ]}
                />

              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-2xl font-bold text-foreground">R$ {plan.price}<span className="text-sm font-normal text-muted-foreground">/mês</span></p>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>Empréstimos: {plan.max_loans ?? "Ilimitado"}</p>
                <p>Usuários: {plan.max_users ?? "Ilimitado"}</p>
              </div>
              <ul className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t border-border/30">
                {plan.features.map((f, i) => <li key={i}>• {f}</li>)}
              </ul>
              {!plan.active && <p className="text-xs text-destructive font-medium">Inativo</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPlan ? "Editar Plano" : "Novo Plano"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Profissional" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Preço (R$/mês)</Label>
                <Input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="59" />
              </div>
              <div className="space-y-1">
                <Label>Ordem</Label>
                <Input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} placeholder="1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Máx. empréstimos</Label>
                <Input type="number" value={maxLoans} onChange={e => setMaxLoans(e.target.value)} placeholder="Vazio = ilimitado" />
              </div>
              <div className="space-y-1">
                <Label>Máx. usuários</Label>
                <Input type="number" value={maxUsers} onChange={e => setMaxUsers(e.target.value)} placeholder="Vazio = ilimitado" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Funcionalidades (uma por linha)</Label>
              <textarea
                className="w-full min-h-[120px] rounded-xl border border-input bg-background px-3 py-2 text-sm"
                value={features}
                onChange={e => setFeatures(e.target.value)}
                placeholder={"Empréstimos ilimitados\nAté 3 usuários\nRelatórios completos"}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch checked={highlight} onCheckedChange={setHighlight} />
                <Label>Destaque (mais popular)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={active} onCheckedChange={setActive} />
                <Label>Ativo</Label>
              </div>
            </div>
            <Button onClick={handleSave} className="w-full">
              {editingPlan ? "Salvar alterações" : "Criar plano"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tabs Config Dialog */}
      <Dialog open={!!tabsPlan} onOpenChange={(open) => !open && setTabsPlan(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Abas do plano: {tabsPlan?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Selecione quais abas os usuários deste plano terão acesso:</p>
            {ALL_TABS.map((tab) => (
              <div key={tab.id} className="flex items-center gap-3 py-1">
                <Checkbox
                  id={`tab-${tab.id}`}
                  checked={selectedTabs.includes(tab.id)}
                  onCheckedChange={() => toggleTab(tab.id)}
                />
                <Label htmlFor={`tab-${tab.id}`} className="text-sm font-medium cursor-pointer">{tab.label}</Label>
              </div>
            ))}
            <Button onClick={saveTabsConfig} className="w-full">Salvar abas</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        onConfirm={handleDelete}
        title="Excluir plano"
        description="Tem certeza que deseja excluir este plano?"
      />
    </div>
  );
}
