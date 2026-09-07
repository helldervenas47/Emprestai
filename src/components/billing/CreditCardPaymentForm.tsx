import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard as CreditCardIcon,
  ShieldCheck,
  Lock,
  Loader2,
  Calendar,
  User,
  MapPin,
  Phone,
  ArrowLeft,
} from "lucide-react";
import type { AsaasCreditCardData, AsaasCreditCardHolderInfo } from "@/hooks/useAsaasCheckout";

export interface CreditCardPaymentFormProps {
  planName?: string;
  cycleLabel?: string;
  totalPrice?: number;
  isProcessing?: boolean;
  isLoading?: boolean;
  onPayWithCard?: (
    cardData: AsaasCreditCardData,
    holderInfo: AsaasCreditCardHolderInfo
  ) => void;
  onSubmit?: (
    cardData: AsaasCreditCardData,
    holderInfo: AsaasCreditCardHolderInfo
  ) => void;
  onBackToPlans?: () => void;
  initialCpf?: string;
  initialName?: string;
  initialEmail?: string;
}

export function detectCardBrand(number: string): string {
  const clean = number.replace(/\D/g, "");
  if (/^(4011|438935|451416|4576|504175|5067|509|627780|636297|636368|650|6516|6550)/.test(clean)) return "Elo";
  if (/^(606282|3841)/.test(clean)) return "Hipercard";
  if (/^4/.test(clean)) return "Visa";
  if (/^(5[1-5]|222[1-9]|22[3-9]|2[3-6]|27[0-1]|2720)/.test(clean)) return "Mastercard";
  if (/^3[47]/.test(clean)) return "American Express";
  return "";
}

export function CreditCardPaymentForm({
  planName = "Plano Selecionado",
  cycleLabel = "Mensal",
  totalPrice = 0,
  isProcessing = false,
  isLoading = false,
  onPayWithCard,
  onSubmit,
  onBackToPlans,
  initialCpf = "",
  initialName = "",
  initialEmail = "",
}: CreditCardPaymentFormProps) {
  const [cardNumber, setCardNumber] = useState("");
  const [holderName, setHolderName] = useState(initialName);
  const [expiry, setExpiry] = useState("");
  const [ccv, setCcv] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState(initialCpf);
  const [postalCode, setPostalCode] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [showAddressFields, setShowAddressFields] = useState(false);

  const processing = isProcessing || isLoading;
  const handlePayment = onPayWithCard || onSubmit;

  const formatBRL = (val?: number) =>
    (val ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const brand = useMemo(() => detectCardBrand(cardNumber), [cardNumber]);

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, "");
    if (val.length > 16) val = val.slice(0, 16);
    const parts = val.match(/.{1,4}/g);
    setCardNumber(parts ? parts.join(" ") : val);
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, "");
    if (val.length > 4) val = val.slice(0, 4);
    if (val.length >= 3) {
      setExpiry(`${val.slice(0, 2)}/${val.slice(2)}`);
    } else {
      setExpiry(val);
    }
  };

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, "");
    if (val.length > 14) val = val.slice(0, 14);
    if (val.length <= 11) {
      // CPF
      val = val.replace(/(\d{3})(\d)/, "$1.$2");
      val = val.replace(/(\d{3})(\d)/, "$1.$2");
      val = val.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    } else {
      // CNPJ
      val = val.replace(/^(\d{2})(\d)/, "$1.$2");
      val = val.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
      val = val.replace(/\.(\d{3})(\d)/, ".$1/$2");
      val = val.replace(/(\d{4})(\d)/, "$1-$2");
    }
    setCpfCnpj(val);
  };

  const handlePostalCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, "");
    if (val.length > 8) val = val.slice(0, 8);
    if (val.length > 5) {
      val = `${val.slice(0, 5)}-${val.slice(5)}`;
    }
    setPostalCode(val);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, "");
    if (val.length > 11) val = val.slice(0, 11);
    if (val.length > 6) {
      val = `(${val.slice(0, 2)}) ${val.slice(2, 7)}-${val.slice(7)}`;
    } else if (val.length > 2) {
      val = `(${val.slice(0, 2)}) ${val.slice(2)}`;
    }
    setPhone(val);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const cleanCard = cardNumber.replace(/\D/g, "");
    if (cleanCard.length < 13) {
      return;
    }

    const [month, year] = expiry.split("/");
    if (!month || !year || Number(month) < 1 || Number(month) > 12) {
      return;
    }

    const cleanCpf = cpfCnpj.replace(/\D/g, "");
    if (cleanCpf.length < 11) {
      return;
    }

    handlePayment?.(
      {
        holderName: holderName.trim().toUpperCase(),
        number: cleanCard,
        expiryMonth: month.trim(),
        expiryYear: year.trim().length === 2 ? `20${year.trim()}` : year.trim(),
        ccv: ccv.trim(),
      },
      {
        name: holderName.trim(),
        cpfCnpj: cleanCpf,
        email: initialEmail,
        postalCode: postalCode.replace(/\D/g, "") || undefined,
        addressNumber: addressNumber.trim() || "S/N",
        phone: phone.replace(/\D/g, "") || undefined,
        mobilePhone: phone.replace(/\D/g, "") || undefined,
      }
    );
  };

  const isFormValid =
    cardNumber.replace(/\D/g, "").length >= 13 &&
    holderName.trim().length >= 3 &&
    expiry.includes("/") &&
    expiry.length >= 4 &&
    ccv.trim().length >= 3 &&
    cpfCnpj.replace(/\D/g, "").length >= 11;

  return (
    <form onSubmit={handleSubmit} className="space-y-5 animate-in fade-in-50 duration-300">
      {/* Resumo do Pedido */}
      <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 flex items-center justify-between text-xs">
        <div>
          <p className="text-muted-foreground">Plano Selecionado</p>
          <p className="font-semibold text-foreground text-sm">
            {planName} ({cycleLabel})
          </p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground">Valor Total</p>
          <p className="font-bold text-primary text-base">{formatBRL(totalPrice)}</p>
        </div>
      </div>

      {/* Inputs do Formulário */}
      <div className="space-y-3.5">
        {/* Número do Cartão */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="cc-number" className="text-xs">
              Número do Cartão
            </Label>
            {brand && (
              <Badge variant="outline" className="text-[10px] h-4 py-0 px-1.5 font-medium">
                {brand}
              </Badge>
            )}
          </div>
          <div className="relative">
            <Input
              id="cc-number"
              placeholder="0000 0000 0000 0000"
              value={cardNumber}
              onChange={handleCardNumberChange}
              maxLength={19}
              className="font-mono text-sm pl-9"
              autoComplete="cc-number"
            />
            <CreditCardIcon className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        {/* Nome do Titular */}
        <div className="space-y-1.5">
          <Label htmlFor="cc-holder" className="text-xs">
            Nome Impresso no Cartão
          </Label>
          <div className="relative">
            <Input
              id="cc-holder"
              placeholder="NOME COMPLETO"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value.toUpperCase())}
              className="text-sm pl-9 uppercase"
              autoComplete="cc-name"
            />
            <User className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        {/* Validade e CVV */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cc-expiry" className="text-xs">
              Validade (MM/AA)
            </Label>
            <div className="relative">
              <Input
                id="cc-expiry"
                placeholder="MM/AA"
                value={expiry}
                onChange={handleExpiryChange}
                maxLength={5}
                className="font-mono text-sm pl-9 text-center"
                autoComplete="cc-exp"
              />
              <Calendar className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cc-cvv" className="text-xs">
              Código de Segurança (CVV)
            </Label>
            <div className="relative">
              <Input
                id="cc-cvv"
                placeholder="123"
                value={ccv}
                onChange={(e) => setCcv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                maxLength={4}
                className="font-mono text-sm pl-9 text-center"
                autoComplete="cc-csc"
              />
              <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
        </div>

        {/* CPF/CNPJ do Titular */}
        <div className="space-y-1.5">
          <Label htmlFor="cc-cpf" className="text-xs">
            CPF ou CNPJ do Titular
          </Label>
          <Input
            id="cc-cpf"
            placeholder="000.000.000-00"
            value={cpfCnpj}
            onChange={handleCpfChange}
            className="text-sm font-mono"
          />
        </div>

        {/* Botão de Toggle para Campos Opcionais de Endereço/Telefone */}
        <button
          type="button"
          onClick={() => setShowAddressFields(!showAddressFields)}
          className="text-[11px] text-primary hover:underline flex items-center gap-1 pt-1"
        >
          <MapPin className="h-3 w-3" />
          {showAddressFields ? "Ocultar endereço de cobrança" : "Informar endereço e telefone (opcional/recomendado)"}
        </button>

        {/* Campos extras opcionais para maior taxa de aprovação anti-fraude */}
        {showAddressFields && (
          <div className="space-y-3 pt-2 border-t border-border/40 animate-in fade-in-50 duration-200">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cc-cep" className="text-xs">
                  CEP
                </Label>
                <Input
                  id="cc-cep"
                  placeholder="00000-000"
                  value={postalCode}
                  onChange={(e) => {
                    let v = e.target.value.replace(/\D/g, "").slice(0, 8);
                    if (v.length > 5) v = `${v.slice(0, 5)}-${v.slice(5)}`;
                    setPostalCode(v);
                  }}
                  className="text-sm font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cc-number-addr" className="text-xs">
                  Número
                </Label>
                <Input
                  id="cc-number-addr"
                  placeholder="123 ou S/N"
                  value={addressNumber}
                  onChange={(e) => setAddressNumber(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cc-phone" className="text-xs">
                Telefone Celular
              </Label>
              <div className="relative">
                <Input
                  id="cc-phone"
                  placeholder="(00) 00000-0000"
                  value={phone}
                  onChange={(e) => {
                    let v = e.target.value.replace(/\D/g, "").slice(0, 11);
                    if (v.length > 6) v = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
                    else if (v.length > 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
                    setPhone(v);
                  }}
                  className="text-sm pl-9 font-mono"
                />
                <Phone className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Selo de Segurança */}
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground py-1">
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
        <span>Pagamento 100% seguro via gateway credenciado Asaas</span>
      </div>

      {/* Ações */}
      <div className="space-y-2 pt-1">
        <Button
          type="submit"
          size="lg"
          disabled={!isFormValid || processing}
          className="w-full h-12 font-semibold text-sm rounded-xl gap-2 shadow-md bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {processing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processando com a operadora...
            </>
          ) : (
            <>
              <Lock className="h-4 w-4" />
              Pagar {formatBRL(totalPrice)}
            </>
          )}
        </Button>

        {onBackToPlans && (
          <Button
            type="button"
            variant="ghost"
            disabled={processing}
            className="w-full text-muted-foreground hover:text-foreground h-10 text-xs"
            onClick={onBackToPlans}
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
            Voltar aos Planos
          </Button>
        )}
      </div>
    </form>
  );
}
