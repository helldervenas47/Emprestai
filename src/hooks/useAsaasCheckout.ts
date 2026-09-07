import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMutation } from "@tanstack/react-query";
import { supabase, USER_SUPABASE_URL, USER_SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/userClient";
import { toast } from "@/hooks/use-toast";

export interface AsaasCreditCardData {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
}

export interface AsaasCreditCardHolderInfo {
  name?: string;
  email?: string;
  cpfCnpj?: string;
  postalCode?: string;
  addressNumber?: string;
  addressComplement?: string;
  phone?: string;
  mobilePhone?: string;
}

export interface AsaasCheckoutData {
  orderId: string;
  paymentId: string;
  invoiceUrl: string | null;
  status: string | null;
  dueDate: string | null;
  value: number;
  billingType?: "PIX" | "CREDIT_CARD" | string;
  pix: {
    payload?: string;
    encodedImage?: string;
    expirationDate?: string;
  } | null;
  creditCard?: {
    creditCardNumber?: string;
    creditCardBrand?: string;
  } | null;
}

export type AsaasCycle = "monthly" | "semestral" | "annual";

export interface AsaasCheckoutParams {
  /** ID do plano em `plans`. O preço é resolvido no servidor. */
  planId: string;
  cycle: AsaasCycle;
  cpfCnpj?: string;
  paymentMethod?: "PIX" | "CREDIT_CARD";
  creditCard?: AsaasCreditCardData;
  creditCardHolderInfo?: AsaasCreditCardHolderInfo;
}


async function createAsaasCheckout(
  params: AsaasCheckoutParams
): Promise<AsaasCheckoutData> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) {
    throw new Error("Sessão não encontrada. Faça login novamente.");
  }

  const isCard = params.paymentMethod === "CREDIT_CARD" || Boolean(params.creditCard);
  const key = `billing-request:${sessionData.session.user.id}:${params.planId}:${params.cycle}:${isCard ? "card" : "pix"}`;
  const requestKey = sessionStorage.getItem(key) ?? crypto.randomUUID();
  sessionStorage.setItem(key, requestKey);

  const { data, error } = await supabase.functions.invoke("asaas-checkout", {
    body: { ...params, requestKey },
  });

  if (error) {
    let serverMessage: string | undefined;
    if ((error as any).context instanceof Response) {
      try {
        const body = await (error as any).context.clone().json();
        serverMessage = body?.message || body?.error;
      } catch { /* noop */ }
    }
    serverMessage = serverMessage || error.message;

    if (serverMessage?.includes("checkout_not_created") || serverMessage?.includes("cpf_required") || serverMessage?.includes("invalid_card_data")) {
      sessionStorage.removeItem(key);
    }

    if (serverMessage && !serverMessage.includes("checkout_not_created") && !serverMessage.includes("non-2xx status code")) {
      throw new Error(serverMessage);
    }

    throw new Error(
      isCard
        ? "Não foi possível processar o pagamento com cartão. Verifique os dados digitados ou contate o suporte."
        : "Não foi possível gerar a cobrança PIX. Verifique seus dados ou contate o suporte."
    );
  }

  if (data?.error) {
    if (data.error === "checkout_not_created" || data.error === "cpf_required" || data.error === "invalid_card_data") {
      sessionStorage.removeItem(key);
    }
    throw new Error(data.message || data.error);
  }

  if (data?.paymentId) sessionStorage.removeItem(key);
  return data as AsaasCheckoutData;
}

export function useAsaasCheckout() {
  const { user } = useAuth();
  const storageKey = `billing-checkout:${user?.id ?? "anonymous"}`;
  const [saved, setSaved] = useState<AsaasCheckoutData | undefined>();
  const [savedOwner, setSavedOwner] = useState(storageKey);
  useEffect(() => {
    setSavedOwner(storageKey);
    try { setSaved(JSON.parse(sessionStorage.getItem(storageKey) ?? "null") ?? undefined); }
    catch { setSaved(undefined); }
  }, [storageKey]);
  const mutation = useMutation<AsaasCheckoutData, Error, AsaasCheckoutParams>({
    mutationFn: createAsaasCheckout,
    onSuccess: (data) => {
      setSavedOwner(storageKey);
      setSaved(data);
      sessionStorage.setItem(storageKey, JSON.stringify(data));
      if (data.status === "CONFIRMED" || data.status === "RECEIVED") {
        toast({
          title: "Pagamento Aprovado!",
          description: "Sua assinatura foi ativada com sucesso.",
        });
      } else if (data.billingType === "CREDIT_CARD") {
        toast({
          title: "Processando Pagamento",
          description: "Estamos aguardando a confirmação da operadora do cartão.",
        });
      } else {
        toast({
          title: "Cobrança gerada",
          description: "Escaneie o QR Code ou copie o código PIX.",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Erro no pagamento",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  return { ...mutation, data: savedOwner === storageKey ? saved : undefined, reset: () => {
    mutation.reset(); setSaved(undefined); sessionStorage.removeItem(storageKey);
  } };
}
