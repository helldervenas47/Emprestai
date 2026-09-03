import * as React from "react";
import { NativeDatePicker } from "@/components/ui/native-date-picker";

interface DatePickerFieldProps {
  /** Value as YYYY-MM-DD string */
  value: string;
  /** Callback with YYYY-MM-DD string */
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Kept for backwards compatibility (native picker ignores popover). */
  popoverContentClassName?: string;
  id?: string;
  disabled?: boolean;
}

export function DatePickerField({
  value,
  onChange,
  placeholder = "Selecione a data",
  className,
  id,
  disabled,
}: DatePickerFieldProps) {
  return (
    <NativeDatePicker
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      id={id}
      disabled={disabled}
    />
  );
}
