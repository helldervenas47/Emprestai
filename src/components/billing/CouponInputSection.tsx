import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tag, Check, X, Loader2, Percent, DollarSign, Sparkles } from "lucide-react";
import { CouponValidationResult, useCouponValidation } from "@/hooks/useCouponValidation";

interface CouponInputSectionProps {
  planId: string;
  cycle: "monthly" | "semestral" | "annual";
  userId?: string;
  appliedCoupon: CouponValidationResult | null;
  onCouponApplied: (coupon: CouponValidationResult | null) => void;
  className?: string;
}

export function CouponInputSection({
  planId,
  cycle,
  userId,
  appliedCoupon,
  onCouponApplied,
  className = "",
}: CouponInputSectionProps) {
  const [isExpanded, setIsExpanded] = useState(Boolean(appliedCoupon));
  const [inputCode, setInputCode] = useState(appliedCoupon?.code || "");
  const { validate, isValidating, removeCoupon } = useCouponValidation();

  // Revalida automaticamente se o plano ou ciclo mudar e houver cupom aplicado
  useEffect(() => {
    if (appliedCoupon?.code) {
      void (async () => {
        const result = await validate(appliedCoupon.code!, planId, cycle, userId, true);
        if (result.valid) {
          onCouponApplied(result);
        } else {
          onCouponApplied(null);
        }
      })();
    }
  }, [planId, cycle, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = async () => {
    const clean = inputCode.trim().toUpperCase().replace(/\s+/g, "");
    if (!clean) return;

    const result = await validate(clean, planId, cycle, userId, false);
    if (result.valid) {
      onCouponApplied(result);
    } else {
      onCouponApplied(null);
    }
  };

  const handleRemove = () => {
    removeCoupon();
    onCouponApplied(null);
    setInputCode("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleApply();
    }
  };

  if (!isExpanded && !appliedCoupon) {
    return (
      <div className={`pt-1 ${className}`}>
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors py-1"
        >
          <Tag className="h-3.5 w-3.5" />
          <span>Tem um cupom de desconto?</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-2 pt-1 ${className}`}>
      {appliedCoupon?.valid ? (
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-6 w-6 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
              <Check className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono tracking-wider">
                  {appliedCoupon.code}
                </span>
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20 py-0 px-1.5">
                  {appliedCoupon.discount_type === "percentage"
                    ? `${appliedCoupon.discount_value}% OFF`
                    : `R$ ${Number(appliedCoupon.discount_value).toFixed(2)} OFF`}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                Desconto de {(Number(appliedCoupon.discount_cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} aplicado
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Remover
          </Button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="coupon-input" className="font-medium text-muted-foreground flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-primary" />
              <span>Cupom de desconto:</span>
            </label>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
          </div>

          <div className="flex gap-2">
            <Input
              id="coupon-input"
              placeholder="Digite seu cupom"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase().replace(/\s+/g, ""))}
              onKeyDown={handleKeyDown}
              className="font-mono uppercase font-bold text-xs h-9 bg-background/80"
              disabled={isValidating}
            />
            <Button
              type="button"
              size="sm"
              onClick={handleApply}
              disabled={isValidating || !inputCode.trim()}
              className="h-9 font-semibold text-xs shrink-0 px-4"
            >
              {isValidating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Validando...
                </>
              ) : (
                "Aplicar"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
