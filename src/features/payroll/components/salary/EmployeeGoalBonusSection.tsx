import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { MoneyInput } from "@/components/ui/money-input";
import { Trophy } from "lucide-react";
import type { EmployeeGoalBonus } from "@/features/piggyBanks/hooks/useEmployeeGoalBonuses";

export interface GoalBonusDraft {
  enabled: boolean;
  minScore: number;
  bonusAmount: number;
  startDate: string;
  endDate: string | null;
  notes: string | null;
}

interface Props {
  initial: EmployeeGoalBonus | null;
  value: GoalBonusDraft;
  onChange: (v: GoalBonusDraft) => void;
}

export function EmployeeGoalBonusSection({ initial, value, onChange }: Props) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Trophy className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <Label className="text-sm">Bônus por Metas</Label>
            <p className="text-xs text-muted-foreground">
              Se a Pontuação Geral Mensal das metas atingir o mínimo, o bônus é
              lançado automaticamente no holerite do mês seguinte.
            </p>
          </div>
        </div>
        <Switch
          checked={value.enabled}
          onCheckedChange={(enabled) => {
            const today = new Date().toISOString().slice(0, 10);
            onChange({
              ...value,
              enabled,
              // Ao ativar, garanta uma data de início (evita o save ser silenciosamente pulado).
              startDate: enabled && !value.startDate ? today : value.startDate,
            });
          }}
        />
      </div>

      {value.enabled && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Pontuação mínima (0–100)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={1}
              inputMode="numeric"
              value={String(value.minScore ?? "")}
              onChange={(e) => {
                onChange({ ...value, minScore: Math.max(0, Math.min(100, Number(e.target.value) || 0)) });
              }}
            />
          </div>
          <div>
            <Label>Valor do bônus (R$)</Label>
            <MoneyInput
              value={value.bonusAmount > 0 ? String(value.bonusAmount) : ""}
              onChange={(v) => {
                onChange({ ...value, bonusAmount: Number(v) || 0 });
              }}
              placeholder="0,00"
            />
          </div>
          <div>
            <Label>Início da vigência</Label>
            <DatePickerField
              value={value.startDate || ""}
              onChange={(d) => onChange({ ...value, startDate: d })}
            />
          </div>
          <div>
            <Label>Fim da vigência (opcional)</Label>
            <DatePickerField
              value={value.endDate ?? ""}
              onChange={(d) => onChange({ ...value, endDate: d || null })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Observações</Label>
            <Textarea
              rows={2}
              value={value.notes ?? ""}
              onChange={(e) => onChange({ ...value, notes: e.target.value || null })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
