import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useIsMobileOrTablet } from "@/hooks/use-mobile";
import { ChevronDown, Pencil, Trash2, RefreshCw } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";

interface Subscriber {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string;
  product_id: string;
  price_id: string;
  status: string;
  environment: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  created_at: string | null;
}

interface PlanOption {
  id: string;
  name: string;
}

const PRODUCT_ID_MAP: Record<string, string> = {
  Free: "free_plan",
  Básico: "basico_plan",
  Profissional: "profissional_plan",
  Empresarial: "empresarial_plan",
};

const PRODUCT_LABEL_MAP: Record<string, string> = {
  free_plan: "Free",
  basico_plan: "Básico",
  profissional_plan: "Profissional",
  empresarial_plan: "Empresarial",
};

export function PlanSubscribers() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const isMobile = useIsMobileOrTablet();

  // Edit dialog
  const [editSub, setEditSub] = useState<Subscriber | null>(null);
  const [editProductId, setEditProductId] = useState("");
  const [editStatus, setEditStatus] = useState("");

  // Change plan dialog
  const [changePlanSub, setChangePlanSub] = useState<Subscriber | null>(null);
  const [changePlanProductId, setChangePlanProductId] = useState("");

  // Delete dialog
  const [deleteSubId, setDeleteSubId] = useState<string | null>(null);

  useEffect(() => {
    fetchSubscribers();
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    const { data } = await supabase.from("plans").select("id, name").eq("active", true).order("sort_order");
    if (data) setPlans(data);
  };

  const fetchSubscribers = async () => {
    setLoading(true);
    const { data: subs, error } = await supabase
      .from("subscriptions")
      .select("id, user_id, product_id, price_id, status, environment, current_period_start, current_period_end, cancel_at_period_end, created_at, paddle_customer_id")
      .neq("product_id", "free_plan")
      .order("created_at", { ascending: false });

    if (error || !subs) { setLoading(false); return; }

    // Fetch admin-created users (those in user_owner) to exclude them
    const { data: ownedUsers } = await supabase.from("user_owner").select("user_id");
    const ownedUserIds = new Set((ownedUsers || []).map((o: any) => o.user_id));

    // Filter out admin-created sub-users
    const filteredSubs = subs.filter((s) => !ownedUserIds.has(s.user_id));

    // Deduplicate: keep one entry per user (prefer "live" over "sandbox")
    const userMap = new Map<string, typeof filteredSubs[0]>();
    for (const s of filteredSubs) {
      const existing = userMap.get(s.user_id);
      if (!existing || (s.environment === "live" && existing.environment !== "live")) {
        userMap.set(s.user_id, s);
      }
    }
    const deduped = Array.from(userMap.values());

    const { data: profiles } = await supabase.from("profiles").select("user_id, display_name, trial_plan_name, trial_started_at");
    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

    const mapped: Subscriber[] = [];
    
    // 1. Processar assinaturas do Asaas
    for (const s of deduped) {
      let status = s.status;
      if ((status === "active" || status === "trialing") && s.current_period_end) {
        if (s.current_period_end <= new Date().toISOString()) status = "expired";
      }
      const p = profileMap.get(s.user_id);
      mapped.push({
        id: s.id,
        user_id: s.user_id,
        display_name: p?.display_name || null,
        email: s.paddle_customer_id || "",
        product_id: s.product_id,
        price_id: s.price_id,
        status,
        environment: s.environment,
        current_period_start: s.current_period_start,
        current_period_end: s.current_period_end,
        cancel_at_period_end: s.cancel_at_period_end,
        created_at: s.created_at,
      });
    }

    // 2. Processar usuários que estão apenas no período de teste (sem assinatura do Asaas)
    if (profiles) {
      for (const p of profiles) {
        if (p.trial_plan_name && p.trial_started_at && !userMap.has(p.user_id) && !ownedUserIds.has(p.user_id)) {
          const trialEnd = new Date(new Date(p.trial_started_at).getTime() + 7 * 86400000).toISOString();
          let status = "trialing";
          if (trialEnd <= new Date().toISOString()) status = "expired";
          
          mapped.push({
            id: `trial_${p.user_id}`,
            user_id: p.user_id,
            display_name: p.display_name || null,
            email: "",
            product_id: p.trial_plan_name.toLowerCase(),
            price_id: "trial",
            status,
            environment: "live",
            current_period_start: p.trial_started_at,
            current_period_end: trialEnd,
            cancel_at_period_end: false,
            created_at: p.trial_started_at,
          });
        }
      }
    }

    setSubscribers(mapped);
    setLoading(false);
  };

  // Edit handler
  const openEdit = (sub: Subscriber) => {
    setEditSub(sub);
    setEditProductId(sub.product_id);
    setEditStatus(sub.status);
  };

  const saveEdit = async () => {
    if (!editSub) return;
    const { error } = await supabase
      .from("subscriptions")
      .update({ product_id: editProductId, status: editStatus })
      .eq("id", editSub.id);
    if (error) { toast.error("Erro ao atualizar assinatura"); return; }
    toast.success("Assinatura atualizada!");
    setEditSub(null);
    fetchSubscribers();
  };

  // Change plan handler
  const openChangePlan = (sub: Subscriber) => {
    setChangePlanSub(sub);
    setChangePlanProductId(sub.product_id);
  };

  const saveChangePlan = async () => {
    if (!changePlanSub) return;
    const { error } = await supabase
      .from("subscriptions")
      .update({ product_id: changePlanProductId })
      .eq("id", changePlanSub.id);
    if (error) { toast.error("Erro ao alterar plano"); return; }
    toast.success("Plano alterado com sucesso!");
    setChangePlanSub(null);
    fetchSubscribers();
  };

  // Delete handler
  const handleDelete = async () => {
    if (!deleteSubId) return;
    const { error } = await supabase.from("subscriptions").delete().eq("id", deleteSubId);
    if (error) { toast.error("Erro ao excluir assinatura"); return; }
    toast.success("Assinatura excluída!");
    setDeleteSubId(null);
    fetchSubscribers();
  };

  const statusBadge = (status: string) => {
    if (status === "active") return <Badge variant="success-solid">Ativo</Badge>;
    if (status === "trialing") return <Badge variant="default">Trial</Badge>;
    if (status === "canceled") return <Badge variant="destructive-solid">Cancelado</Badge>;
    if (status === "expired") return <Badge variant="destructive-solid">Expirado</Badge>;
    if (status === "suspended") return <Badge variant="destructive-solid">Suspenso</Badge>;
    if (status === "past_due") return <Badge variant="secondary">Pendente</Badge>;
    if (status === "paused") return <Badge variant="secondary">Pausado</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  const envBadge = (env: string) => {
    if (env === "live") return <Badge variant="default" className="text-[10px]">Live</Badge>;
    return <Badge variant="outline" className="text-[10px]">Teste</Badge>;
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("pt-BR");
  };

  const planBadgeVariant = (planId: string | undefined) => {
    if (planId === "empresarial_plan" || planId === "empresarial") return "default";
    if (planId === "profissional_plan" || planId === "profissional") return "secondary";
    if (planId === "basico_plan" || planId === "básico" || planId === "basico") return "outline";
    return "outline";
  };

  const planLabel = (planId: string | undefined) => {
    if (planId === "empresarial_plan" || planId === "empresarial") return "Empresarial";
    if (planId === "profissional_plan" || planId === "profissional") return "Profissional";
    if (planId === "basico_plan" || planId === "básico" || planId === "basico") return "Básico";
    return "Free";
  };

  const daysLeftLabel = (iso: string | null | undefined) => {
    if (!iso) return "";
    const ms = new Date(iso).getTime() - Date.now();
    if (Number.isNaN(ms)) return "";
    if (ms <= 0) return "expirada";
    const days = Math.ceil(ms / 86400_000);
    if (days > 1) return `${days} dias restantes`;
    const hours = Math.max(1, Math.ceil(ms / 3600_000));
    return `${hours}h restantes`;
  };
  const actionButtons = (sub: Subscriber) => (
    <RowActions
      size="md"
      actions={[
        { label: "Editar", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(sub) },
        { label: "Definir Plano", icon: <RefreshCw className="h-4 w-4" />, onClick: () => openChangePlan(sub) },
        { label: "Excluir", icon: <Trash2 className="h-4 w-4" />, destructive: true, onClick: () => setDeleteSubId(sub.id) },
      ]}
    />
  );


  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (subscribers.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Nenhum assinante encontrado
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {isMobile ? (
        <div className="space-y-2">
          {subscribers.map((sub) => {
            const isExpanded = expandedId === sub.user_id + sub.environment;
            return (
              <Card key={sub.id} className="overflow-hidden">
                <button type="button"
                  className="w-full flex items-center justify-between p-3 text-left"
                  onClick={() => setExpandedId(isExpanded ? null : sub.user_id + sub.environment)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate flex items-center gap-2">
                      {sub.display_name || sub.user_id.slice(0, 8)}
                      <Badge variant={planBadgeVariant(sub.product_id)} className="text-[10px] px-1.5 py-0">
                        {planLabel(sub.product_id)}
                      </Badge>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col items-end gap-0.5">
                      {statusBadge(sub.status)}
                      <span className="text-[10px] text-muted-foreground">{daysLeftLabel(sub.current_period_end)}</span>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-2 border-t border-border/30 pt-3 text-sm">
                    <p className="text-muted-foreground"><span className="font-medium text-foreground">Plano:</span> {planLabel(sub.product_id)}</p>
                    <p className="text-muted-foreground"><span className="font-medium text-foreground">Preço:</span> {sub.price_id}</p>
                    <p className="text-muted-foreground"><span className="font-medium text-foreground">Ambiente:</span> {envBadge(sub.environment)}</p>
                    <p className="text-muted-foreground"><span className="font-medium text-foreground">Início:</span> {formatDate(sub.current_period_start)}</p>
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">Vencimento:</span> {formatDate(sub.current_period_end)}
                    </p>
                    {sub.cancel_at_period_end && (
                      <p className="text-xs text-warning font-medium">Cancela ao expirar</p>
                    )}
                    <div className="pt-2 border-t border-border/30">
                      {actionButtons(sub)}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ambiente</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscribers.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {sub.display_name || sub.user_id.slice(0, 8)}
                        <Badge variant={planBadgeVariant(sub.product_id)} className="text-[10px] px-1.5 py-0">
                          {planLabel(sub.product_id)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <div className="w-fit">{statusBadge(sub.status)}</div>
                        <span className="text-[11px] text-muted-foreground">{daysLeftLabel(sub.current_period_end)}</span>
                      </div>
                    </TableCell>
                    <TableCell>{envBadge(sub.environment)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(sub.current_period_start)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(sub.current_period_end)}
                      {sub.cancel_at_period_end && <div className="text-[10px] text-warning mt-0.5">Cancela ao expirar</div>}
                    </TableCell>
                    <TableCell className="text-right">{actionButtons(sub)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editSub} onOpenChange={(open) => !open && setEditSub(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Assinatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Usuário</Label>
              <p className="text-sm text-muted-foreground">{editSub?.display_name || editSub?.user_id.slice(0, 8)}</p>
            </div>
            <div className="space-y-1">
              <Label>Plano</Label>
              <Select value={editProductId} onValueChange={setEditProductId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRODUCT_ID_MAP).map(([label, value]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="trialing">Trial</SelectItem>
                  <SelectItem value="canceled">Cancelado</SelectItem>
                  <SelectItem value="past_due">Pendente</SelectItem>
                  <SelectItem value="paused">Pausado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={saveEdit} className="w-full">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change Plan Dialog */}
      <Dialog open={!!changePlanSub} onOpenChange={(open) => !open && setChangePlanSub(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Definir Plano</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Usuário</Label>
              <p className="text-sm text-muted-foreground">{changePlanSub?.display_name || changePlanSub?.user_id.slice(0, 8)}</p>
            </div>
            <div className="space-y-1">
              <Label>Plano atual</Label>
              <p className="text-sm font-medium text-foreground">{changePlanSub ? planLabel(changePlanSub.product_id) : ""}</p>
            </div>
            <div className="space-y-1">
              <Label>Novo plano</Label>
              <Select value={changePlanProductId} onValueChange={setChangePlanProductId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRODUCT_ID_MAP).map(([label, value]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={saveChangePlan} className="w-full">Alterar Plano</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <ConfirmDeleteDialog
        open={!!deleteSubId}
        onOpenChange={(open) => !open && setDeleteSubId(null)}
        onConfirm={handleDelete}
        title="Excluir assinatura"
        description="Tem certeza que deseja excluir esta assinatura? O usuário perderá o acesso ao plano."
      />
    </>
  );
}