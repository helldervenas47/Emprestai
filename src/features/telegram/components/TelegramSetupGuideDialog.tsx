import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Video,
  ArrowRight,
  ExternalLink,
  Bot,
} from "lucide-react";

interface TelegramSetupGuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  botType: "reports" | "expenses";
}

export function TelegramSetupGuideDialog({
  open,
  onOpenChange,
  botType,
}: TelegramSetupGuideDialogProps) {
  const isReports = botType === "reports";

  const handleGoToVideoLessons = () => {
    onOpenChange(false);
    window.dispatchEvent(
      new CustomEvent("app:navigate", { detail: { tab: "video_lessons" } }),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Bot className="h-4 w-4" />
            </div>
            <DialogTitle className="text-base sm:text-lg font-semibold">
              {isReports
                ? "Como configurar o Bot de Relatórios"
                : "Como configurar o Bot de Despesas e Receitas"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Siga o passo a passo abaixo para conectar sua conta ao bot correto do Telegram.
          </DialogDescription>
        </DialogHeader>

        {/* Aviso de 2 bots diferentes */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-2">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <p className="font-semibold text-amber-600 dark:text-amber-400">
                Importante: São dois bots diferentes no Telegram!
              </p>
              <p className="text-muted-foreground leading-relaxed">
                O Emprestaii conta com dois bots independentes, cada um com sua finalidade:
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
            <div
              className={`p-2.5 rounded-lg border transition-colors ${
                isReports
                  ? "border-primary bg-primary/5 font-medium"
                  : "border-border/60 bg-muted/40 text-muted-foreground"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1 font-semibold text-foreground">
                <FileText className="h-3.5 w-3.5 text-primary" />
                1. Bot de Relatórios
                {isReports && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1 ml-auto text-primary border-primary/30">
                    Este card
                  </Badge>
                )}
              </div>
              <p className="text-[11px] leading-tight">
                Envia relatórios operacionais, cobranças, vencimentos do dia e empréstimos em atraso.
              </p>
            </div>

            <div
              className={`p-2.5 rounded-lg border transition-colors ${
                !isReports
                  ? "border-primary bg-primary/5 font-medium"
                  : "border-border/60 bg-muted/40 text-muted-foreground"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1 font-semibold text-foreground">
                <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                2. Bot de Despesas
                {!isReports && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1 ml-auto text-emerald-500 border-emerald-500/30">
                    Este card
                  </Badge>
                )}
              </div>
              <p className="text-[11px] leading-tight">
                Cadastra despesas e receitas no seu financeiro através de mensagens de texto ou áudios.
              </p>
            </div>
          </div>
        </div>

        {/* Passo a Passo */}
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Passo a passo de conexão
          </h4>

          <div className="space-y-2.5 text-xs">
            {isReports ? (
              <>
                <div className="flex items-start gap-3 p-2.5 rounded-lg border border-border/60 bg-card">
                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center shrink-0 text-xs">
                    1
                  </div>
                  <div>
                    <p className="font-semibold">Gerar código de conexão</p>
                    <p className="text-muted-foreground mt-0.5">
                      No card do <strong>Bot de Relatórios</strong>, clique no botão <em>"Conectar bot de relatórios"</em>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-lg border border-border/60 bg-card">
                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center shrink-0 text-xs">
                    2
                  </div>
                  <div>
                    <p className="font-semibold">Copiar comando de início</p>
                    <p className="text-muted-foreground mt-0.5">
                      Copie o comando <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-[11px]">/start [código]</code> gerado na tela.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-lg border border-border/60 bg-card">
                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center shrink-0 text-xs">
                    3
                  </div>
                  <div>
                    <p className="font-semibold">Enviar mensagem no Telegram</p>
                    <p className="text-muted-foreground mt-0.5">
                      Abra a conversa com o <strong>Bot de Relatórios</strong> no Telegram e envie o comando copiado.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-lg border border-border/60 bg-card">
                  <div className="h-6 w-6 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-center shrink-0 text-xs">
                    4
                  </div>
                  <div>
                    <p className="font-semibold">Confirmação automática</p>
                    <p className="text-muted-foreground mt-0.5">
                      O Emprestaii identificará a conexão e o card mudará para <strong>🟢 Conectado</strong>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-lg border border-border/60 bg-card">
                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center shrink-0 text-xs">
                    5
                  </div>
                  <div>
                    <p className="font-semibold">Ativar seus relatórios</p>
                    <p className="text-muted-foreground mt-0.5">
                      Agora é só ativar e configurar os horários de envio nos cards de relatórios disponíveis na tela!
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3 p-2.5 rounded-lg border border-border/60 bg-card">
                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center shrink-0 text-xs">
                    1
                  </div>
                  <div>
                    <p className="font-semibold">Gerar código de conexão</p>
                    <p className="text-muted-foreground mt-0.5">
                      No card do <strong>Bot de Despesas</strong>, clique no botão <em>"Conectar Telegram"</em>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-lg border border-border/60 bg-card">
                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center shrink-0 text-xs">
                    2
                  </div>
                  <div>
                    <p className="font-semibold">Copiar comando exibido</p>
                    <p className="text-muted-foreground mt-0.5">
                      Copie o código <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-[11px]">/start [código]</code> exibido no card.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-lg border border-border/60 bg-card">
                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center shrink-0 text-xs">
                    3
                  </div>
                  <div>
                    <p className="font-semibold">Enviar ao Bot de Despesas</p>
                    <p className="text-muted-foreground mt-0.5">
                      Abra o <strong>Bot de Despesas</strong> no Telegram e envie o comando copiado.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-lg border border-border/60 bg-card">
                  <div className="h-6 w-6 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-center shrink-0 text-xs">
                    4
                  </div>
                  <div>
                    <p className="font-semibold">Pronto para lançar gastos</p>
                    <p className="text-muted-foreground mt-0.5">
                      Com o status <strong>🟢 Conectado</strong>, basta mandar textos ou áudios como:
                      <br />
                      <span className="italic text-foreground">"Almoço 45 reais no cartão de crédito"</span> ou <span className="italic text-foreground">"Recebi 300 de cliente"</span>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-lg border border-border/60 bg-card">
                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center shrink-0 text-xs">
                    5
                  </div>
                  <div>
                    <p className="font-semibold">(Opcional) Resumos Automáticos</p>
                    <p className="text-muted-foreground mt-0.5">
                      Clique em <em>"Configurar resumos automáticos"</em> no card para receber resumos diários, semanais ou mensais dos seus gastos.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Chamada para Vídeo Aulas */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 mt-2">
          <div className="space-y-0.5 text-center sm:text-left">
            <p className="text-xs font-semibold text-foreground flex items-center justify-center sm:justify-start gap-1.5">
              <Video className="h-4 w-4 text-primary" />
              Ainda ficou com alguma dúvida?
            </p>
            <p className="text-[11px] text-muted-foreground">
              Assista à explicação detalhada com exemplos práticos na nossa central de vídeos.
            </p>
          </div>

          <Button
            type="button"
            onClick={handleGoToVideoLessons}
            className="w-full sm:w-auto shrink-0 text-xs gap-1.5 shadow-sm"
          >
            <Video className="h-3.5 w-3.5" />
            Ir para Vídeo Aulas
            <ArrowRight className="h-3 w-3 ml-0.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
