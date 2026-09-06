import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Building2,
  UserPlus,
  DollarSign,
  Calendar,
  Sparkles,
  ShieldCheck,
  Zap,
  Loader2,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/userClient";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { onlyDigits, isValidCPF } from "@/lib/brDocuments";

interface QuickOnboardingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddClient: (client: any) => Promise<string | null>;
  onAddLoan: (loan: any) => Promise<string | null>;
  onComplete?: () => void;
}

export function QuickOnboardingWizard({
  open,
  onOpenChange,
  onAddClient,
  onAddLoan,
  onComplete,
}: QuickOnboardingWizardProps) {
  const { user } = useAuth();
  const {
    state: onboardingState,
    startOnboarding,
    completeSetup,
    completeFirstClient,
    completeFirstLoan,
    skipOnboarding,
  } = useOnboardingProgress();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Configuração Operação
  const [businessName, setBusinessName] = useState(onboardingState.businessName || "");
  const [operatorPhone, setOperatorPhone] = useState("");

  // Step 2: Primeiro Cliente
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientCpf, setClientCpf] = useState("");
  const [createdClientId, setCreatedClientId] = useState<string | null>(onboardingState.createdClientId || null);
  const [createdClientName, setCreatedClientName] = useState<string>(onboardingState.createdClientName || "");

  // Step 3: Primeiro Empréstimo
  const [loanAmount, setLoanAmount] = useState("1000");
  const [interestRate, setInterestRate] = useState("20");
  const [installments, setInstallments] = useState("4");
  const [interestType, setInterestType] = useState("Mensal");
  const [paymentType, setPaymentType] = useState("Parcelado");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().split("T")[0];
  });

  useEffect(() => {
    if (open) {
      startOnboarding();
      if (onboardingState.firstClientDone && onboardingState.createdClientId) {
        setCreatedClientId(onboardingState.createdClientId);
        setCreatedClientName(onboardingState.createdClientName || "");
        setStep(3);
      } else if (onboardingState.setupDone) {
        setStep(2);
      }
    }
  }, [open, startOnboarding, onboardingState.firstClientDone, onboardingState.setupDone, onboardingState.createdClientId, onboardingState.createdClientName]);

  // Cálculos financeiros para o preview antes de confirmar
  const previewCalculation = useMemo(() => {
    const principal = parseFloat(loanAmount.replace(",", ".")) || 0;
    const rate = parseFloat(interestRate.replace(",", ".")) || 0;
    const count = parseInt(installments, 10) || 1;

    if (principal <= 0) {
      return { principal: 0, totalToReceive: 0, installmentValue: 0, totalInterest: 0 };
    }

    // Cálculo simples padrão do sistema: Juros simples sobre o principal
    const totalInterest = (principal * (rate / 100));
    const totalToReceive = principal + totalInterest;
    const installmentValue = count > 0 ? totalToReceive / count : totalToReceive;

    return {
      principal,
      totalInterest,
      totalToReceive,
      installmentValue,
      count,
    };
  }, [loanAmount, interestRate, installments]);

  const formatBRL = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const formatDateBR = (isoStr: string) => {
    try {
      const [y, m, d] = isoStr.split("-");
      return `${d}/${m}/${y}`;
    } catch {
      return isoStr;
    }
  };

  // Step 1: Salvar Operação
  const handleSaveSetup = async () => {
    setSubmitting(true);
    try {
      if (user?.id && businessName.trim()) {
        await supabase
          .from("profiles")
          .update({
            full_name: businessName.trim(),
            display_name: businessName.trim(),
          })
          .eq("user_id", user.id);
      }
      completeSetup(businessName.trim());
      setStep(2);
      toast.success("Informações da operação salvas!");
    } catch (e) {
      console.error(e);
      // Avança mesmo se falhar a gravação do nome
      completeSetup(businessName.trim());
      setStep(2);
    } finally {
      setSubmitting(false);
    }
  };

  // Step 2: Salvar Primeiro Cliente
  const handleSaveClient = async () => {
    if (!clientName.trim()) {
      toast.error("Informe o nome do cliente.");
      return;
    }

    if (clientCpf && !isValidCPF(clientCpf)) {
      toast.error("CPF inválido. Verifique o número digitado.");
      return;
    }

    setSubmitting(true);
    try {
      const newClientId = await onAddClient({
        name: clientName.trim(),
        phone: clientPhone.trim() || undefined,
        cpf: onlyDigits(clientCpf) || undefined,
        active: true,
      });

      if (newClientId) {
        setCreatedClientId(newClientId);
        setCreatedClientName(clientName.trim());
        completeFirstClient(newClientId, clientName.trim());
        toast.success("Cliente cadastrado com sucesso!");
        setStep(3);
      } else {
        toast.error("Não foi possível cadastrar o cliente. Verifique se atingiu o limite do seu plano.");
      }
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("limite")) {
        toast.error("Limite de clientes do seu plano atingido. Faça upgrade para adicionar mais.");
      } else {
        toast.error("Erro ao salvar cliente. Tente novamente.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Step 3: Salvar Primeiro Empréstimo
  const handleSaveLoan = async () => {
    if (!createdClientId) {
      toast.error("Nenhum cliente selecionado.");
      setStep(2);
      return;
    }

    const amount = previewCalculation.principal;
    if (amount <= 0) {
      toast.error("Informe um valor válido para o empréstimo.");
      return;
    }

    setSubmitting(true);
    try {
      const loanPayload = {
        borrowerId: createdClientId,
        borrowerName: createdClientName,
        amount: amount,
        interestRate: parseFloat(interestRate.replace(",", ".")) || 0,
        interestType: interestType,
        paymentType: paymentType,
        startDate: startDate,
        dueDate: dueDate,
        installments: previewCalculation.count,
        paidInstallments: 0,
        status: "active",
        remainingAmount: previewCalculation.totalToReceive,
      };

      const newLoanId = await onAddLoan(loanPayload);

      if (newLoanId) {
        completeFirstLoan(newLoanId);
        setStep(4);
        toast.success("Primeiro empréstimo criado com sucesso!");
      } else {
        toast.error("Não foi possível criar o empréstimo. Verifique se atingiu o limite de contratos.");
      }
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("limite")) {
        toast.error("Limite de empréstimos do seu plano atingido. Faça upgrade para aumentar.");
      } else {
        toast.error("Erro ao salvar empréstimo. Tente novamente.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    skipOnboarding();
    onOpenChange(false);
    toast.info("Configuração ignorada. Você pode cadastrar clientes e empréstimos a qualquer momento.");
  };

  const handleFinish = () => {
    onOpenChange(false);
    if (onComplete) onComplete();
  };

  const stepProgress = step === 4 ? 100 : ((step - 1) / 3) * 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden border-border/80 bg-card shadow-2xl rounded-2xl max-h-[92vh] flex flex-col">
        {/* Header Visual */}
        <div className="p-5 sm:p-6 bg-muted/30 border-b border-border/60">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 bg-primary/10 text-primary border-primary/20">
                {step === 4 ? "Concluído" : `Etapa ${step} de 3`}
              </Badge>
            </div>
            {step < 4 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                className="text-xs text-muted-foreground hover:text-foreground h-8 px-2.5"
              >
                Pular configuração
              </Button>
            )}
          </div>

          <DialogTitle className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
            {step === 1 && "Configure sua Operação"}
            {step === 2 && "Cadastre seu Primeiro Cliente"}
            {step === 3 && "Registre seu Primeiro Empréstimo"}
            {step === 4 && "Tudo Pronto!"}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground mt-1">
            {step === 1 && "Vamos configurar o essencial para você começar a operar."}
            {step === 2 && "Informe os dados básicos do seu primeiro tomador."}
            {step === 3 && "Defina as condições e confirme o resumo financeiro."}
            {step === 4 && "Sua conta já possui dados reais e está pronta para uso."}
          </DialogDescription>

          {/* Barra de Progresso */}
          <div className="mt-4 space-y-1">
            <Progress value={stepProgress} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground text-right font-medium">
              {step === 4 ? "3 de 3 concluído (100%)" : `${step - 1} de 3 concluído`}
            </p>
          </div>
        </div>

        {/* Conteúdo Dinâmico com Scroll */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* ETAPA 1: CONFIGURAÇÃO DA OPERAÇÃO */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="space-y-1.5">
                <Label htmlFor="biz-name" className="text-xs sm:text-sm font-medium">
                  Nome da sua empresa ou operação <span className="text-muted-foreground text-xs">(opcional)</span>
                </Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="biz-name"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Ex: Prime Capital, Empréstimos Silva..."
                    className="pl-9 h-11 text-sm rounded-xl"
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Será exibido nos relatórios, contratos e comprovantes gerados pelo sistema.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="biz-phone" className="text-xs sm:text-sm font-medium">
                  WhatsApp para contato <span className="text-muted-foreground text-xs">(opcional)</span>
                </Label>
                <Input
                  id="biz-phone"
                  value={operatorPhone}
                  onChange={(e) => setOperatorPhone(e.target.value)}
                  placeholder="(00) 00000-0000"
                  className="h-11 text-sm rounded-xl"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 flex gap-3 text-xs text-muted-foreground">
                <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <p>
                  Você pode personalizar juros padrão, cobranças automáticas e multas a qualquer momento no menu de configurações.
                </p>
              </div>
            </div>
          )}

          {/* ETAPA 2: PRIMEIRO CLIENTE */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="space-y-1.5">
                <Label htmlFor="client-name" className="text-xs sm:text-sm font-medium">
                  Nome Completo do Cliente <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="client-name"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Ex: Carlos Eduardo Silva"
                    className="pl-9 h-11 text-sm rounded-xl"
                    autoFocus
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="client-phone" className="text-xs sm:text-sm font-medium">
                    WhatsApp / Telefone
                  </Label>
                  <Input
                    id="client-phone"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="(00) 90000-0000"
                    className="h-11 text-sm rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="client-cpf" className="text-xs sm:text-sm font-medium">
                    CPF <span className="text-muted-foreground text-xs">(opcional)</span>
                  </Label>
                  <Input
                    id="client-cpf"
                    value={clientCpf}
                    onChange={(e) => setClientCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    className="h-11 text-sm rounded-xl"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 text-xs text-muted-foreground">
                Após salvar, você poderá criar um empréstimo imediatamente para este cliente sem precisar voltar ao menu.
              </div>
            </div>
          )}

          {/* ETAPA 3: PRIMEIRO EMPRÉSTIMO COM PREVIEW */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              {/* Cliente Selecionado */}
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Cliente:</span>
                  <strong className="text-foreground text-sm font-semibold">{createdClientName || "Cliente Selecionado"}</strong>
                </div>
                <Badge variant="outline" className="text-[10px] bg-background">Ativo</Badge>
              </div>

              {/* Campos do Empréstimo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="loan-amount" className="text-xs font-medium">
                    Valor Emprestado (R$)
                  </Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="loan-amount"
                      type="number"
                      step="50"
                      value={loanAmount}
                      onChange={(e) => setLoanAmount(e.target.value)}
                      placeholder="1000"
                      className="pl-9 h-11 text-sm rounded-xl font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="interest-rate" className="text-xs font-medium">
                    Taxa de Juros (% a.m.)
                  </Label>
                  <Input
                    id="interest-rate"
                    type="number"
                    step="1"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                    placeholder="20"
                    className="h-11 text-sm rounded-xl font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="installments-count" className="text-xs font-medium">
                    Qtd. de Parcelas
                  </Label>
                  <Input
                    id="installments-count"
                    type="number"
                    min="1"
                    max="120"
                    value={installments}
                    onChange={(e) => setInstallments(e.target.value)}
                    placeholder="4"
                    className="h-11 text-sm rounded-xl font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="due-date" className="text-xs font-medium">
                    Primeiro Vencimento
                  </Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="due-date"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="pl-9 h-11 text-sm rounded-xl font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* CARD DE PREVIEW FINANCEIRO ANTES DE CONFIRMAR */}
              <Card className="border-primary/30 bg-primary/5 shadow-xs rounded-xl overflow-hidden">
                <CardContent className="p-4 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between font-medium text-foreground pb-2 border-b border-primary/20">
                    <span className="text-primary font-semibold flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5" /> Resumo do Contrato
                    </span>
                    <span className="text-muted-foreground">Prévia de Retorno</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor Emprestado:</span>
                    <strong className="text-foreground">{formatBRL(previewCalculation.principal)}</strong>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total a Receber:</span>
                    <strong className="text-emerald-600 font-bold text-sm">
                      {formatBRL(previewCalculation.totalToReceive)}
                    </strong>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Parcelas:</span>
                    <strong className="text-foreground font-semibold">
                      {previewCalculation.count} × {formatBRL(previewCalculation.installmentValue)}
                    </strong>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Primeiro Vencimento:</span>
                    <span className="text-foreground">{formatDateBR(dueDate)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ETAPA 4: SUCESSO DO PRIMEIRO EMPRÉSTIMO */}
          {step === 4 && (
            <div className="text-center py-4 space-y-4 animate-in zoom-in-95 duration-200">
              <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-xl font-bold text-foreground">Primeiro Empréstimo Criado!</h3>
                <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto">
                  Sua operação já está ativa. O cliente e o empréstimo foram registrados e seu dashboard foi atualizado com sucesso.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 text-left text-xs space-y-1.5 max-w-sm mx-auto">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cliente:</span>
                  <span className="font-semibold text-foreground">{createdClientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor a Receber:</span>
                  <span className="font-bold text-emerald-600">{formatBRL(previewCalculation.totalToReceive)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Parcelas:</span>
                  <span className="font-medium text-foreground">{previewCalculation.count} parcelas</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé de Ações */}
        <div className="p-4 sm:p-5 bg-muted/20 border-t border-border/60 flex items-center justify-between gap-3">
          {step === 1 && (
            <>
              <Button
                variant="outline"
                onClick={handleSkip}
                className="h-11 rounded-xl text-xs sm:text-sm"
              >
                Pular
              </Button>
              <Button
                onClick={handleSaveSetup}
                disabled={submitting}
                className="h-11 px-6 rounded-xl font-semibold gap-1.5 text-xs sm:text-sm"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continuar"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                className="h-11 rounded-xl text-xs sm:text-sm"
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
              </Button>
              <Button
                onClick={handleSaveClient}
                disabled={submitting || !clientName.trim()}
                className="h-11 px-6 rounded-xl font-semibold gap-1.5 text-xs sm:text-sm"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                  </>
                ) : (
                  <>
                    <span>Criar empréstimo para este cliente</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </>
          )}

          {step === 3 && (
            <>
              <Button
                variant="outline"
                onClick={() => setStep(2)}
                className="h-11 rounded-xl text-xs sm:text-sm"
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
              </Button>
              <Button
                onClick={handleSaveLoan}
                disabled={submitting || previewCalculation.principal <= 0}
                className="h-11 px-6 rounded-xl font-semibold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs sm:text-sm shadow-md"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Registrando...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    <span>Confirmar empréstimo</span>
                  </>
                )}
              </Button>
            </>
          )}

          {step === 4 && (
            <Button
              onClick={handleFinish}
              className="w-full h-12 rounded-xl font-semibold text-sm bg-primary hover:bg-primary/90 text-primary-foreground shadow-md gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Acessar Meu Dashboard
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
