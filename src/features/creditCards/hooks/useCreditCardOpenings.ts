import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwner } from "@/hooks/useDataOwner";
import { toast } from "sonner";
import { assertWritable } from "@/lib/readOnlyState";
import { financeFetchError, financeFetchStart, financeFetchSuccess, financeInvalidate, financeSetState, useFinanceHookDebug } from "@/lib/financeDebug";

export interface InvoiceOpening {
  id: string;
  cardId: string;
  cycleKey: string;
  openingAmount: number;
  notes: string | null;
}

const fromRow = (r: any): InvoiceOpening => ({
  id: r.id,
  cardId: r.card_id,
  cycleKey: r.cycle_key,
  openingAmount: Number(r.opening_amount ?? 0),
  notes: r.notes ?? null,
});

const ledgerKey = (cardId: string, cycleKey: string) => `${cardId}::${cycleKey}`;

function buildLedgerNotes(base: string | null | undefined, paid: number, paidDate: string, isFull: boolean) {
  const cleaned = (base ?? "")
    .replace(/\[PAGA\]/gi, "")
    .replace(/\[LEDGER\]/gi, "")
    .replace(/\[PAID_DATE:\d{4}-\d{2}-\d{2}\]/gi, "")
    .replace(/\[PAID:[0-9]+(?:\.[0-9]+)?\]/gi, "")
    .replace(/\[TOTAL:[0-9]+(?:\.[0-9]+)?\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const markers = [
    isFull ? `[TOTAL:${paid.toFixed(2)}]` : null,
    `[PAID:${paid.toFixed(2)}]`,
    isFull ? "[PAGA]" : null,
    "[LEDGER]",
    `[PAID_DATE:${paidDate}]`,
  ].filter(Boolean).join(" ");
  return `${cleaned ? `${cleaned} ` : ""}${markers}`.trim();
}

/**
 * Builds a stable cycle key from a "to" closing date (end of cycle).
 * Format: YYYY-MM (year-month of the cycle's closing date).
 */
export function cycleKeyFromDate(closingTo: Date): string {
  const y = closingTo.getFullYear();
  const m = String(closingTo.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// BUGFIX: useCreditCardOpenings() é chamado de forma independente em ~11
// componentes (CreditCardInvoice, CreditCardList, IncomeBalanceCard, etc),
// cada um com seu próprio useState<openings>. Antes desta correção, um
// upsertOpening()/deleteOpening() feito em uma instância (ex: dentro do
// modal de pagamento) não tinha como avisar as outras instâncias (ex: a
// lista de cartões), que continuavam exibindo dados antigos até um reload
// manual da página — mesmo com o pagamento já gravado no banco.
//
// Solução: seguir o mesmo padrão de invalidação por evento global que já
// existe para o extrato (`ledger:changed` / `balance:changed`). Toda
// escrita dispara `openings:changed`; todas as instâncias do hook escutam
// esse evento e recarregam.
const OPENINGS_CHANGED_EVENT = "openings:changed";
const CREDIT_CARD_OPENING_COLUMNS =
  "id, card_id, cycle_key, opening_amount, notes";
type LedgerPaymentMeta = { amount: number; paidDate: string; isFull: boolean };

function notifyOpeningsChanged() {
  window.dispatchEvent(new Event(OPENINGS_CHANGED_EVENT));
}

export function useCreditCardOpenings() {
  useFinanceHookDebug("useCreditCardOpenings");
  const { user } = useAuth();
  const ownerId = useDataOwner();
  const [openings, setOpenings] = useState<InvoiceOpening[]>([]);
  const [loading, setLoading] = useState(true);
  const [ledgerPayments, setLedgerPayments] = useState<Record<string, LedgerPaymentMeta>>({});

  const load = useCallback(async () => {
    if (!ownerId) return;
    financeFetchStart("useCreditCardOpenings", "credit_card_invoice_openings/account_ledger", { ownerId: "present" });
    const [{ data, error }, { data: ledgerRows, error: ledgerError }] = await Promise.all([
      supabase.from("credit_card_invoice_openings").select(CREDIT_CARD_OPENING_COLUMNS),
      supabase
        .from("account_ledger")
        .select("amount, occurred_on, metadata")
        .eq("user_id", ownerId)
        .eq("direction", "out")
        .eq("metadata->>kind", "credit_card_invoice_payment"),
    ]);
    if (error) {
      const err = error as any;
      console.error("[useCreditCardOpenings] load error (full)", {
        code: err?.code,
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        status: err?.status,
      });
      financeFetchError("useCreditCardOpenings", "credit_card_invoice_openings", {
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
      });
      
      toast.error(`Erro ao carregar faturas`, {
        description: err?.message || err?.hint || err?.details || undefined,
      });
      financeSetState("useCreditCardOpenings", "openings", { rows: 0, reason: "load error" });
      setOpenings([]);
      financeSetState("useCreditCardOpenings", "ledgerPayments", { rows: 0, reason: "load error" });
      setLedgerPayments({});
      financeSetState("useCreditCardOpenings", "loading", { value: false, reason: "load error" });
      setLoading(false);
      return;
    }
    const ledgerByCycle: Record<string, LedgerPaymentMeta> = {};
    if (!ledgerError) {
      for (const r of ((ledgerRows as any[]) ?? [])) {
        const meta = r.metadata ?? {};
        if (!meta.credit_card_id || !meta.cycle_key) continue;
        const key = ledgerKey(String(meta.credit_card_id), String(meta.cycle_key));
        const previous = ledgerByCycle[key];
        const amount = Number(((previous?.amount ?? 0) + (Number(r.amount) || 0)).toFixed(2));
        const paidDate = String(r.occurred_on || previous?.paidDate || new Date().toISOString().slice(0, 10));
        const isFull = previous?.isFull || meta.full_payment === true || meta.pay_mode !== "partial";
        ledgerByCycle[key] = { amount, paidDate, isFull };
      }
    }
    financeSetState("useCreditCardOpenings", "ledgerPayments", { rows: Object.keys(ledgerByCycle).length, ledgerError: Boolean(ledgerError) });
    setLedgerPayments(ledgerByCycle);
    const normalized = (data ?? []).map(fromRow).map((opening) => {
      const ledgerPayment = ledgerByCycle[ledgerKey(opening.cardId, opening.cycleKey)];
      const paid = ledgerPayment?.amount ?? 0;
      if (paid <= 0.005) return opening;
      const currentPaid = (() => {
        const match = /\[PAID:([0-9]+(?:\.[0-9]+)?)\]/i.exec(opening.notes ?? "");
        return match ? Number(match[1]) : 0;
      })();
      if (currentPaid >= paid - 0.005) return opening;
      return {
        ...opening,
        notes: buildLedgerNotes(opening.notes, paid, ledgerPayment?.paidDate ?? new Date().toISOString().slice(0, 10), !!ledgerPayment?.isFull),
      };
    });
    const existingKeys = new Set(normalized.map((o) => ledgerKey(o.cardId, o.cycleKey)));
    const syntheticFromLedger = Object.entries(ledgerByCycle)
      .filter(([key, payment]) => payment.amount > 0.005 && !existingKeys.has(key))
      .map(([key, payment]) => {
        const sep = key.lastIndexOf("::");
        const cardId = key.slice(0, sep);
        const cycleKey = key.slice(sep + 2);
        return {
          id: `ledger-${key}`,
          cardId,
          cycleKey,
          openingAmount: 0,
          notes: buildLedgerNotes(null, payment.amount, payment.paidDate, payment.isFull),
        };
      });
    financeSetState("useCreditCardOpenings", "openings", { rows: normalized.length + syntheticFromLedger.length, dbRows: normalized.length, syntheticRows: syntheticFromLedger.length });
    setOpenings([...normalized, ...syntheticFromLedger]);
    setLoading(false);
    financeSetState("useCreditCardOpenings", "loading", { value: false });
    financeFetchSuccess("useCreditCardOpenings", "credit_card_invoice_openings/account_ledger", {
      openingRows: (data ?? []).length,
      ledgerRows: ((ledgerRows as any[]) ?? []).length,
      syntheticRows: syntheticFromLedger.length,
    });
  }, [ownerId]);

  useEffect(() => {
    if (user && ownerId) {
      financeInvalidate("useCreditCardOpenings", "credit_card_invoice_openings/account_ledger", { reason: "initial effect" });
      load();
    }
  }, [user, ownerId, load]);

  // Re-sincroniza esta instância sempre que QUALQUER outra instância do
  // hook (em qualquer componente) gravar uma alteração.
  useEffect(() => {
    if (!user || !ownerId) return;
    const handler = (event: Event) => {
      financeInvalidate("useCreditCardOpenings", "credit_card_invoice_openings/account_ledger", { event: event.type });
      load();
    };
    window.addEventListener(OPENINGS_CHANGED_EVENT, handler);
    window.addEventListener("ledger:changed", handler);
    return () => {
      window.removeEventListener(OPENINGS_CHANGED_EVENT, handler);
      window.removeEventListener("ledger:changed", handler);
    };
  }, [user, ownerId, load]);

  /** Get the opening for a specific card+cycle, or null. */
  const getOpening = useCallback(
    (cardId: string, cycleKey: string): InvoiceOpening | null => {
      const opening = openings.find((o) => o.cardId === cardId && o.cycleKey === cycleKey) ?? null;
      const ledgerPayment = ledgerPayments[ledgerKey(cardId, cycleKey)];
      const ledgerPaid = ledgerPayment?.amount ?? 0;
      if (ledgerPaid <= 0.005) return opening;
      const currentPaid = (() => {
        const match = /\[PAID:([0-9]+(?:\.[0-9]+)?)\]/i.exec(opening?.notes ?? "");
        return match ? Number(match[1]) : 0;
      })();
      if (opening && currentPaid >= ledgerPaid - 0.005) return opening;
      return {
        id: opening?.id ?? `ledger-${cardId}-${cycleKey}`,
        cardId,
        cycleKey,
        openingAmount: opening?.openingAmount ?? 0,
        notes: buildLedgerNotes(opening?.notes, ledgerPaid, ledgerPayment?.paidDate ?? new Date().toISOString().slice(0, 10), !!ledgerPayment?.isFull),
      };
    },
    [openings, ledgerPayments],
  );

  /** Insert or update an opening for a given card+cycle. */
  const upsertOpening = async (cardId: string, cycleKey: string, amount: number, notes?: string) => {
    assertWritable();
    if (!ownerId) return;
    const { data, error } = await supabase
      .from("credit_card_invoice_openings")
      .upsert(
        {
          user_id: ownerId,
          card_id: cardId,
          cycle_key: cycleKey,
          opening_amount: amount,
          notes: notes ?? null,
        } as any,
        { onConflict: "card_id,cycle_key" },
      )
      .select(CREDIT_CARD_OPENING_COLUMNS)
      .single();
    if (error) {
      toast.error("Erro ao salvar fatura");
      return;
    }
    setOpenings((prev) => {
      financeSetState("useCreditCardOpenings", "optimistic opening upsert", { cardId, cycleKey });
      const exists = prev.some((o) => o.cardId === cardId && o.cycleKey === cycleKey);
      if (exists) {
        return prev.map((o) => (o.cardId === cardId && o.cycleKey === cycleKey ? fromRow(data) : o));
      }
      return [...prev, fromRow(data)];
    });
    toast.success("Fatura registrada");
    // Avisa todas as outras instâncias do hook (outras telas/componentes)
    // para recarregarem e refletirem este pagamento/atualização.
    notifyOpeningsChanged();
  };

  const deleteOpening = async (id: string) => {
    assertWritable();
    const { error } = await supabase.from("credit_card_invoice_openings").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao remover fatura");
      return;
    }
    financeSetState("useCreditCardOpenings", "optimistic opening delete", { id });
    setOpenings((prev) => prev.filter((o) => o.id !== id));
    toast.success("Fatura removida");
    notifyOpeningsChanged();
  };

  return { openings, loading, getOpening, upsertOpening, deleteOpening };
}
