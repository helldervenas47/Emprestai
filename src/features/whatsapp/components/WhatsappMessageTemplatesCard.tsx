import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageCircle,
  Save,
  RotateCcw,
  AlertTriangle,
  Send,
  Loader2,
  UserCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useWhatsappBillingMessages } from "@/hooks/useWhatsappBillingMessages";
import { useWhatsappBillingSchedule } from "@/hooks/useWhatsappBillingSchedule";
import {
  DEFAULT_WHATSAPP_MESSAGES,
  applyMessageVariables,
  findUnknownVariables,
  type WhatsappBillingMessages,
} from "@/lib/whatsappBilling";
import { WhatsappChatPreview } from "./WhatsappChatPreview";

const CLIENT_VARIABLES = [
  { id: "nome_cliente", label: "Nome do Cliente", desc: "Ex: Maria Silva" },
  { id: "valor_parcela", label: "Valor da Parcela", desc: "Ex: R$ 250,00" },
  { id: "data_vencimento", label: "Data de Vencimento", desc: "Ex: 15/09/2026" },
  { id: "dias_atraso", label: "Dias de Atraso", desc: "Ex: 7" },
  { id: "juros", label: "Juros/Multa", desc: "Ex: R$ 35,00" },
  { id: "valor_total", label: "Valor Total", desc: "Ex: R$ 285,00" },
  { id: "etiqueta", label: "Etiquetas", desc: "Ex: VIP" },
  { id: "link_pagamento", label: "Link/Chave Pix", desc: "Link Pix configurado" },
];

const MANAGER_VARIABLES = [
  { id: "total_emprestimos_semana", label: "Total Empréstimos", desc: "Ex: 3" },
  { id: "valores_totais", label: "Total em R$", desc: "Ex: R$ 1.450,00" },
  { id: "lista_clientes", label: "Lista Detalhada", desc: "Clientes e valores da semana" },
  { id: "etiquetas", label: "Etiquetas", desc: "Ex: VIP, Renovação" },
  { id: "link_pagamento", label: "Link/Chave Pix", desc: "Link Pix configurado" },
];

const CENTER_SINGLE_VARIABLES = [
  { id: "nome_cliente", label: "Nome do cliente", desc: "Ex: Maria Silva" },
  { id: "etiqueta", label: "Etiqueta", desc: "Nome da etiqueta ou do cliente" },
  { id: "valor_total", label: "Valor da cobrança", desc: "Saldo, parcelas vencidas e encargos" },
  { id: "valor_cobranca", label: "Valor atualizado", desc: "Mesmo valor total que será cobrado" },
  { id: "valor_base", label: "Valor sem encargos", desc: "Saldo ou parcelas vencidas antes dos encargos" },
  { id: "encargos", label: "Juros e multa", desc: "Total de encargos pendentes" },
  { id: "parcelas_vencidas", label: "Parcelas vencidas", desc: "Quantidade de parcelas vencidas" },
  { id: "vencimento_original", label: "Vencimento original", desc: "Data oficial preservada" },
  { id: "data_priorizada", label: "Data priorizada", desc: "Nova Data ou vencimento original" },
  { id: "data_vencimento", label: "Data priorizada", desc: "Nova Data ou vencimento original" },
  { id: "dias_atraso", label: "Dias de atraso", desc: "Calculados pelo vencimento original" },
  { id: "situacao", label: "Situação", desc: "Vence hoje, vencido ou data priorizada" },
  { id: "link_pagamento", label: "Chave Pix", desc: "Link ou chave Pix configurada abaixo" },
];

const CENTER_MULTIPLE_VARIABLES = [
  { id: "nome_cliente", label: "Nome do cliente", desc: "Ex: Maria Silva" },
  { id: "lista_contratos", label: "Lista de contratos", desc: "Linhas com etiqueta, valor e situação" },
  { id: "quantidade_contratos", label: "Quantidade", desc: "Total de contratos agrupados" },
  { id: "valor_total", label: "Valor total", desc: "Soma das cobranças do cliente" },
  { id: "valor_base", label: "Total sem encargos", desc: "Soma dos valores antes dos encargos" },
  { id: "encargos", label: "Juros e multas", desc: "Soma dos encargos de todos os contratos" },
  { id: "parcelas_vencidas", label: "Parcelas vencidas", desc: "Quantidade total de parcelas vencidas" },
  { id: "etiquetas_contratos", label: "Etiquetas", desc: "Etiquetas dos contratos agrupados" },
  { id: "valores_contratos", label: "Valores", desc: "Valores atualizados de cada contrato" },
  { id: "datas_priorizadas", label: "Datas priorizadas", desc: "Datas usadas para organizar as cobranças" },
  { id: "link_pagamento", label: "Chave Pix", desc: "Link ou chave Pix configurada abaixo" },
];

type TemplateTab = "center_single" | "center_multiple" | "upcoming" | "due_today" | "overdue" | "very_overdue" | "manager";

export function WhatsappMessageTemplatesCard() {
  const { messages, loading, save } = useWhatsappBillingMessages();
  const [draft, setDraft] = useState<WhatsappBillingMessages>(messages);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TemplateTab>("center_single");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      draft.message_center_single !== messages.message_center_single ||
      draft.message_center_multiple !== messages.message_center_multiple ||
      draft.pix_link !== messages.pix_link ||
      draft.very_overdue_days !== messages.very_overdue_days,
    [draft, messages]
  );

  const handleSave = async () => {
    setSaving(true);
    const { error } = await save(draft);
    setSaving(false);
    if (error) toast.error("Não foi possível salvar os templates de mensagens.");
    else toast.success("Templates de mensagens do WhatsApp salvos com sucesso!");
  };

  const resetDefaults = () => {
    setDraft(DEFAULT_WHATSAPP_MESSAGES);
    toast.info("Templates restaurados para os padrões originais.");
  };

  const insertVariable = (varName: string) => {
    const textarea = textareaRef.current;
    const tag = `{${varName}}`;
    const fieldKey =
      activeTab === "center_single"
        ? "message_center_single"
        : activeTab === "center_multiple"
        ? "message_center_multiple"
        : activeTab === "upcoming"
        ? "message_upcoming"
        : activeTab === "due_today"
        ? "message_due_today"
        : activeTab === "overdue"
        ? "message_overdue"
        : activeTab === "very_overdue"
        ? "message_very_overdue"
        : "message_manager_weekly";

    const currentVal = draft[fieldKey];

    if (!textarea) {
      setDraft((d) => ({ ...d, [fieldKey]: currentVal + tag }));
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextVal = currentVal.substring(0, start) + tag + currentVal.substring(end);
    setDraft((d) => ({ ...d, [fieldKey]: nextVal }));

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  const currentMessage = useMemo(() => {
    switch (activeTab) {
      case "center_single":
        return draft.message_center_single;
      case "center_multiple":
        return draft.message_center_multiple;
      case "upcoming":
        return draft.message_upcoming;
      case "due_today":
        return draft.message_due_today;
      case "overdue":
        return draft.message_overdue;
      case "very_overdue":
        return draft.message_very_overdue;
      case "manager":
        return draft.message_manager_weekly;
    }
  }, [activeTab, draft]);

  const previewRendered = useMemo(() => {
    const today = new Date();
    const formatDate = (d: Date) =>
      d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

    if (activeTab === "center_single") {
      return currentMessage
        .replace(/\{nome_cliente\}|\{nome\}/g, "Maria Silva")
        .replace(/\{etiqueta\}/g, "Contrato VIP")
        .replace(/\{valor_total\}|\{valor_parcela\}|\{valor\}/g, "R$ 285,00")
        .replace(/\{valor_cobranca\}/g, "R$ 285,00")
        .replace(/\{valor_base\}/g, "R$ 250,00")
        .replace(/\{encargos\}|\{juros\}/g, "R$ 35,00")
        .replace(/\{parcelas_vencidas\}/g, "1")
        .replace(/\{vencimento_original\}/g, "08/09/2026")
        .replace(/\{data_priorizada\}/g, "15/09/2026")
        .replace(/\{data_vencimento\}/g, "15/09/2026")
        .replace(/\{dias_atraso\}/g, "7")
        .replace(/\{situacao\}/g, "vencido há 7 dia(s)")
        .replace(/\{link_pagamento\}/g, draft.pix_link || "chave-pix-exemplo");
    }

    if (activeTab === "center_multiple") {
      return currentMessage
        .replace(/\{nome_cliente\}|\{nome\}/g, "Maria Silva")
        .replace(/\{lista_contratos\}/g, "• Contrato Casa — R$ 285,00 — vencido há 7 dia(s)\n• Contrato Moto — R$ 150,00 — vence hoje")
        .replace(/\{quantidade_contratos\}/g, "2")
        .replace(/\{valor_total\}|\{valor_cobranca\}|\{valor\}/g, "R$ 435,00")
        .replace(/\{valor_base\}/g, "R$ 400,00")
        .replace(/\{encargos\}|\{juros\}/g, "R$ 35,00")
        .replace(/\{parcelas_vencidas\}/g, "2")
        .replace(/\{etiquetas_contratos\}/g, "Contrato Casa, Contrato Moto")
        .replace(/\{valores_contratos\}/g, "R$ 285,00; R$ 150,00")
        .replace(/\{datas_priorizadas\}/g, "15/09/2026; 22/09/2026")
        .replace(/\{link_pagamento\}/g, draft.pix_link || "chave-pix-exemplo");
    }

    if (activeTab === "manager") {
      return currentMessage
        .replace(/\{total_emprestimos_semana\}/g, "3")
        .replace(/\{valores_totais\}/g, "R$ 1.450,00")
        .replace(/\{etiquetas\}/g, "VIP, Renovação")
        .replace(
          /\{lista_clientes\}/g,
          "- Maria Silva [VIP] — R$ 500,00 (vence 02/05)\n- João Pereira [Renovação] — R$ 450,00 (vence 04/05)\n- Ana Souza — R$ 500,00 (vence 06/05)"
        )
        .replace(/\{link_pagamento\}/g, draft.pix_link || "https://pix.me/exemplo");
    }

    const diasAtraso =
      activeTab === "upcoming" || activeTab === "due_today"
        ? 0
        : activeTab === "overdue"
        ? 7
        : draft.very_overdue_days || 30;

    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() - diasAtraso);
    const valor = 250;
    const juros = diasAtraso > 0 ? Math.round(valor * 0.02 * diasAtraso) : 0;

    return applyMessageVariables(currentMessage, {
      nome_cliente: "Maria Silva",
      valor_parcela: valor,
      data_vencimento: formatDate(dueDate),
      dias_atraso: diasAtraso,
      juros,
      valor_total: valor + juros,
      etiqueta: "VIP",
      link_pagamento: draft.pix_link || "https://pix.me/exemplo",
    });
  }, [activeTab, currentMessage, draft.pix_link, draft.very_overdue_days]);

  const unknownVars = useMemo(() => findUnknownVariables(currentMessage), [currentMessage]);

  const tabConfig = {
    center_single: {
      label: "Central: 1 contrato",
      sublabel: "Cobrança manual individual",
      icon: UserCheck,
      badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      headerBg: "bg-emerald-600 dark:bg-emerald-700",
    },
    center_multiple: {
      label: "Central: vários",
      sublabel: "Cobrança agrupada por cliente",
      icon: Users,
      badge: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
      headerBg: "bg-violet-600 dark:bg-violet-700",
    },
    upcoming: {
      label: "A Vencer",
      sublabel: "Aviso prévio antes do vencimento",
      icon: Clock,
      badge: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
      headerBg: "bg-sky-600 dark:bg-sky-700",
    },
    due_today: {
      label: "Vence Hoje",
      sublabel: "Lembrete no dia do vencimento",
      icon: AlertCircle,
      badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      headerBg: "bg-amber-600 dark:bg-amber-700",
    },
    overdue: {
      label: "Vencido",
      sublabel: "Cobrança de parcela em atraso",
      icon: AlertTriangle,
      badge: "bg-destructive/10 text-destructive border-destructive/20",
      headerBg: "bg-rose-600 dark:bg-rose-700",
    },
    very_overdue: {
      label: "Muito Atrasado",
      sublabel: `Atraso crítico (≥ ${draft.very_overdue_days} dias)`,
      icon: AlertTriangle,
      badge: "bg-destructive/20 text-destructive border-destructive/30",
      headerBg: "bg-red-700 dark:bg-red-800",
    },
    manager: {
      label: "Resumo Gerente",
      sublabel: "Resumo semanal com vencimentos da equipe",
      icon: Users,
      badge: "bg-primary/10 text-primary border-primary/20",
      headerBg: "bg-purple-600 dark:bg-purple-700",
    },
  };

  return (
    <div className="space-y-4">
      <Card no3d className="border-border/60 shadow-xs">
        <CardHeader className="p-4 sm:p-5 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-emerald-500" />
                Templates de Cobrança WhatsApp
              </CardTitle>
              <CardDescription className="text-xs">
                Personalize as mensagens disparadas automaticamente ou de forma manual para clientes e gerentes.
              </CardDescription>
            </div>

            <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center shrink-0 pt-1 sm:pt-0">
              <Button
                variant="outline"
                size="sm"
                onClick={resetDefaults}
                disabled={loading || saving}
                className="h-9 sm:h-8 text-xs font-semibold w-full sm:w-auto justify-center rounded-xl"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                Restaurar padrão
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!dirty || loading || saving}
                className="h-9 sm:h-8 text-xs font-semibold w-full sm:w-auto justify-center rounded-xl shadow-xs"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin shrink-0" />
                ) : (
                  <Save className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                )}
                Salvar alterações
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 pt-0 space-y-5">
          {/* Navegação por Sub-Abas dos Templates */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5 p-1 bg-muted/40 rounded-2xl border border-border/40">
            {(Object.keys(tabConfig) as TemplateTab[]).map((tabKey) => {
              const cfg = tabConfig[tabKey];
              const Icon = cfg.icon;
              const active = activeTab === tabKey;
              return (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => setActiveTab(tabKey)}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl text-center transition-all min-h-[54px] ${
                    active
                      ? "bg-background text-foreground shadow-xs font-bold ring-1 ring-border/50"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/40 font-medium"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className={`h-3.5 w-3.5 ${active ? "text-primary" : ""}`} />
                    <span className="text-xs">{cfg.label}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground line-clamp-1 opacity-80 mt-0.5">
                    {cfg.sublabel}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Grid Principal: Editor de Mensagem à esquerda + Simulador de Chat WhatsApp à direita */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Coluna do Editor (7 colunas no Desktop) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-xs font-semibold ${tabConfig[activeTab].badge}`}>
                    {tabConfig[activeTab].label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{tabConfig[activeTab].sublabel}</span>
                </div>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {currentMessage.length} caracteres
                </span>
              </div>

              {/* Tags / Variáveis Clicáveis */}
              <div className="space-y-1.5 bg-muted/20 p-3 rounded-2xl border border-border/40">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-primary" />
                    Inserir Variáveis Dinâmicas (clique para adicionar)
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(activeTab === "manager" ? MANAGER_VARIABLES : activeTab === "center_single" ? CENTER_SINGLE_VARIABLES : activeTab === "center_multiple" ? CENTER_MULTIPLE_VARIABLES : CLIENT_VARIABLES).map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => insertVariable(v.id)}
                      title={v.desc}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono bg-background hover:bg-primary/10 hover:text-primary border border-border/50 transition-all hover:border-primary/40 active:scale-95 shadow-2xs"
                    >
                      <span>{`{${v.id}}`}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea do Template */}
              <div className="space-y-1.5">
                <Textarea
                  ref={textareaRef}
                  value={currentMessage}
                  rows={activeTab === "manager" ? 8 : 6}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDraft((d) => {
                      switch (activeTab) {
                        case "center_single":
                          return { ...d, message_center_single: val };
                        case "center_multiple":
                          return { ...d, message_center_multiple: val };
                        case "upcoming":
                          return { ...d, message_upcoming: val };
                        case "due_today":
                          return { ...d, message_due_today: val };
                        case "overdue":
                          return { ...d, message_overdue: val };
                        case "very_overdue":
                          return { ...d, message_very_overdue: val };
                        case "manager":
                          return { ...d, message_manager_weekly: val };
                        default:
                          return d;
                      }
                    });
                  }}
                  placeholder="Escreva a mensagem personalizada..."
                  className="font-sans text-sm rounded-2xl resize-y border-border/60 focus-visible:ring-primary/30"
                />

                {unknownVars.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 border border-destructive/20 p-2.5 rounded-xl">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>
                      Variáveis não reconhecidas:{" "}
                      <strong className="font-mono">{unknownVars.map((u) => `{${u}}`).join(", ")}</strong>
                    </span>
                  </div>
                )}
              </div>

              {/* Ações Especiais para Resumo de Gerente */}
              {activeTab === "manager" && (
                <ManagerActionButtons pixLink={draft.pix_link} dirty={dirty} />
              )}
            </div>

            {/* Coluna do Simulador Visual de Chat WhatsApp (5 colunas no Desktop) */}
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground px-1">
                <Layers className="h-3.5 w-3.5 text-emerald-500" />
                Como o cliente visualiza no WhatsApp:
              </div>

              <WhatsappChatPreview
                title={tabConfig[activeTab].label}
                recipientName={activeTab === "manager" ? "Carlos (Gerente)" : "Maria Silva (Cliente)"}
                recipientPhone={activeTab === "manager" ? "+55 (11) 97777-6666" : "+55 (11) 98765-4321"}
                message={previewRendered}
                time="09:00"
                headerBgClass={tabConfig[activeTab].headerBg}
              />
            </div>
          </div>

          {/* Configurações Globais Adicionais (Chave Pix e Dias Muito Atrasado) */}
          <div className="pt-4 border-t border-border/40 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 rounded-2xl bg-muted/20 border border-border/40 p-3 sm:p-4">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                Link de Pagamento / Chave Pix Padrão
              </Label>
              <Input
                value={draft.pix_link}
                onChange={(e) => setDraft((d) => ({ ...d, pix_link: e.target.value }))}
                placeholder="Ex: https://pix.me/minha-chave ou chave aleatória"
                disabled={loading}
                className="text-xs rounded-xl h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                Substitui a tag <code className="font-mono text-primary font-semibold">{"{link_pagamento}"}</code> nas mensagens.
              </p>
            </div>

            <div className="space-y-1.5 rounded-2xl bg-muted/20 border border-border/40 p-3 sm:p-4">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                Dias de atraso para o template "Muito atrasado"
              </Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={draft.very_overdue_days}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, very_overdue_days: Number(e.target.value || 30) }))
                }
                disabled={loading}
                className="text-xs rounded-xl h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                A partir dessa quantidade de dias vencidos, o sistema passa a enviar o template crítico.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ManagerActionButtons({ pixLink, dirty }: { pixLink: string; dirty?: boolean }) {
  const [sending, setSending] = useState(false);
  const { runManagerSummaryNow, listManagerSummaryRecipients, previewManagerSummary } =
    useWhatsappBillingSchedule();

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
      toast.warning("Salve as alterações no template antes de realizar o envio.");
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
    <div className="grid grid-cols-2 gap-2 w-full pt-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 sm:h-8 text-xs font-semibold rounded-xl w-full justify-center px-2"
        onClick={openIndividualDialog}
      >
        <UserCheck className="h-3.5 w-3.5 mr-1.5 text-primary shrink-0" />
        <span className="hidden sm:inline">Enviar para um gerente específico</span>
        <span className="sm:hidden">Gerente específico</span>
      </Button>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-9 sm:h-8 text-xs font-semibold rounded-xl w-full justify-center px-2"
        onClick={handleSendNow}
        disabled={sending}
      >
        {sending ? (
          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin shrink-0" />
        ) : (
          <Send className="h-3.5 w-3.5 mr-1.5 shrink-0" />
        )}
        <span className="hidden sm:inline">Disparar para todos os gerentes</span>
        <span className="sm:hidden">Todos os gerentes</span>
      </Button>

      {/* Dialog de Envio Individual */}
      <Dialog open={openIndividual} onOpenChange={setOpenIndividual}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>Enviar resumo para gerente</DialogTitle>
            <DialogDescription>
              Selecione um gerente para visualizar os dados consolidados e confirmar o disparo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Selecione o Gerente</Label>
              {loadingMgrs ? (
                <div className="text-xs text-muted-foreground flex items-center gap-2 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando gerentes…
                </div>
              ) : managers.length === 0 ? (
                <div className="text-xs text-muted-foreground py-2">
                  Nenhum usuário com papel de Gerente encontrado.
                </div>
              ) : (
                <Select value={selectedMgr} onValueChange={handleSelectMgr}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Selecione um gerente" />
                  </SelectTrigger>
                  <SelectContent>
                    {managers.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.display_name || "Gerente"} {!m.has_phone ? "(Sem telefone)" : `(${m.phone})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedMgr && (
              <div className="space-y-1.5">
                <Label className="text-xs">Prévia da mensagem</Label>
                {loadingPreview ? (
                  <div className="text-xs text-muted-foreground flex items-center gap-2 py-4">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando dados da carteira…
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border bg-muted/30 p-3 text-xs whitespace-pre-wrap max-h-60 overflow-y-auto font-sans">
                      {renderedPreview || "Mensagem vazia"}
                    </div>
                    {previewMeta && (
                      <p className="text-[11px] text-muted-foreground font-medium pt-1">
                        📊 {previewMeta.loans} empréstimo(s) na semana — Total de{" "}
                        {previewMeta.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </p>
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
              className="font-semibold"
            >
              {sendingOne ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Confirmar e Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
