import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  MessageSquarePlus,
  Tags,
  Zap,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Send,
  Bot,
  ShieldCheck,
} from "lucide-react";
import { TelegramCheckoutModal } from "./TelegramCheckoutModal";
import { useTelegramPlan } from "@/features/telegram/hooks/useTelegramPlan";

interface TelegramPaywallCardProps {
  onSuccess?: () => void;
}

export function TelegramPaywallCard({ onSuccess }: TelegramPaywallCardProps) {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const { formattedPrice } = useTelegramPlan();

  return (
    <div className="w-full space-y-6">
      <Card className="relative overflow-hidden border-border/80 bg-gradient-to-br from-card via-card to-primary/5 shadow-sm w-full">
        <CardContent className="p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8">
          {/* Cabeçalho */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 px-2.5 py-0.5 text-xs font-semibold flex items-center gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Recurso Premium
              </Badge>
              <Badge variant="secondary" className="text-xs">
                Add-on Exclusivo
              </Badge>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
                <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Send className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                </div>
                <span>EmprestAI Telegram</span>
              </h2>
              <p className="text-sm sm:text-base font-medium text-foreground/90 max-w-3xl">
                Tenha o seu EmprestAI direto no Telegram.
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-3xl leading-relaxed">
                Receba relatórios financeiros automáticos nos horários que preferir e registre despesas simplesmente enviando mensagens de texto para o bot.
              </p>
            </div>
          </div>

          {/* Grid de Benefícios */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4 w-full">
            <div className="p-4 rounded-xl bg-background/70 border border-border/60 flex items-start gap-3.5 shadow-sm hover:border-primary/40 transition-all">
              <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div className="space-y-1 min-w-0">
                <h4 className="text-sm font-semibold text-foreground">Relatórios automáticos</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Resumo operacional, vencimentos do dia, atrasos e planejamento direto no seu Telegram nos horários programados.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-background/70 border border-border/60 flex items-start gap-3.5 shadow-sm hover:border-primary/40 transition-all">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                <MessageSquarePlus className="h-5 w-5" />
              </div>
              <div className="space-y-1 min-w-0">
                <h4 className="text-sm font-semibold text-foreground">Cadastro de despesas por mensagem</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Basta enviar <em>"Gastei R$ 85 no supermercado"</em> e o EmprestAI interpreta e registra no seu caixa em segundos.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-background/70 border border-border/60 flex items-start gap-3.5 shadow-sm hover:border-primary/40 transition-all">
              <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 shrink-0">
                <Tags className="h-5 w-5" />
              </div>
              <div className="space-y-1 min-w-0">
                <h4 className="text-sm font-semibold text-foreground">Categorização inteligente</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Identificação automática de valor, categoria, descrição, data e tipo de movimentação sem trabalho manual.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-background/70 border border-border/60 flex items-start gap-3.5 shadow-sm hover:border-primary/40 transition-all">
              <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                <Zap className="h-5 w-5" />
              </div>
              <div className="space-y-1 min-w-0">
                <h4 className="text-sm font-semibold text-foreground">Praticidade no dia a dia</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Gerencie informações financeiras em tempo real sem a necessidade de abrir o aplicativo toda hora.
                </p>
              </div>
            </div>
          </div>

          {/* Demonstração Visual do Chat Telegram */}
          <div className="space-y-2.5 w-full">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Exemplo de Funcionamento no Telegram
            </h4>

            <div
              className="relative w-full rounded-2xl border border-[#232e3c] p-4 sm:p-5 shadow-inner space-y-4 font-sans text-xs overflow-hidden"
              style={{
                backgroundColor: "#0e1621",
                backgroundImage: "radial-gradient(circle at 50% 30%, #172433 0%, #0e1621 100%)",
              }}
            >
              {/* Papel de Parede Oficial do Telegram (Telegram Doodles Pattern) */}
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.09]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='240' height='240' viewBox='0 0 240 240' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23ffffff' stroke-width='1.3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 30 l25 -10 l-10 25 l-6 -6 l-9 -9z M35 20 l-15 15' /%3E%3Cpath d='M100 25 a8 8 0 0 1 16 0 c0 6 -8 10 -8 10 s-8 -4 -8 -10 z' /%3E%3Cpath d='M180 20 l3 6 l6 1 l-4.5 4 l1 6 l-5.5 -3 l-5.5 3 l1 -6 l-4.5 -4 l6 -1 z' /%3E%3Cpath d='M50 80 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 M56 70 v4 M56 86 v4 M46 80 h4 M62 80 h4' /%3E%3Cpath d='M140 75 h16 a3 3 0 0 1 3 3 v8 a3 3 0 0 1 -3 3 h-16 a3 3 0 0 1 -3 -3 v-8 a3 3 0 0 1 3 -3 z M156 80 h3 a2 2 0 0 1 2 2 v2 a2 2 0 0 1 -2 2 h-3' /%3E%3Cpath d='M210 90 l-8 8 l-4 -4 M218 82 a10 10 0 1 1 -14 0' /%3E%3Cpath d='M25 140 c3 -5 8 -5 11 0 c3 -5 8 -5 11 0 c3 5 0 10 -5 12 h-12 c-5 -2 -8 -7 -5 -12 z' /%3E%3Cpath d='M95 140 l12 -8 l12 8 l-4 14 h-16 z' /%3E%3Cpath d='M180 135 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0 M173 135 a16 6 0 1 0 32 0 a16 6 0 1 0 -32 0' /%3E%3Cpath d='M40 200 h18 v10 h-18 z M43 200 v-4 a3 3 0 0 1 6 0 v4 M55 200 v-4 a3 3 0 0 1 6 0 v4' /%3E%3Cpath d='M120 195 l6 12 l-12 0 z M116 207 h8 v6 h-8 z' /%3E%3Cpath d='M195 190 a8 8 0 1 1 0 16 a8 8 0 0 1 -4 -1 l-4 3 l1 -4 a8 8 0 0 1 7 -14 z' /%3E%3C/g%3E%3C/svg%3E")`,
                  backgroundSize: "240px 240px",
                }}
              />

              {/* Header do Chat */}
              <div className="relative z-10 flex items-center justify-between pb-3 border-b border-[#242f3d]/80 bg-[#17212b]/60 -mx-4 -mt-4 sm:-mx-5 sm:-mt-5 p-3 sm:px-4 rounded-t-2xl backdrop-blur-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#229ED9] flex items-center justify-center text-white font-bold text-xs shadow-sm">
                    <Send className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-100 flex items-center gap-1.5 text-xs">
                      <span>EmprestAI Bot</span>
                      <ShieldCheck className="h-3.5 w-3.5 text-[#229ED9]" />
                    </div>
                    <span className="text-[10px] text-slate-400">bot oficial</span>
                  </div>
                </div>
                <Badge variant="outline" className="border-[#2b5278] bg-[#2b5278]/20 text-[#2AABEE] text-[10px] py-0 font-medium">
                  Telegram
                </Badge>
              </div>

              {/* Mensagem Enviada pelo Usuário */}
              <div className="relative z-10 flex justify-end pt-1">
                <div className="bg-[#2b5278] text-white px-3.5 py-2 rounded-2xl rounded-tr-xs max-w-[85%] sm:max-w-[70%] shadow-md space-y-0.5 border border-[#3b6690]/40">
                  <p className="text-xs font-medium leading-snug">Gastei R$ 85 no supermercado.</p>
                  <div className="text-[9px] text-sky-200/80 text-right">14:32 ✓✓</div>
                </div>
              </div>

              {/* Resposta do Bot */}
              <div className="relative z-10 flex justify-start items-start gap-2.5">
                <div className="w-7 h-7 rounded-full bg-[#229ED9] flex items-center justify-center shrink-0 text-white shadow-sm mt-0.5">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="bg-[#182533] border border-[#242f3d] text-slate-100 p-3.5 rounded-2xl rounded-tl-xs max-w-[90%] sm:max-w-[75%] shadow-md space-y-2">
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-400 text-xs">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>Despesa registrada com sucesso!</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] bg-[#0e1621] p-2.5 rounded-lg border border-[#242f3d] font-mono">
                    <div>
                      <span className="text-slate-400 text-[10px] block font-sans">Valor</span>
                      <strong className="text-emerald-400">R$ 85,00</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block font-sans">Categoria</span>
                      <strong className="text-slate-200">Alimentação</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block font-sans">Descrição</span>
                      <strong className="text-slate-200 truncate block">Supermercado</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block font-sans">Data</span>
                      <strong className="text-slate-200">Hoje</strong>
                    </div>
                  </div>
                  <div className="text-[9px] text-slate-400 text-right">14:32</div>
                </div>
              </div>
            </div>
          </div>

          {/* Rodapé e Botão CTA */}
          <div className="pt-3 border-t border-border/60 flex flex-col sm:flex-row sm:items-center justify-end gap-4 w-full">
            <Button
              size="lg"
              onClick={() => setCheckoutOpen(true)}
              className="w-full sm:w-auto font-bold shadow-md px-8 h-12 text-sm sm:text-base transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              <Send className="h-4 w-4 mr-2" />
              Assinar EmprestAI Telegram (+ {formattedPrice}/mês)
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <TelegramCheckoutModal
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        onSuccess={() => {
          onSuccess?.();
        }}
      />
    </div>
  );
}
