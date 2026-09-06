import { useState, useEffect } from "react";
import { useIsMobileOrTablet } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/userClient";

import { useClients } from "@/features/clients/hooks/useClients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Shield, UserPlus, Pencil, ChevronDown, Settings2, Link2, CreditCard, Eye } from "lucide-react";
import { toast } from "sonner";
import { useViewAsUser } from "@/features/admin/hooks/useViewAsUser";
import { useAuth } from "@/hooks/useAuth";
import { APP_TABS, APP_TAB_IDS, sanitizeAllowedTabs } from "@/lib/appTabs";
import { normalizeUsername, validateUsernameFormat, isUsernameAvailable } from "@/lib/username";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { confirmWithScroll } from "@/lib/confirmWithScroll";

interface ManagedUser {
  id: string;
  email: string;
  display_name: string;
  username: string | null;
  role: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  is_active: boolean;
  allowed_tabs: string[] | null;
  linked_client_ids: string[];
  plan_id?: string;
  subscription_status?: string;
  subscription_end?: string | null;
  cancel_at_period_end?: boolean;
  owner_id?: string | null;
  trial_plan_name?: string | null;
  trial_started_at?: string | null;
  trial_days_override?: number | null;
}

const ALL_TABS = APP_TABS;

export function UserManagement() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "mine" | "subscribers">("all");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [permissionsUser, setPermissionsUser] = useState<ManagedUser | null>(null);
  const [permTabs, setPermTabs] = useState<string[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);
  const [clientLinkUser, setClientLinkUser] = useState<ManagedUser | null>(null);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [savingClientLinks, setSavingClientLinks] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const { clients } = useClients();
  const [creating, setCreating] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const isMobile = useIsMobileOrTablet();
  const [saving, setSaving] = useState(false);
  const { user: currentUser, role: currentRole } = useAuth();
  const isAdmin = currentRole === "admin";
  const { startViewing } = useViewAsUser();

  const invokeAdminManageUser = async (body: Record<string, unknown>) => {
    let { data: { session } } = await supabase.auth.getSession();
    if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
      const refreshed = await supabase.auth.refreshSession();
      session = refreshed.data.session ?? session;
    }
    if (!session?.access_token) {
      return { data: { error: "Sessão expirada. Faça login novamente." }, error: null };
    }
    const { data: verified, error: verifyError } = await supabase.auth.getUser(session.access_token);
    if (verifyError || !verified?.user) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      Object.keys(localStorage).forEach((k) => { if (k.startsWith("sb-")) localStorage.removeItem(k); });
      return { data: { error: "Sessão expirada. Faça login novamente." }, error: null };
    }
    const result = await supabase.functions.invoke("admin-manage-user", {
      body,
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (result.error && /401|unauthorized|invalid_token|não autorizado/i.test(result.error.message)) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      Object.keys(localStorage).forEach((k) => { if (k.startsWith("sb-")) localStorage.removeItem(k); });
      return { data: { error: "Sessão expirada. Faça login novamente." }, error: null };
    }
    return result;
  };

  const invokeAdminSubscriptionManage = async (body: Record<string, unknown>) => {
    let { data: { session } } = await supabase.auth.getSession();
    if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
      const refreshed = await supabase.auth.refreshSession();
      session = refreshed.data.session ?? session;
    }
    if (!session?.access_token) {
      return { data: { error: "Sessão expirada. Faça login novamente." }, error: null };
    }
    const { data: verified, error: verifyError } = await supabase.auth.getUser(session.access_token);
    if (verifyError || !verified?.user) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      Object.keys(localStorage).forEach((k) => { if (k.startsWith("sb-")) localStorage.removeItem(k); });
      return { data: { error: "Sessão expirada. Faça login novamente." }, error: null };
    }
    const result = await supabase.functions.invoke("admin-subscription-manage", {
      body,
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (result.error && /401|unauthorized|invalid_token/i.test(result.error.message)) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      Object.keys(localStorage).forEach((k) => { if (k.startsWith("sb-")) localStorage.removeItem(k); });
      return { data: { error: "Sessão expirada. Faça login novamente." }, error: null };
    }
    return result;
  };

  const handleViewAs = async (target: ManagedUser) => {
    if (target.id === currentUser?.id) {
      toast.info("Você já está logado nesta conta");
      return;
    }
    if (!confirmWithScroll(`Entrar em modo visualização (somente leitura) como "${target.display_name}"?\n\nVocê poderá ver todos os dados desta conta, mas não poderá alterar nada.`)) return;
    const { error } = await startViewing(target.id);
    if (error) toast.error(error);
  };

  // Plan selection for admins
  const [planUser, setPlanUser] = useState<ManagedUser | null>(null);
  const [planProductId, setPlanProductId] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<{ id: string; name: string; product_id: string }[]>([]);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    username: "",
    display_name: "",
    role: "cliente" as string,
    account_type: "independent" as "independent" | "team_member",
  });
  const [editData, setEditData] = useState({
    email: "",
    password: "",
    username: "",
    display_name: "",
  });

  type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";
  const [createUsernameStatus, setCreateUsernameStatus] = useState<UsernameStatus>("idle");
  const [createUsernameError, setCreateUsernameError] = useState<string | null>(null);
  const [editUsernameStatus, setEditUsernameStatus] = useState<UsernameStatus>("idle");
  const [editUsernameError, setEditUsernameError] = useState<string | null>(null);

  // Debounced live check — create
  useEffect(() => {
    const u = normalizeUsername(formData.username);
    if (!u) { setCreateUsernameStatus("idle"); setCreateUsernameError(null); return; }
    const fmt = validateUsernameFormat(u);
    if (fmt) { setCreateUsernameStatus("invalid"); setCreateUsernameError(fmt); return; }
    setCreateUsernameStatus("checking"); setCreateUsernameError(null);
    const t = setTimeout(async () => {
      const ok = await isUsernameAvailable(u);
      if (ok) { setCreateUsernameStatus("available"); setCreateUsernameError(null); }
      else { setCreateUsernameStatus("taken"); setCreateUsernameError("Nome de usuário já está em uso."); }
    }, 400);
    return () => clearTimeout(t);
  }, [formData.username]);

  // Debounced live check — edit (ignora o próprio usuário)
  useEffect(() => {
    const u = normalizeUsername(editData.username);
    if (!u) { setEditUsernameStatus("idle"); setEditUsernameError(null); return; }
    const fmt = validateUsernameFormat(u);
    if (fmt) { setEditUsernameStatus("invalid"); setEditUsernameError(fmt); return; }
    if (editingUser && u === (editingUser.username || "").toLowerCase()) {
      setEditUsernameStatus("available"); setEditUsernameError(null); return;
    }
    setEditUsernameStatus("checking"); setEditUsernameError(null);
    const t = setTimeout(async () => {
      const ok = await isUsernameAvailable(u, editingUser?.id);
      if (ok) { setEditUsernameStatus("available"); setEditUsernameError(null); }
      else { setEditUsernameStatus("taken"); setEditUsernameError("Nome de usuário já está em uso."); }
    }, 400);
    return () => clearTimeout(t);
  }, [editData.username, editingUser]);

  const fetchUsers = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }

    const { data, error } = await invokeAdminManageUser({ action: "list" });

    if (error || data?.error) {
      const errMsg = data?.error || "Erro ao carregar usuários";
      if (errMsg === "Não autorizado") {
        toast.error("Sessão expirada. Faça login novamente.");
        await supabase.auth.signOut();
      } else {
        toast.error(errMsg);
      }
    } else {
      const usersList = data.users || [];
      // Fetch plans and actual user_owner links directly from the database
      if (usersList.length > 0) {
        const userIds = usersList.map((u: ManagedUser) => u.id);
        const [subsRes, ownersRes] = await Promise.all([
          supabase
            .from("subscriptions")
            .select("user_id, product_id, environment, status, current_period_end, cancel_at_period_end, updated_at")
            .in("user_id", userIds),
          supabase
            .from("user_owner")
            .select("user_id, owner_id")
            .in("user_id", userIds),
        ]);

        const subs = subsRes.data;
        const owners = ownersRes.data;
        const ownerMap = new Map((owners || []).map((o: any) => [o.user_id, o.owner_id]));

        // Pick the most relevant subscription per user:
        // prefer active/non-free plans, then most recently updated.
        const subMap = new Map<string, any>();
        (subs || [])
          .slice()
          .sort((a: any, b: any) => {
            const aFree = !a.product_id || a.product_id === "free_plan" ? 1 : 0;
            const bFree = !b.product_id || b.product_id === "free_plan" ? 1 : 0;
            if (aFree !== bFree) return aFree - bFree;
            return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
          })
          .forEach((s: any) => {
            if (!subMap.has(s.user_id)) subMap.set(s.user_id, s);
          });

        usersList.forEach((u: ManagedUser) => {
          u.owner_id = ownerMap.get(u.id) || null;
          const s = subMap.get(u.id);
          let planId = s?.product_id || "free_plan";
          let status = s?.status || "none";
          let end = s?.current_period_end ?? null;

          const now = new Date().toISOString();
          const trialDays = u.trial_days_override ?? 7;
          const trialEnd = u.trial_started_at
            ? new Date(new Date(u.trial_started_at).getTime() + trialDays * 86400000).toISOString()
            : null;
          const isTrialActive = trialEnd ? trialEnd > now : false;
          const isPaidPeriodActive = end ? end > now : false;

          // Se a conta ainda possui dias restantes válidos (período pago ou teste grátis ativo),
          // ela NÃO deve ser considerada em atraso (past_due), mesmo que uma cobrança PIX tenha sido gerada e ainda não paga.
          if (isPaidPeriodActive && status !== "canceled" && status !== "suspended") {
            status = "active";
          } else if (isTrialActive && status !== "active") {
            status = "trialing";
            if (u.trial_plan_name) {
              planId = u.trial_plan_name.toLowerCase();
            }
            end = trialEnd;
          } else if (status === "active" || status === "trialing") {
            if (end && end <= now) {
              status = "expired";
            }
          } else if (status === "none" && trialEnd && trialEnd <= now) {
            status = "expired";
            end = trialEnd;
          }

          u.plan_id = planId;
          u.subscription_status = status;
          u.subscription_end = end;
          u.cancel_at_period_end = !!s?.cancel_at_period_end;
        });
      }

      setUsers(usersList);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
    // Realtime: qualquer bump em profiles (subscription_bump_at) refetcha a lista.
    // Escuta em toda a tabela (schema.public) — admin já tem acesso amplo por RLS.
    const ch = supabase
      .channel("admin-users-bump")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "subscriptions" },
        () => fetchUsers(),
      )
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch { /* noop */ } };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.password || !formData.role) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (formData.password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }
    const usernameFmt = validateUsernameFormat(formData.username);
    if (usernameFmt) {
      toast.error(usernameFmt);
      return;
    }
    if (createUsernameStatus === "taken") {
      toast.error("Nome de usuário já está em uso.");
      return;
    }
    if (createUsernameStatus === "checking") {
      toast.info("Verificando disponibilidade do nome de usuário…");
      return;
    }
    setCreating(true);
    const normalizedUsername = normalizeUsername(formData.username);
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: { ...formData, username: normalizedUsername },
    });


    if (error || data?.error) {
      toast.error(data?.error || "Erro ao criar usuário");
    } else {
      toast.success("Usuário criado com sucesso!");
      setShowCreateForm(false);
      setFormData({ email: "", password: "", username: "", display_name: "", role: "cliente", account_type: "independent" });
      fetchUsers();
    }
    setCreating(false);
  };

  const handleToggleOwnership = async (user: ManagedUser) => {
    const isTeam = !!user.owner_id;
    const action = isTeam ? "set_independent" : "link_owner";
    const confirmMsg = isTeam
      ? `Tornar a conta de ${user.display_name || user.username || user.email} independente (desvincular da sua equipe e isolar dados)?`
      : `Vincular a conta de ${user.display_name || user.username || user.email} como membro da sua equipe (ele terá acesso aos seus dados)?`;

    if (!confirmWithScroll(confirmMsg)) return;

    let success = false;
    let errorMsg = "";

    try {
      if (isTeam) {
        const { error: delErr } = await (supabase as any)
          .from("user_owner")
          .delete()
          .eq("user_id", user.id);
        if (!delErr) {
          success = true;
        } else {
          errorMsg = delErr.message;
        }
      } else {
        const { error: insErr } = await (supabase as any)
          .from("user_owner")
          .upsert(
            { user_id: user.id, owner_id: currentUser?.id },
            { onConflict: "user_id" },
          );
        if (!insErr) {
          success = true;
        } else {
          errorMsg = insErr.message;
        }
      }
    } catch (err: any) {
      errorMsg = err?.message || "Erro desconhecido";
    }

    // Notifica também a edge function
    invokeAdminManageUser({ action, user_id: user.id }).catch(() => {});

    if (success) {
      toast.success(isTeam ? "Conta agora é independente!" : "Conta vinculada à equipe!");
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, owner_id: isTeam ? null : (currentUser?.id || "linked") } : u
        )
      );
      fetchUsers();
    } else {
      toast.error(errorMsg || "Erro ao alterar vínculo da conta");
    }
  };

  const handleUpdateRole = async (userId: string, role: string) => {
    const { data, error } = await invokeAdminManageUser({ action: "update_role", user_id: userId, role });
    if (error || data?.error) {
      toast.error(data?.error || "Erro ao atualizar papel");
    } else {
      toast.success("Papel atualizado!");
      fetchUsers();
    }
  };

  const openEdit = (user: ManagedUser) => {
    setEditingUser(user);
    setEditData({
      email: user.email,
      password: "",
      username: user.username || "",
      display_name: user.display_name,
    });
  };

  const openClientLinks = (user: ManagedUser) => {
    setClientLinkUser(user);
    setSelectedClientIds(user.linked_client_ids || []);
    setClientSearch("");
  };

  const handleToggleClient = (clientId: string) => {
    setSelectedClientIds(prev =>
      prev.includes(clientId) ? prev.filter(c => c !== clientId) : [...prev, clientId]
    );
  };

  const handleSaveClientLinks = async () => {
    if (!clientLinkUser) return;
    setSavingClientLinks(true);
    const { data, error } = await invokeAdminManageUser({ action: "update_client_links", user_id: clientLinkUser.id, client_ids: selectedClientIds });
    if (error || data?.error) {
      toast.error(data?.error || "Erro ao salvar vínculos");
    } else {
      toast.success("Vínculos de clientes atualizados!");
      setClientLinkUser(null);
      fetchUsers();
    }
    setSavingClientLinks(false);
  };

  const openPermissions = (user: ManagedUser) => {
    setPermissionsUser(user);
    // Sanitize: drop tab ids that no longer exist in the app, default to all current tabs.
    setPermTabs(user.allowed_tabs ? sanitizeAllowedTabs(user.allowed_tabs) : APP_TAB_IDS.slice());
  };

  const handleToggleTab = (tabId: string) => {
    setPermTabs(prev =>
      prev.includes(tabId) ? prev.filter(t => t !== tabId) : [...prev, tabId]
    );
  };

  const handleSavePermissions = async () => {
    if (!permissionsUser) return;
    setSavingPerms(true);
    const cleaned = sanitizeAllowedTabs(permTabs);
    const { data, error } = await invokeAdminManageUser({ action: "update_permissions", user_id: permissionsUser.id, allowed_tabs: cleaned });
    if (error || data?.error) {
      toast.error(data?.error || "Erro ao salvar permissões");
    } else {
      toast.success("Permissões atualizadas!");
      setPermissionsUser(null);
      fetchUsers();
    }
    setSavingPerms(false);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    const usernameFmt = validateUsernameFormat(editData.username);
    if (usernameFmt) {
      toast.error(usernameFmt);
      return;
    }
    if (editUsernameStatus === "taken") {
      toast.error("Nome de usuário já está em uso.");
      return;
    }
    if (editUsernameStatus === "checking") {
      toast.info("Verificando disponibilidade do nome de usuário…");
      return;
    }
    setSaving(true);
    const body: Record<string, unknown> = {
      action: "update_user",
      user_id: editingUser.id,
      display_name: editData.display_name,
      username: normalizeUsername(editData.username),
    };
    if (editData.email !== editingUser.email) body.email = editData.email;
    if (editData.password) body.password = editData.password;

    const { data, error } = await invokeAdminManageUser(body);
    if (error || data?.error) {
      toast.error(data?.error || "Erro ao atualizar usuário");
    } else {
      toast.success("Usuário atualizado!");
      setEditingUser(null);
      fetchUsers();
    }
    setSaving(false);
  };

  const handleDelete = async (userId: string, name: string) => {
    if (!confirmWithScroll(`Tem certeza que deseja excluir o usuário "${name}"?`)) return;

    const { data, error } = await invokeAdminManageUser({ action: "delete", user_id: userId });

    if (error || data?.error) {
      toast.error(data?.error || "Erro ao excluir usuário");
    } else {
      toast.success("Usuário excluído!");
      fetchUsers();
    }
  };

  const handleToggleActive = async (userId: string, active: boolean) => {
    const { data, error } = await invokeAdminManageUser({ action: "toggle_active", user_id: userId, active });
    if (error || data?.error) {
      toast.error(data?.error || "Erro ao alterar status");
    } else {
      toast.success(active ? "Usuário ativado!" : "Usuário desativado!");
      fetchUsers();
    }
  };

  const PRODUCT_ID_MAP: Record<string, string> = {
    free_plan: "Free",
    basico_plan: "Básico",
    profissional_plan: "Profissional",
    empresarial_plan: "Empresarial",
  };

  const openPlanSelector = async (user: ManagedUser) => {
    setPlanUser(user);
    // Pre-select the user's current plan. Prefer the value already loaded
    // (plan_id), then fall back to a fresh query covering both environments.
    if (user.plan_id) {
      setPlanProductId(user.plan_id);
      return;
    }
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("product_id, environment")
      .eq("user_id", user.id);
    const active =
      subs?.find((s: any) => s.product_id && s.product_id !== "free_plan") ||
      subs?.[0];
    setPlanProductId(active?.product_id || "free_plan");
  };

  const handleSavePlan = async () => {
    if (!planUser) return;
    setSavingPlan(true);
    try {
      const planName = PRODUCT_ID_MAP[planProductId];
      if (!planName) throw new Error("Plano inválido");

      const { data: plan, error: planError } = await supabase
        .from("plans")
        .select("id, allowed_tabs")
        .eq("name", planName)
        .eq("active", true)
        .maybeSingle();

      if (planError) throw new Error(planError.message);

      const endDate = new Date(Date.now() + 30 * 86400_000).toISOString();
      const { data, error } = await invokeAdminSubscriptionManage({
        action: "grant_plan",
        target_user_id: planUser.id,
        plan_id: plan?.id,
        product_id: planProductId,
        note: "Alteração manual pela aba Usuários",
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Erro ao atualizar plano");
      }

      toast.success("Plano atualizado!");
      setPlanUser(null);
      await fetchUsers();
    } catch (e) {
      toast.error((e as Error).message || "Erro ao atualizar plano");
    } finally {
      setSavingPlan(false);
    }
  };

  const roleBadgeVariant = (role: string | null) => {
    if (role === "admin") return "default";
    if (role === "cliente") return "secondary";
    if (role === "gerente") return "secondary";
    return "outline";
  };

  const roleLabel = (role: string | null) => {
    if (role === "admin") return "Admin";
    if (role === "cliente") return "Cliente";
    if (role === "gerente") return "Gerente";
    if (role === "visualizador") return "Visualizador";
    return "Sem papel";
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

  const subStatusLabel = (s: string | undefined) => {
    switch (s) {
      case "active": return "Ativa";
      case "trialing": return "Em teste";
      case "suspended": return "Suspensa";
      case "canceled": return "Cancelada";
      case "expired": return "Expirada";
      case "past_due": return "Em atraso";
      case "none":
      default: return "Sem plano";
    }
  };
  const subStatusBadge = (s: string | undefined): "default" | "secondary" | "destructive" | "destructive-solid" | "outline" | "success" | "success-solid" => {
    if (s === "active") return "success-solid";
    if (s === "trialing") return "default";
    if (s === "suspended" || s === "canceled" || s === "expired") return "destructive-solid";
    if (s === "past_due") return "secondary";
    return "outline";
  };
  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleDateString("pt-BR"); } catch { return "—"; }
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

  const normalizeUserText = (value: string | null | undefined) =>
    (value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const isLegacyUserCreatedByMe = (user: ManagedUser) => {
    const text = normalizeUserText(`${user.display_name} ${user.username || ""} ${user.email || ""}`);
    return (
      (text.includes("renan") && text.includes("mota")) ||
      (text.includes("thiago") && text.includes("ferraz")) ||
      (text.includes("helder") && text.includes("venas"))
    );
  };

  const isCreatedByCurrentUser = (user: ManagedUser) =>
    (user.owner_id && currentUser?.id && user.owner_id === currentUser.id) || isLegacyUserCreatedByMe(user);

  const mineUsers = users.filter(isCreatedByCurrentUser);
  const subscriberUsers = users.filter((u) => !isCreatedByCurrentUser(u) && (!u.owner_id || u.owner_id === u.id));
  const displayedUsers = activeTab === "all" ? users : activeTab === "mine" ? mineUsers : subscriberUsers;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Usuários ({displayedUsers.length})
        </h2>
        <Button onClick={() => setShowCreateForm(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Novo Usuário
        </Button>
      </div>

      <div className="inline-flex rounded-md border border-border bg-muted/30 p-1 gap-1">
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${activeTab === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          Todos ({users.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("mine")}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${activeTab === "mine" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          Criados por mim ({mineUsers.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("subscribers")}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${activeTab === "subscribers" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          Assinantes ({subscriberUsers.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : displayedUsers.length === 0 ? (
        <Card no3d>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum usuário encontrado
          </CardContent>
        </Card>
      ) : (
        isMobile ? (
          <div className="space-y-2">
            {displayedUsers.map((user) => {
              const isExpanded = expandedUserId === user.id;
              return (
                <Card no3d key={user.id} className="overflow-hidden">
                  <button type="button"
                    className="w-full flex items-center justify-between p-3 text-left"
                    onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-bold text-foreground truncate max-w-full">{user.display_name}</p>
                        <Badge variant={planBadgeVariant(user.plan_id)} className="text-[10px] px-2 py-0.5 shrink-0 whitespace-nowrap font-semibold">
                          {planLabel(user.plan_id)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{user.username || "—"}</p>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-3 border-t border-border/30 pt-3">
                      <div className="space-y-1 text-sm">
                        <p className="text-muted-foreground"><span className="font-medium text-foreground">Email:</span> {user.email}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-foreground">Assinatura:</span>
                          <Badge variant={subStatusBadge(user.subscription_status)} className="text-[10px] px-1.5 py-0">
                            {subStatusLabel(user.subscription_status)}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">{daysLeftLabel(user.subscription_end)}</span>
                        </div>
                        <p className="text-muted-foreground">
                          <span className="font-medium text-foreground">Expira:</span> {formatDate(user.subscription_end) || "—"}
                          {user.cancel_at_period_end ? <span className="ml-2 text-[10px] text-warning">Cancela ao expirar</span> : null}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">Status:</span>
                          <div className="flex items-center gap-1.5">
                            <Switch
                              checked={user.is_active}
                              onCheckedChange={(checked) => handleToggleActive(user.id, checked)}
                            />
                            <span className={`text-xs ${user.is_active ? "text-success" : "text-destructive"}`}>
                              {user.is_active ? "Ativo" : "Inativo"}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">Papel:</span>
                          <Select value={user.role || ""} onValueChange={(val) => handleUpdateRole(user.id, val)}>
                            <SelectTrigger className="w-[130px] h-7 text-xs">
                              <SelectValue>
                                <Badge variant={roleBadgeVariant(user.role)}>{roleLabel(user.role)}</Badge>
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin"><div className="flex items-center gap-2"><Shield className="h-3 w-3" /> Admin</div></SelectItem>
                              <SelectItem value="cliente">Cliente</SelectItem>
                              <SelectItem value="gerente">Gerente</SelectItem>
                              <SelectItem value="visualizador">Visualizador</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {isAdmin && (
                          <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => openPlanSelector(user)}>
                            <CreditCard className="h-3.5 w-3.5" /> Plano
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => openClientLinks(user)}>
                          <Link2 className="h-3.5 w-3.5" /> Clientes
                          {user.linked_client_ids?.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px] px-1">{user.linked_client_ids.length}</Badge>}
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => handleViewAs(user)} title="Visualizar como (somente leitura)">
                          <Eye className="h-3.5 w-3.5" /> Ver como
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => openEdit(user)}>
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1 text-destructive hover:text-destructive" onClick={() => handleDelete(user.id, user.display_name)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
        <Card no3d>
          <CardContent className="p-0 overflow-x-auto">
            <Table className="min-w-[950px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap min-w-[200px]">Nome</TableHead>
                  <TableHead className="whitespace-nowrap min-w-[120px]">Usuário</TableHead>
                  <TableHead className="whitespace-nowrap min-w-[190px]">Email</TableHead>
                  <TableHead className="whitespace-nowrap min-w-[130px]">Assinatura</TableHead>
                  <TableHead className="whitespace-nowrap min-w-[110px]">Expira</TableHead>
                  <TableHead className="whitespace-nowrap min-w-[110px]">Status</TableHead>
                  <TableHead className="whitespace-nowrap min-w-[150px]">Papel</TableHead>
                  <TableHead className="text-right whitespace-nowrap min-w-[160px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                  {displayedUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-[180px]" title={user.display_name}>{user.display_name}</span>
                        <Badge variant={planBadgeVariant(user.plan_id)} className="text-[10px] px-1.5 py-0 shrink-0">
                          {planLabel(user.plan_id)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap font-mono text-xs">{user.username || "—"}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap text-xs">{user.email}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex flex-col gap-0.5">
                        <Badge variant={subStatusBadge(user.subscription_status)} className="text-[10px] px-1.5 py-0 w-fit">
                          {subStatusLabel(user.subscription_status)}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">{daysLeftLabel(user.subscription_end)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(user.subscription_end)}
                      {user.cancel_at_period_end ? <div className="text-[10px] text-warning whitespace-nowrap">Cancela ao expirar</div> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <Switch
                          checked={user.is_active}
                          onCheckedChange={(checked) => handleToggleActive(user.id, checked)}
                        />
                        <span className={`text-xs whitespace-nowrap ${user.is_active ? "text-success" : "text-destructive"}`}>
                          {user.is_active ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Select
                        value={user.role || ""}
                        onValueChange={(val) => handleUpdateRole(user.id, val)}
                      >
                        <SelectTrigger className="w-[130px] h-8 text-xs">
                          <SelectValue>
                            <Badge variant={roleBadgeVariant(user.role)}>
                              {roleLabel(user.role)}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">
                            <div className="flex items-center gap-2">
                              <Shield className="h-3 w-3" /> Admin
                            </div>
                          </SelectItem>
                          <SelectItem value="cliente">Cliente</SelectItem>
                          <SelectItem value="gerente">Gerente</SelectItem>
                          <SelectItem value="visualizador">Visualizador</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex gap-1 justify-end items-center">
                        {isAdmin ? (
                          <Button variant="ghost" size="icon" onClick={() => openPlanSelector(user)} className="h-8 w-8 shrink-0" title="Definir plano">
                            <CreditCard className="h-4 w-4" />
                          </Button>
                        ) : (
                          <div className="h-8 w-8" />
                        )}
                        <Button variant="ghost" size="icon" onClick={() => openClientLinks(user)} className="h-8 w-8 shrink-0" title="Vincular clientes">
                          <Link2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleViewAs(user)} className="h-8 w-8 shrink-0" title="Visualizar como (somente leitura)">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(user)} className="h-8 w-8 shrink-0" title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(user.id, user.display_name)} className="h-8 w-8 shrink-0 text-destructive hover:text-destructive" title="Excluir">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        )
      )}

      {/* Create user dialog */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                placeholder="Nome completo"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Nome de usuário *</Label>
              <Input
                placeholder="usuario.123"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: normalizeUsername(e.target.value) })}
                required
                minLength={4}
                maxLength={30}
                aria-invalid={createUsernameStatus === "taken" || createUsernameStatus === "invalid"}
              />
              <div className={`text-xs flex items-center gap-1 ${
                createUsernameStatus === "taken" || createUsernameStatus === "invalid" ? "text-destructive" :
                createUsernameStatus === "available" ? "text-emerald-600" : "text-muted-foreground"
              }`}>
                {createUsernameStatus === "checking" && <Loader2 className="h-3 w-3 animate-spin" />}
                {createUsernameStatus === "available" && <CheckCircle2 className="h-3 w-3" />}
                {(createUsernameStatus === "taken" || createUsernameStatus === "invalid") && <AlertCircle className="h-3 w-3" />}
                <span>
                  {createUsernameStatus === "taken" || createUsernameStatus === "invalid"
                    ? (createUsernameError ?? "Nome de usuário indisponível")
                    : createUsernameStatus === "available"
                      ? "Disponível"
                      : createUsernameStatus === "checking"
                        ? "Verificando…"
                        : "4–30 caracteres · letras, números, . _ -"}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="email@exemplo.com (opcional)"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Senha *</Label>
              <Input
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Papel *</Label>
              <Select value={formData.role} onValueChange={(val) => setFormData({ ...formData, role: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="cliente">Cliente</SelectItem>
                  <SelectItem value="gerente">Gerente</SelectItem>
                  <SelectItem value="visualizador">Visualizador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Criando..." : "Criar Usuário"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit user dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                placeholder="Nome completo"
                value={editData.display_name}
                onChange={(e) => setEditData({ ...editData, display_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Nome de usuário *</Label>
              <Input
                placeholder="usuario.123"
                value={editData.username}
                onChange={(e) => setEditData({ ...editData, username: normalizeUsername(e.target.value) })}
                required
                minLength={4}
                maxLength={30}
                aria-invalid={editUsernameStatus === "taken" || editUsernameStatus === "invalid"}
              />
              <div className={`text-xs flex items-center gap-1 ${
                editUsernameStatus === "taken" || editUsernameStatus === "invalid" ? "text-destructive" :
                editUsernameStatus === "available" ? "text-emerald-600" : "text-muted-foreground"
              }`}>
                {editUsernameStatus === "checking" && <Loader2 className="h-3 w-3 animate-spin" />}
                {editUsernameStatus === "available" && <CheckCircle2 className="h-3 w-3" />}
                {(editUsernameStatus === "taken" || editUsernameStatus === "invalid") && <AlertCircle className="h-3 w-3" />}
                <span>
                  {editUsernameStatus === "taken" || editUsernameStatus === "invalid"
                    ? (editUsernameError ?? "Nome de usuário indisponível")
                    : editUsernameStatus === "available"
                      ? "Disponível"
                      : editUsernameStatus === "checking"
                        ? "Verificando…"
                        : "4–30 caracteres · letras, números, . _ -"}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="email@exemplo.com"
                value={editData.email}
                onChange={(e) => setEditData({ ...editData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Nova Senha (deixe vazio para manter)</Label>
              <Input
                type="password"
                placeholder="Nova senha"
                value={editData.password}
                onChange={(e) => setEditData({ ...editData, password: e.target.value })}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>


      {/* Client links dialog */}
      <Dialog open={!!clientLinkUser} onOpenChange={(open) => !open && setClientLinkUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular Clientes — {clientLinkUser?.display_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecione os clientes que este usuário poderá visualizar. Sem vínculo = acesso a todos.
            </p>
            <Input
              placeholder="Buscar cliente..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
            />
            <ScrollArea className="h-[300px] border rounded-md p-2">
              {clients.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum cliente cadastrado</p>
              ) : (
                <div className="space-y-2">
                  {clients
                    .filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
                    .map((client) => (
                      <div key={client.id} className="flex items-center gap-3 py-1.5 px-1 rounded hover:bg-muted/50">
                        <Checkbox
                          checked={selectedClientIds.includes(client.id)}
                          onCheckedChange={() => handleToggleClient(client.id)}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{client.name}</p>
                          {client.phone && <p className="text-xs text-muted-foreground">{client.phone}</p>}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </ScrollArea>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{selectedClientIds.length} selecionado(s)</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedClientIds([])}>Limpar</Button>
                <Button variant="outline" size="sm" onClick={() => setSelectedClientIds(clients.map(c => c.id))}>Todos</Button>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setClientLinkUser(null)}>Cancelar</Button>
              <Button onClick={handleSaveClientLinks} disabled={savingClientLinks}>
                {savingClientLinks ? "Salvando..." : "Salvar Vínculos"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Plan selector dialog (admin only) */}
      <Dialog open={!!planUser} onOpenChange={(open) => !open && setPlanUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Definir Plano — {planUser?.display_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecione o plano deste administrador. Sub-usuários herdarão o mesmo plano.
            </p>
            <Select value={planProductId} onValueChange={setPlanProductId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PRODUCT_ID_MAP).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setPlanUser(null)}>Cancelar</Button>
              <Button onClick={handleSavePlan} disabled={savingPlan}>
                {savingPlan ? "Salvando..." : "Salvar Plano"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
