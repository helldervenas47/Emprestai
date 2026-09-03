import * as React from "react";
import { Input } from "@/components/ui/input";

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const parseDisplayToCents = (display: string) => {
  const digits = display.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : 0;
};

interface MoneyInputProps {
  id?: string;
  value: string; // numeric string like "250.00" or ""
  onChange: (numeric: string) => void;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  className?: string;
  disabled?: boolean;
}

/**
 * Currency-masked input for BRL.
 * - Internally tracks formatted display "1.234,56".
 * - Emits a plain numeric string ("1234.56") via onChange to keep parent logic untouched.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, placeholder = "R$ 0,00", ...rest }, ref) => {
    const externalCents = value ? Math.round((parseFloat(value) || 0) * 100) : 0;
    const [display, setDisplay] = React.useState(value ? formatBRL(externalCents) : "");

    // Keep display in sync when the external value changes (e.g. form reset / edit).
    React.useEffect(() => {
      if (!value) {
        setDisplay("");
        return;
      }
      const cents = Math.round((parseFloat(value) || 0) * 100);
      setDisplay((cur) => {
        const curCents = parseDisplayToCents(cur);
        return curCents === cents ? cur : formatBRL(cents);
      });
    }, [value]);

    return (
      <Input
        ref={ref}
        inputMode="decimal"
        type="text"
        value={display}
        placeholder={placeholder}
        onChange={(e) => {
          const cents = parseDisplayToCents(e.target.value);
          setDisplay(cents ? formatBRL(cents) : "");
          onChange(cents ? (cents / 100).toFixed(2) : "");
        }}
        {...rest}
      />
    );
  },
);
MoneyInput.displayName = "MoneyInput";
