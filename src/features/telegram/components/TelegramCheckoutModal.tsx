import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Crown,
  QrCode,
  CreditCard as CreditCardIcon,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Loader2,
  Sparkles,
  Send,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAccountProfile } from "@/hooks/useAccountProfile";
import { useAsaasCheckout, AsaasCreditCardData, AsaasCreditCardHolderInfo } from "@/hooks/useAsaasCheckout";
import { supabase } from "@/integrations/supabase/userClient";
import { CreditCardPaymentForm } from "@/components/billing/CreditCardPaymentForm";
import { CouponInputSection } from "@/components/billing/CouponInputSection";
import { useTelegramPlan } from "@/features/telegram/hooks/useTelegramPlan";

interface TelegramCheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function TelegramCheckoutModal({
  open,
  onOpenChange,
  onSuccess,
}: TelegramCheckoutModalProps) {
  const { user } = useAuth();
  const { profile } = useAccountProfile();
  const { plan: telegramPlan, formattedPrice } = useTelegramPlan();
  const { mutate, isPending, data: checkoutData, reset } = useAsaasCheckout();

  const [paymentMethod, setPaymentMethod] = useState<"PIX" | "CREDIT_CARD">("PIX");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [copied, setCopied] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isCardProcessing, setIsCardProcessing] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);

  const basePriceNumber = telegramPlan.price || 14.90;
  const finalPriceNumber = appliedCoupon?.final_cents
    ? appliedCoupon.final_cents / 100
    : basePriceNumber;

  const finalFormattedPrice = finalPriceNumber.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  useEffect(() => {
    if (profile?.cpf_cnpj) {
      setCpfCnpj(profile.cpf_cnpj);
    }
  }, [profile]);

  useEffect(() => {
    if (!open) {
      reset();
      setIsSuccess(false);
      setAppliedCoupon(null);
    }
  }, [open, reset]);

  // Polling para checar status do PIX
  useEffect(() => {
    if (!checkoutData?.paymentId || isSuccess) return;

    const interval = setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke("asaas-payment-status", {
          body: { paymentId: checkoutData.paymentId },
        });
        if (data?.status === "CONFIRMED" || data?.status === "RECEIVED") {
          setIsSuccess(true);
          toast.success("Pagamento confirmado! EmprestAI Telegram ativado com sucesso.");
          clearInterval(interval);
          setTimeout(() => {
            onSuccess?.();
            onOpenChange(false);
          }, 2000);
        }
      } catch {
        /* noop */
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [checkoutData, isSuccess, onSuccess, onOpenChange]);

  const handleGeneratePix = () => {
    const cleanCpf = cpfCnpj.replace(/\D/g, "");
    if (!cleanCpf) {
      toast.error("Informe seu CPF ou CNPJ para gerar a cobrança.");
      return;
    }

    mutate(
      {
        planId: telegramPlan.id,
        cycle: "monthly",
        cpfCnpj: cleanCpf,
        couponCode: appliedCoupon?.code,
        paymentMethod: "PIX",
      },
      {
        onError: (err) => {
          toast.error("Erro ao gerar PIX", {
            description: err.message || "Tente novamente mais tarde.",
          });
        },
      }
    );
  };

  const handlePayWithCard = async (
    cardData: AsaasCreditCardData,
    holderInfo: AsaasCreditCardHolderInfo
  ) => {
    setIsCardProcessing(true);
    mutate(
      {
        planId: telegramPlan.id,
        cycle: "monthly",
        paymentMethod: "CREDIT_CARD",
        couponCode: appliedCoupon?.code,
        creditCard: cardData,
        creditCardHolderInfo: holderInfo,
      },
      {
        onSuccess: (data) => {
          setIsCardProcessing(false);
          if (data.status === "CONFIRMED" || data.status === "RECEIVED") {
            setIsSuccess(true);
            toast.success("Assinatura do EmprestAI Telegram ativada com sucesso!");
            setTimeout(() => {
              onSuccess?.();
              onOpenChange(false);
            }, 2000);
          }
        },
        onError: (err) => {
          setIsCardProcessing(false);
          toast.error("Falha no pagamento com cartão", {
            description: err.message || "Verifique os dados e tente novamente.",
          });
        },
      }
    );
  };

  const copyPixCode = () => {
    const payload = checkoutData?.pix?.payload || checkoutData?.pix?.encodedImage;
    if (!payload) return;
    navigator.clipboard.writeText(payload);
    setCopied(true);
    toast.success("Código PIX copiado para a área de transferência!");
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 bg-card text-card-foreground border-border">
        <DialogHeader className="space-y-1 text-center">
          <div className="mx-auto w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-1">
            <Send className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle className="text-xl font-bold flex items-center justify-center gap-2">
            <span>Assinar EmprestAI Telegram</span>
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Adicional independente de <strong className="text-foreground">{formattedPrice}/mês</strong>
          </DialogDescription>
        </DialogHeader>

        {isSuccess ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto animate-bounce" />
            <h4 className="text-lg font-semibold text-emerald-500">Premium Ativado!</h4>
            <p className="text-xs text-muted-foreground">
              Seu acesso ao EmprestAI Telegram já foi liberado. Aproveite!
            </p>
          </div>
        ) : checkoutData?.pix ? (
          <div className="space-y-4 pt-1">
            {/* Box de Valor */}
            <div className="bg-emerald-500/10 dark:bg-emerald-500/15 p-3 rounded-xl text-center space-y-0.5 border border-emerald-500/30">
              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Valor a pagar</span>
              <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight tabular-nums">
                {finalFormattedPrice}
              </div>
              <p className="text-[10px] text-muted-foreground">Cobrança mensal avulsa e independente via Pix</p>
            </div>

            {/* Container do QR Code */}
            {checkoutData.pix.encodedImage && (
              <div className="flex flex-col items-center space-y-2 pt-1">
                <div className="relative p-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-lg shadow-black/5 ring-1 ring-black/5">
                  {/* Guias visuais nos cantos estilo scanner */}
                  <div className="absolute top-2 left-2 w-3.5 h-3.5 border-t-2 border-l-2 border-emerald-500 rounded-tl" />
                  <div className="absolute top-2 right-2 w-3.5 h-3.5 border-t-2 border-r-2 border-emerald-500 rounded-tr" />
                  <div className="absolute bottom-2 left-2 w-3.5 h-3.5 border-b-2 border-l-2 border-emerald-500 rounded-bl" />
                  <div className="absolute bottom-2 right-2 w-3.5 h-3.5 border-b-2 border-r-2 border-emerald-500 rounded-br" />

                  <img
                    src={`data:image/png;base64,${checkoutData.pix.encodedImage}`}
                    alt="QR Code PIX"
                    className="w-44 h-44 sm:w-48 sm:h-48 object-contain rounded-lg"
                  />
                </div>
                <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5 pt-0.5">
                  <QrCode className="h-3.5 w-3.5 text-primary" />
                  Aponte a câmera do aplicativo do seu banco
                </span>
              </div>
            )}

            {/* Código Pix Copia e Cola */}
            {checkoutData.pix.payload && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>Código Pix Copia e Cola:</span>
                  <button
                    type="button"
                    onClick={copyPixCode}
                    className="text-primary hover:underline text-[11px] font-semibold flex items-center gap-1"
                  >
                    {copied ? (
                      <span className="text-emerald-500 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Copiado!
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Copy className="h-3 w-3" /> Copiar código
                      </span>
                    )}
                  </button>
                </div>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={checkoutData.pix.payload}
                    onClick={copyPixCode}
                    className="text-xs font-mono bg-muted/50 border-border/70 select-all cursor-pointer h-9 truncate"
                  />
                  <Button
                    size="sm"
                    onClick={copyPixCode}
                    variant={copied ? "default" : "secondary"}
                    className="shrink-0 h-9 px-3 gap-1.5 font-semibold transition-all"
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span className="text-xs">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        <span className="text-xs">Copiar</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Status em tempo real */}
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Aguardando confirmação do pagamento...</span>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground hover:text-foreground"
              onClick={() => reset()}
            >
              Escolher outra forma de pagamento
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs flex items-center justify-between">
              <div>
                <span className="font-semibold text-primary">Plano Add-on Premium</span>
                <p className="text-muted-foreground text-[11px]">Relatórios automáticos + Despesas por mensagem</p>
              </div>
              <div className="text-right">
                {appliedCoupon?.valid && appliedCoupon.discount_cents ? (
                  <div>
                    <span className="text-[11px] text-muted-foreground line-through mr-1.5">
                      {formattedPrice}
                    </span>
                    <Badge variant="outline" className="text-sm font-bold text-emerald-500 bg-emerald-500/10 border-emerald-500/30">
                      {finalFormattedPrice}/mês
                    </Badge>
                  </div>
                ) : (
                  <Badge variant="outline" className="text-sm font-bold text-primary">
                    {formattedPrice}/mês
                  </Badge>
                )}
              </div>
            </div>

            {/* Seção de Cupom */}
            <CouponInputSection
              planId={telegramPlan.id}
              cycle="monthly"
              userId={user?.id}
              appliedCoupon={appliedCoupon}
              onCouponApplied={setAppliedCoupon}
            />

            <Tabs defaultValue="pix" className="w-full" onValueChange={(v) => setPaymentMethod(v as any)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pix" className="flex items-center gap-1.5 text-xs">
                  <QrCode className="h-3.5 w-3.5" />
                  PIX Instantâneo
                </TabsTrigger>
                <TabsTrigger value="card" className="flex items-center gap-1.5 text-xs">
                  <CreditCardIcon className="h-3.5 w-3.5" />
                  Cartão de Crédito
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pix" className="space-y-3 pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cpf-pix" className="text-xs">
                    CPF ou CNPJ do pagador:
                  </Label>
                  <Input
                    id="cpf-pix"
                    placeholder="000.000.000-00"
                    value={cpfCnpj}
                    onChange={(e) => setCpfCnpj(e.target.value)}
                    className="text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Necessário para a emissão do comprovante no Banco Central.
                  </p>
                </div>

                <Button
                  onClick={handleGeneratePix}
                  disabled={isPending}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Gerando QR Code PIX...
                    </>
                  ) : (
                    <>
                      <QrCode className="h-4 w-4 mr-2" />
                      Gerar PIX de {finalFormattedPrice}
                    </>
                  )}
                </Button>
              </TabsContent>

              <TabsContent value="card" className="pt-2">
                <CreditCardPaymentForm
                  planName={telegramPlan.name || "EmprestAI Telegram"}
                  cycleLabel="Mensal"
                  totalPrice={finalPriceNumber}
                  isProcessing={isCardProcessing || isPending}
                  onPayWithCard={handlePayWithCard}
                  initialCpf={profile?.cpf_cnpj || ""}
                  initialName={profile?.display_name || user?.email || ""}
                  initialEmail={user?.email || ""}
                />
              </TabsContent>
            </Tabs>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground pt-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              <span>Pagamento seguro via gateway oficial Asaas</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
