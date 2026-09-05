import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 20;
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Loan, Payment } from "@/types/loan";
import {
  calculateInstallment,
  calculateTotalWithInterest,
} from "@/features/loans/hooks/useLoans";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useHideValues } from "@/contexts/HideValuesContext";
import { paymentsRepository } from "@/repositories/paymentsRepository";
import { allocateInterestByPayment } from "@/features/financial/lib/interestAllocation";
import { getLoanFinancialStateForUI } from "@/features/loans/lib/loanFinancialAdapter";
import { focusWithoutScrollOnNextFrame } from "@/lib/focusWithoutScroll";

interface Props {
  loan: Loan | null;
  /**
   * Lista de pagamentos. Opcional a partir do P0-03 (etapa B): quando não
   * for informada, o diálogo busca por `loan.id` sob demanda (fetchByLoanId),
   * evitando depender do carregamento global do useLoans.
   */
  payments?: Payment[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(d?: string): string {
  if (!d) return "—";
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, day] = iso;
    return `${day}/${m}/${y}`;
  }
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
}

export function LoanPaymentHistoryDialog({
  loan,
  payments,
  open,
  onOpenChange,
}: Props) {
  const { methods } = usePaymentMethods(open);
  const { hidden } = useHideValues();
  const mask = (v: string) => (hidden ? "•••" : v);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [lazyPayments, setLazyPayments] = useState<Payment[] | null>(null);
  const [lazyLoading, setLazyLoading] = useState(false);
  const dialogStartRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const totalRowsRef = useRef(0);

  useEffect(() => {
    if (open) setVisibleCount(PAGE_SIZE);
  }, [open, loan?.id]);

  // Carrega mais automaticamente ao rolar até o fim da lista.
  useEffect(() => {
    if (!open) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setVisibleCount((c) =>
          c >= totalRowsRef.current ? c : Math.min(totalRowsRef.current, c + PAGE_SIZE),
        );
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [open, loan?.id, visibleCount]);



  // P0-03 (B): quando o caller NÃO passa `payments`, buscamos apenas os
  // pagamentos deste empréstimo ao abrir o diálogo. Isso permite migrar
  // detalhes sem depender do carregamento global do useLoans.
  useEffect(() => {
    if (!open || !loan?.id) return;
    if (payments !== undefined) { setLazyPayments(null); return; }
    let cancelled = false;
    setLazyLoading(true);
    paymentsRepository
      .fetchByLoanId(loan.id)
      .then((rows) => {
        if (cancelled) return;
        setLazyPayments(
          rows.map((p: any) => ({
            id: p.id,
            loanId: p.loan_id,
            amount: Number(p.amount),
            date: p.date,
            installmentNumber: p.installment_number,
            previousDueDate: p.previous_due_date,
            paymentMethodId: p.payment_method_id ?? null,
            metadata: p.metadata ?? null,
            createdAt: p.created_at ?? undefined,
          })),
        );
      })
      .catch((err) => {
        // Em erro, deixa lista vazia — o resumo ainda exibe o loan.
        console.warn("[LoanPaymentHistoryDialog] fetchByLoanId falhou:", err);
        if (!cancelled) setLazyPayments([]);
      })
      .finally(() => { if (!cancelled) setLazyLoading(false); });
    return () => { cancelled = true; };
  }, [open, loan?.id, payments]);

  const effectivePayments: Payment[] = payments ?? lazyPayments ?? [];

  const methodById = useMemo(() => {
    const map: Record<string, string> = {};
    methods.forEach((m) => {
      map[m.id] = m.name;
    });
    return map;
  }, [methods]);

  const data = useMemo(() => {
    if (!loan) return null;

    const principal = loan.amount || 0;
    const expected = calculateTotalWithInterest(
      principal,
      loan.interestRate,
      loan.installments,
    );
    const totalInterest = Math.max(0, expected - principal);
    const interestRatio = expected > 0 ? totalInterest / expected : 0;
    const principalRatio = 1 - interestRatio;
    const nominalInstallment =
      loan.customInstallmentValue ||
      calculateInstallment(principal, loan.interestRate, loan.installments);

    const loanPayments = effectivePayments
      .filter((p) => p.loanId === loan.id)
      .slice()
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    // Fonte oficial de juros por pagamento — mesma regra do Dashboard/Contador.
    // Soma todos os juros pagos ao longo da vida do contrato (parcelas
    // integrais, parciais, antecipados, avulsos), evitando exibir apenas
    // o juros do último pagamento.
    const allocated = allocateInterestByPayment(
      [
        {
          id: loan.id,
          amount: principal,
          interestRate: loan.interestRate,
          installments: loan.installments,
          status: loan.status,
        },
      ],
      loanPayments.map((p) => ({
        id: p.id,
        loanId: p.loanId,
        amount: p.amount,
        date: p.date,
        installmentNumber: p.installmentNumber,
        createdAt: (p as any).createdAt,
      })),
    );

    let totalPaid = 0;
    let principalPaid = 0;
    let interestPaid = 0;

    const rows = loanPayments.map((p) => {
      const amount = p.amount || 0;
      totalPaid += amount;

      const allocInterest = allocated.get(p.id) ?? 0;
      // Classificação oficial por tipo de lançamento:
      // - installmentNumber === 0  → juros avulso (100% juros)
      // - installmentNumber === -2 → multa/mora (100% juros)
      // - installmentNumber === -3 → amortização (100% principal)
      // - demais parcelas → usa allocator (ratio principal/juros do contrato)
      let interestPart: number;
      let principalPart: number;
      if (p.installmentNumber === 0 || p.installmentNumber === -2) {
        interestPart = amount;
        principalPart = 0;
      } else if (p.installmentNumber === -3) {
        interestPart = 0;
        principalPart = amount;
      } else {
        interestPart = allocInterest;
        principalPart = Math.max(0, amount - interestPart);
      }
      principalPaid += principalPart;
      interestPaid += interestPart;

      const methodName = p.paymentMethodId
        ? methodById[p.paymentMethodId] ?? "—"
        : "—";

      return {
        id: p.id,
        date: p.date,
        installmentNumber: p.installmentNumber,
        installmentValue: nominalInstallment,
        principal: principalPart,
        interest: interestPart,
        total: amount,
        method: methodName,
      };
    });

    const financialState = getLoanFinancialStateForUI({
      loan,
      payments: loanPayments,
    });

    const remaining = loan.status === "paid" ? 0 : financialState.payoffAmount;

    const isPaid = loan.status === "paid" || remaining <= 0.01;
    const paidInstallments = loan.paidInstallments ?? 0;
    const pendingInstallments = Math.max(
      0,
      loan.installments - paidInstallments,
    );

    return {
      rows,
      summary: {
        original: principal,
        totalPaid,
        remaining,
        interestPaid,
        paidInstallments,
        pendingInstallments,
        isPaid,
      },
    };
  }, [loan, effectivePayments, methodById]);

  if (!loan || !data) return null;

  const statusBadge = (
    installmentNumber: number,
    rowIndex: number,
  ): { label: string; className: string } => {
    if (data.summary.isPaid && rowIndex === data.rows.length - 1) {
      return {
        label: "Quitado",
        className: "bg-primary/15 text-primary border-primary/30",
      };
    }
    // Amortização (-3): abate 100% do principal — NUNCA rotular como "Juros".
    if (installmentNumber === -3) {
      return {
        label: "Amortização",
        className: "bg-primary/15 text-primary border-primary/30",
      };
    }
    // Parcial (-1): pagamento parcial (juros-primeiro), pode ter principal.
    if (installmentNumber === -1) {
      return {
        label: "Parcial",
        className: "bg-warning/15 text-warning border-warning/30",
      };
    }
    // Juros avulso (0) ou multa/mora (-2): 100% juros.
    if (installmentNumber === 0 || installmentNumber === -2) {
      return {
        label: "Juros",
        className: "bg-warning/15 text-warning border-warning/30",
      };
    }
    return {
      label: "Pago",
      className: "bg-success/15 text-success border-success/30",
    };
  };

  const totalRows = data.rows.length;
  totalRowsRef.current = totalRows;

  const startIdx = Math.max(0, totalRows - visibleCount);
  const visibleRows = data.rows
    .slice(startIdx)
    .map((r, i) => ({ row: r, originalIdx: startIdx + i }))
    .reverse();
  const hasMore = startIdx > 0;

  const summaryItems: Array<{ label: string; value: string; valueClass?: string }> = [
    { label: "Valor Original", value: mask(formatCurrency(data.summary.original)) },
    { label: "Já Pago", value: mask(formatCurrency(data.summary.totalPaid)), valueClass: "text-success" },
    { label: "Saldo Devedor", value: mask(formatCurrency(data.summary.remaining)), valueClass: "text-warning" },
    { label: "Juros Recebidos", value: mask(formatCurrency(data.summary.interestPaid)), valueClass: "text-primary" },
    { label: "Parcelas Pagas", value: `${data.summary.paidInstallments} / ${loan.installments}` },
    { label: "Parcelas Pendentes", value: String(data.summary.pendingInstallments), valueClass: "text-warning" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl xl:max-w-6xl h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] sm:h-[92dvh] sm:max-h-[92dvh] flex flex-col overflow-hidden pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-6"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          focusWithoutScrollOnNextFrame(dialogStartRef.current);
        }}
      >
        <div ref={dialogStartRef} tabIndex={-1} className="outline-none">
        </div>
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-base sm:text-lg">
            Histórico de Pagamentos — {loan.borrowerName}
          </DialogTitle>
          <DialogDescription>
            Consulte os pagamentos registrados, composição entre principal e juros e saldo restante do contrato.
          </DialogDescription>
        </DialogHeader>

        {/* Resumo — fixo, fora da área de rolagem */}
        <div className="shrink-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 auto-rows-fr">
          {summaryItems.map((it) => (
            <Card key={it.label}>
              <CardContent className="p-3 text-center">
                <div className="text-[11px] text-muted-foreground mb-0.5 truncate">
                  {it.label}
                </div>
                <div className={`font-semibold tabular-nums text-sm ${it.valueClass ?? ""}`}>
                  {it.value}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Área rolável: apenas a lista de pagamentos */}
        <ScrollArea
          type="always"
          className="flex-1 min-h-0 mt-3 rounded-lg border border-border/50 [&>[data-radix-scroll-area-viewport]]:h-full [&>[data-radix-scroll-area-viewport]]:overscroll-contain [&>[data-radix-scroll-area-viewport]]:scroll-smooth"
        >
          <div className="px-1 pb-8">
          {/* Tabela desktop */}
          <div className="hidden md:block">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-center">Parcela</TableHead>
                  <TableHead className="text-right">Valor Parcela</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Juros</TableHead>
                  <TableHead className="text-right">Total Pago</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Forma</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>

                {data.rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-muted-foreground py-6"
                    >
                      Nenhum pagamento registrado.
                    </TableCell>
                  </TableRow>
                )}
                {visibleRows.map(({ row: r, originalIdx: idx }) => {
                  const st = statusBadge(r.installmentNumber, idx);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="tabular-nums whitespace-nowrap">
                        {formatDate(r.date)}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {r.installmentNumber <= 0
                          ? "—"
                          : `${r.installmentNumber}/${loan.installments}`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {mask(formatCurrency(r.installmentValue))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {mask(formatCurrency(r.principal))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {mask(formatCurrency(r.interest))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-success">
                        {mask(formatCurrency(r.total))}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 h-5 ${st.className}`}
                        >
                          {st.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {r.method}
                      </TableCell>
                    </TableRow>
                  );
                })}

              </TableBody>
            </Table>
          </div>

          {/* Cards mobile */}
          <div className="md:hidden space-y-2">
            {data.rows.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-6">
                Nenhum pagamento registrado.
              </p>
            )}
            {visibleRows.map(({ row: r, originalIdx: idx }) => {
              const st = statusBadge(r.installmentNumber, idx);
              return (
                <div
                  key={r.id}
                  className="rounded-lg border border-border/50 bg-card/40 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {formatDate(r.date)}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 h-5 ${st.className}`}
                    >
                      {st.label}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <div className="text-muted-foreground">Parcela</div>
                      <div className="tabular-nums font-medium">
                        {r.installmentNumber <= 0
                          ? "—"
                          : `${r.installmentNumber}/${loan.installments}`}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Valor Parcela</div>
                      <div className="tabular-nums font-medium">
                        {mask(formatCurrency(r.installmentValue))}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Principal</div>
                      <div className="tabular-nums font-medium">
                        {mask(formatCurrency(r.principal))}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Juros</div>
                      <div className="tabular-nums font-medium">
                        {mask(formatCurrency(r.interest))}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Total Pago</div>
                      <div className="tabular-nums font-semibold text-success">
                        {mask(formatCurrency(r.total))}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Forma</div>
                      <div className="font-medium truncate">{r.method}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Carregar mais / contador (com carregamento automático ao rolar) */}
          {totalRows > 0 && (
            <div ref={sentinelRef} className="flex flex-col items-center gap-1 mt-3 mb-1">
              <div className="text-[11px] text-muted-foreground">
                Exibindo {totalRows - startIdx} de {totalRows} pagamentos
              </div>
              {hasMore && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setVisibleCount((c) => Math.min(totalRows, c + PAGE_SIZE))
                  }
                >
                  Carregar mais
                </Button>
              )}
            </div>
          )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

