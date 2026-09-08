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
} from "lucide-react";
import { TelegramCheckoutModal } from "./TelegramCheckoutModal";

interface TelegramPaywallCardProps {
  onSuccess?: () => void;
}

export function TelegramPaywallCard({ onSuccess }: TelegramPaywallCardProps) {
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  return (
    <div className="space-y-6 w-full py-1">
      {/* Header com Visual Integrado ao App */}
      <Card className="relative overflow-hidden border-border/80 bg-gradient-to-br from-card via-card to-primary/5 shadow-sm w-full">
        <CardContent className="p-6 md:p-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 px-2.5 py-0.5 text-xs font-semibold flex items-center gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  RECURSO PREMIUM
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  Add-on Exclusivo
                </Badge>
              </div>

              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
                <Send className="h-7 w-7 text-primary shrink-0" />
                <span>EmprestAI Telegram</span>
              </h2>

              <p className="text-base font-medium text-foreground/90 max-w-3xl">
                Tenha o seu EmprestAI direto no Telegram.
              </p>
              <p className="text-sm text-muted-foreground max-w-3xl">
                Receba seus relatórios automaticamente e registre suas despesas simplesmente enviando uma mensagem.
              </p>
            </div>
          </div>

          {/* Grid de Benefícios em largura total */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 w-full">
            <div className="p-4 rounded-xl bg-background/60 border border-border/60 flex items-start gap-3.5 shadow-sm hover:border-primary/30 transition-colors">
              <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-500 shrink-0">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-foreground">📊 Relatórios automáticos</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Receba seus relatórios do EmprestAI diretamente no Telegram nos horários programados.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-background/60 border border-border/60 flex items-start gap-3.5 shadow-sm hover:border-primary/30 transition-colors">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
                <MessageSquarePlus className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-foreground">💰 Cadastro de despesas por mensagem</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Envie <em>"Gastei R$ 85 no supermercado"</em> e o EmprestAI interpreta e registra no seu caixa.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-background/60 border border-border/60 flex items-start gap-3.5 shadow-sm hover:border-primary/30 transition-colors">
              <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-500 shrink-0">
                <Tags className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-foreground">🏷️ Categorização automática</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Identificação automática de valor, categoria, descrição, data e tipo de movimentação.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-background/60 border border-border/60 flex items-start gap-3.5 shadow-sm hover:border-primary/30 transition-colors">
              <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
                <Zap className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-foreground">⚡ Mais praticidade</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Registre informações em tempo real no seu dia a dia sem precisar abrir o aplicativo.
                </p>
              </div>
            </div>
          </div>

          {/* Demonstração Visual da Experiência no Telegram */}
          <div className="pt-2 w-full">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Exemplo da Funcionalidade no Telegram
            </h4>

            <div className="bg-slate-950/80 rounded-xl p-4 border border-slate-800 space-y-3 font-sans text-xs w-full">
              {/* Mensagem do Usuário */}
              <div className="flex justify-end">
                <div className="bg-[#2b5278] text-white px-3.5 py-2 rounded-2xl rounded-tr-sm max-w-[80%] shadow-sm flex items-center gap-2">
                  <span>Gastei R$ 85 no supermercado.</span>
                  <span className="text-[10px] text-blue-200 ml-1 opacity-75">14:32</span>
                </div>
              </div>

              {/* Resposta do EmprestAI Telegram */}
              <div className="flex justify-start items-start gap-2">
                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0 text-white shadow-sm mt-0.5">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="bg-slate-900 border border-slate-700/60 text-slate-100 px-4 py-2.5 rounded-2xl rounded-tl-sm max-w-[85%] shadow-md space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Despesa registrada</span>
                  </div>
                  <div className="space-y-0.5 text-slate-300 font-mono text-[11px]">
                    <div>💰 <strong>R$ 85,00</strong></div>
                    <div>🏷️ <strong>Alimentação</strong></div>
                    <div>📝 <strong>Supermercado</strong></div>
                    <div>📅 <strong>Hoje</strong></div>
                  </div>
                  <div className="text-[9px] text-slate-400 text-right opacity-70">14:32</div>
                </div>
              </div>
            </div>
          </div>

          {/* CTA Direto */}
          <div className="pt-2 border-t border-border/60 flex flex-col sm:flex-row sm:items-center justify-end gap-4 w-full">
            <Button
              size="lg"
              onClick={() => setCheckoutOpen(true)}
              className="w-full sm:w-auto font-bold shadow-md px-8 h-12 text-sm"
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
