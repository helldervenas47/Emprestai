import { useEffect, useMemo, useState, useCallback, Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDownRight, ArrowUpRight, Plus, Wallet, ListFilter, RefreshCw, Banknote, Building2, ArrowLeftRight, ChevronDown, ChevronRight, Landmark, ShoppingBag, SlidersHorizontal, PiggyBank, ShoppingCart, MoreHorizontal } from "lucide-react";
import { MonthNavigator } from "@/components/ui/month-navigator";

import {
  listLedger, recordLedger, recomputeBalanceFromLedger, recordTransfer,
  type LedgerEntry, type LedgerCategory, type LedgerDirection,
} from "@/features/financial/lib/ledger";
import { getBalances, type Wallet as WalletType } from "@/features/financial/lib/balance";
import { todayInAppTz, getAppTimezone } from "@/lib/timezone";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { getLedgerDisplay, statusToneClass } from "@/features/financial/lib/ledgerDisplay";

import { ConsolidatedBalanceCards } from "@/features/dashboard/components/ConsolidatedBalanceCards";
import { supabase } from "@/integrations/supabase/userClient";
import { toast } from "sonner";
import { isVehicleExpenseCategory } from "@/features/vehicles/components/VehicleExpenseForm";

/**
 * Detecta lançamentos originados do módulo "Veículos" para ocultá-los do extrato
 * financeiro. Os registros originais não são removidos; apenas a exibição
 * (e os filtros/totais derivados) é filtrada.
 */
const isVehicleLedgerEntry = (e: LedgerEntry): boolean => {
  const md = (e.metadata ?? {}) as Record<string, any>;
  if (md.scope === "vehicle" || md.source === "vehicle" || md.vehicle === true) return true;
  if (typeof md.category === "string" && isVehicleExpenseCategory(md.category)) return true;
  return false;
};

/**
 * Pagamentos de fatura de cartão de crédito não devem aparecer no extrato
 * financeiro: as compras individuais do cartão já são exibidas em seus
 * próprios módulos e a fatura é conciliada na aba "Cartões". O registro no
 * ledger é preservado (para saldo/conciliação), apenas ocultado da UI.
 */
const isCreditCardInvoiceLedgerEntry = (e: LedgerEntry): boolean => {
  const md = (e.metadata ?? {}) as Record<string, any>;
  if (md?.kind === "credit_card_invoice_payment" || md?.card_id) return true;
  
  // Fallback for descriptions: "Fatura Cartão", "Pagamento Fatura", etc.
  const desc = (e.description || "").toLowerCase();
  const isInvoiceDesc = (desc.includes("fatura") || desc.includes("fechamento")) && 
                       (desc.includes("cartão") || desc.includes("credito") || desc.includes("crédito"));
  
  return isInvoiceDesc;
};

const formatBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Format the exact time portion (HH:mm:ss) of a timestamptz in the app timezone. */
const formatTimeInAppTz = (iso?: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: getAppTimezone(),
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return d.toISOString().slice(11, 19);
  }
};

const categoryLabels: Record<LedgerCategory, string> = {
  loan: "Empréstimo",
  payment: "Pagamento",
  expense: "Despesa",
  adjustment: "Ajuste",
  aporte: "Aporte",
  sale: "Venda",
  initial: "Saldo inicial",
  other: "Outro",
  transfer: "Transferência",
};

const categoryIcons: Record<LedgerCategory, React.ComponentType<{ className?: string }>> = {
  loan: Landmark,
  payment: Wallet,
  expense: ShoppingBag,
  adjustment: SlidersHorizontal,
  aporte: PiggyBank,
  sale: ShoppingCart,
  initial: Wallet,
  other: MoreHorizontal,
  transfer: ArrowLeftRight,
};

const categoryTints: Record<LedgerCategory, string> = {
  loan: "bg-primary/10 text-primary",
  payment: "bg-success/10 text-success",
  expense: "bg-destructive/10 text-destructive",
  adjustment: "bg-muted text-muted-foreground",
  aporte: "bg-purple/10 text-purple",
  sale: "bg-warning/10 text-warning",
  initial: "bg-primary/10 text-primary",
  other: "bg-muted text-muted-foreground",
  transfer: "bg-muted text-muted-foreground",
};

const walletLabel = (w: WalletType) => (w === "cash" ? "Dinheiro" : "Conta");

type GroupedItem =
  | { kind: "single"; entry: LedgerEntry }
  | { kind: "group"; key: string; entries: LedgerEntry[]; total: number };

interface Props {
  readOnly?: boolean;
}

function LedgerItemCard({
  item,
  getMethodName,
  getLoanTags,
  getLoanBorrower,
}: {
  item: Extract<GroupedItem, { kind: "single" }>;
  getMethodName: (e: LedgerEntry) => string | null;
  getLoanTags: (e: LedgerEntry) => string[];
  getLoanBorrower: (e: LedgerEntry) => string | null;
}) {
  const e = item.entry;
  const w = (e.wallet ?? "account") as WalletType;
  const methodName = getMethodName(e);
  const CategoryIcon = categoryIcons[e.category];
  const d = getLedgerDisplay(e, getLoanBorrower(e));
  const time = formatTimeInAppTz(e.created_at);
  return (
    <Card no3d className="overflow-hidden transition-colors hover:bg-accent/30">
      <CardContent className="p-0">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <div className={`h-9 w-9 rounded-xl shrink-0 flex items-center justify-center ${categoryTints[e.category]}`}>
            <CategoryIcon className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            {/* Linha 1 — cliente/movimentação + valor */}
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-foreground truncate">{d.title}</p>
              <span className={`text-sm font-bold tabular-nums whitespace-nowrap ${e.direction === "in" ? "text-success" : "text-destructive"}`}>
                {e.direction === "in" ? "+" : "−"} {formatBRL(Number(e.amount))}
              </span>
            </div>
            {/* Linha 2 — tipo · data/hora · forma de pagamento */}
            <p className="text-[11px] text-muted-foreground truncate">
              <span className="font-medium text-foreground/80">{d.typeLabel}</span>
              {` · ${e.occurred_on}`}
              {time ? ` ${time.slice(0, 5)}` : ""}
              {methodName ? ` · ${methodName}` : ""}
            </p>
            {/* Linha 3 — status · carteira · etiquetas */}
            <div className="flex items-center gap-1.5 min-w-0">
              <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${statusToneClass[d.statusTone]}`}>
                {d.status}
              </Badge>
              <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1 whitespace-nowrap">
                {w === "cash" ? <Banknote className="h-2.5 w-2.5" /> : <Building2 className="h-2.5 w-2.5" />}
                {walletLabel(w)}
              </span>
              {getLoanTags(e).slice(0, 2).map((t) => (
                <span key={`tag-${e.id}-${t}`} className="text-[10px] text-primary truncate">#{t}</span>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


function LedgerGroupCard({
  item,
  expanded,
  onToggle,
  getMethodName,
  getLoanTags,
  getLoanBorrower,
}: {
  item: Extract<GroupedItem, { kind: "group" }>;
  expanded: boolean;
  onToggle: () => void;
  getMethodName: (e: LedgerEntry) => string | null;
  getLoanTags: (e: LedgerEntry) => string[];
  getLoanBorrower: (e: LedgerEntry) => string | null;
}) {
  const first = item.entries[0];
  const w = (first.wallet ?? "account") as WalletType;
  const methodNames = Array.from(new Set(item.entries.map(getMethodName).filter((n): n is string => !!n)));
  const CategoryIcon = categoryIcons[first.category];
  const d = getLedgerDisplay(first, getLoanBorrower(first));
  const time = formatTimeInAppTz(first.created_at);
  return (
    <Card no3d className="overflow-hidden transition-colors hover:bg-accent/30">
      <CardContent className="p-0">
        <button type="button" onClick={onToggle} className="w-full text-left">
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <div className={`h-9 w-9 rounded-xl shrink-0 flex items-center justify-center ${categoryTints[first.category]}`}>
              <CategoryIcon className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-1 min-w-0">
                  {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  <p className="text-sm font-semibold text-foreground truncate">{d.title}</p>
                </div>
                <span className={`text-sm font-bold tabular-nums whitespace-nowrap ${first.direction === "in" ? "text-success" : "text-destructive"}`}>
                  {first.direction === "in" ? "+" : "−"} {formatBRL(item.total)}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                <span className="font-medium text-foreground/80">{d.typeLabel}</span>
                {` · ${first.occurred_on}`}
                {time ? ` ${time.slice(0, 5)}` : ""}
                {methodNames.length > 0 ? ` · ${methodNames.join(" + ")}` : ""}
              </p>
              <div className="flex items-center gap-1.5 min-w-0">
                <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${statusToneClass[d.statusTone]}`}>
                  {d.status}
                </Badge>
                <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1 whitespace-nowrap">
                  {w === "cash" ? <Banknote className="h-2.5 w-2.5" /> : <Building2 className="h-2.5 w-2.5" />}
                  {walletLabel(w)}
                </span>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{item.entries.length}× dividido</span>
              </div>
            </div>
          </div>
        </button>

        {expanded && (
          <div className="border-t border-border/50 px-3 py-2 space-y-2">
            {item.entries.map((e) => {
              const mn = getMethodName(e);
              return (
                <div key={e.id} className="flex items-center justify-between gap-2 pl-2 border-l border-border/60">
                  <span className="text-xs text-muted-foreground truncate">{mn ?? "—"}</span>
                  <span className={`text-xs font-semibold tabular-nums ${e.direction === "in" ? "text-success" : "text-destructive"}`}>
                    {formatBRL(Number(e.amount))}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function LedgerView({ readOnly = false }: Props) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [balances, setBalances] = useState({ account: 0, cash: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filterDir, setFilterDir] = useState<"all" | LedgerDirection>("all");
  const [filterCat, setFilterCat] = useState<"all" | LedgerCategory>("all");
  const [filterWallet, setFilterWallet] = useState<"all" | WalletType>("all");
  const [filterMonth, setFilterMonth] = useState<string>(() => todayInAppTz().slice(0, 7));
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const { methods: paymentMethods } = usePaymentMethods();
  const [paymentMethodByPaymentId, setPaymentMethodByPaymentId] = useState<Record<string, string | null>>({});
  const [loanTagsById, setLoanTagsById] = useState<Record<string, string[]>>({});
  const [loanBorrowerById, setLoanBorrowerById] = useState<Record<string, string | null>>({});
  const methodNameById = useMemo(() => {
    const m = new Map<string, string>();
    paymentMethods.forEach((pm) => m.set(pm.id, pm.name));
    return m;
  }, [paymentMethods]);

  const getMethodName = useCallback((e: LedgerEntry): string | null => {
    const id = e.payment_method_id
      ?? (e.metadata as any)?.payment_method_id
      ?? (e.payment_id ? paymentMethodByPaymentId[e.payment_id] : null);
    if (!id) return null;
    return methodNameById.get(id) ?? null;
  }, [methodNameById, paymentMethodByPaymentId]);

  const reload = useCallback(async () => {
    setLoading(true);
    const [list, bal] = await Promise.all([listLedger(), getBalances()]);
    setEntries(list);
    setBalances(bal);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    const onChange = () => { reload(); };
    window.addEventListener("balance:changed", onChange);
    window.addEventListener("ledger:changed", onChange);
    return () => {
      window.removeEventListener("balance:changed", onChange);
      window.removeEventListener("ledger:changed", onChange);
    };
  }, [reload]);

  // Backfill: payment_method_id da tabela `payments` para ledger antigos
  useEffect(() => {
    const missing = entries
      .filter((e) => e.payment_id && !e.payment_method_id && !(e.metadata as any)?.payment_method_id && !(e.payment_id! in paymentMethodByPaymentId))
      .map((e) => e.payment_id as string);
    if (missing.length === 0) return;
    const unique = Array.from(new Set(missing));
    (async () => {
      const { data } = await supabase.from("payments").select("id, payment_method_id").in("id", unique);
      setPaymentMethodByPaymentId((prev) => {
        const next = { ...prev };
        unique.forEach((id) => { if (!(id in next)) next[id] = null; });
        (data as any[] | null)?.forEach((r) => { next[r.id] = r.payment_method_id ?? null; });
        return next;
      });
    })();
  }, [entries, paymentMethodByPaymentId]);

  // Backfill: tags e nome do mutuário (loans) para os lançamentos
  useEffect(() => {
    const missing = entries
      .filter((e) => e.loan_id && !(e.loan_id in loanTagsById))
      .map((e) => e.loan_id as string);
    if (missing.length === 0) return;
    const unique = Array.from(new Set(missing));
    (async () => {
      const { data } = await supabase.from("loans").select("id, tags, borrower_name").in("id", unique);
      setLoanTagsById((prev) => {
        const next = { ...prev };
        unique.forEach((id) => { if (!(id in next)) next[id] = []; });
        (data as any[] | null)?.forEach((r) => {
          next[r.id] = Array.isArray(r.tags) ? r.tags.filter((t: any) => typeof t === "string" && t.trim()) : [];
        });
        return next;
      });
      setLoanBorrowerById((prev) => {
        const next = { ...prev };
        unique.forEach((id) => { if (!(id in next)) next[id] = null; });
        (data as any[] | null)?.forEach((r) => {
          next[r.id] = typeof r.borrower_name === "string" && r.borrower_name.trim() ? r.borrower_name.trim() : null;
        });
        return next;
      });
    })();
  }, [entries, loanTagsById]);

  const getLoanTags = useCallback((e: LedgerEntry): string[] => {
    if (!e.loan_id) return [];
    return loanTagsById[e.loan_id] ?? [];
  }, [loanTagsById]);

  const getLoanBorrower = useCallback((e: LedgerEntry): string | null => {
    if (!e.loan_id) return null;
    return loanBorrowerById[e.loan_id] ?? null;
  }, [loanBorrowerById]);

  const filtered = useMemo(() => {
    return entries
      .filter((e) => {
        // Transferências internas entre carteiras não são receita/despesa real
        if (e.category === "transfer") return false;
        // Movimentações originadas do módulo Veículos não devem aparecer no
        // extrato financeiro (continuam preservadas em seus próprios relatórios).
        if (isVehicleLedgerEntry(e)) return false;
        // Pagamentos de fatura de cartão são ocultados do extrato.
        if (isCreditCardInvoiceLedgerEntry(e)) return false;
        if (filterDir !== "all" && e.direction !== filterDir) return false;
        if (filterCat !== "all" && e.category !== filterCat) return false;
        if (filterWallet !== "all" && (e.wallet ?? "account") !== filterWallet) return false;
        if (filterMonth !== "all" && (e.occurred_on || "").slice(0, 7) !== filterMonth) return false;
        return true;
      })
      .sort((a, b) => {
        const cmp = (b.occurred_on ?? "").localeCompare(a.occurred_on ?? "");
        if (cmp !== 0) return cmp;
        return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      });
  }, [entries, filterDir, filterCat, filterWallet, filterMonth]);

  const filteredList = useMemo(
    () => filtered.filter((e) => e.category !== "adjustment"),
    [filtered],
  );

  // Agrupa entradas que pertencem ao mesmo empréstimo (desembolso split)
  // ou ao mesmo pagamento (recebimento split em mais de um método).
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const groupKeyFor = (e: LedgerEntry): string | null => {
    if (e.category === "loan" && e.direction === "out" && e.loan_id) return `loan:${e.loan_id}`;
    if (e.category === "payment" && e.direction === "in" && e.payment_id) return `payment:${e.payment_id}`;
    return null;
  };

  const groupedItems = useMemo<GroupedItem[]>(() => {
    const buckets = new Map<string, LedgerEntry[]>();
    const order: string[] = [];
    for (const e of filteredList) {
      const k = groupKeyFor(e) ?? `single:${e.id}`;
      if (!buckets.has(k)) { buckets.set(k, []); order.push(k); }
      buckets.get(k)!.push(e);
    }
    return order.map((k) => {
      const arr = buckets.get(k)!;
      if (arr.length === 1) return { kind: "single", entry: arr[0] } as GroupedItem;
      const total = arr.reduce((a, e) => a + Number(e.amount), 0);
      return { kind: "group", key: k, entries: arr, total } as GroupedItem;
    });
  }, [filteredList]);


  const totals = useMemo(() => {
    const totalIn = filtered.filter((e) => e.direction === "in").reduce((a, e) => a + Number(e.amount), 0);
    const totalOut = filtered.filter((e) => e.direction === "out").reduce((a, e) => a + Number(e.amount), 0);
    return { totalIn, totalOut, net: totalIn - totalOut };
  }, [filtered]);




  const handleRecompute = async () => {
    await recomputeBalanceFromLedger();
    await reload();
    toast.success("Saldos recalculados a partir do extrato");
  };

  return (
    <div className="space-y-3 sm:space-y-4 w-full max-w-full min-w-0 overflow-x-hidden">

      {/* Indicadores consolidados — layout bento */}
      <ConsolidatedBalanceCards variant="bento" />

      {/* Entradas/Saídas do período filtrado */}
      <div className="flex gap-2 sm:gap-3">
        <div className="flex-1 rounded-2xl border border-border/60 bg-success/10 p-3 flex items-center gap-3 transition-colors hover:bg-success/15">
          <div className="rounded-xl bg-success p-2 text-success-foreground shrink-0">
            <ArrowUpRight className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-success">Entradas</p>
            <p className="text-sm sm:text-base font-bold tabular-nums text-success truncate">{formatBRL(totals.totalIn)}</p>
          </div>
        </div>
        <div className="flex-1 rounded-2xl border border-border/60 bg-destructive/10 p-3 flex items-center gap-3 transition-colors hover:bg-destructive/15">
          <div className="rounded-xl bg-destructive p-2 text-destructive-foreground shrink-0">
            <ArrowDownRight className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-destructive">Saídas</p>
            <p className="text-sm sm:text-base font-bold tabular-nums text-destructive truncate">{formatBRL(totals.totalOut)}</p>
          </div>
        </div>
      </div>

      {/* Filtros + ações */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 flex-1">
            <button
              type="button"
              onClick={() => setFilterDir("all")}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                filterDir === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Tudo
            </button>
            <button
              type="button"
              onClick={() => setFilterDir("in")}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                filterDir === "in"
                  ? "bg-success text-success-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Entradas
            </button>
            <button
              type="button"
              onClick={() => setFilterDir("out")}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                filterDir === "out"
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Saídas
            </button>
          </div>
          {!readOnly && (
            <div className="flex items-center gap-1.5 shrink-0 sm:hidden">
              <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)} className="h-9 rounded-full">
                <ArrowLeftRight className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Transferir</span>
              </Button>
              <Button size="sm" onClick={() => setAdjustOpen(true)} className="h-9 w-9 sm:w-auto rounded-full px-0 sm:px-3">
                <Plus className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Ajustar</span>
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <MonthNavigator
            value={filterMonth}
            onChange={setFilterMonth}
            className="w-full"
          />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-nowrap sm:items-stretch">
            <ListFilter className="hidden sm:block h-4 w-4 text-muted-foreground shrink-0 self-center" />
            <Select value={filterWallet} onValueChange={(v: any) => setFilterWallet(v)}>
              <SelectTrigger className="h-9 w-full sm:flex-1 rounded-full text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as carteiras</SelectItem>
                <SelectItem value="account">Conta</SelectItem>
                <SelectItem value="cash">Dinheiro</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCat} onValueChange={(v: any) => setFilterCat(v)}>
              <SelectTrigger className="h-9 w-full sm:flex-1 rounded-full text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {Object.entries(categoryLabels)
                  .filter(([k]) => k !== "transfer")
                  .map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {!readOnly && (
          <div className="hidden sm:flex sm:flex-1 sm:items-stretch gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)} className="h-9 flex-1 rounded-full px-3">
              <ArrowLeftRight className="h-4 w-4 mr-1" /> Transferir
            </Button>
            <Button size="sm" onClick={() => setAdjustOpen(true)} className="h-9 flex-1 rounded-full px-3">
              <Plus className="h-4 w-4 mr-1" /> Ajustar
            </Button>
          </div>
        )}
      </div>

      {/* Lançamentos */}
      {loading ? (
        <Card no3d><CardContent className="p-8 text-center text-muted-foreground">Carregando…</CardContent></Card>
      ) : filteredList.length === 0 ? (
        <Card no3d><CardContent className="p-8 text-center text-muted-foreground">Nenhum lançamento encontrado.</CardContent></Card>
      ) : (
        <>
          {/* Mobile */}
          <div className="sm:hidden space-y-2">
            {(() => {
              let lastDate = "";
              return groupedItems.map((item) => {
                const date = item.kind === "single" ? item.entry.occurred_on : item.entries[0].occurred_on;
                const showDate = date !== lastDate;
                lastDate = date;
                return (
                  <Fragment key={item.kind === "single" ? item.entry.id : item.key}>
                    {showDate && (
                      <div className="flex items-center gap-2 pt-2">
                        <span className="text-xs font-semibold text-muted-foreground">{date}</span>
                        <div className="flex-1 h-px bg-border/60" />
                      </div>
                    )}
                    {item.kind === "single" ? (
                      <LedgerItemCard
                        item={item}
                        getMethodName={getMethodName}
                        getLoanTags={getLoanTags}
                        getLoanBorrower={getLoanBorrower}
                      />
                    ) : (
                      <LedgerGroupCard
                        item={item}
                        expanded={expandedGroups.has(item.key)}
                        onToggle={() => toggleGroup(item.key)}
                        getMethodName={getMethodName}
                        getLoanTags={getLoanTags}
                        getLoanBorrower={getLoanBorrower}
                      />
                    )}
                  </Fragment>
                );
              });
            })()}
          </div>

          {/* Desktop */}
          <Card no3d className="hidden sm:block">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Data / Hora</TableHead>
                    <TableHead>Cliente / Movimentação</TableHead>
                    <TableHead className="whitespace-nowrap">Tipo</TableHead>
                    <TableHead className="whitespace-nowrap">Pagamento</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedItems.map((item) => {
                    if (item.kind === "single") {
                      const e = item.entry;
                      const w = (e.wallet ?? "account") as WalletType;
                      const methodName = getMethodName(e);
                      const CategoryIcon = categoryIcons[e.category];
                      const d = getLedgerDisplay(e, getLoanBorrower(e));
                      return (
                        <TableRow key={e.id}>
                          <TableCell className="whitespace-nowrap text-sm tabular-nums align-middle">
                            <div className="flex flex-col leading-tight">
                              <span>{e.occurred_on}</span>
                              {formatTimeInAppTz(e.created_at) && (
                                <span className="text-[11px] text-muted-foreground">{formatTimeInAppTz(e.created_at).slice(0, 5)}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm align-middle">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`h-6 w-6 shrink-0 rounded-md flex items-center justify-center ${categoryTints[e.category].replace("/10", "/15")}`}>
                                <CategoryIcon className="h-3.5 w-3.5" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium truncate">{d.title}</p>
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {d.typeLabel}
                                  {getLoanTags(e).length > 0 ? ` · ${getLoanTags(e).map((t) => `#${t}`).join(" ")}` : ""}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-middle">
                            <Badge variant="outline" className="text-[10px] whitespace-nowrap">{d.typeLabel}</Badge>
                          </TableCell>
                          <TableCell className="align-middle text-xs text-muted-foreground whitespace-nowrap">
                            <div className="flex flex-col leading-tight">
                              <span>{methodName ?? "—"}</span>
                              <span className="inline-flex items-center gap-1">
                                {w === "cash" ? <Banknote className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                                {walletLabel(w)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="align-middle">
                            <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${statusToneClass[d.statusTone]}`}>{d.status}</Badge>
                          </TableCell>
                          <TableCell className={`text-right font-semibold whitespace-nowrap tabular-nums align-middle ${e.direction === "in" ? "text-success" : "text-destructive"}`}>
                            {e.direction === "in" ? "+" : "−"} {formatBRL(Number(e.amount))}
                          </TableCell>
                        </TableRow>
                      );
                    }

                    // Grupo
                    const first = item.entries[0];
                    const w = (first.wallet ?? "account") as WalletType;
                    const methodNames = Array.from(new Set(
                      item.entries.map(getMethodName).filter((n): n is string => !!n)
                    ));
                    const expanded = expandedGroups.has(item.key);
                    const GroupIcon = categoryIcons[first.category];
                    const d = getLedgerDisplay(first, getLoanBorrower(first));
                    return (
                      <Fragment key={item.key}>
                        <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => toggleGroup(item.key)}>
                          <TableCell className="whitespace-nowrap text-sm tabular-nums align-middle">
                            <div className="flex flex-col leading-tight">
                              <span>{first.occurred_on}</span>
                              {formatTimeInAppTz(first.created_at) && (
                                <span className="text-[11px] text-muted-foreground">{formatTimeInAppTz(first.created_at).slice(0, 5)}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm align-middle">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`h-6 w-6 shrink-0 rounded-md flex items-center justify-center ${categoryTints[first.category].replace("/10", "/15")}`}>
                                <GroupIcon className="h-3.5 w-3.5" />
                              </div>
                              {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                              <div className="min-w-0">
                                <p className="font-medium truncate">{d.title}</p>
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {d.typeLabel} · {item.entries.length}× dividido
                                  {getLoanTags(first).length > 0 ? ` · ${getLoanTags(first).map((t) => `#${t}`).join(" ")}` : ""}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-middle">
                            <Badge variant="outline" className="text-[10px] whitespace-nowrap">{d.typeLabel}</Badge>
                          </TableCell>
                          <TableCell className="align-middle text-xs text-muted-foreground whitespace-nowrap">
                            <div className="flex flex-col leading-tight">
                              <span>{methodNames.length > 0 ? methodNames.join(" + ") : "—"}</span>
                              <span className="inline-flex items-center gap-1">
                                {w === "cash" ? <Banknote className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                                {walletLabel(w)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="align-middle">
                            <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${statusToneClass[d.statusTone]}`}>{d.status}</Badge>
                          </TableCell>
                          <TableCell className={`text-right font-semibold whitespace-nowrap tabular-nums align-middle ${first.direction === "in" ? "text-success" : "text-destructive"}`}>
                            {first.direction === "in" ? "+" : "−"} {formatBRL(item.total)}
                          </TableCell>
                        </TableRow>
                        {expanded && item.entries.map((e) => {
                          const mn = getMethodName(e);
                          return (
                            <TableRow key={e.id} className="bg-muted/20">
                              <TableCell />
                              <TableCell className="text-xs text-muted-foreground pl-8">↳ parte {(e.metadata as any)?.split_index ? `${(e.metadata as any).split_index}/${(e.metadata as any).split_count}` : ""}</TableCell>
                              <TableCell />
                              <TableCell className="text-xs text-muted-foreground">{mn ?? "—"}</TableCell>
                              <TableCell />
                              <TableCell className={`text-right text-xs tabular-nums ${e.direction === "in" ? "text-success" : "text-destructive"}`}>
                                {formatBRL(Number(e.amount))}
                              </TableCell>
                            </TableRow>
                          );
                        })}

                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>

      )}

      <AdjustBalanceDialog open={adjustOpen} onOpenChange={setAdjustOpen} balances={balances} onSaved={reload} />
      <TransferDialog open={transferOpen} onOpenChange={setTransferOpen} balances={balances} onSaved={reload} />
    </div>
  );
}

function AdjustBalanceDialog({ open, onOpenChange, balances, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; balances: { account: number; cash: number }; onSaved: () => void }) {
  const [wallet, setWallet] = useState<WalletType>("account");
  const [targetBalance, setTargetBalance] = useState("");
  const [description, setDescription] = useState("Ajuste manual de saldo");
  const [date, setDate] = useState(todayInAppTz());
  const [saving, setSaving] = useState(false);

  const currentBalance = wallet === "cash" ? balances.cash : balances.account;

  useEffect(() => {
    if (open) {
      setWallet("account");
      setTargetBalance(balances.account.toFixed(2));
      setDescription("Ajuste manual de saldo");
      setDate(todayInAppTz());
    }
  }, [open, balances.account]);

  useEffect(() => {
    if (open) setTargetBalance(currentBalance.toFixed(2));
  }, [wallet, open, currentBalance]);

  const target = parseFloat(targetBalance.replace(",", "."));
  const validTarget = !isNaN(target);
  const delta = validTarget ? +(target - currentBalance).toFixed(2) : 0;
  const direction: LedgerDirection = delta >= 0 ? "in" : "out";
  const absDelta = Math.abs(delta);

  const handleSave = async () => {
    if (!validTarget) { toast.error("Informe um saldo válido"); return; }
    if (absDelta < 0.005) { toast.error("O saldo informado é igual ao atual"); return; }
    setSaving(true);
    try {
      await recordLedger({
        direction, category: "adjustment", amount: absDelta,
        description: description.trim() || "Ajuste manual de saldo",
        occurred_on: date, source: "manual", wallet,
      });
      toast.success("Ajuste registrado");
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao registrar ajuste");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Ajustar saldo</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Carteira</Label>
            <Select value={wallet} onValueChange={(v: any) => setWallet(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="account">Conta</SelectItem>
                <SelectItem value="cash">Dinheiro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            <p className="text-muted-foreground">Saldo atual ({walletLabel(wallet)})</p>
            <p className="font-semibold">{formatBRL(currentBalance)}</p>
          </div>
          <div>
            <Label>Novo saldo (R$)</Label>
            <Input type="number" inputMode="decimal" step="0.01" value={targetBalance} onChange={(e) => setTargetBalance(e.target.value)} placeholder="0,00" autoFocus />
          </div>
          {validTarget && absDelta >= 0.005 && (
            <div className={`rounded-md px-3 py-2 text-sm ${direction === "in" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
              {direction === "in" ? "Entrada" : "Saída"} de {formatBRL(absDelta)} em {walletLabel(wallet)}
            </div>
          )}
          <div>
            <Label>Data</Label>
            <DatePickerField value={date} onChange={setDate} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ open, onOpenChange, balances, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; balances: { account: number; cash: number }; onSaved: () => void }) {
  const [from, setFrom] = useState<WalletType>("account");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayInAppTz());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const to: WalletType = from === "account" ? "cash" : "account";
  const fromBalance = from === "cash" ? balances.cash : balances.account;
  const v = parseFloat(amount.replace(",", "."));

  useEffect(() => {
    if (open) {
      setFrom("account");
      setAmount("");
      setDate(todayInAppTz());
      setNote("");
    }
  }, [open]);

  const handleSave = async () => {
    if (!v || v <= 0) { toast.error("Informe um valor válido"); return; }
    setSaving(true);
    try {
      await recordTransfer({ from, to, amount: v, occurred_on: date, description: note });
      toast.success("Transferência registrada");
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao registrar transferência");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Transferir entre saldos</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>De</Label>
            <Select value={from} onValueChange={(v: any) => setFrom(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="account">Conta ({formatBRL(balances.account)})</SelectItem>
                <SelectItem value="cash">Dinheiro ({formatBRL(balances.cash)})</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md bg-muted px-3 py-2 text-sm flex items-center justify-center gap-2">
            <span className="font-medium">{walletLabel(from)}</span>
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{walletLabel(to)}</span>
          </div>
          <div>
            <Label>Valor (R$)</Label>
            <Input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" autoFocus />
            {v > fromBalance && v > 0 && (
              <p className="text-xs text-warning mt-1">⚠ Valor maior que o saldo disponível em {walletLabel(from)} ({formatBRL(fromBalance)}). A transferência ficará negativa.</p>
            )}
          </div>
          <div>
            <Label>Data</Label>
            <DatePickerField value={date} onChange={setDate} />
          </div>
          <div>
            <Label>Observação (opcional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Transferência ${walletLabel(from)} → ${walletLabel(to)}`} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Transferir"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

