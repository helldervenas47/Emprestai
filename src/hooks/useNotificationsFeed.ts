import { useEffect, useMemo, useState, useCallback } from "react";
import type { Loan, Payment, InstallmentSchedule, Client } from "@/types/loan";
import { todayInAppTz } from "@/lib/timezone";
import { calculateInstallment } from "@/features/loans/hooks/useLoans";
import { useAuth } from "@/hooks/useAuth";

export interface DueFeedItem {
  kind: "overdue" | "dueSoon";
  key: string;
  loanId: string;
  clientId?: string;
  clientName: string;
  installmentNumber: number;
  totalInstallments: number;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  sortTs: number;
}

export interface PaymentFeedItem {
  kind: "payment";
  key: string;
  loanId: string;
  paymentId: string;
  clientId?: string;
  clientName: string;
  installmentNumber: number;
  totalInstallments: number;
  amount: number;
  paidAt: string; // ISO
  sortTs: number;
}

export type FeedItem = DueFeedItem | PaymentFeedItem;

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function expectedInstallmentAmount(loan: Loan, schedules: InstallmentSchedule[], n: number): number {
  const s = schedules.find((x) => x.loanId === loan.id && x.installmentNumber === n);
  if (s) return s.amount;
  if (loan.installments === 1 && loan.remainingAmount && loan.remainingAmount > 0) return loan.remainingAmount;
  return loan.customInstallmentValue || calculateInstallment(loan.amount, loan.interestRate, loan.installments);
}

export function useNotificationsFeed(
  loans: Loan[],
  payments: Payment[],
  installmentSchedules: InstallmentSchedule[],
  clients: Client[],
) {
  const { user } = useAuth();
  const storageKey = user ? `notif:lastSeen:${user.id}` : null;

  const safeGetItem = (key: string): string | null => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const safeSetItem = (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage disabled (private mode / iframe) */
    }
  };

  const [lastSeen, setLastSeen] = useState<number>(() => {
    if (typeof window === "undefined" || !storageKey) return 0;
    const raw = safeGetItem(storageKey);
    return raw ? Number(raw) || 0 : 0;
  });
  const [, force] = useState(0);

  // Re-render every 60s para atualizar contagens baseadas em "agora"
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!storageKey) return;
    const raw = safeGetItem(storageKey);
    setLastSeen(raw ? Number(raw) || 0 : 0);
  }, [storageKey]);

  const markAllRead = useCallback(() => {
    if (!storageKey) return;
    const now = Date.now();
    safeSetItem(storageKey, String(now));
    setLastSeen(now);
  }, [storageKey]);


  const data = useMemo(() => {
    const today = todayInAppTz();
    const in3 = addDaysIso(today, 3);
    const clientsById = new Map(clients.map((c) => [c.id, c] as const));

    const overdue: DueFeedItem[] = [];
    const dueSoon: DueFeedItem[] = [];

    for (const loan of loans) {
      if (loan.status === "paid") continue;
      const paid = loan.paidInstallments || 0;
      const total = loan.installments || 1;
      if (paid >= total) continue;

      // Próximas parcelas em aberto
      const candidates: { number: number; dueDate: string; amount: number }[] = [];
      if (loan.installments === 1) {
        candidates.push({
          number: 1,
          dueDate: loan.dueDate,
          amount: expectedInstallmentAmount(loan, installmentSchedules, 1),
        });
      } else {
        const open = installmentSchedules
          .filter((s) => s.loanId === loan.id && s.installmentNumber > paid && s.installmentNumber <= total)
          .sort((a, b) => a.installmentNumber - b.installmentNumber);
        if (open.length > 0) {
          for (const s of open) {
            candidates.push({ number: s.installmentNumber, dueDate: s.dueDate, amount: s.amount });
          }
        } else if (loan.dueDate) {
          candidates.push({
            number: paid + 1,
            dueDate: loan.dueDate,
            amount: expectedInstallmentAmount(loan, installmentSchedules, paid + 1),
          });
        }
      }

      const clientName =
        loan.borrowerName ||
        (loan.borrowerId && clientsById.get(loan.borrowerId)?.name) ||
        "Cliente";

      for (const c of candidates) {
        if (!c.dueDate) continue;
        const ts = new Date(c.dueDate + "T00:00:00").getTime();
        const base = {
          key: `${loan.id}#${c.number}`,
          loanId: loan.id,
          clientId: loan.borrowerId,
          clientName,
          installmentNumber: c.number,
          totalInstallments: total,
          amount: c.amount,
          dueDate: c.dueDate,
          sortTs: ts,
        };
        if (c.dueDate < today) {
          overdue.push({ kind: "overdue", ...base });
        } else if (c.dueDate <= in3) {
          dueSoon.push({ kind: "dueSoon", ...base });
        }
      }
    }

    overdue.sort((a, b) => a.sortTs - b.sortTs);
    dueSoon.sort((a, b) => a.sortTs - b.sortTs);

    // Pagamentos das últimas 24h (usar created_at quando disponível;
    // p.date pode ser apenas YYYY-MM-DD e referir-se a uma data antiga de pagamento)
    const cutoff = Date.now() - 24 * 3600 * 1000;
    const loansById = new Map(loans.map((l) => [l.id, l] as const));
    const recentPayments: PaymentFeedItem[] = payments
      .map((p) => {
        const createdTs = p.createdAt ? new Date(p.createdAt).getTime() : NaN;
        return { p, ts: Number.isFinite(createdTs) ? createdTs : NaN };
      })
      .filter(({ ts }) => Number.isFinite(ts) && ts >= cutoff)
      .map(({ p, ts }) => {
        const loan = loansById.get(p.loanId);
        const clientName =
          loan?.borrowerName ||
          (loan?.borrowerId && clientsById.get(loan.borrowerId)?.name) ||
          "Cliente";
        return {
          kind: "payment" as const,
          key: `pay#${p.id}`,
          loanId: p.loanId,
          paymentId: p.id,
          clientId: loan?.borrowerId,
          clientName,
          installmentNumber: p.installmentNumber,
          totalInstallments: loan?.installments || p.installmentNumber,
          amount: p.amount,
          paidAt: p.createdAt || p.date,
          sortTs: ts,
        };
      })
      .sort((a, b) => b.sortTs - a.sortTs);

    const all = [...overdue, ...dueSoon, ...recentPayments];
    const unreadCount = all.filter((i) => i.sortTs > lastSeen).length;

    return { overdue, dueSoon, recentPayments, unreadCount };
  }, [loans, payments, installmentSchedules, clients, lastSeen]);

  return { ...data, markAllRead, lastSeen };
}
