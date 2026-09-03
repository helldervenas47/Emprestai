import { useEffect } from "react";
import { getBalances } from "@/features/financial/lib/balance";
import { supabase } from "@/integrations/supabase/userClient";
import type { Loan, Payment, InstallmentSchedule } from "@/types/loan";
import { getLoanReceivable } from "@/features/loans/lib/loanLateFees";

/**
 * Publica no localStorage o patrimônio "ao vivo" do mês corrente e mantém o
 * snapshot do mês anterior travado, de forma global — independente de o card
 * "Extrato / Saldo Consolidado" ter sido montado.
 *
 * Também sincroniza com a tabela `patrimonio_snapshots` no backend para que
 * os valores sejam compartilhados entre dispositivos do mesmo usuário/owner.
 */
const SNAP_KEY = "patrimonio.snapshots.v1";
const HISTORICAL_PATRIMONIO_SEEDS: Record<string, { account: number; rua: number; total: number }> = {
  "2026-05": { account: 0, rua: 0, total: 79235.36 },
  "2026-06": { account: 8848.70, rua: 78656.00, total: 87413.76 },
};

const notifyPatrimonioChanged = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("patrimonio:snapshots-changed"));
};

async function getOwnerId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;
  const { data } = await supabase
    .from("user_owner" as any)
    .select("owner_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return (data as any)?.owner_id || user.id;
}

const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export function usePatrimonioPublisher(loans: Loan[], payments: Payment[], installmentSchedules: InstallmentSchedule[]) {
  useEffect(() => {
    let alive = true;

    const loadFromBackend = async (ownerId: string) => {
      const { data, error } = await (supabase as any)
        .from("patrimonio_snapshots")
        .select("month, account, rua, total")
        .eq("owner_id", ownerId);
      if (error || !data || !alive) return;
      try {
        const raw = localStorage.getItem(SNAP_KEY);
        const snaps: Record<string, any> = raw ? JSON.parse(raw) : {};
        (data as any[]).forEach((row) => {
          snaps[row.month] = {
            account: Number(row.account) || 0,
            rua: Number(row.rua) || 0,
            total: Number(row.total) || 0,
          };
        });
        Object.entries(HISTORICAL_PATRIMONIO_SEEDS).forEach(([month, seed]) => {
          const existingTotal = Number(snaps[month]?.total ?? snaps[month] ?? 0);
          if (snaps[month] == null || Math.abs(existingTotal) < 0.01) {
            snaps[month] = seed;
            void pushSnapshot(ownerId, month, seed.account, seed.rua, seed.total, true);
          }
        });
        localStorage.setItem(SNAP_KEY, JSON.stringify(snaps));
        notifyPatrimonioChanged();
      } catch { /* noop */ }
    };

    const pushSnapshot = async (
      ownerId: string,
      month: string,
      account: number,
      rua: number,
      total: number,
      finalize: boolean,
    ) => {
      await (supabase as any)
        .from("patrimonio_snapshots")
        .upsert(
          { owner_id: ownerId, month, account, rua, total, finalized: finalize },
          { onConflict: "owner_id,month" },
        );
    };

    const publish = async () => {
      try {
        const [b, ownerId] = await Promise.all([getBalances(), getOwnerId()]);
        if (!alive) return;
        const contaMaisDinheiro = (b.account || 0) + (b.cash || 0);
        const pendingLoans = loans
          .filter((l) => l.status !== "paid")
          .reduce((s, l) => s + getLoanReceivable(l, payments, installmentSchedules), 0);
        const total = contaMaisDinheiro + pendingLoans;
        const now = new Date();
        const currentKey = monthKey(now);

        localStorage.setItem(
          "patrimonio.current.v1",
          JSON.stringify({ month: currentKey, account: contaMaisDinheiro, rua: pendingLoans, total }),
        );
        notifyPatrimonioChanged();

        // Trava snapshot no último dia do mês.
        const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const isLastDay = next.getMonth() !== now.getMonth();
        if (isLastDay && ownerId) {
          const raw = localStorage.getItem(SNAP_KEY);
          const snaps: Record<string, any> = raw ? JSON.parse(raw) : {};
          if (snaps[currentKey] == null) {
            snaps[currentKey] = { account: contaMaisDinheiro, rua: pendingLoans, total };
            localStorage.setItem(SNAP_KEY, JSON.stringify(snaps));
            notifyPatrimonioChanged();
            void pushSnapshot(ownerId, currentKey, contaMaisDinheiro, pendingLoans, total, true);
          }
        }

        // Sincroniza sempre o patrimônio ao vivo do mês corrente (não finalizado)
        // — permite que outros dispositivos leiam o valor mesmo sem esperar o fim do mês.
        if (ownerId && !isLastDay) {
          void pushSnapshot(ownerId, currentKey, contaMaisDinheiro, pendingLoans, total, false);
        }
      } catch { /* noop */ }
    };

    // Primeiro carrega o que já existe no backend, depois publica os dados atuais.
    (async () => {
      const ownerId = await getOwnerId();
      if (ownerId) await loadFromBackend(ownerId);
      await publish();
    })();

    const onChange = () => { publish(); };
    window.addEventListener("balance:changed", onChange);
    window.addEventListener("focus", onChange);
    return () => {
      alive = false;
      window.removeEventListener("balance:changed", onChange);
      window.removeEventListener("focus", onChange);
    };
  }, [loans, payments, installmentSchedules]);
}
