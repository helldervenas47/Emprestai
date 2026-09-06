import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Circle,
  X,
  Sparkles,
  ArrowRight,
  UserPlus,
  Zap,
  Building2,
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
  const { state, dismissChecklist } = useOnboardingProgress();

  // Etapas
  const isPlanActive = true;
  const isSetupDone = state.setupDone || !!state.businessName;
  const isClientDone = state.firstClientDone || clientsCount > 0;
  const isLoanDone = state.firstLoanDone || loansCount > 0;

  const totalSteps = 4;
  const completedStepsCount =
    (isPlanActive ? 1 : 0) +
    (isSetupDone ? 1 : 0) +
    (isClientDone ? 1 : 0) +
    (isLoanDone ? 1 : 0);

  const progressPercent = (completedStepsCount / totalSteps) * 100;
  const isAllComplete = completedStepsCount === totalSteps;

  // Não exibe se o usuário dispensou ou se já concluiu todas as etapas
  if (state.dismissedChecklist || isAllComplete) {
    return null;
  }

  return (
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
              onClick={dismissChecklist}
              className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg"
              title="Dispensar checklist"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
          {/* Item 1: Plano Ativado */}
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-background/60 border border-border/40 text-xs">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <span className="font-medium text-foreground line-through opacity-80">Plano ativado</span>
          </div>

          {/* Item 2: Configurar Operação */}
          <div
            onClick={!isSetupDone ? onOpenWizard : undefined}
            className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-colors ${
              isSetupDone
                ? "bg-background/60 border-border/40 text-foreground"
                : "bg-card border-primary/30 hover:border-primary cursor-pointer shadow-2xs"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {isSetupDone ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className={`font-medium ${isSetupDone ? "line-through opacity-80 text-muted-foreground" : "text-foreground"}`}>
                Configurar operação
              </span>
            </div>
            {!isSetupDone && (
              <Building2 className="h-3.5 w-3.5 text-primary shrink-0 opacity-70" />
            )}
          </div>

          {/* Item 3: Cadastrar Cliente */}
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

          {/* Item 4: Criar Empréstimo */}
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
  );
}
