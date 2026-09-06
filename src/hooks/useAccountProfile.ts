// Busca os campos financeiros/administrativos do próprio usuário logado.
// Isolado do useAuth para manter aquele contexto enxuto — este hook será
// consumido pelo Route Guard e por telas de billing.
//
// NOTA: as colunas `financial_status`, `manual_override` e `current_period_end`
// serão criadas na tabela `profiles` junto da integração Asaas. Enquanto a
// migração não roda, o hook faz fallback silencioso para valores neutros
// ("ACTIVE" / override nulo), preservando o comportamento atual do app.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import type {
  AccountProfile,
  FinancialStatus,
  ManualOverride,
} from "@/types/accountProfile";

interface AccountProfileState {
  profile: AccountProfile | null;
  loading: boolean;
  refetch: () => Promise<AccountProfile | null | undefined>;
}

const DEFAULT_PROFILE: AccountProfile = {
  financial_status: "INACTIVE",
  manual_override: null,
  current_period_end: null,
};

/** QueryKey base do perfil financeiro/administrativo. */
export const PROFILE_QUERY_KEY = ["profile"] as const;

export function useAccountProfile(): AccountProfileState {
  const { user, dataOwnerId } = useAuth();
  const ownerId = dataOwnerId ?? user?.id ?? null;

  const {
    data: profile,
    isLoading,
    refetch,
  } = useQuery<AccountProfile | null>({
    queryKey: [...PROFILE_QUERY_KEY, ownerId],
    queryFn: async () => {
      if (!ownerId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("financial_status, manual_override, current_period_end, last_payment_id" as any)
        .eq("user_id", ownerId)
        .maybeSingle();

      if (error || !data) {
        // Colunas ainda não migradas ou perfil ausente: mantemos o app operante.
        return DEFAULT_PROFILE;
      }

      const row = data as {
        financial_status?: string | null;
        manual_override?: string | null;
        current_period_end?: string | null;
        last_payment_id?: string | null;
      };

      return {
        financial_status:
          (row.financial_status as FinancialStatus) ?? "ACTIVE",
        manual_override: (row.manual_override as ManualOverride) ?? null,
        current_period_end: row.current_period_end ?? null,
        last_payment_id: row.last_payment_id ?? null,
      };
    },
    enabled: !!ownerId,
    staleTime: 0,
  });

  return {
    profile: profile ?? null,
    loading: isLoading,
    refetch: async () => {
      const { data } = await refetch();
      return data;
    },
  };
}
