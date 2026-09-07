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

interface CreditCardPaymentFormProps {
  planName: string;
  cycleLabel: string;
  totalPrice: number;
  isProcessing: boolean;
  onPayWithCard: (
    cardData: AsaasCreditCardData,
    holderInfo: AsaasCreditCardHolderInfo
  ) => void;
  onBackToPlans: () => void;
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
  planName,
  cycleLabel,
  totalPrice,
  isProcessing,
  onPayWithCard,
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

  const formatBRL = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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

    onPayWithCard(
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

      {/* Cartão Visual Preview */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-tr from-slate-900 via-slate-800 to-indigo-950 p-5 text-white shadow-xl border border-slate-700/60">
        <div className="flex justify-between items-start mb-6">
          <div className="w-10 h-8 rounded bg-amber-400/80 border border-amber-200/50 flex items-center justify-center">
            <div className="w-6 h-4 border border-amber-800/40 rounded-xs" />
          </div>
          <div className="text-right">
            {brand ? (
              <Badge className="bg-white/20 text-white hover:bg-white/30 font-semibold px-2.5 py-0.5">
                {brand}
              </Badge>
            ) : (
              <CreditCardIcon className="h-6 w-6 text-slate-400" />
            )}
          </div>
        </div>

        <div className="space-y-4">
          <p className="font-mono text-lg sm:text-xl tracking-wider select-none">
            {cardNumber || "•••• •••• •••• ••••"}
          </p>

          <div className="flex justify-between items-end text-xs">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">Titular</p>
              <p className="font-semibold truncate max-w-[190px] uppercase">
                {holderName || "NOME IMPRESSO NO CARTÃO"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">Validade</p>
              <p className="font-semibold font-mono">{expiry || "MM/AA"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Campos do Cartão */}
      <div className="space-y-3.5">
        <div>
          <Label htmlFor="card-number" className="text-xs font-medium">
            Número do Cartão
          </Label>
          <div className="relative mt-1">
            <Input
              id="card-number"
              placeholder="0000 0000 0000 0000"
              value={cardNumber}
              onChange={handleCardNumberChange}
              maxLength={19}
              className="h-11 pl-10 font-mono text-sm bg-muted/20"
              required
            />
            <CreditCardIcon className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
          </div>
        </div>

        <div>
          <Label htmlFor="holder-name" className="text-xs font-medium">
            Nome Impresso no Cartão
          </Label>
          <div className="relative mt-1">
            <Input
              id="holder-name"
              placeholder="Ex: CARLOS M SILVA"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value.toUpperCase())}
              className="h-11 pl-10 uppercase text-sm bg-muted/20"
              required
            />
            <User className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="card-expiry" className="text-xs font-medium">
              Validade (MM/AA)
            </Label>
            <div className="relative mt-1">
              <Input
                id="card-expiry"
                placeholder="MM/AA"
                value={expiry}
                onChange={handleExpiryChange}
                maxLength={5}
                className="h-11 pl-10 font-mono text-sm bg-muted/20"
                required
              />
              <Calendar className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
            </div>
          </div>

          <div>
            <Label htmlFor="card-ccv" className="text-xs font-medium">
              CVV / CVC
            </Label>
            <div className="relative mt-1">
              <Input
                id="card-ccv"
                placeholder="123"
                type="password"
                value={ccv}
                onChange={(e) => setCcv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                maxLength={4}
                className="h-11 pl-10 font-mono text-sm bg-muted/20"
                required
              />
              <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="card-cpf" className="text-xs font-medium">
            CPF ou CNPJ do Titular
          </Label>
          <Input
            id="card-cpf"
            placeholder="000.000.000-00"
            value={cpfCnpj}
            onChange={handleCpfChange}
            maxLength={18}
            className="h-11 mt-1 font-mono text-sm bg-muted/20"
            required
          />
        </div>

        {/* Toggle para Dados Complementares de Faturamento */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowAddressFields(!showAddressFields)}
            className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
          >
            <MapPin className="h-3.5 w-3.5" />
            {showAddressFields ? "Ocultar dados de endereço" : "Adicionar CEP e telefone (recomendado para aprovação rápida)"}
          </button>
        </div>

        {showAddressFields && (
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border/40 space-y-3 animate-in fade-in-50 duration-200">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="card-cep" className="text-xs font-medium">
                  CEP
                </Label>
                <Input
                  id="card-cep"
                  placeholder="00000-000"
                  value={postalCode}
                  onChange={handlePostalCodeChange}
                  maxLength={9}
                  className="h-10 mt-1 text-xs bg-background"
                />
              </div>
              <div>
                <Label htmlFor="card-num" className="text-xs font-medium">
                  Número / Compl.
                </Label>
                <Input
                  id="card-num"
                  placeholder="Ex: 120 Apto 4"
                  value={addressNumber}
                  onChange={(e) => setAddressNumber(e.target.value)}
                  className="h-10 mt-1 text-xs bg-background"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="card-phone" className="text-xs font-medium">
                Telefone com DDD
              </Label>
              <div className="relative mt-1">
                <Input
                  id="card-phone"
                  placeholder="(00) 00000-0000"
                  value={phone}
                  onChange={handlePhoneChange}
                  maxLength={15}
                  className="h-10 pl-9 text-xs bg-background"
                />
                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
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
          disabled={!isFormValid || isProcessing}
          className="w-full h-12 font-semibold text-sm rounded-xl gap-2 shadow-md bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {isProcessing ? (
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

        <Button
          type="button"
          variant="ghost"
          disabled={isProcessing}
          className="w-full text-muted-foreground hover:text-foreground h-10 text-xs"
          onClick={onBackToPlans}
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          Voltar aos Planos
        </Button>
      </div>
    </form>
  );
}
