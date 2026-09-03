import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Pencil,
  Trash2,
  Plus,
  MoreVertical,
  KeyRound,
  Plug,
  RefreshCw,
  Loader2,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/userClient";

interface ApiKeyEntry {
  id: string;
  name: string;
  key_last4: string;
  active: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

function maskLast4(last4: string): string {
  if (!last4) return "—";
  return `••••${last4}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Nunca";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

interface AppIntegration {
  name: string;
  envVar: string;
  description: string;
  maskedKey: string;
  configured: boolean;
}

export function ApiKeysManager() {
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [editing, setEditing] = useState<ApiKeyEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", key: "" });
  const [integrations, setIntegrations] = useState<AppIntegration[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [integrationsLoaded, setIntegrationsLoaded] = useState(false);

  const loadIntegrations = async () => {
    setLoadingIntegrations(true);
    try {
      const { data, error } = await supabase.functions.invoke("list-app-integrations");
      if (error) throw error;
      setIntegrations((data as any)?.integrations ?? []);
      setIntegrationsLoaded(true);
    } catch (e: any) {
      console.error("[ApiKeysManager] loadIntegrations", e?.message);
      setIntegrations([]);
    } finally {
      setLoadingIntegrations(false);
    }
  };

  const loadKeys = async () => {
    setLoadingKeys(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-api-keys", {
        method: "GET",
      });
      if (error) throw error;
      const list = ((data as any)?.keys ?? []) as ApiKeyEntry[];
      // Oculta entradas reservadas (ex.: __gdrive_api_key_override)
      setKeys(list.filter((k) => !k.name.startsWith("__")));
    } catch (e: any) {
      console.error("[ApiKeysManager] loadKeys", e?.message);
      toast.error("Não foi possível carregar as chaves");
      setKeys([]);
    } finally {
      setLoadingKeys(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const toggleIntegrations = () => {
    setIntegrationsOpen((open) => {
      const next = !open;
      if (next && !integrationsLoaded && !loadingIntegrations) {
        loadIntegrations();
      }
      return next;
    });
  };

  const openCreate = () => {
    setForm({ name: "", key: "" });
    setCreating(true);
  };

  const openEdit = (k: ApiKeyEntry) => {
    setForm({ name: k.name, key: "" });
    setEditing(k);
  };

  const handleSave = async () => {
    const name = form.name.trim();
    const key = form.key.trim();
    if (!name) {
      toast.error("Informe o nome da integração");
      return;
    }
    if (!editing && !key) {
      toast.error("Informe a chave");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { name };
      if (key) body.key = key;
      if (editing) body.id = editing.id;

      const { error } = await supabase.functions.invoke("manage-api-keys", {
        method: "POST",
        body,
      });
      if (error) throw error;
      toast.success(editing ? "Chave atualizada" : "Chave adicionada");
      setEditing(null);
      setCreating(false);
      await loadKeys();
    } catch (e: any) {
      console.error("[ApiKeysManager] save", e?.message);
      toast.error("Não foi possível salvar a chave");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (k: ApiKeyEntry, value: boolean) => {
    // Atualização otimista
    setKeys((prev) => prev.map((it) => (it.id === k.id ? { ...it, active: value } : it)));
    try {
      const { error } = await supabase.functions.invoke("manage-api-keys", {
        method: "POST",
        body: { id: k.id, name: k.name, active: value },
      });
      if (error) throw error;
    } catch (e: any) {
      console.error("[ApiKeysManager] toggleActive", e?.message);
      toast.error("Não foi possível alterar o status");
      setKeys((prev) => prev.map((it) => (it.id === k.id ? { ...it, active: !value } : it)));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke("manage-api-keys", {
        method: "DELETE",
        body: { id },
      });
      if (error) throw error;
      toast.success("Chave removida");
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (e: any) {
      console.error("[ApiKeysManager] delete", e?.message);
      toast.error("Não foi possível remover");
    } finally {
      setDeletingId(null);
    }
  };

  const dialogOpen = creating || !!editing;
  const closeDialog = () => {
    setCreating(false);
    setEditing(null);
  };

  const empty = useMemo(() => keys.length === 0, [keys]);

  return (
    <div className="space-y-6">
      {/* Conexões existentes do app (configuradas no backend) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={toggleIntegrations}
            className="flex items-center gap-2 text-left flex-1 min-w-0"
            aria-expanded={integrationsOpen}
          >
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${integrationsOpen ? "rotate-0" : "-rotate-90"}`}
            />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Plug className="h-4 w-4 text-primary" /> Conexões existentes do app
              </h3>
              <p className="text-xs text-muted-foreground">
                Integrações já configuradas no backend. Por segurança, os valores não são exibidos.
              </p>
            </div>
          </button>
          {integrationsOpen && (
            <Button
              size="sm"
              variant="outline"
              onClick={loadIntegrations}
              disabled={loadingIntegrations}
            >
              {loadingIntegrations ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>

        {integrationsOpen && (
          loadingIntegrations ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : integrations.length === 0 ? (
            <div className="border border-dashed rounded-lg py-6 text-center text-xs text-muted-foreground">
              Nenhuma conexão encontrada.
            </div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Integração</TableHead>
                    <TableHead className="hidden sm:table-cell">Identificador</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Descrição</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {integrations.map((it) => (
                    <TableRow key={it.envVar}>
                      <TableCell className="font-medium">{it.name}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <code className="font-mono text-[11px] text-muted-foreground">{it.envVar}</code>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={it.configured ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {it.configured ? "Configurada" : "Não configurada"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {it.description}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        )}
      </section>

      {/* Chaves customizadas (armazenadas com segurança no backend) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <KeyRound className="h-4 w-4 text-primary" /> Minhas chaves
            </h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" />
              Armazenadas com segurança no servidor. Só os 4 últimos caracteres são exibidos.
            </p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Nova chave
          </Button>
        </div>

      {loadingKeys ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : empty ? (
        <div className="border border-dashed rounded-lg py-10 flex flex-col items-center text-center gap-2">
          <KeyRound className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">Nenhuma chave cadastrada</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Adicione a primeira chave de API para começar a integrar serviços externos.
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Integração</TableHead>
                <TableHead>Chave</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Criada em</TableHead>
                <TableHead className="hidden md:table-cell">Última utilização</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell>
                    <code className="font-mono text-xs">{maskLast4(k.key_last4)}</code>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={k.active}
                        onCheckedChange={(v) => toggleActive(k, v)}
                      />
                      <Badge variant={k.active ? "default" : "secondary"} className="text-[10px]">
                        {k.active ? "Ativa" : "Inativa"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    {formatDate(k.createdAt)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    {formatDate(k.lastUsedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(k)}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Editar / Substituir
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleActive(k, !k.active)}>
                          {k.active ? "Desativar" : "Ativar"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeletingId(k.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Remover
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      </section>


      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar chave de API" : "Nova chave de API"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Deixe o campo Chave em branco para manter a atual. Informe um novo valor para substituí-la."
                : "A chave é armazenada com segurança no servidor e nunca é exibida novamente."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="api-key-name" className="text-xs">Nome da integração</Label>
              <Input
                id="api-key-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Stripe, OpenAI, WhatsApp"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="api-key-value" className="text-xs">
                Chave {editing && <span className="text-muted-foreground">(opcional)</span>}
              </Label>
              <Input
                id="api-key-value"
                type="password"
                autoComplete="off"
                value={form.key}
                onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                placeholder={editing ? `Atual: ••••${editing.key_last4}` : "sk-..."}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {editing ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover chave de API?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A integração que utiliza esta chave deixará de funcionar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && handleDelete(deletingId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
