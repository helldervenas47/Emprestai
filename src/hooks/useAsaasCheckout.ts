import { useMutation } from "@tanstack/react-query";
import { supabase, USER_SUPABASE_URL, USER_SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/userClient";
import { toast } from "@/hooks/use-toast";

export interface AsaasCheckoutData {
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

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      apikey: USER_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(params),
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(
      json?.error || json?.message || "Erro ao gerar cobrança PIX."
    );
  }

  return json as AsaasCheckoutData;
}

export function useAsaasCheckout() {
  return useMutation<AsaasCheckoutData, Error, AsaasCheckoutParams>({
    mutationFn: createAsaasCheckout,
    onSuccess: () => {
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
}
