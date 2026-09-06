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
}


async function createAsaasCheckout(
  params: AsaasCheckoutParams
): Promise<AsaasCheckoutData> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) {
    throw new Error("Sessão não encontrada. Faça login novamente.");
  }

  const url = `${USER_SUPABASE_URL}/functions/v1/asaas-checkout`;

  const key = `billing-request:${sessionData.session.user.id}:${params.planId}:${params.cycle}`;
  const requestKey = sessionStorage.getItem(key) ?? crypto.randomUUID();
  sessionStorage.setItem(key, requestKey);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      apikey: USER_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ ...params, requestKey }),
  });

  const json = await res.json();

  if (!res.ok) {
    if (json?.error === "checkout_not_created") sessionStorage.removeItem(key);
    throw new Error(
      json?.error === "checkout_in_progress" ? "A cobrança está sendo confirmada. Aguarde e tente novamente; não é necessário gerar outro PIX."
      : json?.error === "only_account_owner_can_purchase" ? "A contratação deve ser feita pelo titular da conta."
      : "Não foi possível gerar o PIX. Tente novamente ou contate o suporte."
    );
  }

  if (json.paymentId) sessionStorage.removeItem(key);
  return json as AsaasCheckoutData;
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
