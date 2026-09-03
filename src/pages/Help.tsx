import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AppLogo } from "@/components/AppLogo";
import { useAppBranding } from "@/hooks/useAppBranding";
import { ArrowLeft, Loader2, Send, Sparkles, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const HELP_CHAT_BASE_URL =
  (import.meta.env.VITE_EXTERNAL_SUPABASE_URL as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  "";
const HELP_CHAT_URL = `${HELP_CHAT_BASE_URL.replace(/\/$/, "")}/functions/v1/help-chat`;
const HELP_CHAT_KEY =
  (import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  "";

const SUGGESTIONS = [
  "Como cadastrar um empréstimo parcelado?",
  "Como criar um cofrinho?",
  "Como dar acesso a outro usuário?",
  "Como conectar o bot do Telegram?",
];

export default function Help() {
  const navigate = useNavigate();
  const { branding } = useAppBranding();
  const brandName = branding.brand_name;

  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content: `Olá! Sou o assistente do ${brandName}. Pergunte qualquer coisa sobre o app — como cadastrar empréstimos, usar cofrinhos, configurar bots, permissões, relatórios etc. 👋`,
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || sending) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setSending(true);

    try {
      const response = await fetch(HELP_CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: HELP_CHAT_KEY,
          Authorization: `Bearer ${HELP_CHAT_KEY}`,
        },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
      });

      const data = (await response.json().catch(() => null)) as { reply?: string; error?: string } | null;
      if (!response.ok || data?.error || !data?.reply) {
        const msg = data?.error || `Falha ao chamar o assistente (${response.status}).`;
        toast.error(msg);
        setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${msg}` }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro de rede.";
      toast.error(msg);
      setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${msg}` }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pt-safe">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="flex-shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="h-8 w-8 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0">
          <AppLogo area="auth" alt={brandName} rounded />
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground leading-tight">Ajuda</h1>
          <p className="text-xs text-muted-foreground leading-tight">Assistente IA do {brandName}</p>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div className="max-w-2xl mx-auto w-full space-y-4">
          {messages.map((m, i) => (
            <MessageBubble key={i} msg={m} />
          ))}
          {sending && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Pensando…
            </div>
          )}

          {messages.length <= 1 && !sending && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm rounded-xl border border-border bg-card hover:bg-muted/50 px-3 py-2.5 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-background px-4 py-3 pb-safe">
        <form
          className="max-w-2xl mx-auto flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte algo sobre o app…"
            className="min-h-[44px] max-h-32 resize-none rounded-xl"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            disabled={sending}
          />
          <Button
            type="submit"
            size="icon"
            className="h-11 w-11 rounded-xl flex-shrink-0"
            disabled={sending || !input.trim()}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"
        }`}
      >
        {msg.content}
      </div>
      {isUser && (
        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
          <UserIcon className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
