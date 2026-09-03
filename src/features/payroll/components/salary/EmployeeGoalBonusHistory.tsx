import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Ban } from "lucide-react";
import { useGoalBonusAwards } from "@/features/piggyBanks/hooks/useGoalBonusAwards";
import { toast } from "sonner";
import { confirmWithScroll } from "@/lib/confirmWithScroll";

const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props { employeeId: string }

export function EmployeeGoalBonusHistory({ employeeId }: Props) {
  const { awards, cancel } = useGoalBonusAwards();
  const rows = awards.filter((a) => a.employeeId === employeeId);

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-center text-sm text-muted-foreground">
          Nenhum bônus por metas gerado para este funcionário.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((a) => (
        <Card key={a.id}>
          <CardContent className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Trophy className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {format(parseISO(a.referenceMonth + "-01"), "MMMM 'de' yyyy", { locale: ptBR })}
                </p>
                <p className="text-xs text-muted-foreground">
                  Pontos: {a.scoreObtained.toFixed(0)} / mín. {a.minScoreRequired.toFixed(0)}
                  {" · "}Folha: {format(parseISO(a.payrollMonth + "-01"), "MMM/yyyy", { locale: ptBR })}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-2">
              <span className="font-semibold">{BRL(a.bonusAmount)}</span>
              <StatusBadge status={a.status} />
              {a.status === "gerado" && (
                <Button size="sm" variant="ghost" onClick={async () => {
                  if (!confirmWithScroll("Cancelar este bônus? Ele não será mais lançado no holerite.")) return;
                  await cancel(a.id);
                  toast.success("Bônus cancelado");
                }}>
                  <Ban className="h-3 w-3 text-destructive" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: "gerado" | "pago" | "cancelado" }) {
  const map = {
    gerado: { label: "Gerado", cls: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
    pago: { label: "Pago", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
    cancelado: { label: "Cancelado", cls: "bg-rose-500/15 text-rose-600 border-rose-500/30" },
  } as const;
  const it = map[status];
  return <Badge variant="outline" className={`text-[10px] ${it.cls}`}>{it.label}</Badge>;
}
