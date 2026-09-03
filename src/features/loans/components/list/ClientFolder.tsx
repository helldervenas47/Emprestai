import React, { useCallback, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, MessageCircle, UserCog } from "lucide-react";
import { toast } from "sonner";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Loan, Payment, InstallmentSchedule, Client, PaymentSplit } from "@/types/loan";
import type { LoanRenegotiation } from "@/types/loan";
import { rawFormatCurrency } from "@/features/loans/components/list/formatting";
import { LoanRowView } from "@/features/loans/components/list/LoanListRow";

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
  group, payments, installmentSchedules, onPayment, onPartialPayment, onFullPayment, onInterestPayment, onAmortize, onRenegotiate, renegotiations = [], onUpdate, onDelete, onDeletePayment, onSaveSchedule, readOnly = false, clients = [], commissionTotalByLoan,
}: ClientFolderProps) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);
  const activeCount = group.loans.filter((l) => l.status !== "paid").length;
  const paidCount = group.loans.filter((l) => l.status === "paid").length;
  const managerCount = group.loans.filter((l) => l.hasManager).length;

  const handleShareWhatsApp = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!captureRef.current || sharing) return;
    setSharing(true);
    try {
      // `html-to-image` foi removido do bundle (limpeza pré-Asaas). Import dinâmico
      // via CDN mantém o compartilhamento funcionando sem re-adicionar a dep npm.
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
    <Card no3d className={`overflow-hidden transition-shadow hover:shadow-lg ${open ? "ring-1 ring-primary/20" : ""} ${group.hasOverdue ? "border-destructive/40" : ""}`}>
      <button type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0 shadow-md ${group.hasOverdue ? "bg-destructive" : "gradient-primary"}`}>
          {group.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-foreground text-sm truncate">{group.name}</h3>
            {group.hasOverdue && <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">Atrasado</Badge>}
            {managerCount > 0 && (
              <Badge variant="outline" className="bg-[#009C3B]/15 text-[#009C3B] dark:bg-emerald-500/25 dark:text-emerald-300 border-[#009C3B]/60 dark:border-emerald-500/60 text-[10px] gap-0.5">
                <UserCog className="h-2.5 w-2.5" />{managerCount === group.loans.length ? "Com gerente" : `${managerCount} c/ gerente`}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="outline" className="text-[10px]">{group.loans.length}</Badge>
            {activeCount > 0 && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">{activeCount} ativos</Badge>}
            {paidCount > 0 && <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/20">{paidCount} pagos</Badge>}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs shrink-0">
          {open && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Enviar para WhatsApp"
              onClick={handleShareWhatsApp}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleShareWhatsApp(e as any); } }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] transition-colors disabled:opacity-50"
              aria-disabled={sharing}
            >
              <MessageCircle className="h-4 w-4" />
            </span>
          )}
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase">Emprestado</p>
            <p className="font-bold text-foreground">{formatCurrency(group.totalAmount)}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase">Juros a Receber</p>
            <p className="font-bold text-success">{formatCurrency(group.totalPaid)}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase">A Receber</p>
            <p className={`font-bold ${group.hasOverdue ? "text-destructive" : "text-warning"}`}>{formatCurrency(group.totalReceivable)}</p>
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <CardContent className="pt-0 pb-3 px-3 space-y-3">
          <div ref={captureRef} className="space-y-3 bg-card p-3 rounded-xl">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0 shadow-md ${group.hasOverdue ? "bg-destructive" : "gradient-primary"}`}>
                {group.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-foreground text-sm">{group.name}</h3>
                <p className="text-[10px] text-muted-foreground">{group.loans.length} empréstimo(s) · {new Date().toLocaleDateString("pt-BR")}</p>
              </div>
              <button
                type="button"
                aria-label="Enviar para WhatsApp"
                data-whatsapp-export-hidden="true"
                onClick={handleShareWhatsApp}
                disabled={sharing}
                className="sm:hidden inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] transition-colors shrink-0 disabled:opacity-50"
              >
                <MessageCircle className="h-4 w-4" />
              </button>
            </div>
            {/* Mobile summary */}
            <div className="flex sm:hidden items-center justify-between gap-2 text-xs border-b border-border/30 pb-3">
              <div className="text-center flex-1">
                <p className="text-[9px] text-muted-foreground uppercase">Emprestado</p>
                <p className="font-bold text-foreground">{formatCurrency(group.totalAmount)}</p>
              </div>
              <div className="text-center flex-1" data-whatsapp-export-hidden="true">
                <p className="text-[9px] text-muted-foreground uppercase">Juros a Receber</p>
                <p className="font-bold text-success">{formatCurrency(group.totalPaid)}</p>
              </div>
              <div className="text-center flex-1">
                <p className="text-[9px] text-muted-foreground uppercase">A Receber</p>
                <p className={`font-bold ${group.hasOverdue ? "text-destructive" : "text-warning"}`}>{formatCurrency(group.totalReceivable)}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-border/30 overflow-hidden shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="px-1.5 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground">Cliente</th>
                    <th className="hidden sm:table-cell px-1.5 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground">Status</th>
                    <th className="hidden sm:table-cell px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Emprestado</th>
                    <th className="px-1.5 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground">Restante</th>
                    <th className="hidden sm:table-cell px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Parcelas</th>
                    <th className="px-1.5 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground">Venc.</th>
                    <th className="hidden sm:table-cell px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Etiquetas</th>
                    <th className="hidden sm:table-cell px-4 py-2.5 text-right text-xs font-medium text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  {group.loans.map((loan) => (
                    <LoanRowView key={loan.id} loan={loan} payments={payments} installmentSchedules={installmentSchedules} readOnly={readOnly} existingTags={[...new Set(group.loans.flatMap(l => l.tags || []))]} clients={clients} renegotiations={renegotiations.filter((r) => r.loanId === loan.id)} managerCommissionTotal={commissionTotalByLoan?.get(loan.id) || 0} hideQuickNotes
                      onPayment={(date, mid, split) => onPayment(loan.id, date, mid, split)} onPartialPayment={(amt, date, mid, split) => onPartialPayment(loan.id, amt, date, mid, split)} onFullPayment={onFullPayment ? (date, custom, mid, split) => onFullPayment(loan.id, date, custom, mid, split) : undefined}
                      onInterestPayment={(date, custom, fees, mid, split, opts) => onInterestPayment(loan.id, date, custom, fees, mid, split, opts)} onAmortize={onAmortize ? (amt, date, mid, split) => onAmortize(loan.id, amt, date, mid, split) : undefined} onRenegotiate={onRenegotiate ? (params) => onRenegotiate(loan.id, params) : undefined} onUpdate={(d) => onUpdate(loan.id, d)} onDelete={() => onDelete(loan.id)} onDeletePayment={onDeletePayment} onSaveSchedule={onSaveSchedule} />
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
