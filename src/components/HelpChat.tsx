import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppLogo } from "@/components/AppLogo";
import { useAppBranding } from "@/hooks/useAppBranding";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ArrowUp,
  Copy,
  Check,
  History,
  Loader2,
  MessageSquarePlus,
  MoreVertical,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  HandCoins,
  DollarSign,
  TrendingUp,
  Package,
  ShieldCheck,
  Zap,
  Target,
  Bot,
  ChevronRight,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { USER_SUPABASE_URL, USER_SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/userClient";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
  at?: number;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: Msg[];
}

const SUPABASE_URL = USER_SUPABASE_URL;
const ASSISTANT_URL = `${SUPABASE_URL}/functions/v1/ai-assistant`;
const ANON_KEY = USER_SUPABASE_PUBLISHABLE_KEY;
const STORAGE_KEY = "ai-assistant:conversations:v1";

const ROTATING_PLACEHOLDERS = [
  "Quem vence hoje?",
  "Quanto tenho em juros pendentes?",
  "Mostre meu fluxo de caixa deste mês",
  "Quanto recebi em PIX hoje?",
  "Quais clientes estão atrasados?",
  "Quais produtos estão com estoque baixo?",
];

interface PromptCategory {
  title: string;
  icon: typeof HandCoins;
  color: string;
  bgColor: string;
  borderColor: string;
  prompts: string[];
}

const PROMPT_CATEGORIES: PromptCategory[] = [
  {
    title: "Empréstimos & Cobranças",
    icon: HandCoins,
    color: "text-primary",
    bgColor: "bg-primary/10",
    borderColor: "border-primary/20",
    prompts: [
      "Quem vence hoje?",
      "Quais clientes estão atrasados?",
      "Como calcular amortização de contrato?",
      "Qual o total a receber de contratos ativos?",
    ],
  },
  {
    title: "Fluxo Financeiro & Caixa",
    icon: DollarSign,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    prompts: [
      "Qual meu fluxo de caixa do mês?",
      "Quanto recebi em PIX hoje?",
      "Quais minhas maiores categorias de despesa?",
      "Comparativo de despesas vs mês anterior",
    ],
  },
  {
    title: "Vendas & Estoque",
    icon: Package,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    prompts: [
      "Quais produtos estão com estoque baixo?",
      "Qual o lucro potencial estimado do meu estoque?",
      "Quem são os clientes com mais compras?",
      "Resumo dos contratos de veículos ativos",
    ],
  },
  {
    title: "Metas & Cofrinhos",
    icon: Target,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
    prompts: [
      "Qual o ritmo necessário para atingir as metas do mês?",
      "Quanto tenho guardado no total dos cofrinhos?",
      "Como funciona o rendimento em CDI dos cofrinhos?",
      "Quais metas estão mais próximas de bater?",
    ],
  },
];

const CAPABILITIES = [
  { label: "Análise em Tempo Real", icon: Zap },
  { label: "Histórico Contratual", icon: TrendingUp },
  { label: "Fluxo Financeiro", icon: DollarSign },
  { label: "Privacidade Bancária", icon: ShieldCheck },
];

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Conversation[]) : [];
  } catch {
    return [];
  }
}

function groupLabel(ts: number) {
  const day = 24 * 60 * 60 * 1000;
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= startToday) return "Hoje";
  if (ts >= startToday - day) return "Ontem";
  if (ts >= startToday - 7 * day) return "Últimos 7 dias";
  return "Este mês";
}

export default function HelpChat() {
  const { branding } = useAppBranding();
  const brandName = branding.brand_name;
  const isMobile = useIsMobile();

  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [fitHeight, setFitHeight] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastQuestionRef = useRef<string>("");

  const isEmpty = messages.length === 0 && !sending;

  useEffect(() => {
    const t = setInterval(() => setPlaceholderIdx((i) => (i + 1) % ROTATING_PLACEHOLDERS.length), 4000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.slice(0, 40)));
    } catch {
      /* ignore quota */
    }
  }, [conversations]);

  useEffect(() => {
    if (!scrollRef.current) return;
    if (typeof scrollRef.current.scrollTo === "function") {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    } else {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  // Altura adaptativa perfeita à viewport da tela
  useEffect(() => {
    const measure = () => {
      const el = rootRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + (window.scrollY || 0);
      const bottomGap = isMobile ? 90 : 28;
      const available = window.innerHeight - top - bottomGap;
      setFitHeight(Math.max(400, Math.round(available)));
    };
    measure();
    const id = window.setTimeout(measure, 150);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [isMobile]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  const persist = useCallback((id: string, msgs: Msg[]) => {
    setConversations((prev) => {
      const title = msgs.find((m) => m.role === "user")?.content.slice(0, 60) || "Nova conversa";
      const existing = prev.find((c) => c.id === id);
      const updated: Conversation = { id, title, updatedAt: Date.now(), messages: msgs };
      const rest = prev.filter((c) => c.id !== id);
      return [updated, ...rest].sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }, []);

  const [loadingPhase, setLoadingPhase] = useState(0);

  useEffect(() => {
    if (!sending) {
      setLoadingPhase(0);
      return;
    }
    const timer = setInterval(() => {
      setLoadingPhase((p) => (p + 1) % 3);
    }, 2200);
    return () => clearInterval(timer);
  }, [sending]);

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || sending) return;
      lastQuestionRef.current = q;

      const convId = activeId ?? newId();
      if (!activeId) setActiveId(convId);

      const history = messages;
      const next: Msg[] = [...history, { role: "user", content: q, at: Date.now() }];
      setMessages(next);
      persist(convId, next);
      setInput("");
      setSending(true);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error("Sessão expirada. Faça login novamente para usar o assistente.");

        // Envia apenas as últimas 4 mensagens para resposta ultra-rápida
        const historyMsgs = history.slice(-4).map(({ role, content }) => ({ role, content }));
        const authHeaders = {
          "Content-Type": "application/json",
          apikey: ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        };

        let response = await fetch(ASSISTANT_URL, {
          method: "POST",
          headers: authHeaders,
          signal: controller.signal,
          body: JSON.stringify({
            message: q,
            history: historyMsgs,
            context: { tab: "ajuda", today: new Date().toISOString().slice(0, 10) },
          }),
        });

        if (response.status === 404) {
          response = await fetch(`${SUPABASE_URL}/functions/v1/help-chat`, {
            method: "POST",
            headers: authHeaders,
            signal: controller.signal,
            body: JSON.stringify({ messages: [...historyMsgs, { role: "user", content: q }] }),
          });
        }

        clearTimeout(timeoutId);

        const data = (await response.json().catch(() => null)) as { reply?: string; error?: string } | null;
        const reply =
          !response.ok || data?.error || !data?.reply
            ? `⚠️ ${data?.error || `Falha ao chamar o assistente (${response.status}).`}`
            : data.reply;
        if (reply.startsWith("⚠️")) toast.error(reply.replace("⚠️ ", ""));

        const finalMsgs: Msg[] = [...next, { role: "assistant", content: reply, at: Date.now() }];
        setMessages(finalMsgs);
        persist(convId, finalMsgs);
      } catch (e) {
        clearTimeout(timeoutId);
        const isAbort = (e as any)?.name === "AbortError";
        const msg = isAbort
          ? "A consulta demorou além do esperado. Tente uma pergunta mais direta ou tente novamente em instantes."
          : e instanceof Error
            ? e.message
            : "Erro de rede.";
        toast.error(msg);
        const finalMsgs: Msg[] = [...next, { role: "assistant", content: `⚠️ ${msg}`, at: Date.now() }];
        setMessages(finalMsgs);
        persist(convId, finalMsgs);
      } finally {
        setSending(false);
      }
    },
    [activeId, messages, persist, sending],
  );

  const newConversation = () => {
    if (sending) return;
    setActiveId(null);
    setMessages([]);
    setInput("");
    setHistoryOpen(false);
  };

  const openConversation = (c: Conversation) => {
    setActiveId(c.id);
    setMessages(c.messages);
    setHistoryOpen(false);
  };

  const deleteConversation = (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) newConversation();
  };

  const regenerate = () => {
    if (sending || !lastQuestionRef.current) return;
    const trimmed = [...messages];
    if (trimmed[trimmed.length - 1]?.role === "assistant") trimmed.pop();
    if (trimmed[trimmed.length - 1]?.role === "user") trimmed.pop();
    setMessages(trimmed);
    setTimeout(() => send(lastQuestionRef.current), 0);
  };

  const filteredConversations = useMemo(() => {
    if (!historySearch.trim()) return conversations;
    const query = historySearch.toLowerCase();
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(query) ||
        c.messages.some((m) => m.content.toLowerCase().includes(query)),
    );
  }, [conversations, historySearch]);

  const grouped = useMemo(() => {
    const map = new Map<string, Conversation[]>();
    for (const c of filteredConversations) {
      const g = groupLabel(c.updatedAt);
      map.set(g, [...(map.get(g) ?? []), c]);
    }
    return Array.from(map.entries());
  }, [filteredConversations]);

  const historyList = (
    <div className="flex flex-col h-full p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Button onClick={newConversation} className="flex-1 gap-2 rounded-xl h-10 shadow-xs font-semibold text-xs">
          <MessageSquarePlus className="h-4 w-4" />
          Nova conversa
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={historySearch}
          onChange={(e) => setHistorySearch(e.target.value)}
          placeholder="Buscar no histórico..."
          className="pl-8 h-8 text-xs rounded-xl bg-card/60 border-border/60"
        />
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {grouped.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1 py-4 text-center">
            {historySearch ? "Nenhuma conversa encontrada." : "Nenhuma conversa gravada."}
          </p>
        ) : (
          grouped.map(([label, items]) => (
            <div key={label} className="space-y-1">
              <p className="px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {label}
              </p>
              {items.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "group flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 cursor-pointer transition-all duration-150 border border-transparent",
                    activeId === c.id
                      ? "bg-primary/15 text-primary font-medium border-primary/20 shadow-xs"
                      : "hover:bg-muted/70 text-foreground",
                  )}
                  onClick={() => openConversation(c)}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <History className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs">{c.title}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {new Date(c.updatedAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Excluir conversa"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(c.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="relative flex overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-b from-card/80 via-card/50 to-card/90 shadow-xl backdrop-blur-xl animate-fade-in"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        height: fitHeight ? `${fitHeight}px` : undefined,
      }}
    >
      {/* Desktop history sidebar */}
      {!isMobile && sidebarOpen && (
        <aside className="hidden lg:flex w-[280px] xl:w-[300px] shrink-0 flex-col border-r border-border/50 bg-background/50 overflow-hidden">
          {historyList}
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header Superior do Assistente */}
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border/50 bg-background/80 backdrop-blur-md px-3 sm:px-5 py-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex items-center justify-center h-10 w-10 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-purple/20 p-1.5 shadow-sm ring-1 ring-primary/25 shrink-0 overflow-hidden">
              <AppLogo area="auth" alt={brandName} rounded className="!w-full !h-full object-contain" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm sm:text-base font-bold text-foreground leading-tight truncate">
                  Assistente IA
                </p>
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary border border-primary/20">
                  <Sparkles className="h-2.5 w-2.5" /> Pro
                </span>
              </div>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span>Online • Conectado à sua base de dados</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="hidden lg:inline-flex h-9 w-9 p-0 rounded-xl"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="Alternar histórico"
              title="Histórico de conversas"
            >
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden h-9 w-9 p-0 rounded-xl"
              onClick={() => setHistoryOpen(true)}
              aria-label="Histórico"
              title="Ver histórico"
            >
              <History className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={newConversation}
              disabled={sending || messages.length === 0}
              className="h-9 gap-1.5 rounded-xl text-xs font-semibold border-border/70 shadow-xs"
            >
              <MessageSquarePlus className="h-3.5 w-3.5 text-primary" />
              <span className="hidden sm:inline">Nova conversa</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-xl" aria-label="Mais opções">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-xl">
                <DropdownMenuItem onClick={newConversation} className="gap-2 text-xs">
                  <MessageSquarePlus className="h-3.5 w-3.5" /> Nova conversa
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => (isMobile ? setHistoryOpen(true) : setSidebarOpen(true))} className="gap-2 text-xs">
                  <History className="h-3.5 w-3.5" /> Ver histórico
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setConversations([]);
                    newConversation();
                    toast.success("Histórico limpo com sucesso.");
                  }}
                  className="gap-2 text-xs text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Limpar todas as conversas
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Corpo de Mensagens / Painel Hero */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
          {isEmpty ? (
            <EmptyState brandName={brandName} onSelectPrompt={(p) => send(p)} />
          ) : (
            <div className="mx-auto w-full max-w-[960px] px-3 sm:px-6 py-6 space-y-5">
              {messages.map((m, i) => (
                <MessageRow
                  key={i}
                  msg={m}
                  isLast={i === messages.length - 1}
                  onRegenerate={regenerate}
                />
              ))}
              {sending && (
                <div className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-card/80 p-4 max-w-sm animate-fade-in shadow-sm backdrop-blur-sm">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs animate-spin shrink-0">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground">
                      {loadingPhase === 0
                        ? "Consultando base de dados…"
                        : loadingPhase === 1
                          ? "Processando informações…"
                          : "Formatando resposta final…"}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {loadingPhase === 0
                        ? "Lendo contratos e lançamentos reais"
                        : loadingPhase === 1
                          ? "Consolidando totais e indicadores"
                          : "Gerando análise personalizada"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Composer / Caixa de Envio */}
        <div className="border-t border-border/50 bg-background/90 backdrop-blur-md px-3 sm:px-6 pt-3 pb-3.5">
          <div className="mx-auto w-full max-w-[960px] space-y-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <div className="relative flex items-end gap-2 rounded-3xl border border-border/70 bg-card p-1.5 shadow-sm transition-all duration-200 focus-within:border-primary/60 focus-within:ring-3 focus-within:ring-primary/20">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={`Pergunte algo como: "${ROTATING_PLACEHOLDERS[placeholderIdx]}"`}
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  className="min-h-[42px] max-h-[180px] flex-1 resize-none border-0 bg-transparent px-3.5 py-2.5 text-xs sm:text-sm leading-snug shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/75"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim() || sending}
                  className="h-10 w-10 shrink-0 rounded-2xl transition-all duration-200 active:scale-95 shadow-xs"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                </Button>
              </div>

              <div className="flex items-center justify-between px-2 pt-1 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1 truncate">
                  <Info className="h-3 w-3 shrink-0" />
                  O assistente pode cometer erros. Verifique informações importantes.
                </span>
                <span className="hidden sm:inline font-mono text-[9px] opacity-70">
                  Enter ↵ para enviar • Shift + Enter para quebra
                </span>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Drawer de Histórico no Mobile */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="left" className="w-[300px] p-0">
          <SheetHeader className="px-4 pt-4 pb-2 border-b border-border/40">
            <SheetTitle className="text-base font-bold flex items-center gap-2">
              <History className="h-4 w-4 text-primary" /> Histórico de Conversas
            </SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100%-60px)]">{historyList}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/**
 * Painel Inicial de Boas-Vindas com Categorias Inteligentes e Prompts Rápidos
 */
function EmptyState({
  brandName,
  onSelectPrompt,
}: {
  brandName: string;
  onSelectPrompt: (prompt: string) => void;
}) {
  return (
    <div className="mx-auto flex h-full w-full max-w-[960px] flex-col items-center justify-start px-4 sm:px-6 py-6 sm:py-8 text-center animate-fade-in space-y-6">
      {/* Hero Header */}
      <div className="flex flex-col items-center space-y-3">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl scale-150 animate-pulse" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/30 via-primary/10 to-purple/30 p-2 shadow-lg shadow-primary/15 ring-2 ring-primary/30">
            <Bot className="h-8 w-8 text-primary" />
          </div>
        </div>
        <div className="space-y-1">
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-foreground">
            Como posso ajudar você hoje no {brandName}?
          </h2>
          <p className="max-w-xl text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Pergunte sobre seus empréstimos, cobranças, receitas, despesas, clientes, metas ou peça uma análise personalizada da sua carteira.
          </p>
        </div>

        {/* Badges de Capacidades */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {CAPABILITIES.map((cap, i) => {
            const Icon = cap.icon;
            return (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-[11px] font-medium text-foreground/80 shadow-xs"
              >
                <Icon className="h-3 w-3 text-primary" />
                {cap.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Grid de 4 Pilares de Prompts Rápidos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full text-left pt-2">
        {PROMPT_CATEGORIES.map((cat, ci) => {
          const Icon = cat.icon;
          return (
            <div
              key={ci}
              className={cn(
                "rounded-2xl border bg-card/60 p-4 transition-all duration-200 shadow-xs hover:shadow-md hover:border-primary/40",
                cat.borderColor,
              )}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className={cn("flex h-7 w-7 items-center justify-center rounded-xl", cat.bgColor, cat.color)}>
                  <Icon className="h-4 w-4" />
                </span>
                <h3 className="text-xs sm:text-sm font-bold text-foreground">{cat.title}</h3>
              </div>

              <div className="space-y-1.5">
                {cat.prompts.map((p, pi) => (
                  <button
                    key={pi}
                    type="button"
                    onClick={() => onSelectPrompt(p)}
                    className="w-full flex items-center justify-between gap-2 rounded-xl bg-background/60 hover:bg-primary/10 border border-border/40 hover:border-primary/30 px-3 py-2 text-left text-xs text-foreground/90 hover:text-primary transition-all duration-150 group active:scale-[0.99]"
                  >
                    <span className="truncate">{p}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Linha de Mensagem (Usuário vs Assistente) com Ações e Renderização Markdown
 */
function MessageRow({
  msg,
  isLast,
  onRegenerate,
}: {
  msg: Msg;
  isLast: boolean;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const isUser = msg.role === "user";

  const time = msg.at
    ? new Date(msg.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Mensagem copiada!");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  if (isUser) {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[85%] sm:max-w-[75%] rounded-3xl rounded-br-md bg-gradient-to-r from-primary via-primary to-primary/95 px-4 sm:px-5 py-3 text-xs sm:text-sm leading-relaxed text-primary-foreground shadow-md whitespace-pre-wrap font-medium">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in rounded-3xl border border-border/60 bg-card/80 p-4 sm:p-5 shadow-sm backdrop-blur-sm space-y-3">
      <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
            <Bot className="h-4 w-4" />
          </span>
          <span className="text-xs font-bold text-foreground">Assistente IA</span>
        </div>
        {time && <span className="text-[10px] text-muted-foreground tabular-nums">{time}</span>}
      </div>

      <div className="prose prose-sm dark:prose-invert max-w-none text-xs sm:text-sm leading-relaxed text-foreground prose-p:my-2 prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-bold prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none prose-pre:bg-muted/70 prose-pre:border prose-pre:border-border/60 prose-pre:rounded-xl prose-pre:text-foreground prose-a:text-primary prose-a:underline hover:prose-a:text-primary/80 prose-table:border-collapse prose-th:border prose-th:border-border/60 prose-th:bg-muted/50 prose-th:px-3 prose-th:py-2 prose-td:border prose-td:border-border/60 prose-td:px-3 prose-td:py-2">
        <ReactMarkdown>{msg.content}</ReactMarkdown>
      </div>

      <div className="flex items-center justify-between border-t border-border/40 pt-2.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <ActionBtn onClick={copy} label={copied ? "Copiado!" : "Copiar"}>
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </ActionBtn>
          <ActionBtn onClick={() => setVote(vote === "up" ? null : "up")} label="Útil" active={vote === "up"}>
            <ThumbsUp className="h-3.5 w-3.5" />
          </ActionBtn>
          <ActionBtn
            onClick={() => setVote(vote === "down" ? null : "down")}
            label="Não útil"
            active={vote === "down"}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
          </ActionBtn>
        </div>

        {isLast && (
          <ActionBtn onClick={onRegenerate} label="Regenerar resposta">
            <RefreshCw className="h-3.5 w-3.5" />
          </ActionBtn>
        )}
      </div>
    </div>
  );
}

function ActionBtn({
  onClick,
  label,
  active,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors duration-150",
        active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
      )}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
