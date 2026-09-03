import { CreditCard as CreditCardIcon, Pencil, Trash2, Wifi } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { Button } from "@/components/ui/button";
import { CreditCard } from "@/features/creditCards/hooks/useCreditCards";
import { getBank, brandLabel } from "@/features/creditCards/lib/creditCardBanks";
import { useHideValues } from "@/contexts/HideValuesContext";

interface Props {
  card: CreditCard;
  onEdit?: () => void;
  onDelete?: () => void;
  readOnly?: boolean;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CreditCardItem({ card, onEdit, onDelete, readOnly }: Props) {
  const bank = getBank(card.bank);
  const { mask } = useHideValues();

  return (
    <div className="group relative">
      {/* Cartão realista — proporção próxima a um cartão de crédito (1.585:1) */}
      <div
        className={`${bank.gradient} ${bank.textClass} relative aspect-[1.586/1] w-full rounded-2xl p-5 shadow-xl overflow-hidden`}
      >
        {/* Efeitos visuais (brilhos sutis) */}
        <div className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-black/20 blur-2xl" />

        {/* Topo: chip + contactless + logo banco */}
        <div className="flex items-start justify-between relative">
          <div className="flex items-center gap-2">
            <div className="h-9 w-12 rounded-md bg-gradient-to-br from-[hsl(45,90%,75%)] to-[hsl(40,80%,50%)] shadow-inner border border-[hsl(45,90%,80%)]/40" />
            <Wifi className="h-4 w-4 rotate-90 opacity-80" />
          </div>
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1.5">
              <CreditCardIcon className="h-4 w-4 opacity-90" />
              <span className="font-bold text-sm tracking-wide">{bank.name}</span>
            </div>
            {card.nickname && (
              <span className="text-[10px] opacity-80 mt-0.5 truncate max-w-[140px]">
                {card.nickname}
              </span>
            )}
          </div>
        </div>

        {/* Número mascarado */}
        <div className="absolute left-5 right-5 top-1/2 -translate-y-1/2">
          <div className="font-mono text-base sm:text-lg tracking-[0.2em] opacity-95">
            •••• •••• •••• {card.lastFour || "0000"}
          </div>
        </div>

        {/* Rodapé: limite + datas + bandeira */}
        <div className="absolute left-5 right-5 bottom-4 flex items-end justify-between">
          <div className="text-[10px] leading-tight opacity-90 space-y-0.5">
            <div>
              <span className="opacity-70">Limite</span>{" "}
              <span className="font-semibold">{mask(fmt(card.creditLimit))}</span>
            </div>
            <div className="flex gap-3">
              <span>
                <span className="opacity-70">Fecha</span>{" "}
                <span className="font-semibold">dia {card.closingDay}</span>
              </span>
              <span>
                <span className="opacity-70">Vence</span>{" "}
                <span className="font-semibold">dia {card.dueDay}</span>
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold italic tracking-wider opacity-95">
              {brandLabel(card.brand)}
            </span>
          </div>
        </div>
      </div>

      {/* Ações */}
      {!readOnly && (
        <div className="mt-2 flex justify-end">
          <RowActions
            actions={[
              { label: "Editar", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => onEdit?.() },
              { label: "Excluir", icon: <Trash2 className="h-3.5 w-3.5" />, destructive: true, onClick: () => onDelete?.() },
            ]}
          />
        </div>
      )}

    </div>
  );
}
