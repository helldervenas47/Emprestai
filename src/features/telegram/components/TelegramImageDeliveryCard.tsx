import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Image as ImageIcon, ChevronDown, Activity, RefreshCw, Loader2, AlertTriangle, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/userClient";


const STORAGE_KEY = "telegram_image_delivery_prefs_v1";

export type ReportKey =
  | "billing"
  | "accumulated_delinquency"
  | "daily_planning"
  | "incomes_expenses"
  | "manager_weekly"
  | "personal_insights";

export interface ImageDeliveryPrefs {
  reports: Record<ReportKey, boolean>;
  includeText: boolean;
  allowedUserIds: string[] | null; // null = todos
}

const REPORTS: { key: ReportKey; label: string; hint: string }[] = [
  { key: "billing", label: "Cobranças do dia", hint: "Relatório diário de cobranças" },
  { key: "accumulated_delinquency", label: "Inadimplência acumulada", hint: "Resumo de atrasos" },
  { key: "daily_planning", label: "Planejamento do dia", hint: "Planejamento diário" },
  { key: "incomes_expenses", label: "Receitas e Despesas", hint: "Resumo financeiro" },
  { key: "manager_weekly", label: "Resumo por gerente", hint: "Resumo semanal por gerente" },
  { key: "personal_insights", label: "Insights pessoais (IA)", hint: "Análise de despesas pessoais" },
];

const DEFAULT_PREFS: ImageDeliveryPrefs = {
  reports: {
    billing: true,
    accumulated_delinquency: true,
    daily_planning: true,
    incomes_expenses: true,
    manager_weekly: true,
    personal_insights: true,
  },
  includeText: true,
  allowedUserIds: null,
};

export function loadImageDeliveryPrefs(): ImageDeliveryPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return {
      reports: { ...DEFAULT_PREFS.reports, ...(parsed.reports || {}) },
      includeText: parsed.includeText ?? true,
      allowedUserIds: Array.isArray(parsed.allowedUserIds) ? parsed.allowedUserIds : null,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

async function fetchPrefsFromDB(): Promise<ImageDeliveryPrefs | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data } = await supabase
    .from("telegram_image_delivery_prefs")
    .select("reports, include_text, allowed_user_ids")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!data) return null;
  return {
    reports: { ...DEFAULT_PREFS.reports, ...((data.reports as any) || {}) },
    includeText: data.include_text !== false,
    allowedUserIds: Array.isArray((data as any).allowed_user_ids)
      ? ((data as any).allowed_user_ids as string[])
      : null,
  };
}

async function savePrefsToDB(prefs: ImageDeliveryPrefs) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return;
  await supabase.from("telegram_image_delivery_prefs").upsert({
    user_id: auth.user.id,
    reports: prefs.reports as any,
    include_text: prefs.includeText,
    allowed_user_ids: prefs.allowedUserIds as any,
    updated_at: new Date().toISOString(),
  });
}

interface UsageState {
  loading: boolean;
  used: number | null;
  limit: number | null;
  error: string | null;
  configured: boolean;
}

export function TelegramImageDeliveryCard() {
  const [prefs, setPrefs] = useState<ImageDeliveryPrefs>(DEFAULT_PREFS);
  const [open, setOpen] = useState(true);
  const [usage, setUsage] = useState<UsageState>({
    loading: true,
    used: null,
    limit: null,
    error: null,
    configured: true,
  });

  const loadUsage = async () => {
    setUsage((u) => ({ ...u, loading: true, error: null }));
    try {
      const { data, error } = await supabase.functions.invoke("html-to-image-usage");
      if (error) throw error;
      const d = data as any;
      setUsage({
        loading: false,
        used: typeof d?.used === "number" ? d.used : null,
        limit: typeof d?.limit === "number" ? d.limit : null,
        error: d?.error ?? null,
        configured: d?.configured !== false,
      });
    } catch (e: any) {
      setUsage({
        loading: false,
        used: null,
        limit: null,
        error: e?.message || "Erro ao consultar consumo",
        configured: true,
      });
    }
  };

  // Lista de usuários do sistema (somente admin tem acesso ao endpoint)
  const [systemUsers, setSystemUsers] = useState<
    { id: string; display_name: string; email: string }[]
  >([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  const loadSystemUsers = async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada. Faça login novamente.");
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "list" },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Erro ao carregar usuários");
      }
      const list = ((data as any)?.users || []).map((u: any) => ({
        id: u.id,
        display_name: u.display_name || u.email,
        email: u.email,
      }));
      setSystemUsers(list);
    } catch (e: any) {
      setUsersError(e?.message || "Erro ao carregar usuários");
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    setPrefs(loadImageDeliveryPrefs());
    loadUsage();
    loadSystemUsers();
    fetchPrefsFromDB().then((p) => {
      if (p) {
        setPrefs(p);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
      }
    });
  }, []);

  const update = (next: ImageDeliveryPrefs) => {
    setPrefs(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    void savePrefsToDB(next);
  };

  const toggleReport = (key: ReportKey, value: boolean) => {
    update({ ...prefs, reports: { ...prefs.reports, [key]: value } });
  };

  const isUserAllowed = (uid: string) => {
    // null/empty = todos liberados (back-compat)
    if (!prefs.allowedUserIds || prefs.allowedUserIds.length === 0) return true;
    return prefs.allowedUserIds.includes(uid);
  };

  const toggleUser = (uid: string, value: boolean) => {
    // Quando saindo do estado "todos" (null), materializa a lista atual
    const baseList: string[] = prefs.allowedUserIds && prefs.allowedUserIds.length > 0
      ? [...prefs.allowedUserIds]
      : systemUsers.map((u) => u.id);
    const set = new Set(baseList);
    if (value) set.add(uid);
    else set.delete(uid);
    update({ ...prefs, allowedUserIds: Array.from(set) });
  };

  const selectAllUsers = () => {
    update({ ...prefs, allowedUserIds: null });
  };

  const clearAllUsers = () => {
    update({ ...prefs, allowedUserIds: [] });
  };

  return (
    <Card no3d>
      <CardContent className="p-4 space-y-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 w-full text-left"
          aria-expanded={open}
        >
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ImageIcon className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm">Envio em formato de imagem</p>
            <p className="text-xs text-muted-foreground">
              Selecione quais relatórios serão enviados como imagem no Telegram.
            </p>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>

        {open && (
          <>
            {/* Indicador de consumo da API HTML→Imagem */}
            {(() => {
              const used = usage.used ?? 0;
              const limit = usage.limit ?? 0;
              const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
              const warning = limit > 0 && pct >= 80 && pct < 100;
              const critical = limit > 0 && pct >= 100;
              const tone = critical
                ? "text-destructive"
                : warning
                  ? "text-warning"
                  : "text-foreground";
              const barClass = critical
                ? "[&>div]:bg-destructive"
                : warning
                  ? "[&>div]:bg-warning"
                  : "";
              return (
                <div className="border-t pt-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Activity className="h-3.5 w-3.5 text-primary shrink-0" />
                      <p className="text-xs font-medium text-foreground truncate">
                        Consumo da API (HTML → Imagem)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={loadUsage}
                      disabled={usage.loading}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                      aria-label="Atualizar consumo"
                    >
                      {usage.loading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>

                  {usage.loading && usage.used === null ? (
                    <p className="text-[11px] text-muted-foreground">Carregando…</p>
                  ) : !usage.configured ? (
                    <p className="text-[11px] text-muted-foreground">
                      Integração HTML→Imagem não configurada.
                    </p>
                  ) : usage.error ? (
                    <p className="text-[11px] text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> {usage.error}
                    </p>
                  ) : (
                    <>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className={cn("text-sm font-semibold tabular-nums", tone)}>
                          {used}/{limit > 0 ? limit : "∞"}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {limit > 0 ? `${pct}% utilizado` : "sem limite"}
                        </span>
                      </div>
                      <Progress value={pct} className={cn("h-2", barClass)} />
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        Imagens geradas no mês atual.
                        {warning && " Atenção: aproximando do limite."}
                        {critical && " Limite atingido — gerações podem falhar."}
                      </p>
                    </>
                  )}
                </div>
              );
            })()}

            <div className="border-t pt-3 space-y-2">
              {REPORTS.map((r) => (
                <label
                  key={r.key}
                  className="flex items-center justify-between gap-3 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{r.label}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{r.hint}</p>
                  </div>
                  <Switch
                    checked={prefs.reports[r.key]}
                    onCheckedChange={(v) => toggleReport(r.key, v)}
                  />
                </label>
              ))}
            </div>

            {/* Lista de usuários autorizados a receber em formato de imagem */}
            <div className="border-t pt-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Users className="h-3.5 w-3.5 text-primary shrink-0" />
                  <p className="text-sm font-medium text-foreground truncate">
                    Usuários autorizados a receber imagem
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={selectAllUsers}
                    className="text-[11px] text-primary hover:underline"
                  >
                    Todos
                  </button>
                  <span className="text-muted-foreground/50">·</span>
                  <button
                    type="button"
                    onClick={clearAllUsers}
                    className="text-[11px] text-muted-foreground hover:underline"
                  >
                    Nenhum
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">
                Apenas os usuários marcados receberão relatórios em formato de imagem. Os
                demais continuarão recebendo no formato padrão (texto).
              </p>

              {usersLoading ? (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Carregando usuários…
                </p>
              ) : usersError ? (
                <p className="text-[11px] text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> {usersError}
                </p>
              ) : systemUsers.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Nenhum usuário cadastrado.
                </p>
              ) : (
                <ScrollArea className="max-h-48 pr-2">
                  <div className="space-y-1.5">
                    {systemUsers.map((u) => (
                      <label
                        key={u.id}
                        className="flex items-center gap-2 py-1 cursor-pointer"
                      >
                        <Checkbox
                          checked={isUserAllowed(u.id)}
                          onCheckedChange={(v) => toggleUser(u.id, v === true)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground truncate">
                            {u.display_name}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {u.email}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>

            <div className="border-t pt-3">
              <label className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Incluir mensagem de texto junto à imagem
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Quando desativado, apenas a imagem será enviada (sem legenda).
                  </p>
                </div>
                <Switch
                  checked={prefs.includeText}
                  onCheckedChange={(v) => update({ ...prefs, includeText: v })}
                />
              </label>
            </div>

            <p className="text-[10px] text-muted-foreground">
              As preferências são salvas neste dispositivo.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

