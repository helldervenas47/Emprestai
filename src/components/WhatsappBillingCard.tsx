import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MessageCircle, Save, RotateCcw, Eye, AlertTriangle, Send, Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { useWhatsappBillingMessages } from "@/hooks/useWhatsappBillingMessages";
import { useWhatsappBillingSchedule } from "@/hooks/useWhatsappBillingSchedule";
import {
  DEFAULT_WHATSAPP_MESSAGES,
  applyMessageVariables,
  findUnknownVariables,
  type WhatsappBillingMessages,
} from "@/lib/whatsappBilling";

const LOAN_VARS = [
  "nome_cliente",
  "valor_parcela",
  "data_vencimento",
  "dias_atraso",
  "juros",
  "valor_total",
  "etiqueta",
  "link_pagamento",
];

const MANAGER_VARS = ["total_emprestimos_semana", "lista_clientes", "valores_totais", "etiquetas"];

export function WhatsappBillingCard() {
  const { messages, loading, save } = useWhatsappBillingMessages();
  const [draft, setDraft] = useState<WhatsappBillingMessages>(messages);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(messages);
  }, [messages]);

  const dirty = useMemo(
    () =>
      draft.message_upcoming !== messages.message_upcoming ||
      draft.message_due_today !== messages.message_due_today ||
      draft.message_overdue !== messages.message_overdue ||
      draft.message_very_overdue !== messages.message_very_overdue ||
      draft.message_manager_weekly !== messages.message_manager_weekly ||
      draft.pix_link !== messages.pix_link ||
      draft.very_overdue_days !== messages.very_overdue_days,
    [draft, messages],
  );

  const handleSave = async () => {
    setSaving(true);
    const { error } = await save(draft);
    setSaving(false);
    if (error) toast.error("Não foi possível salvar as mensagens");
    else toast.success("Mensagens de cobrança salvas");
  };

  const resetDefaults = () => setDraft(DEFAULT_WHATSAPP_MESSAGES);

  return (
    <div className="space-y-4">
      <Card no3d>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-success" />
            <h3 className="text-sm font-semibold">Cobrança via WhatsApp</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Personalize as mensagens enviadas (manualmente ou pela cobrança automática) com base no
            status de cada empréstimo. Use as variáveis abaixo:
          </p>
          <div className="mt-2">
            <div className="text-[11px] font-medium text-muted-foreground mb-1">
              Variáveis para clientes
            </div>
            <div className="flex flex-wrap gap-1.5">
              {LOAN_VARS.map((v) => (
                <Badge key={v} variant="outline" className="text-[10px] font-mono">{`{${v}}`}</Badge>
              ))}
            </div>
            <div className="text-[11px] font-medium text-muted-foreground mt-3 mb-1">
              Variáveis para gerentes (resumo semanal)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {MANAGER_VARS.map((v) => (
                <Badge key={v} variant="outline" className="text-[10px] font-mono">{`{${v}}`}</Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card no3d>
        <CardContent className="p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Link/Chave Pix do destinatário</Label>
              <Input
                value={draft.pix_link}
                onChange={(e) => setDraft((d) => ({ ...d, pix_link: e.target.value }))}
                placeholder="Ex: https://pix… ou chave Pix"
                disabled={loading}
              />
              <p className="text-[10px] text-muted-foreground">
                Substitui {"{link_pagamento}"} nas mensagens.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Dias de atraso para "muito atrasado"</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={draft.very_overdue_days}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, very_overdue_days: Number(e.target.value || 30) }))
                }
                disabled={loading}
              />
              <p className="text-[10px] text-muted-foreground">
                A partir desse atraso, usa o template "Muito atrasado".
              </p>
            </div>
          </div>

          <Separator />

          <MessageField
            label="A vencer"
            description="Parcela ainda não venceu."
            badgeClass="bg-muted text-muted-foreground border-border"
            value={draft.message_upcoming}
            onChange={(v) => setDraft((d) => ({ ...d, message_upcoming: v }))}
            disabled={loading}
            previewCtx={previewCtxClient(0)}
          />
          <MessageField
            label="Vence hoje"
            description="A parcela vence no dia atual."
            badgeClass="bg-warning/10 text-warning border-warning/30"
            value={draft.message_due_today}
            onChange={(v) => setDraft((d) => ({ ...d, message_due_today: v }))}
            disabled={loading}
            previewCtx={previewCtxClient(0)}
          />
          <MessageField
            label="Vencido"
            description="A parcela está em atraso."
            badgeClass="bg-destructive/10 text-destructive border-destructive/20"
            value={draft.message_overdue}
            onChange={(v) => setDraft((d) => ({ ...d, message_overdue: v }))}
            disabled={loading}
            previewCtx={previewCtxClient(7)}
          />
          <MessageField
            label="Muito atrasado"
            description={`Atraso ≥ ${draft.very_overdue_days} dias.`}
            badgeClass="bg-destructive/20 text-destructive border-destructive/30"
            value={draft.message_very_overdue}
            onChange={(v) => setDraft((d) => ({ ...d, message_very_overdue: v }))}
            disabled={loading}
            previewCtx={previewCtxClient(draft.very_overdue_days)}
          />

          <Separator />

          <ManagerField
            value={draft.message_manager_weekly}
            onChange={(v) => setDraft((d) => ({ ...d, message_manager_weekly: v }))}
            disabled={loading}
            pixLink={draft.pix_link}
            dirty={dirty}
          />

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border/60">
            <Button variant="ghost" size="sm" onClick={resetDefaults} disabled={loading || saving}>
              <RotateCcw className="h-4 w-4 mr-1" /> Restaurar padrão
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!dirty || loading || saving}>
              <Save className="h-4 w-4 mr-1" /> {saving ? "Salvando…" : "Salvar mensagens"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function previewCtxClient(diasAtraso: number) {
  const today = new Date();
  const due = new Date(today);
  due.setDate(due.getDate() - diasAtraso);
  const iso = due.toISOString().slice(0, 10);
  const valor = 250;
  const juros = diasAtraso > 0 ? Math.round(valor * 0.02 * diasAtraso) : 0;
  return {
    nome_cliente: "Maria Silva",
    valor_parcela: valor,
    data_vencimento: iso,
    dias_atraso: diasAtraso,
    juros,
    valor_total: valor + juros,
    etiqueta: "VIP",
    link_pagamento: "",
  };
}

function MessageField({
  label,
  description,
  badgeClass,
  value,
  onChange,
  disabled,
  previewCtx,
}: {
  label: string;
  description: string;
  badgeClass: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  previewCtx: ReturnType<typeof previewCtxClient>;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const unknown = findUnknownVariables(value);
  const preview = applyMessageVariables(value, previewCtx);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-xs ${badgeClass}`}>{label}</Badge>
          <span className="text-[11px] text-muted-foreground">{description}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={() => setShowPreview((s) => !s)}
        >
          <Eye className="h-3.5 w-3.5 mr-1" /> {showPreview ? "Ocultar" : "Pré-visualizar"}
        </Button>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        disabled={disabled}
        className="text-sm"
      />
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[10px] text-muted-foreground">{value.length} caracteres</Label>
        {unknown.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] text-warning">
            <AlertTriangle className="h-3 w-3" /> Variáveis desconhecidas:{" "}
            <span className="font-mono">{unknown.map((u) => `{${u}}`).join(", ")}</span>
          </span>
        )}
      </div>
      {showPreview && (
        <div className="rounded-md border bg-muted/40 p-2 text-xs whitespace-pre-wrap">
          {preview || <span className="text-muted-foreground">Mensagem vazia</span>}
        </div>
      )}
    </div>
  );
}

function ManagerField({
  value,
  onChange,
  disabled,
  pixLink,
  dirty,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  pixLink: string;
  dirty?: boolean;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const { runManagerSummaryNow, listManagerSummaryRecipients, previewManagerSummary } =
    useWhatsappBillingSchedule();
  const unknown = findUnknownVariables(value);
  const preview = value
    .replace(/\{total_emprestimos_semana\}/g, "3")
    .replace(/\{valores_totais\}/g, "R$ 1.450,00")
    .replace(/\{etiquetas\}/g, "VIP, Renovação")
    .replace(
      /\{lista_clientes\}/g,
      "- Maria Silva [VIP] — R$ 500,00 (vence 02/05)\n- João Pereira [Renovação] — R$ 450,00 (vence 04/05)\n- Ana Souza — R$ 500,00 (vence 06/05)",
    )
    .replace(/\{link_pagamento\}/g, pixLink || "");

  // Individual send dialog state
  type Mgr = { user_id: string; display_name: string; phone: string; has_phone: boolean };
  const [openIndividual, setOpenIndividual] = useState(false);
  const [loadingMgrs, setLoadingMgrs] = useState(false);
  const [managers, setManagers] = useState<Mgr[]>([]);
  const [selectedMgr, setSelectedMgr] = useState<string>("");
  const [renderedPreview, setRenderedPreview] = useState<string>("");
  const [previewMeta, setPreviewMeta] = useState<{ loans: number; total: number } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sendingOne, setSendingOne] = useState(false);

  const openIndividualDialog = async () => {
    if (dirty) {
      toast.warning("Salve as alterações antes de continuar.");
      return;
    }
    setOpenIndividual(true);
    setSelectedMgr("");
    setRenderedPreview("");
    setPreviewMeta(null);
    setLoadingMgrs(true);
    try {
      const res: any = await listManagerSummaryRecipients();
      const list: Mgr[] = (res?.results?.[0]?.managers ?? []) as Mgr[];
      setManagers(list);
      if (list.length === 0) {
        toast.info("Nenhum gerente vinculado encontrado.");
      }
    } catch (e: any) {
      toast.error("Falha ao carregar gerentes: " + (e?.message ?? String(e)));
    } finally {
      setLoadingMgrs(false);
    }
  };

  const loadPreview = async (mgrId: string) => {
    setLoadingPreview(true);
    setRenderedPreview("");
    setPreviewMeta(null);
    try {
      const res: any = await previewManagerSummary(mgrId);
      const r = res?.results?.[0];
      setRenderedPreview(r?.message ?? "");
      setPreviewMeta({ loans: Number(r?.loans_count ?? 0), total: Number(r?.total_amount ?? 0) });
    } catch (e: any) {
      toast.error("Falha ao gerar prévia: " + (e?.message ?? String(e)));
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSelectMgr = (id: string) => {
    setSelectedMgr(id);
    if (id) loadPreview(id);
  };

  const handleSendIndividual = async () => {
    if (!selectedMgr) return;
    const mgr = managers.find((m) => m.user_id === selectedMgr);
    if (!mgr?.has_phone) {
      toast.error("Este gerente não possui telefone configurado no perfil.");
      return;
    }
    setSendingOne(true);
    try {
      const res: any = await runManagerSummaryNow({ manager_user_id: selectedMgr });
      const r = (res?.results ?? []).find((x: any) => x.manager_user_id === selectedMgr);
      if (r?.success) {
        toast.success(`Resumo enviado para ${mgr.display_name || "gerente"}.`);
        setOpenIndividual(false);
      } else if (r?.error) {
        toast.error("Falha ao enviar: " + r.error);
      } else {
        toast.warning("Envio não confirmado. Verifique os logs.");
      }
    } catch (e: any) {
      toast.error("Falha no envio: " + (e?.message ?? String(e)));
    } finally {
      setSendingOne(false);
    }
  };

  const handleSendNow = async () => {
    if (dirty) {
      toast.warning("Salve as alterações antes de enviar.");
      return;
    }
    setSending(true);
    try {
      const res: any = await runManagerSummaryNow();
      const sent = (res?.results ?? []).filter((r: any) => r.success).length;
      const failed = (res?.results ?? []).filter((r: any) => r.success === false).length;
      if (sent === 0 && failed === 0) {
        toast.info("Nenhum gerente com telefone configurado encontrado.");
      } else {
        toast.success(`Resumo de gerentes: ${sent} enviado(s), ${failed} falha(s).`);
      }
    } catch (e: any) {
      toast.error("Falha ao enviar resumo: " + (e?.message ?? String(e)));
    } finally {
      setSending(false);
    }
  };

  const selectedMgrObj = managers.find((m) => m.user_id === selectedMgr);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
            Resumo semanal — Gerentes
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            Lista empréstimos vencendo na semana atual.
          </span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() => setShowPreview((s) => !s)}
          >
            <Eye className="h-3.5 w-3.5 mr-1" /> {showPreview ? "Ocultar" : "Pré-visualizar"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={openIndividualDialog}
            disabled={disabled}
          >
            <UserCheck className="h-3.5 w-3.5 mr-1" /> Enviar para um gerente
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={handleSendNow}
            disabled={sending || disabled}
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
            Enviar para todos
          </Button>
        </div>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        disabled={disabled}
        className="text-sm"
      />
      {unknown.length > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] text-warning">
          <AlertTriangle className="h-3 w-3" /> Variáveis desconhecidas:{" "}
          <span className="font-mono">{unknown.map((u) => `{${u}}`).join(", ")}</span>
        </span>
      )}
      {showPreview && (
        <div className="rounded-md border bg-muted/40 p-2 text-xs whitespace-pre-wrap">
          {preview || <span className="text-muted-foreground">Mensagem vazia</span>}
        </div>
      )}

      <Dialog open={openIndividual} onOpenChange={setOpenIndividual}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar resumo individual</DialogTitle>
            <DialogDescription>
              Selecione um gerente, visualize a mensagem renderizada e confirme o envio.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Gerente</Label>
              {loadingMgrs ? (
                <div className="text-xs text-muted-foreground inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando gerentes…
                </div>
              ) : managers.length === 0 ? (
                <div className="text-xs text-muted-foreground">
                  Nenhum gerente vinculado a esta conta.
                </div>
              ) : (
                <Select value={selectedMgr} onValueChange={handleSelectMgr}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um gerente" />
                  </SelectTrigger>
                  <SelectContent>
                    {managers.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {(m.display_name || "Gerente sem nome")}
                        {!m.has_phone && " — (sem telefone)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedMgrObj && !selectedMgrObj.has_phone && (
                <span className="inline-flex items-center gap-1 text-[10px] text-warning">
                  <AlertTriangle className="h-3 w-3" /> Este gerente não possui telefone no perfil; o envio ficará indisponível.
                </span>
              )}
            </div>

            {selectedMgr && (
              <div className="space-y-1.5">
                <Label className="text-xs">Pré-visualização da mensagem</Label>
                {loadingPreview ? (
                  <div className="text-xs text-muted-foreground inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Renderizando…
                  </div>
                ) : (
                  <>
                    <div className="rounded-md border bg-muted/40 p-2 text-xs whitespace-pre-wrap max-h-72 overflow-auto">
                      {renderedPreview || (
                        <span className="text-muted-foreground">Mensagem vazia.</span>
                      )}
                    </div>
                    {previewMeta && (
                      <div className="text-[10px] text-muted-foreground">
                        {previewMeta.loans} empréstimo(s) na semana — total{" "}
                        {previewMeta.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpenIndividual(false)} disabled={sendingOne}>
              Cancelar
            </Button>
            <Button
              onClick={handleSendIndividual}
              disabled={!selectedMgr || sendingOne || loadingPreview || !selectedMgrObj?.has_phone}
            >
              {sendingOne ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Confirmar e enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
