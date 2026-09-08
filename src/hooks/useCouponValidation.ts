import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { toast } from "sonner";

export interface CouponValidationResult {
  valid: boolean;
  coupon_id?: string;
  code?: string;
  discount_type?: "percentage" | "fixed";
  discount_value?: number;
  original_cents?: number;
  discount_cents?: number;
  final_cents?: number;
  message?: string;
  reason?: string;
}

export function useCouponValidation() {
  const [appliedCoupon, setAppliedCoupon] = useState<CouponValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const validate = useCallback(
    async (
      code: string,
      planId: string,
      cycle: "monthly" | "semestral" | "annual",
      userId?: string,
      silent = false
    ): Promise<CouponValidationResult> => {
      const cleanCode = code.trim().toUpperCase().replace(/\s+/g, "");
      if (!cleanCode) {
        if (!silent) toast.error("Informe o código do cupom.");
        return { valid: false, reason: "empty_code", message: "Informe o código do cupom." };
      }

      setIsValidating(true);
      try {
        const { data, error } = await supabase.rpc("validate_coupon", {
          _code: cleanCode,
          _plan_id: planId,
          _cycle: cycle,
          _user_id: userId || null,
        });

        if (error) {
          console.warn("[useCouponValidation] Erro na RPC validate_coupon:", error);
          const fallbackRes: CouponValidationResult = {
            valid: false,
            reason: "error",
            message: "Não foi possível validar o cupom. Tente novamente.",
          };
          if (!silent) toast.error(fallbackRes.message);
          return fallbackRes;
        }

        const res = data as unknown as CouponValidationResult;
        if (res.valid) {
          setAppliedCoupon(res);
          if (!silent) toast.success(res.message || "Cupom aplicado com sucesso!");
        } else {
          setAppliedCoupon(null);
          if (!silent) {
            toast.error(res.message || "Cupom inválido ou não disponível para este plano.");
          }
        }

        return res;
      } catch (err: any) {
        console.warn("[useCouponValidation] Exceção:", err);
        const errRes: CouponValidationResult = {
          valid: false,
          reason: "exception",
          message: err?.message || "Erro ao validar cupom.",
        };
        if (!silent) toast.error(errRes.message);
        return errRes;
      } finally {
        setIsValidating(false);
      }
    },
    []
  );

  const removeCoupon = useCallback(() => {
    setAppliedCoupon(null);
    toast.info("Cupom removido.");
  }, []);

  return {
    appliedCoupon,
    isValidating,
    validate,
    removeCoupon,
    setAppliedCoupon,
  };
}
