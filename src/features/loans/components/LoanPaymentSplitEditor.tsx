import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaymentMethodPicker } from "@/components/PaymentMethodPicker";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { Plus, X } from "lucide-react";

export interface SplitState {
  method1Id: string | null;
  method2Id: string | null;
  amount1: string;
  amount2: string;
  enabled: boolean;
}

interface Props {
  /** Valor total do empréstimo (deve casar com soma dos dois) */
  total: number;
  state: SplitState;
  onChange: (next: SplitState) => void;
  showError?: boolean;
  /** Texto da label da 1ª forma. */
  primaryLabel?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function LoanPaymentSplitEditor({ total, state, onChange, showError, primaryLabel = "Forma de Pagamento (saída do empréstimo)" }: Props) {
  const { activeMethods } = usePaymentMethods();
  const methodNameById = useMemo(() => {
    const m = new Map<string, string>();
    activeMethods.forEach((x) => m.set(x.id, x.name));
    return m;
  }, [activeMethods]);

  const [touched, setTouched] = useState<"a1" | "a2" | null>(null);

  // Auto-balance the other field when one is edited
  useEffect(() => {
    if (!state.enabled || !total || total <= 0) return;
    if (touched === "a1") {
      const a1 = Math.max(0, parseFloat(state.amount1) || 0);
      const a2 = round2(Math.max(0, total - a1));
      if ((parseFloat(state.amount2) || 0) !== a2) onChange({ ...state, amount2: a2.toFixed(2) });
    } else if (touched === "a2") {
      const a2 = Math.max(0, parseFloat(state.amount2) || 0);
      const a1 = round2(Math.max(0, total - a2));
      if ((parseFloat(state.amount1) || 0) !== a1) onChange({ ...state, amount1: a1.toFixed(2) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.amount1, state.amount2, touched, total, state.enabled]);

  // When enabling for the first time, prefill 50/50
  const enableSecond = () => {
    const half = round2(total / 2);
    onChange({
      ...state,
      enabled: true,
      amount1: state.amount1 || half.toFixed(2),
      amount2: state.amount2 || round2(total - half).toFixed(2),
    });
    setTouched(null);
  };

  const disableSecond = () => {
    onChange({ ...state, enabled: false, method2Id: null, amount1: "", amount2: "" });
    setTouched(null);
  };

  const sum = round2((parseFloat(state.amount1) || 0) + (parseFloat(state.amount2) || 0));
  const sumOk = state.enabled ? Math.abs(sum - total) < 0.01 : true;
  const sameMethod = state.enabled && !!state.method1Id && state.method1Id === state.method2Id;
  const negative = state.enabled && ((parseFloat(state.amount1) || 0) <= 0 || (parseFloat(state.amount2) || 0) <= 0);

  return (
    <div className="space-y-3">
      <PaymentMethodPicker
        value={state.method1Id}
        onChange={(id) => onChange({ ...state, method1Id: id })}
        required
        showError={showError}
        label={primaryLabel}
      />

      {!state.enabled ? (
        <Button type="button" variant="outline" size="sm" onClick={enableSecond} disabled={!total || total <= 0} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-1.5" />
          Adicionar 2ª forma de pagamento
        </Button>
      ) : (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-foreground">2ª Forma de Pagamento</p>
            <Button type="button" variant="ghost" size="sm" onClick={disableSecond} className="h-7 text-xs text-muted-foreground hover:text-destructive">
              <X className="h-3.5 w-3.5 mr-1" /> Remover
            </Button>
          </div>

          <PaymentMethodPicker
            value={state.method2Id}
            onChange={(id) => onChange({ ...state, method2Id: id })}
            required
            showError={showError && !state.method2Id}
            label="Forma de pagamento 2"
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">
                Valor {state.method1Id ? `(${methodNameById.get(state.method1Id) ?? "Forma 1"})` : "(Forma 1)"}
              </Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={state.amount1}
                onChange={(e) => { setTouched("a1"); onChange({ ...state, amount1: e.target.value }); }}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Valor {state.method2Id ? `(${methodNameById.get(state.method2Id) ?? "Forma 2"})` : "(Forma 2)"}
              </Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={state.amount2}
                onChange={(e) => { setTouched("a2"); onChange({ ...state, amount2: e.target.value }); }}
                className="h-9"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Soma: <span className={sumOk ? "text-foreground font-semibold" : "text-destructive font-semibold"}>R$ {sum.toFixed(2)}</span> / Total: R$ {total.toFixed(2)}</span>
          </div>

          {sameMethod && (
            <p className="text-[11px] text-destructive">As duas formas de pagamento devem ser diferentes.</p>
          )}
          {negative && (
            <p className="text-[11px] text-destructive">Valores devem ser maiores que zero.</p>
          )}
          {!sumOk && !negative && (
            <p className="text-[11px] text-destructive">A soma das formas precisa ser igual ao valor do empréstimo.</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Returns a normalized split if the editor state is valid for submission, or null otherwise. */
export function buildSplitFromState(state: SplitState, total: number) {
  if (!state.enabled) return { ok: true as const, split: null };
  if (!state.method1Id || !state.method2Id) return { ok: false as const, error: "Selecione as duas formas de pagamento." };
  if (state.method1Id === state.method2Id) return { ok: false as const, error: "As duas formas de pagamento devem ser diferentes." };
  const a1 = parseFloat(state.amount1) || 0;
  const a2 = parseFloat(state.amount2) || 0;
  if (a1 <= 0 || a2 <= 0) return { ok: false as const, error: "Valores das formas de pagamento devem ser maiores que zero." };
  if (Math.abs((a1 + a2) - total) > 0.01) return { ok: false as const, error: "A soma das formas precisa ser igual ao valor do empréstimo." };
  return {
    ok: true as const,
    split: { parts: [
      { paymentMethodId: state.method1Id, amount: round2(a1) },
      { paymentMethodId: state.method2Id, amount: round2(a2) },
    ] },
  };
}
