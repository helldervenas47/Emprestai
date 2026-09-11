import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";

export function usePaymentPromises() {
  const { dataOwnerId } = useAuth();
  const [promises, setPromises] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchPromises = async () => {
    if (!dataOwnerId) {
      setPromises(new Map());
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("whatsapp_payment_promises")
        .select("loan_id, installment_number, promised_date")
        .eq("user_id", dataOwnerId);

      if (!error && data) {
        const nextMap = new Map<string, string>();
        for (const row of data) {
          if (row.loan_id && row.promised_date) {
            nextMap.set(row.loan_id, row.promised_date);
          }
        }
        setPromises(nextMap);
      }
    } catch (e) {
      console.warn("Erro ao buscar datas previstas de pagamento:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromises();

    if (!dataOwnerId) return;

    const channel = supabase
      .channel(`payment-promises:${dataOwnerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_payment_promises",
          filter: `user_id=eq.${dataOwnerId}`,
        },
        () => {
          fetchPromises();
        }
      )
      .subscribe();

    const handleCustomChange = () => {
      fetchPromises();
    };
    window.addEventListener("payment-promise-updated", handleCustomChange);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("payment-promise-updated", handleCustomChange);
    };
  }, [dataOwnerId]);

  const promisedLoanIds = useMemo(() => {
    const set = new Set<string>();
    promises.forEach((val, loanId) => {
      if (val && val.trim()) set.add(loanId);
    });
    return set;
  }, [promises]);

  return {
    promises,
    promisedLoanIds,
    loading,
    refetch: fetchPromises,
  };
}
