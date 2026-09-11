/**
 * Painel admin para configurar permissões granulares por papel.
 *
 * Localizado em Administração → Papéis & Permissões. Suporta:
 * - matriz Módulo × (Ver, Criar, Editar, Excluir) por papel via tabs;
 * - persistência em `role_permissions` (upsert por linha alterada);
 * - histórico de alterações (`role_permissions_audit`).
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Save, History, ShieldCheck, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  PERMISSION_ROLES,
  type PermissionAction,
} from "@/features/admin/lib/permissionModules";
import {
  useAllRolePermissions,
  useRolePermissionsAudit,
  type RolePermissionRow,
} from "@/features/admin/hooks/useRolePermissions";
import { useRoleTabPermissions } from "@/features/admin/hooks/useRoleTabPermissions";
import { APP_TABS } from "@/lib/appTabs";

type DraftMap = Record<string, Partial<Record<"can_view" | "can_create" | "can_edit" | "can_delete", boolean>>>;
// key: `${role}|${module}`

const ACTION_COL: Record<PermissionAction, "can_view" | "can_create" | "can_edit" | "can_delete"> = {
  view: "can_view",
  create: "can_create",
  edit: "can_edit",
  delete: "can_delete",
};

function keyOf(role: string, module: string) {
  return `${role}|${module}`;
}

export function RolePermissionsMatrix() {
  const { rows, byRole, loading, upsertMany } = useAllRolePermissions();
  const [activeRole, setActiveRole] = useState<string>(PERMISSION_ROLES[0].key);
  const [draft, setDraft] = useState<DraftMap>({});
  const [saving, setSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Reset drafts ao trocar de aba ou quando dados externos mudam.
  useEffect(() => {
    setDraft({});
  }, [activeRole, rows]);

  const currentRows = useMemo<RolePermissionRow[]>(
    () => byRole.get(activeRole) || [],
    [byRole, activeRole],
  );

  const getCurrentValue = (module: string, action: PermissionAction): boolean => {
    const k = keyOf(activeRole, module);
    const col = ACTION_COL[action];
    if (draft[k] && col in draft[k]) return !!draft[k][col];
    const row = currentRows.find((r) => r.module === module);
    return row ? !!row[col] : false;
  };

  const setValue = (module: string, action: PermissionAction, value: boolean) => {
    const k = keyOf(activeRole, module);
    setDraft((prev) => ({ ...prev, [k]: { ...prev[k], [ACTION_COL[action]]: value } }));
  };

  const dirtyCount = Object.keys(draft).length;

  const save = async () => {
    setSaving(true);
    try {
      const changes: Array<Pick<RolePermissionRow, "role" | "module"> & Partial<Pick<RolePermissionRow, "can_view" | "can_create" | "can_edit" | "can_delete">>> = [];
      Object.entries(draft).forEach(([k, patch]) => {
        const [role, module] = k.split("|");
        const base = (byRole.get(role) || []).find((r) => r.module === module);
        changes.push({
          role,
          module,
          can_view: base?.can_view ?? false,
          can_create: base?.can_create ?? false,
          can_edit: base?.can_edit ?? false,
          can_delete: base?.can_delete ?? false,
          ...patch,
        });
      });
      await upsertMany(changes);
      toast.success(`${changes.length} permissão(ões) atualizada(s).`);
      setDraft({});
    } catch (e) {
      toast.error("Falha ao salvar permissões: " + ((e as Error).message || ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-xl"
          >
            <CardHeader className="flex-row items-center justify-between space-y-0 p-4 sm:p-6 cursor-pointer hover:bg-muted/30 transition-colors rounded-xl">
              <div className="space-y-1 min-w-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4 text-primary shrink-0" /> Papéis &amp; Permissões
                </CardTitle>
                <CardDescription>
                  Defina quais ações cada papel pode realizar em cada módulo e quais abas ficam visíveis.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground hidden sm:inline font-medium">
                  {isOpen ? "Recolher" : "Expandir"}
                </span>
                <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center border border-border/50">
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </div>
            </CardHeader>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <Tabs defaultValue="matrix" className="w-full">
              <div className="flex items-center justify-between gap-4">
                <TabsList className="grid h-auto flex-1 grid-cols-3">
                  <TabsTrigger value="matrix" className="w-full">Ações</TabsTrigger>
                  <TabsTrigger value="tabs" className="w-full">Abas visíveis</TabsTrigger>
                  <TabsTrigger value="history" className="w-full">
                    <History className="h-3.5 w-3.5 mr-1" /> Histórico
                  </TabsTrigger>
                </TabsList>

                <div className="hidden md:flex items-center justify-end gap-2">
                  {dirtyCount > 0 && (
                    <Badge variant="secondary">{dirtyCount} alteração(ões) pendentes</Badge>
                  )}
                  <Button onClick={save} disabled={saving || dirtyCount === 0} size="sm">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    <span className="ml-2">Salvar</span>
                  </Button>
                </div>
              </div>

              <TabsContent value="tabs" className="mt-4">
                <RoleTabsMatrix />
              </TabsContent>


          <TabsContent value="matrix" className="mt-4">
            <Tabs value={activeRole} onValueChange={setActiveRole}>
              <TabsList className="flex flex-wrap gap-1 h-auto">
                {PERMISSION_ROLES.map((r) => (
                  <TabsTrigger key={r.key} value={r.key} className="flex-1 min-w-[100px]">
                    {r.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {PERMISSION_ROLES.map((r) => (
                <TabsContent key={r.key} value={r.key} className="mt-4">
                  {loading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <>
                      {/* Desktop/tablet: tabela */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left font-medium text-muted-foreground py-2 pr-4">Módulo</th>
                              {PERMISSION_ACTIONS.map((a) => (
                                <th key={a.key} className="text-center font-medium text-muted-foreground py-2 px-2 w-20">
                                  {a.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {PERMISSION_MODULES.map((mod) => (
                              <tr key={mod.key} className="border-b border-border/60 last:border-0">
                                <td className="py-2 pr-4">
                                  <div className="font-medium text-foreground">{mod.label}</div>
                                  <div className="text-xs text-muted-foreground">{mod.key}</div>
                                </td>
                                {PERMISSION_ACTIONS.map((a) => (
                                  <td key={a.key} className="text-center py-2 px-2">
                                    <Switch
                                      checked={getCurrentValue(mod.key, a.key)}
                                      onCheckedChange={(v) => setValue(mod.key, a.key, !!v)}
                                      disabled={r.key === "admin"}
                                      aria-label={`${mod.label} - ${a.label}`}
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile: cards por módulo */}
                      <div className="md:hidden space-y-3">
                        {PERMISSION_MODULES.map((mod) => (
                          <div key={mod.key} className="rounded-lg border border-border p-3">
                            <div className="mb-2">
                              <div className="font-medium text-foreground text-sm">{mod.label}</div>
                              <div className="text-[11px] text-muted-foreground">{mod.key}</div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {PERMISSION_ACTIONS.map((a) => (
                                <label
                                  key={a.key}
                                  className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2"
                                >
                                  <span className="text-xs text-foreground">{a.label}</span>
                                  <Switch
                                    checked={getCurrentValue(mod.key, a.key)}
                                    onCheckedChange={(v) => setValue(mod.key, a.key, !!v)}
                                    disabled={r.key === "admin"}
                                    aria-label={`${mod.label} - ${a.label}`}
                                  />
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {r.key === "admin" && (
                        <p className="text-xs text-muted-foreground mt-3">
                          O papel <strong>Admin</strong> sempre tem acesso total e não pode ser
                          restringido.
                        </p>
                      )}
                    </>
                  )}
                </TabsContent>
              ))}

            </Tabs>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <RolePermissionsHistory />
          </TabsContent>

          <div className="mt-5 space-y-2 md:hidden">
            {dirtyCount > 0 && (
              <Badge variant="secondary" className="w-full justify-center">
                {dirtyCount} alteração(ões) pendentes
              </Badge>
            )}
            <Button onClick={save} disabled={saving || dirtyCount === 0} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span className="ml-2">Salvar</span>
            </Button>
          </div>
        </Tabs>
      </CardContent>
    </CollapsibleContent>
  </Collapsible>
</Card>
  );
}

function RolePermissionsHistory() {
  const { rows, loading } = useRolePermissionsAudit(100);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">Nenhuma alteração registrada ainda.</p>;
  }

  const fmt = (b?: Record<string, boolean> | null) =>
    !b ? "—" : Object.entries(b).map(([k, v]) => `${k.replace("can_", "")}=${v ? "✓" : "✗"}`).join(" ");

  return (
    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
      {rows.map((r) => (
        <div key={r.id} className="rounded-md border border-border p-3 text-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="font-medium text-foreground">
              <Badge variant="secondary" className="mr-2">{r.role}</Badge>
              <span>{r.module}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {new Date(r.changed_at).toLocaleString("pt-BR")} · por {r.changed_by?.slice(0, 8) || "—"}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1 mt-2 text-xs">
            <div><span className="text-muted-foreground">Antes:</span> {fmt(r.before_state)}</div>
            <div><span className="text-muted-foreground">Depois:</span> {fmt(r.after_state)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RoleTabsMatrix() {
  const { allowedFor, setAllowed, loading } = useRoleTabPermissions();

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {/* Desktop/tablet: tabela */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left font-medium text-muted-foreground py-2 pr-4">Aba</th>
              {PERMISSION_ROLES.map((r) => (
                <th key={r.key} className="text-center font-medium text-muted-foreground py-2 px-2 w-24">
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {APP_TABS.map((tab) => (
              <tr key={tab.id} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-4">
                  <div className="font-medium text-foreground">{tab.label}</div>
                  <div className="text-xs text-muted-foreground">{tab.id}</div>
                </td>
                {PERMISSION_ROLES.map((r) => {
                  const allowed = allowedFor(r.key).has(tab.id);
                  return (
                    <td key={r.key} className="text-center py-2 px-2">
                      <Switch
                        checked={r.key === "admin" ? true : allowed}
                        disabled={r.key === "admin"}
                        onCheckedChange={async (v) => {
                          try { await setAllowed(r.key, tab.id, !!v); }
                          catch (e) { toast.error("Falha ao salvar: " + ((e as Error).message || "")); }
                        }}
                        aria-label={`${tab.label} - ${r.label}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards por aba */}
      <div className="md:hidden space-y-3">
        {APP_TABS.map((tab) => (
          <div key={tab.id} className="rounded-lg border border-border p-3">
            <div className="mb-2">
              <div className="font-medium text-foreground text-sm">{tab.label}</div>
              <div className="text-[11px] text-muted-foreground">{tab.id}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PERMISSION_ROLES.map((r) => {
                const allowed = allowedFor(r.key).has(tab.id);
                return (
                  <label
                    key={r.key}
                    className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2"
                  >
                    <span className="text-xs text-foreground">{r.label}</span>
                    <Switch
                      checked={r.key === "admin" ? true : allowed}
                      disabled={r.key === "admin"}
                      onCheckedChange={async (v) => {
                        try { await setAllowed(r.key, tab.id, !!v); }
                        catch (e) { toast.error("Falha ao salvar: " + ((e as Error).message || "")); }
                      }}
                      aria-label={`${tab.label} - ${r.label}`}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mt-3">
        As alterações valem imediatamente para todos os usuários do papel. O papel
        <strong> Admin</strong> sempre enxerga todas as abas.
      </p>
    </>
  );
}
