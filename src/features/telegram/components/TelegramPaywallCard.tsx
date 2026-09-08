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

interface TelegramPaywallCardProps {
  onSuccess?: () => void;
}

export function TelegramPaywallCard({ onSuccess }: TelegramPaywallCardProps) {
  const [checkoutOpen, setCheckoutOpen] = useState(false);

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

            <div className="w-full rounded-2xl bg-[#0f172a] dark:bg-slate-950 border border-slate-800 p-4 sm:p-5 shadow-inner space-y-4 font-sans text-xs">
              {/* Header do Chat */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
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
                <Badge variant="outline" className="border-slate-700 text-slate-400 text-[10px] py-0">
                  Telegram
                </Badge>
              </div>

              {/* Mensagem Enviada pelo Usuário */}
              <div className="flex justify-end">
                <div className="bg-[#2AABEE] text-white px-3.5 py-2 rounded-2xl rounded-tr-xs max-w-[85%] sm:max-w-[70%] shadow-sm space-y-0.5">
                  <p className="text-xs font-medium leading-snug">Gastei R$ 85 no supermercado.</p>
                  <div className="text-[9px] text-blue-100/80 text-right">14:32 ✓✓</div>
                </div>
              </div>

              {/* Resposta do Bot */}
              <div className="flex justify-start items-start gap-2.5">
                <div className="w-7 h-7 rounded-full bg-[#229ED9] flex items-center justify-center shrink-0 text-white shadow-sm mt-0.5">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="bg-[#1e293b] border border-slate-700/70 text-slate-100 p-3.5 rounded-2xl rounded-tl-xs max-w-[90%] sm:max-w-[75%] shadow-md space-y-2">
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-400 text-xs">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>Despesa registrada com sucesso!</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-900/70 p-2.5 rounded-lg border border-slate-800 font-mono">
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
              Assinar EmprestAI Telegram (+ R$ 14,90/mês)
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
