import React, { useCallback, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, MessageCircle, UserCog, Folder, FolderOpen, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Loan, Payment, InstallmentSchedule, Client, PaymentSplit } from "@/types/loan";
import type { LoanRenegotiation } from "@/types/loan";
import { rawFormatCurrency } from "@/features/loans/components/list/formatting";
import { LoanRowView } from "@/features/loans/components/list/LoanListRow";
import { LoanListMiniCard } from "@/features/loans/components/list/LoanListMiniCard";

export interface ClientGroup {
  name: string;
  loans: Loan[];
  totalAmount: number;
  totalPaid: number;
  totalReceivable: number;
  hasOverdue: boolean;
}

export interface ClientFolderProps {
  group: ClientGroup;
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  onPayment: (id: string, date?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onPartialPayment: (id: string, amount: number, date?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onFullPayment?: (id: string, date?: string, customAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onInterestPayment: (id: string, date?: string, customAmount?: number, feesAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null, options?: { partial?: boolean; notes?: string | null }) => void;
  onAmortize?: (loanId: string, amount: number, paymentDate?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => Promise<void> | void;
  onRenegotiate?: (loanId: string, params: { type: "no_interest" | "with_penalty"; penaltyMode?: "fixed" | "percentage" | null; penaltyInput?: number | null; penaltyDistribution?: "diluted" | "first" | null; newInstallments?: number | null; notes?: string | null; selectedInstallmentNumbers?: number[] | null; firstDueDate?: string | null }) => Promise<void> | void;
  renegotiations?: LoanRenegotiation[];
  onUpdate: (id: string, data: Partial<Omit<Loan, "id">>) => void;
  onDelete: (id: string) => void;
  onDeletePayment: (paymentId: string) => void;
  onSaveSchedule: (loanId: string, rows: { installmentNumber: number; dueDate: string; amount: number }[]) => Promise<void>;
  readOnly?: boolean;
  clients?: Client[];
  commissionTotalByLoan?: Map<string, number>;
}

export function ClientFolder({
  group,
  payments,
  installmentSchedules,
  onPayment,
  onPartialPayment,
  onFullPayment,
  onInterestPayment,
  onAmortize,
  onRenegotiate,
  renegotiations = [],
  onUpdate,
  onDelete,
  onDeletePayment,
  onSaveSchedule,
  readOnly = false,
  clients = [],
  commissionTotalByLoan,
}: ClientFolderProps) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  const activeCount = group.loans.filter((l) => l.status !== "paid").length;
  const paidCount = group.loans.filter((l) => l.status === "paid").length;
  const managerCount = group.loans.filter((l) => l.hasManager).length;
  const existingTags = [...new Set(group.loans.flatMap((l) => l.tags || []))];

  const handleShareWhatsApp = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!captureRef.current || sharing) return;
    setSharing(true);
    try {
      const mod: any = await import(/* @vite-ignore */ ("https://esm.sh/html-to-image@1.11.13" as string));
      const toBlob = mod.toBlob as (
        node: HTMLElement,
        opts?: Record<string, unknown>,
      ) => Promise<Blob | null>;
      const original = captureRef.current;

      const hiddenNodes = Array.from(
        original.querySelectorAll<HTMLElement>('[data-whatsapp-export-hidden="true"]')
      );
      const previousDisplay = hiddenNodes.map((n) => n.style.display);
      hiddenNodes.forEach((n) => {
        n.style.display = "none";
      });

      let blob: Blob | null = null;
      try {
        blob = await toBlob(original, {
          pixelRatio: 2,
          backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
          cacheBust: true,
          width: original.scrollWidth,
          height: original.scrollHeight,
        });
      } finally {
        hiddenNodes.forEach((n, i) => {
          n.style.display = previousDisplay[i];
        });
      }

      if (!blob) throw new Error("Falha ao gerar imagem");
      const file = new File([blob], `emprestimos-${group.name.replace(/\s+/g, "-").toLowerCase()}.png`, { type: "image/png" });
      const text = `Empréstimos de ${group.name}`;
      const nav = navigator as any;
      if (nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: text, text });
          return;
        } catch (err: any) {
          if (err?.name === "AbortError") return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      window.open(`https://wa.me/?text=${encodeURIComponent(text + " (imagem baixada — anexe no WhatsApp)")}`, "_blank");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao gerar imagem");
    } finally {
      setSharing(false);
    }
  };

  return (
    <Card
      no3d
      className={`overflow-hidden transition-all duration-200 rounded-2xl ${
        open
          ? "ring-2 ring-primary/20 shadow-md border-primary/30"
          : "hover:shadow-md border-border/60 hover:border-primary/30"
      } ${group.hasOverdue ? "border-destructive/30 bg-destructive/[0.015]" : "bg-card/90"}`}
    >
      {/* Botão de expansão do Card (Pasta) */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left p-3 sm:p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors hover:bg-muted/20"
        aria-expanded={open}
        aria-label={`${open ? "Recolher" : "Expandir"} pasta de empréstimos de ${group.name}`}
      >
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Avatar / Ícone de Pasta */}
          <div
            className={`h-11 w-11 sm:h-12 sm:w-12 rounded-2xl flex items-center justify-center font-bold text-sm sm:text-base shrink-0 shadow-sm transition-transform ${
              group.hasOverdue
                ? "bg-destructive text-destructive-foreground shadow-destructive/20"
                : "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-primary/20"
            }`}
          >
            {group.name.charAt(0).toUpperCase()}
          </div>

          {/* Dados do Cliente e Badges */}
          <div className="flex-1 min-w-0">
            {/* Linha 1: Nome + Badges de Status */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <h3 className="font-bold text-foreground text-sm sm:text-base truncate leading-snug">
                {group.name}
              </h3>
              {group.hasOverdue && (
                <Badge
                  variant="destructive"
                  className="bg-destructive/15 text-destructive hover:bg-destructive/20 border-destructive/30 text-[10px] font-bold px-1.5 py-0 uppercase tracking-wider h-5"
                >
                  Atrasado
                </Badge>
              )}
              {managerCount > 0 && (
                <Badge
                  variant="outline"
                  className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-semibold px-1.5 py-0 gap-1 h-5"
                >
                  <UserCog className="h-2.5 w-2.5" />
                  {managerCount === group.loans.length ? "Com gerente" : `${managerCount} c/ gerente`}
                </Badge>
              )}
            </div>

            {/* Linha 2: Contadores de Contratos */}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-muted/70 text-muted-foreground border border-border/40">
                {group.loans.length} {group.loans.length === 1 ? "empréstimo" : "empréstimos"}
              </span>
              {activeCount > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                  {activeCount} {activeCount === 1 ? "ativo" : "ativos"}
                </span>
              )}
              {paidCount > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {paidCount} {paidCount === 1 ? "quitado" : "quitados"}
                </span>
              )}
            </div>
          </div>

          {/* Lado Direito: Mobile (Resumo Rápido A Receber) */}
          <div className="flex sm:hidden items-center gap-2 shrink-0">
            <div className="text-right">
              <p className="text-[9px] text-muted-foreground uppercase font-semibold tracking-wider">A receber</p>
              <p
                className={`font-bold text-xs tabular-nums ${
                  group.hasOverdue ? "text-destructive" : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {formatCurrency(group.totalReceivable)}
              </p>
            </div>
            <div className="w-6 h-6 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
              <ChevronRight
                className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-90 text-primary" : ""}`}
              />
            </div>
          </div>

          {/* Lado Direito: Desktop / Tablet (3 Colunas Financeiras + Ações) */}
          <div className="hidden sm:flex items-center gap-4 text-xs shrink-0">
            <div className="text-right pl-2">
              <p className="text-[10px] text-muted-foreground uppercase font-medium tracking-wider">Emprestado</p>
              <p className="font-semibold text-foreground text-sm tabular-nums mt-0.5">
                {formatCurrency(group.totalAmount)}
              </p>
            </div>
            <div className="text-right pl-2">
              <p className="text-[10px] text-muted-foreground uppercase font-medium tracking-wider">Juros a Receber</p>
              <p className="font-semibold text-emerald-600 dark:text-emerald-400 text-sm tabular-nums mt-0.5">
                {formatCurrency(group.totalPaid)}
              </p>
            </div>
            <div className="text-right pl-2">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">A Receber</p>
              <p
                className={`font-bold text-sm tabular-nums mt-0.5 ${
                  group.hasOverdue ? "text-destructive" : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {formatCurrency(group.totalReceivable)}
              </p>
            </div>

            {open && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Enviar extrato para WhatsApp"
                onClick={handleShareWhatsApp}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleShareWhatsApp(e as any);
                  }
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition-colors ml-1"
                aria-disabled={sharing}
              >
                <MessageCircle className="h-4 w-4" />
              </span>
            )}

            <div className="w-7 h-7 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground ml-1">
              <ChevronRight
                className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-90 text-primary" : ""}`}
              />
            </div>
          </div>
        </div>
      </button>

      {/* Conteúdo Expandido da Pasta */}
      {open && (
        <CardContent className="pt-0 pb-4 px-3 sm:px-4 space-y-3">
          <div ref={captureRef} className="space-y-3 bg-muted/30 dark:bg-white/[0.02] p-3 sm:p-4 rounded-2xl border border-border/40">
            {/* Header Interno do Extrato */}
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-border/40">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                  <FolderOpen className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="font-bold text-foreground text-sm leading-tight">{group.name}</h4>
                  <p className="text-[11px] text-muted-foreground">
                    {group.loans.length} contrato(s) vinculados · Atualizado em {new Date().toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>

              <button
                type="button"
                aria-label="Exportar para WhatsApp"
                data-whatsapp-export-hidden="true"
                onClick={handleShareWhatsApp}
                disabled={sharing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 font-semibold text-xs transition-colors shrink-0 disabled:opacity-50"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Compartilhar WhatsApp</span>
                <span className="sm:hidden">WhatsApp</span>
              </button>
            </div>

            {/* Painel com Métricas Consolidadas */}
            <div className="grid grid-cols-3 gap-2 py-1">
              <div className="p-2.5 rounded-xl bg-card border border-border/40 text-center">
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Emprestado</p>
                <p className="font-bold text-foreground text-xs sm:text-sm tabular-nums mt-0.5">
                  {formatCurrency(group.totalAmount)}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-card border border-border/40 text-center" data-whatsapp-export-hidden="true">
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Juros a Receber</p>
                <p className="font-bold text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm tabular-nums mt-0.5">
                  {formatCurrency(group.totalPaid)}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-card border border-border/40 text-center">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">A Receber</p>
                <p
                  className={`font-bold text-xs sm:text-sm tabular-nums mt-0.5 ${
                    group.hasOverdue ? "text-destructive" : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {formatCurrency(group.totalReceivable)}
                </p>
              </div>
            </div>

            {/* Mobile: Exibição em Cards Interativos (LoanListMiniCard) */}
            <div className="sm:hidden space-y-2.5 pt-1">
              {group.loans.map((loan) => (
                <LoanListMiniCard
                  key={loan.id}
                  loan={loan}
                  payments={payments}
                  installmentSchedules={installmentSchedules}
                  readOnly={readOnly}
                  clients={clients}
                  renegotiations={renegotiations.filter((r) => r.loanId === loan.id)}
                  existingTags={existingTags}
                  onPayment={(date, mid, split) => onPayment(loan.id, date, mid, split)}
                  onPartialPayment={(amt, date, mid, split) => onPartialPayment(loan.id, amt, date, mid, split)}
                  onFullPayment={
                    onFullPayment
                      ? (date, custom, mid, split) => onFullPayment(loan.id, date, custom, mid, split)
                      : undefined
                  }
                  onInterestPayment={(date, custom, fees, mid, split, opts) =>
                    onInterestPayment(loan.id, date, custom, fees, mid, split, opts)
                  }
                  onAmortize={onAmortize ? (amt, date, mid, split) => onAmortize(loan.id, amt, date, mid, split) : undefined}
                  onRenegotiate={onRenegotiate ? (params) => onRenegotiate(loan.id, params) : undefined}
                  onUpdate={(d) => onUpdate(loan.id, d)}
                  onDelete={() => onDelete(loan.id)}
                  onDeletePayment={onDeletePayment}
                  onSaveSchedule={onSaveSchedule}
                />
              ))}
            </div>

            {/* Desktop / Tablet: Tabela Completa */}
            <div className="hidden sm:block rounded-2xl border border-border/40 overflow-hidden bg-card shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/40 text-xs font-semibold text-muted-foreground">
                    <th className="px-4 py-3 text-left">Cliente / Contrato</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Emprestado</th>
                    <th className="px-4 py-3 text-left">Restante</th>
                    <th className="px-4 py-3 text-left">Parcelas</th>
                    <th className="px-4 py-3 text-left">Vencimento</th>
                    <th className="px-4 py-3 text-left">Etiquetas</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {group.loans.map((loan) => (
                    <LoanRowView
                      key={loan.id}
                      loan={loan}
                      payments={payments}
                      installmentSchedules={installmentSchedules}
                      readOnly={readOnly}
                      existingTags={existingTags}
                      clients={clients}
                      renegotiations={renegotiations.filter((r) => r.loanId === loan.id)}
                      managerCommissionTotal={commissionTotalByLoan?.get(loan.id) || 0}
                      hideQuickNotes
                      onPayment={(date, mid, split) => onPayment(loan.id, date, mid, split)}
                      onPartialPayment={(amt, date, mid, split) => onPartialPayment(loan.id, amt, date, mid, split)}
                      onFullPayment={
                        onFullPayment
                          ? (date, custom, mid, split) => onFullPayment(loan.id, date, custom, mid, split)
                          : undefined
                      }
                      onInterestPayment={(date, custom, fees, mid, split, opts) =>
                        onInterestPayment(loan.id, date, custom, fees, mid, split, opts)
                      }
                      onAmortize={onAmortize ? (amt, date, mid, split) => onAmortize(loan.id, amt, date, mid, split) : undefined}
                      onRenegotiate={onRenegotiate ? (params) => onRenegotiate(loan.id, params) : undefined}
                      onUpdate={(d) => onUpdate(loan.id, d)}
                      onDelete={() => onDelete(loan.id)}
                      onDeletePayment={onDeletePayment}
                      onSaveSchedule={onSaveSchedule}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

