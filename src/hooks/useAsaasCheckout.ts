import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMutation } from "@tanstack/react-query";
import { supabase, USER_SUPABASE_URL, USER_SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/userClient";
import { toast } from "@/hooks/use-toast";

export interface AsaasCheckoutData {
  orderId: string;
  paymentId: string;
  invoiceUrl: string | null;
  status: string | null;
  dueDate: string | null;
  value: number;
  pix: {
    payload?: string;
    encodedImage?: string;
    expirationDate?: string;
  } | null;
}

export type AsaasCycle = "monthly" | "semestral" | "annual";

export interface AsaasCheckoutParams {
  /** ID do plano em `plans`. O preço é resolvido no servidor. */
  planId: string;
  cycle: AsaasCycle;
  cpfCnpj?: string;
}


async function createAsaasCheckout(
  params: AsaasCheckoutParams
): Promise<AsaasCheckoutData> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) {
    throw new Error("Sessão não encontrada. Faça login novamente.");
  }

  const key = `billing-request:${sessionData.session.user.id}:${params.planId}:${params.cycle}`;
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

    if (serverMessage?.includes("checkout_not_created") || serverMessage?.includes("cpf_required")) {
      sessionStorage.removeItem(key);
    }

    if (serverMessage && !serverMessage.includes("checkout_not_created") && !serverMessage.includes("non-2xx status code")) {
      throw new Error(serverMessage);
    }

    throw new Error("Não foi possível gerar a cobrança PIX. Verifique seus dados ou contate o suporte.");
  }

  if (data?.error) {
    if (data.error === "checkout_not_created" || data.error === "cpf_required") {
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
      toast({
        title: "Cobrança gerada",
        description: "Escaneie o QR Code ou copie o código PIX.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao gerar pagamento",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  return { ...mutation, data: savedOwner === storageKey ? saved : undefined, reset: () => {
    mutation.reset(); setSaved(undefined); sessionStorage.removeItem(storageKey);
  } };
}
