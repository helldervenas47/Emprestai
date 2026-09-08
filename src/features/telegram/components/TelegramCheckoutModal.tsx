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

interface TelegramCheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const TELEGRAM_ADDON_PLAN_ID = "b4e60000-0000-0000-0000-000000000001";
const ADDON_PRICE = "R$ 14,90";

export function TelegramCheckoutModal({
  open,
  onOpenChange,
  onSuccess,
}: TelegramCheckoutModalProps) {
  const { user } = useAuth();
  const { profile } = useAccountProfile();
  const { mutate, isPending, data: checkoutData, reset } = useAsaasCheckout();

  const [paymentMethod, setPaymentMethod] = useState<"PIX" | "CREDIT_CARD">("PIX");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [copied, setCopied] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isCardProcessing, setIsCardProcessing] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);

  const basePriceNumber = 14.90;
  const finalPriceNumber = appliedCoupon?.final_cents
    ? appliedCoupon.final_cents / 100
    : basePriceNumber;

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
        planId: TELEGRAM_ADDON_PLAN_ID,
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
        planId: TELEGRAM_ADDON_PLAN_ID,
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
            Adicional independente de <strong className="text-foreground">{ADDON_PRICE}/mês</strong>
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
          <div className="space-y-4 pt-2">
            <div className="bg-muted/40 p-3 rounded-lg text-center space-y-1 border border-border/50">
              <div className="text-xs text-muted-foreground">Valor a pagar</div>
              <div className="text-2xl font-bold text-emerald-500">{ADDON_PRICE}</div>
              <div className="text-[11px] text-muted-foreground">Cobrança mensal avulsa e independente</div>
            </div>

            {checkoutData.pix.encodedImage && (
              <div className="flex justify-center p-3 bg-white rounded-lg border">
                <img
                  src={`data:image/png;base64,${checkoutData.pix.encodedImage}`}
                  alt="QR Code PIX"
                  className="w-48 h-48 object-contain"
                />
              </div>
            )}

            {checkoutData.pix.payload && (
              <div className="space-y-2">
                <Label className="text-xs">Código Pix Copia e Cola:</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={checkoutData.pix.payload}
                    className="text-xs font-mono bg-muted/60"
                  />
                  <Button size="sm" onClick={copyPixCode} variant="outline">
                    {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Aguardando confirmação do pagamento...</span>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
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
                      R$ 14,90
                    </span>
                    <Badge variant="outline" className="text-sm font-bold text-emerald-500 bg-emerald-500/10 border-emerald-500/30">
                      R$ {finalPriceNumber.toFixed(2)}/mês
                    </Badge>
                  </div>
                ) : (
                  <Badge variant="outline" className="text-sm font-bold text-primary">
                    {ADDON_PRICE}/mês
                  </Badge>
                )}
              </div>
            </div>

            {/* Seção de Cupom */}
            <CouponInputSection
              planId={TELEGRAM_ADDON_PLAN_ID}
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
                      Gerar PIX de R$ {finalPriceNumber.toFixed(2)}
                    </>
                  )}
                </Button>
              </TabsContent>

              <TabsContent value="card" className="pt-2">
                <CreditCardPaymentForm
                  planName="EmprestAI Telegram"
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
