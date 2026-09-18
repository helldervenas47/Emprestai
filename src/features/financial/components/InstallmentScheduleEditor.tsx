import React, { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { MoneyInput } from "@/components/ui/money-input";
import { IndividualInstallmentEdit, calculateTotalFromInstallments } from "@/features/financial/lib/installmentEdit";
import { ChevronDown, ChevronUp, Layers, RotateCcw, Sparkles } from "lucide-react";

interface Props {
  // Novas propriedades padronizadas
  totalInstallments?: number;
  totalAmount?: number;
  baseAmount?: number;
  startDate?: string;
  isCustomized?: boolean;

  // Legado / compatibilidade
  count?: number;
  baseDueDate?: string;
  baseUnitAmount?: number;
  isCustom?: boolean;
  onCustomToggle?: (custom: boolean) => void;

  customInstallments: IndividualInstallmentEdit[];
  onChange: (installments: IndividualInstallmentEdit[], isCustomized?: boolean) => void;
}

export function InstallmentScheduleEditor({
  totalInstallments,
  totalAmount,
  baseAmount,
  startDate,
  isCustomized,
  count: legacyCount,
  baseDueDate: legacyDueDate,
  baseUnitAmount: legacyUnitAmount,
  isCustom: legacyIsCustom,
  onCustomToggle,
  customInstallments,
  onChange,
}: Props) {
  const count = Math.max(1, totalInstallments ?? legacyCount ?? 1);
  const total = totalAmount ?? baseAmount ?? (legacyUnitAmount ? legacyUnitAmount * count : 0);
  const unitAmount = count > 0 ? total / count : total;
  const dueDateStart = startDate || legacyDueDate || new Date().toISOString().slice(0, 10);
  const isCustomActive = isCustomized ?? legacyIsCustom ?? false;

  // Gera o cronograma inicial baseado no número de parcelas, data e valor unitário
  useEffect(() => {
    if (count <= 1) return;

    // Se já existem parcelas e o tamanho bate, mantemos se estiver customizado
    if (customInstallments.length === count && isCustomActive) return;

    const [year, month, day] = dueDateStart.split("-").map(Number);

    const generated: IndividualInstallmentEdit[] = [];
    for (let i = 0; i < count; i++) {
      const existing = customInstallments[i];
      const d = new Date(year, (month || 1) - 1 + i, day || 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const dueDateStr = `${yyyy}-${mm}-${dd}`;

      generated.push({
        index: i,
        dueDate: existing?.dueDate || dueDateStr,
        amount: existing?.amount !== undefined && existing.amount > 0 && isCustomActive ? existing.amount : (unitAmount || 0),
        paid: false,
        description: `Parcela ${i + 1}/${count}`,
      });
    }

    onChange(generated, isCustomActive);
  }, [count, dueDateStart, total, isCustomActive]);

  const totalCalculated = useMemo(() => {
    if (isCustomActive && customInstallments.length > 0) {
      return calculateTotalFromInstallments(customInstallments);
    }
    return total;
  }, [isCustomActive, customInstallments, total]);

  const handleToggle = () => {
    const nextCustom = !isCustomActive;
    if (onCustomToggle) {
      onCustomToggle(nextCustom);
    }
    
    // Se ativando e ainda não temos parcelas geradas no tamanho correto
    if (nextCustom && customInstallments.length !== count) {
      const [year, month, day] = dueDateStart.split("-").map(Number);
      const generated: IndividualInstallmentEdit[] = [];
      for (let i = 0; i < count; i++) {
        const d = new Date(year, (month || 1) - 1 + i, day || 1);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        generated.push({
          index: i,
          dueDate: `${yyyy}-${mm}-${dd}`,
          amount: unitAmount || 0,
          paid: false,
          description: `Parcela ${i + 1}/${count}`,
        });
      }
      onChange(generated, nextCustom);
    } else {
      onChange(customInstallments, nextCustom);
    }
  };

  const handleUpdateItem = (index: number, patch: Partial<IndividualInstallmentEdit>) => {
    const updated = [...customInstallments];
    if (!updated[index]) return;

    // Se o valor da parcela foi alterado, recalculamos as demais para fechar o valor total
    if (typeof patch.amount === "number") {
      const newAmount = Math.max(0, patch.amount);
      updated[index] = { ...updated[index], ...patch, amount: newAmount };

      // Se temos mais de 1 parcela e um total positivo definido
      if (updated.length > 1 && total > 0) {
        const remainingIndices: number[] = [];
        let fixedSum = 0;

        if (index < updated.length - 1) {
          // As parcelas de 0 até index mantêm seus valores
          for (let i = 0; i <= index; i++) {
            fixedSum += updated[i].amount;
          }
          for (let i = index + 1; i < updated.length; i++) {
            remainingIndices.push(i);
          }
        } else {
          // Editou a última parcela: a última fica fixa, ajustamos as anteriores (0 até index - 1)
          fixedSum = newAmount;
          for (let i = 0; i < index; i++) {
            remainingIndices.push(i);
          }
        }

        const remainingTotal = Math.max(0, total - fixedSum);
        const numRemaining = remainingIndices.length;

        if (numRemaining > 0) {
          let accumulated = 0;
          for (let j = 0; j < numRemaining; j++) {
            const targetIdx = remainingIndices[j];
            if (j === numRemaining - 1) {
              // A última parcela do grupo absorve a diferença de centavos para fechar exato
              const lastAmount = Math.max(0, Math.round((remainingTotal - accumulated) * 100) / 100);
              updated[targetIdx] = { ...updated[targetIdx], amount: lastAmount };
            } else {
              const rawVal = Math.round((remainingTotal / numRemaining) * 100) / 100;
              updated[targetIdx] = { ...updated[targetIdx], amount: rawVal };
              accumulated += rawVal;
            }
          }
        }
      }
    } else {
      updated[index] = { ...updated[index], ...patch };
    }

    onChange(updated, true);
  };

  const handleDistributeEqually = () => {
    if (customInstallments.length === 0) return;
    const countInst = customInstallments.length;
    let accumulated = 0;
    const updated = customInstallments.map((item, idx) => {
      if (idx === countInst - 1) {
        const lastAmt = Math.max(0, Math.round((total - accumulated) * 100) / 100);
        return { ...item, amount: lastAmt };
      }
      const raw = Math.round((total / countInst) * 100) / 100;
      accumulated += raw;
      return { ...item, amount: raw };
    });
    onChange(updated, true);
  };

  if (count <= 1) return null;

  return (
    <div className="rounded-xl border border-border/80 bg-muted/20 p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-foreground cursor-pointer" onClick={handleToggle}>
              Valores das Parcelas
            </Label>
            <p className="text-[11px] text-muted-foreground">
              {isCustomActive
                ? "Valores e vencimentos personalizados para cada parcela"
                : `${count}x de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(unitAmount || 0)} (Total: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(total || 0)})`}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant={isCustomActive ? "secondary" : "outline"}
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={handleToggle}
        >
          {isCustomActive ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              Ocultar
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Personalizar
            </>
          )}
        </Button>
      </div>

      {isCustomActive && (
        <div className="space-y-3 pt-2 border-t border-border/50 animate-in fade-in-50 duration-200">
          <div className="flex items-center justify-between text-xs text-muted-foreground pb-1">
            <span>Editar vencimento e valor individual:</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-primary hover:text-primary/80 gap-1"
              onClick={handleDistributeEqually}
            >
              <RotateCcw className="h-3 w-3" />
              Igualar parcelas
            </Button>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-2 pr-1 overscroll-contain">
            {customInstallments.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2.5 p-2 rounded-lg border border-border/60 bg-card/80 text-xs"
              >
                <span className="w-16 font-medium text-muted-foreground shrink-0">
                  {idx + 1}ª ({idx + 1}/{count})
                </span>

                <div className="w-36 shrink-0">
                  <DatePickerField
                    value={item.dueDate}
                    onChange={(d) => handleUpdateItem(idx, { dueDate: d })}
                  />
                </div>

                <div className="flex-1 min-w-[100px]">
                  <MoneyInput
                    value={String(item.amount || "")}
                    onChange={(v) => handleUpdateItem(idx, { amount: parseFloat(v) || 0 })}
                    placeholder="R$ 0,00"
                    className="h-8 text-xs font-semibold"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-lg bg-primary/5 border border-primary/20 text-xs font-medium">
            <span>Soma Total das Parcelas:</span>
            <span className="text-sm font-bold text-primary">
              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalCalculated)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
