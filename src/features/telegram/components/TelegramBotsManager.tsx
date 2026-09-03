import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Loader2, CheckCircle2, XCircle, Eye, EyeOff, ShieldCheck, Bot, Wallet, BarChart3, Unlink, Link2 } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { toast } from "sonner";
import { invokeUserFunction } from "@/features/telegram/lib/telegramLinkCode";

interface ConnectedLink {
  id: string;
  chat_id: number;
  label: string | null;
  created_at: string;
  kind: "expenses" | "reports";
  source: "telegram_links" | "telegram_reports_links";
}

interface BotRow {
  id: string;
  name: string;
  token: string;
  description: string | null;
  active: boolean;
  bot_username: string | null;
  bot_id: number | null;
  last_validated_at: string | null;
  validation_status: string | null;
  created_at: string;
  purpose: "reports" | "expenses" | "general";
}

interface FormState {
  name: string;
  token: string;
  description: string;
  active: boolean;
  purpose: "reports" | "expenses" | "general";
}

const EMPTY_FORM: FormState = { name: "", token: "", description: "", active: true, purpose: "reports" };

function maskToken(token: string) {
  if (!token) return "";
  const parts = token.split(":");
  if (parts.length !== 2) return "••••••••";
  return `${parts[0]}:••••${parts[1].slice(-4)}`;
}

export function TelegramBotsManager() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const [bots, setBots] = useState<BotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BotRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showToken, setShowToken] = useState(false);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationResult, setValidationResult] = useState<
    { ok: boolean; message: string; bot_username?: string; bot_id?: number } | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<BotRow | null>(null);
  const [connected, setConnected] = useState<ConnectedLink[]>([]);
  const [loadingConnected, setLoadingConnected] = useState(true);

  const loadConnected = async () => {
    setLoadingConnected(true);
    const [{ data: legacyLinks }, { data: reportLinks, error: reportLinksError }] = await Promise.all([
      supabase
        .from("telegram_links" as any)
        .select("id, chat_id, label, created_at, bot_id, system_telegram_bots(purpose)"),
      supabase
        .from("telegram_reports_links" as any)
        .select("id, chat_id, label, created_at, bot_id")
        .order("created_at", { ascending: false }),
    ]);
    if (reportLinksError && reportLinksError.code !== "42P01" && reportLinksError.code !== "PGRST205") {
      toast.error("Erro ao carregar bot de relatórios", { description: reportLinksError.message });
    }
    const legacyItems: ConnectedLink[] = ((legacyLinks as any[]) ?? []).map((r) => ({
      id: r.id,
      chat_id: r.chat_id,
      label: r.label,
      created_at: r.created_at,
      kind: (r.system_telegram_bots?.purpose === "reports" ? "reports" : "expenses") as "reports" | "expenses",
      source: "telegram_links",
    }));
    const dedicatedReports: ConnectedLink[] = ((reportLinks as any[]) ?? []).map((r) => ({
      id: r.id,
      chat_id: r.chat_id,
      label: r.label,
      created_at: r.created_at,
      kind: "reports",
      source: "telegram_reports_links",
    }));
    setConnected([...dedicatedReports, ...legacyItems]);
    setLoadingConnected(false);
  };

  const disconnectLink = async (link: ConnectedLink) => {
    const table = link.source === "telegram_reports_links" ? "telegram_reports_links" : "telegram_links";
    const { error } = await supabase.from(table as any).delete().eq("id", link.id);
    if (error) toast.error("Erro ao desconectar", { description: error.message });
    else { toast.success("Bot desconectado"); loadConnected(); }
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("system_telegram_bots" as any)
      .select(
        "id, name, token, description, active, bot_username, bot_id, last_validated_at, validation_status, created_at, purpose",
      )
      .order("created_at", { ascending: true });
    if (error) toast.error("Erro ao carregar bots", { description: error.message });
    setBots((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) load(); else setLoading(false); loadConnected(); }, [isAdmin]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowToken(false);
    setValidationResult(null);
    setDialogOpen(true);
  };

  const openEdit = (b: BotRow) => {
    setEditing(b);
    setForm({
      name: b.name,
      token: b.token,
      description: b.description ?? "",
      active: b.active,
      purpose: (b.purpose ?? "general") as FormState["purpose"],
    });
    setShowToken(false);
    setValidationResult(b.validation_status === "valid" && b.bot_username
      ? { ok: true, message: `@${b.bot_username}`, bot_username: b.bot_username, bot_id: b.bot_id ?? undefined }
      : null);
    setDialogOpen(true);
  };

  const handleValidate = async (): Promise<{ ok: boolean; bot_id?: number; bot_username?: string }> => {
    const token = form.token.trim();
    if (!token) {
      toast.error("Informe o token primeiro");
      return { ok: false };
    }
    setValidating(true);
    setValidationResult(null);
    try {
      const data = await invokeUserFunction("validate-telegram-bot", { token });
      const res = data as any;
      if (res?.ok) {
        setValidationResult({
          ok: true, message: `Bot @${res.bot_username} validado`,
          bot_username: res.bot_username, bot_id: res.bot_id,
        });
        return { ok: true, bot_id: res.bot_id, bot_username: res.bot_username };
      }
      setValidationResult({ ok: false, message: res?.error || "Token inválido" });
      return { ok: false };
    } catch (e: any) {
      setValidationResult({ ok: false, message: e?.message || "Falha ao validar" });
      return { ok: false };
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.name.trim() || !form.token.trim()) {
      toast.error("Nome e token são obrigatórios");
      return;
    }
    setSaving(true);
    try {
      // Validate token if changed or never validated
      const tokenChanged = !editing || editing.token !== form.token.trim();
      let validation: { ok: boolean; bot_id?: number; bot_username?: string } | null =
        validationResult && validationResult.ok
          ? { ok: true, bot_id: validationResult.bot_id, bot_username: validationResult.bot_username }
          : null;

      if (tokenChanged || !validation) {
        validation = await handleValidate();
        if (!validation.ok) {
          toast.error("Token inválido — corrija antes de salvar");
          setSaving(false);
          return;
        }
      }

      const payload = {
        name: form.name.trim(),
        token: form.token.trim(),
        description: form.description.trim() || null,
        active: form.active,
        purpose: form.purpose,
        bot_id: validation.bot_id ?? null,
        bot_username: validation.bot_username ?? null,
        last_validated_at: new Date().toISOString(),
        validation_status: "valid",
        ...(editing ? {} : { created_by: user.id }),
      };

      if (editing) {
        const { error } = await supabase
          .from("system_telegram_bots" as any)
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Bot atualizado");
      } else {
        const { error } = await supabase.from("system_telegram_bots" as any).insert(payload);
        if (error) throw error;
        toast.success("Bot cadastrado");
      }
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from("system_telegram_bots" as any).delete().eq("id", deleteTarget.id);
    if (error) toast.error("Erro ao excluir", { description: error.message });
    else { toast.success("Bot removido"); load(); }
    setDeleteTarget(null);
  };

  const toggleActive = async (b: BotRow) => {
    const { error } = await supabase
      .from("system_telegram_bots" as any)
      .update({ active: !b.active })
      .eq("id", b.id);
    if (error) toast.error("Erro ao atualizar", { description: error.message });
    else load();
  };

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" /> Bots do Telegram (globais)
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {isAdmin
                ? "Bots compartilhados por todo o sistema. Cada conta vincula seu chat individualmente enviando /start ao bot."
                : "Envie /start no bot do Telegram para vincular sua conta. Os bots são gerenciados pelos administradores."}
            </p>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={openAdd} className="gap-1.5">
              <Plus className="h-4 w-4" /> Adicionar bot
            </Button>
          )}
        </div>

        {/* Bots já conectados via /start no app */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Link2 className="h-3.5 w-3.5 text-primary" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Bots conectados ao app
            </h4>
          </div>
          {loadingConnected ? (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : connected.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              Nenhum bot vinculado ainda. Gere o comando <code className="font-mono px-1 py-0.5 rounded bg-muted">/start</code> no app e envie ao bot do Telegram.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {connected.map(link => (
                <li key={`${link.kind}-${link.id}`} className="rounded-md border p-2.5 flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {link.kind === "reports"
                        ? <BarChart3 className="h-3.5 w-3.5 text-primary" />
                        : <Wallet className="h-3.5 w-3.5 text-primary" />}
                      <span className="text-sm font-medium">
                        {link.label || (link.kind === "reports" ? "Bot de Relatórios" : "Bot de Despesas")}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {link.kind === "reports" ? "Relatórios" : "Despesas"}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono">chat_id: {link.chat_id}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive gap-1"
                    onClick={() => disconnectLink(link)}>
                    <Unlink className="h-3.5 w-3.5" /> Desconectar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {isAdmin && (
          <>
            <div className="flex items-center gap-2 pt-1">
              <Bot className="h-3.5 w-3.5 text-primary" />
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Bots globais do sistema
              </h4>
            </div>

            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : bots.length === 0 ? (
              <p className="text-xs text-center text-muted-foreground py-6">
                Nenhum bot cadastrado ainda.
              </p>
            ) : (
              <ul className="space-y-2">
                {bots.map(b => (
                  <li key={b.id} className="rounded-md border p-3 flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{b.name}</span>
                        {b.active
                          ? <Badge variant="default" className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">Ativo</Badge>
                          : <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
                        {b.validation_status === "valid" && (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <ShieldCheck className="h-3 w-3" /> validado
                          </Badge>
                        )}
                        {b.purpose === "reports" && (
                          <Badge className="text-[10px] gap-1 bg-primary/15 text-primary border-primary/30 hover:bg-primary/20">
                            <BarChart3 className="h-3 w-3" /> Relatórios
                          </Badge>
                        )}
                        {b.purpose === "expenses" && (
                          <Badge className="text-[10px] gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">
                            <Wallet className="h-3 w-3" /> Despesas
                          </Badge>
                        )}
                      </div>
                      {b.bot_username && (
                        <p className="text-xs text-muted-foreground">@{b.bot_username}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground font-mono">{maskToken(b.token)}</p>
                      {b.description && (
                        <p className="text-xs text-muted-foreground">{b.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Switch checked={b.active} onCheckedChange={() => toggleActive(b)} />
                      <RowActions
                        size="md"
                        actions={[
                          { label: "Editar", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(b) },
                          { label: "Excluir", icon: <Trash2 className="h-4 w-4" />, destructive: true, onClick: () => setDeleteTarget(b) },
                        ]}
                      />

                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar bot" : "Novo bot do Telegram"}</DialogTitle>
            <DialogDescription className="text-xs">
              Cole o token gerado pelo @BotFather. Validamos automaticamente antes de salvar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="bot-name">Nome do bot</Label>
              <Input id="bot-name" value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Bot de Cobranças" maxLength={80} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bot-token">Token / API Key</Label>
              <div className="flex gap-2">
                <Input id="bot-token" type={showToken ? "text" : "password"}
                  value={form.token}
                  onChange={(e) => { setForm(f => ({ ...f, token: e.target.value })); setValidationResult(null); }}
                  placeholder="123456789:AA..." className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon"
                  onClick={() => setShowToken(s => !s)} title={showToken ? "Ocultar" : "Mostrar"}>
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <Button type="button" size="sm" variant="outline" onClick={handleValidate} disabled={validating || !form.token.trim()}>
                  {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />}
                  Validar token
                </Button>
                {validationResult && (
                  <span className={`text-xs flex items-center gap-1 ${validationResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                    {validationResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    {validationResult.message}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Finalidade</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["reports", "expenses", "general"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, purpose: p }))}
                    className={`text-xs px-2 py-2 rounded-md border transition-colors ${
                      form.purpose === p
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border hover:bg-muted"
                    }`}
                  >
                    {p === "reports" ? "Relatórios" : p === "expenses" ? "Despesas" : "Geral"}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                <strong>Relatórios</strong> recebe planejamento diário, cobranças e insights. <strong>Despesas</strong> processa lançamentos. <strong>Geral</strong> serve para ambos.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bot-desc">Descrição (opcional)</Label>
              <Textarea id="bot-desc" value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Para que serve este bot…" rows={2} maxLength={300} />
            </div>

            <div className="flex items-center justify-between rounded-md border p-2.5">
              <Label htmlFor="bot-active" className="text-sm font-normal">Ativo</Label>
              <Switch id="bot-active" checked={form.active}
                onCheckedChange={(v) => setForm(f => ({ ...f, active: v }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || validating}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {editing ? "Salvar alterações" : "Cadastrar bot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir bot?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" será removido permanentemente. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
