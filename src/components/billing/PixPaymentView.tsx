import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/userClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  QrCode,
  Copy,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ArrowLeft,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Zap,
} from "lucide-react";
import type { AsaasCheckoutData } from "@/hooks/useAsaasCheckout";

interface PixPaymentViewProps {
  checkoutData: AsaasCheckoutData;
  planName?: string;
  cycleLabel?: string;
  onBackToPlans: () => void;
  onGenerateNewPix?: () => void;
}

type PaymentStatusState = "PENDING" | "PROCESSING" | "CONFIRMED" | "EXPIRED" | "ERROR";

export function PixPaymentView({
  checkoutData,
  planName = "Plano Selecionado",
  cycleLabel = "Mensal",
  onBackToPlans,
  onGenerateNewPix,
}: PixPaymentViewProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [statusState, setStatusState] = useState<PaymentStatusState>("PENDING");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const formatBRL = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const formatDueDate = (dateStr?: string | null) => {
    if (!dateStr) return "Hoje";
    try {
      const [year, month, day] = dateStr.split("-");
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  };

  // Função centralizada para checar status no backend via asaas-payment-status
  const checkStatus = useCallback(async (isManual = false) => {
    if (!checkoutData?.paymentId || statusState === "CONFIRMED") return;
    if (isManual) setChecking(true);

    try {
      const { data, error } = await supabase.functions.invoke("asaas-payment-status", {
        body: { paymentId: checkoutData.paymentId },
      });

      if (error) throw error;

      if (data?.paid) {
        setStatusState("CONFIRMED");
        if (pollingRef.current) clearInterval(pollingRef.current);
        
        // Invalida caches do React Query e notifica o app
        await queryClient.invalidateQueries({ queryKey: ["profile"] });
        await queryClient.invalidateQueries({ queryKey: ["subscription"] });
        await queryClient.invalidateQueries({ queryKey: ["system_settings"] });
        window.dispatchEvent(new Event("subscription:changed"));

        toast.success("Pagamento confirmado com sucesso! Seu plano está ativo.");
      } else if (data?.status === "OVERDUE" || data?.status === "REFUNDED") {
        setStatusState("EXPIRED");
        if (pollingRef.current) clearInterval(pollingRef.current);
      } else if (data?.review) {
        setStatusState("PROCESSING");
      } else {
        setStatusState("PENDING");
      }
    } catch (err: any) {
      if (isManual) {
        setErrorMessage("Não foi possível verificar agora. Tentaremos novamente em instantes.");
        toast.error("Não foi possível consultar o pagamento no momento.");
      }
    } finally {
      if (isManual) setChecking(false);
    }
  }, [checkoutData?.paymentId, statusState, queryClient]);

  // Polling automático a cada 6 segundos enquanto PENDING ou PROCESSING
  useEffect(() => {
    if (statusState === "CONFIRMED" || statusState === "EXPIRED") {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    pollingRef.current = setInterval(() => {
      checkStatus(false);
    }, 6000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [checkStatus, statusState]);

  const handleCopyPayload = () => {
    const payload = checkoutData.pix?.payload;
    if (!payload) return;

    navigator.clipboard.writeText(payload).then(() => {
      setCopied(true);
      toast.success("Código PIX copiado com sucesso!");
      setTimeout(() => setCopied(false), 3000);
    }).catch(() => {
      toast.error("Não foi possível copiar automaticamente. Selecione e copie o código.");
    });
  };

  const handleStartUsing = () => {
    navigate("/?onboarding=true");
  };

  return (
    <div className="max-w-md mx-auto w-full px-4 sm:px-0 animate-in fade-in-50 duration-300">
      {/* Estado: CONFIRMADO / SUCESSO */}
      {statusState === "CONFIRMED" ? (
        <Card className="border-emerald-500/40 bg-card shadow-lg text-center p-6 sm:p-8 space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center animate-in zoom-in-75 duration-300">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 text-xs px-3 py-1 font-semibold">
              Pagamento Aprovado
            </Badge>
            <h2 className="text-2xl font-bold text-foreground">Plano Ativado com Sucesso!</h2>
            <p className="text-sm text-muted-foreground">
              Sua assinatura do plano <strong className="text-foreground">{planName}</strong> ({cycleLabel}) foi confirmada e todos os recursos já estão disponíveis.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-muted/40 border border-border/60 text-left text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plano:</span>
              <span className="font-semibold text-foreground">{planName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor:</span>
              <span className="font-semibold text-foreground">{formatBRL(checkoutData.value)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status da Conta:</span>
              <span className="font-semibold text-emerald-600 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> 100% Ativa
              </span>
            </div>
          </div>

          <Button
            size="lg"
            onClick={handleStartUsing}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6 text-base rounded-xl shadow-md gap-2"
          >
            <Zap className="w-4 h-4" />
            Começar a usar o EmprestAI
          </Button>
        </Card>
      ) : statusState === "EXPIRED" ? (
        /* Estado: EXPIRADO */
        <Card className="border-rose-500/40 bg-card shadow-lg text-center p-6 sm:p-8 space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-rose-500/10 text-rose-600 flex items-center justify-center">
            <AlertCircle className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <Badge variant="destructive" className="text-xs px-3 py-1 font-semibold">
              PIX Expirado
            </Badge>
            <h2 className="text-2xl font-bold text-foreground">Cobrança Vencida</h2>
            <p className="text-sm text-muted-foreground">
              O tempo limite para pagamento deste PIX expirou. Você pode gerar um novo código imediatamente sem custos adicionais.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            {onGenerateNewPix ? (
              <Button
                size="lg"
                onClick={onGenerateNewPix}
                className="w-full font-semibold py-6 text-base rounded-xl gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Gerar Novo PIX
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={onBackToPlans}
              className="w-full rounded-xl py-5"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar aos Planos
            </Button>
          </div>
        </Card>
      ) : (
        /* Estado: PENDENTE OU PROCESSANDO */
        <Card className="border-border/60 bg-card shadow-xl overflow-hidden rounded-2xl">
          <div className="p-5 sm:p-6 text-center border-b border-border/40 bg-muted/20 space-y-2">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-primary/10 text-primary mb-1 shadow-xs">
              <QrCode className="h-6 w-6" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              Pagamento via PIX
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto">
              Escaneie o QR Code no app do seu banco ou copie o código abaixo para ativar sua conta.
            </p>

            {/* Status dinâmico */}
            <div className="pt-2">
              {statusState === "PROCESSING" ? (
                <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 animate-pulse flex items-center gap-1.5 mx-auto w-fit">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Pagamento identificado. Confirmando plano...
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs px-3 py-1 flex items-center gap-1.5 mx-auto w-fit border border-primary/20 bg-primary/5 text-primary">
                  <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                  Aguardando pagamento... (confirmação automática)
                </Badge>
              )}
            </div>
          </div>

          <CardContent className="p-5 sm:p-6 space-y-5">
            {/* Detalhes do Pedido */}
            <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 flex items-center justify-between text-xs">
              <div>
                <p className="text-muted-foreground">Plano Selecionado</p>
                <p className="font-semibold text-foreground text-sm">{planName} ({cycleLabel})</p>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground">Valor Total</p>
                <p className="font-bold text-primary text-base">{formatBRL(checkoutData.value)}</p>
              </div>
            </div>

            {/* Imagem do QR Code */}
            {checkoutData.pix?.encodedImage ? (
              <div className="flex flex-col items-center justify-center p-3 bg-white rounded-xl border border-border/40 shadow-xs">
                <img
                  src={`data:image/png;base64,${checkoutData.pix.encodedImage}`}
                  alt="QR Code PIX"
                  className="w-48 h-48 sm:w-56 sm:h-56 max-w-full object-contain rounded"
                />
                <p className="text-[11px] text-muted-foreground mt-2 font-medium">
                  Válido até: {formatDueDate(checkoutData.dueDate)}
                </p>
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-xs border rounded-xl bg-muted/20">
                QR Code não disponível. Utilize o código copia e cola abaixo.
              </div>
            )}

            {/* Código Copia e Cola */}
            <div className="space-y-1.5">
              <label htmlFor="pix-copia-cola" className="text-xs font-medium text-muted-foreground">
                Código PIX Copia e Cola
              </label>
              <div className="flex gap-2">
                <Input
                  id="pix-copia-cola"
                  readOnly
                  value={checkoutData.pix?.payload || "Carregando código..."}
                  className="font-mono text-xs truncate bg-muted/30 select-all cursor-pointer h-11"
                  onClick={handleCopyPayload}
                />
                <Button
                  type="button"
                  variant={copied ? "default" : "secondary"}
                  size="default"
                  onClick={handleCopyPayload}
                  disabled={!checkoutData.pix?.payload}
                  className="shrink-0 h-11 px-4 gap-1.5 font-medium transition-all"
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      <span className="hidden sm:inline">Copiar Código</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="space-y-2 pt-2">
              <Button
                type="button"
                className="w-full h-12 font-semibold text-sm rounded-xl gap-2 shadow-sm"
                onClick={() => checkStatus(true)}
                disabled={checking}
              >
                {checking ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Consultando confirmação...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Já realizei o pagamento
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full text-muted-foreground hover:text-foreground h-10 text-xs"
                onClick={onBackToPlans}
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                Trocar de plano ou cancelar
              </Button>
            </div>

            {/* Link alternativo da fatura */}
            {checkoutData.invoiceUrl && (
              <p className="text-center text-[11px] text-muted-foreground">
                Problemas para escanear? Acesse o{" "}
                <a
                  href={checkoutData.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground inline-flex items-center gap-0.5 text-primary"
                >
                  comprovante oficial Asaas <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
