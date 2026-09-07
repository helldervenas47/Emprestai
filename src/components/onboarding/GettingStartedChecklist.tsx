import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  Circle,
  X,
  Sparkles,
  ArrowRight,
  UserPlus,
  Zap,
  Clock,
} from "lucide-react";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";

interface GettingStartedChecklistProps {
  clientsCount: number;
  loansCount: number;
  onOpenWizard: () => void;
  onOpenNewClient: () => void;
  onOpenNewLoan: () => void;
}

export function GettingStartedChecklist({
  clientsCount,
  loansCount,
  onOpenWizard,
  onOpenNewClient,
  onOpenNewLoan,
}: GettingStartedChecklistProps) {
  const {
    state,
    isLoaded,
    postponeChecklist,
    dismissChecklistPermanently,
  } = useOnboardingProgress();

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  // Etapas
  const isPlanActive = true;
  const isClientDone = state.firstClientDone || clientsCount > 0;
  const isLoanDone = state.firstLoanDone || loansCount > 0;

  const totalSteps = 3;
  const completedStepsCount =
    (isPlanActive ? 1 : 0) +
    (isClientDone ? 1 : 0) +
    (isLoanDone ? 1 : 0);

  const progressPercent = (completedStepsCount / totalSteps) * 100;
  const isAllComplete = completedStepsCount === totalSteps;

  // Prevenção de flash visual: não renderiza se ainda não carregou o estado do usuário
  // Não exibe se o usuário adiou nesta sessão, dispensou permanentemente ou já concluiu tudo
  if (!isLoaded || state.dismissedPermanent || state.postponedSession || state.dismissedChecklist || isAllComplete) {
    return null;
  }

  const handlePostpone = () => {
    setConfirmModalOpen(false);
    postponeChecklist();
  };

  const handleDismissPermanently = () => {
    setConfirmModalOpen(false);
    dismissChecklistPermanently();
  };

  return (
    <>
      <Card className="border border-primary/20 bg-gradient-to-r from-primary/5 via-card to-primary/5 shadow-sm rounded-2xl overflow-hidden mb-5 animate-in fade-in-50 duration-300">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-semibold text-foreground">
                    Primeiros Passos no EmprestAI
                  </h3>
                  <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary border-primary/20 font-semibold">
                    {completedStepsCount}/{totalSteps} concluído
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Complete a configuração inicial para aproveitar todo o potencial da sua carteira.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenWizard}
                className="h-8 text-xs font-semibold rounded-lg gap-1 border-primary/30 text-primary hover:bg-primary/10 hidden sm:inline-flex"
              >
                <span>Abrir Assistente</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setConfirmModalOpen(true)}
                className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg"
                title="Fechar checklist"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Barra de Progresso */}
          <div className="space-y-1">
            <Progress value={progressPercent} className="h-1.5 bg-primary/10" />
          </div>

          {/* Lista de Itens do Checklist */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            {/* Item 1: Plano Ativado */}
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-background/60 border border-border/40 text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              <span className="font-medium text-foreground line-through opacity-80">Plano ativado</span>
            </div>

            {/* Item 2: Cadastrar Cliente */}
            <div
              onClick={!isClientDone ? onOpenNewClient : undefined}
              className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-colors ${
                isClientDone
                  ? "bg-background/60 border-border/40 text-foreground"
                  : "bg-card border-primary/30 hover:border-primary cursor-pointer shadow-2xs"
              }`}
            >
              <div className="flex items-center gap-2.5">
                {isClientDone ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className={`font-medium ${isClientDone ? "line-through opacity-80 text-muted-foreground" : "text-foreground"}`}>
                  Cadastrar 1º cliente
                </span>
              </div>
              {!isClientDone && (
                <UserPlus className="h-3.5 w-3.5 text-primary shrink-0 opacity-70" />
              )}
            </div>

            {/* Item 3: Criar Empréstimo */}
            <div
              onClick={!isLoanDone ? onOpenNewLoan : undefined}
              className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-colors ${
                isLoanDone
                  ? "bg-background/60 border-border/40 text-foreground"
                  : "bg-card border-primary/30 hover:border-primary cursor-pointer shadow-2xs"
              }`}
            >
              <div className="flex items-center gap-2.5">
                {isLoanDone ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className={`font-medium ${isLoanDone ? "line-through opacity-80 text-muted-foreground" : "text-foreground"}`}>
                  Criar 1º empréstimo
                </span>
              </div>
              {!isLoanDone && (
                <Zap className="h-3.5 w-3.5 text-primary shrink-0 opacity-70" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Confirmação ao fechar o Checklist */}
      <Dialog open={confirmModalOpen} onOpenChange={setConfirmModalOpen}>
        <DialogContent className="sm:max-w-md p-6 border-border/80 bg-card rounded-2xl shadow-xl">
          <DialogHeader className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Clock className="h-5 w-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-foreground">
              Quer continuar o passo a passo depois?
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
              Você pode retomar o passo a passo quando voltar ao EmprestAI ou escolher não exibi-lo novamente. Esse guia ajuda você a concluir a configuração inicial e operar com segurança.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-4">
            <Button
              variant="outline"
              onClick={handleDismissPermanently}
              className="w-full sm:flex-1 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/30 rounded-xl h-10"
            >
              Não mostrar novamente
            </Button>

            <Button
              onClick={handlePostpone}
              className="w-full sm:flex-1 text-xs font-semibold rounded-xl h-10 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Fazer mais tarde
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
