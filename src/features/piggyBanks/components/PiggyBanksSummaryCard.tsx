import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, PiggyBank } from "lucide-react";
import { usePiggyBanks } from "@/features/piggyBanks/hooks/usePiggyBanks";
import { useHideValues } from "@/contexts/HideValuesContext";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface Props {
  readOnly?: boolean;
}

export function PiggyBanksSummaryCard({ readOnly = false }: Props) {
  const navigate = useNavigate();
  const { piggyBanks, balances, cdiRate } = usePiggyBanks();
  const { mask } = useHideValues();

  const total = useMemo(() => {
    let sum = 0;
    for (const pb of piggyBanks) {
      const b = balances.get(pb.id);
      if (b) sum += b.balance;
    }
    return sum;
  }, [piggyBanks, balances]);

  return (
    <Card no3d className="animate-fade-in">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => navigate("/cofrinhos")}
          className="w-full text-left p-4 flex items-center justify-between gap-2 hover:bg-muted/40 rounded-3xl transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <PiggyBank className="h-4 w-4 text-primary shrink-0" />
            <h3 className="text-sm font-semibold text-foreground truncate">
              Cofrinhos
            </h3>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              · {piggyBanks.length} {piggyBanks.length === 1 ? "cofrinho" : "cofrinhos"}
            </span>
            {cdiRate && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary tabular-nums">
                CDI {cdiRate.annualRate.toFixed(2)}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase leading-none">Saldo total</p>
              <p className="text-sm font-bold text-foreground tabular-nums">{mask(fmt(total))}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </button>
      </CardContent>
    </Card>
  );
}
