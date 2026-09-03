import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useManagerCommissions } from "@/features/payroll/hooks/useManagerCommissions";
import {
  buildPaidCommissionEntries,
  getCommissionConfig,
  getDerivedPaymentCommission,
  roundCommission99,
} from "@/features/payroll/lib/managerCommissionsCore";
import { Client, Loan, InstallmentSchedule, Payment, ManagerCommission } from "@/types/loan";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Briefcase, UserCog, CalendarDays, Check, CheckCircle2, Clock, Pencil, Tag, TrendingUp } from "lucide-react";
import { ManagerCommissionsYearlyDialog } from "./ManagerCommissionsYearlyDialog";

const MANAGER_FILTER_STORAGE_KEY = "manager-commissions-visible-managers";

interface Props {
  clients: Client[];
  loans?: Loan[];
  installmentSchedules?: InstallmentSchedule[];
  payments?: Payment[];
  range?: { start: Date; end: Date };
  rangeLabel?: string;
}

interface DetailItem {
  key: string;
  label: string;
  paidDate?: string;
  dueDate?: string;
  commission: number;
  isPaid: boolean;
  inPeriod: boolean;
}

function rawFormatCurrency(v: number) {
  const adjusted = roundCommission99(v);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(adjusted);
}

function inRange(dateStr: string, start: Date, end: Date) {
  const d = new Date(dateStr + "T00:00:00");
  return d >= start && d <= end;
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr.length > 10 ? dateStr : dateStr + "T00:00:00").toLocaleDateString("pt-BR");
  } catch {
    return dateStr;
  }
}

function resolveLoanManagerId(loan: Loan, managers: Client[]) {
  if (!loan.hasManager) return null;
  if (loan.managerId) return loan.managerId;
  if (loan.borrowerId && managers.some((manager) => manager.id === loan.borrowerId)) {
    return loan.borrowerId;
  }
  const borrowerName = loan.borrowerName?.trim().toLocaleLowerCase("pt-BR");
  if (!borrowerName) return null;
  const matchedManager = managers.find(
    (manager) => manager.name.trim().toLocaleLowerCase("pt-BR") === borrowerName
  );
  return matchedManager?.id ?? null;
}

function isLegacyInterestPayment(loan: Loan, payment: Payment) {
  return payment.installmentNumber === 0 || (payment.installmentNumber === -1 && loan.installments === 1);
}


export function ManagerCommissionsChart({
  clients,
  loans = [],
  installmentSchedules = [],
  payments = [],
  range,
  rangeLabel,
}: Props) {
  const { commissions } = useManagerCommissions(true);
  const { mask } = useHideValues();
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  const [yearlyOpen, setYearlyOpen] = useState(false);
  const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = window.localStorage.getItem(MANAGER_FILTER_STORAGE_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
    } catch {
      return [];
    }
  });
  const [managerFilterOpen, setManagerFilterOpen] = useState(false);

  const managers = useMemo(
    () => clients.filter((c) => c.isManager && c.active !== false).sort((a, b) => a.name.localeCompare(b.name)),
    [clients]
  );

  const data = useMemo(() => {
    const byManager: Record<string, { paid: number; projected: number }> = {};
    const loanIdsByManager: Record<string, Set<string>> = {};
    const nameById = new Map<string, string>(clients.map((c) => [c.id, c.name]));

    const ensureManagerBucket = (managerId: string) => {
      if (!byManager[managerId]) byManager[managerId] = { paid: 0, projected: 0 };
      if (!loanIdsByManager[managerId]) loanIdsByManager[managerId] = new Set<string>();
    };

    managers.forEach((m) => ensureManagerBucket(m.id));

    // Pago: fonte única de verdade (registradas + derivadas), imutável no histórico.
    const paidEntries = buildPaidCommissionEntries({ clients, loans, payments, commissions });
    paidEntries.forEach((entry) => {
      if (range && !inRange(entry.date, range.start, range.end)) return;
      ensureManagerBucket(entry.managerId);
      byManager[entry.managerId].paid += entry.amount;
      loanIdsByManager[entry.managerId].add(entry.loanId);
    });

    // Pendente/projeção: somente contratos abertos de gerentes ativos.
    const managedLoans = loans
      .map((loan) => ({ loan, resolvedManagerId: resolveLoanManagerId(loan, managers) }))
      .filter(({ loan, resolvedManagerId }) => loan.hasManager && !!resolvedManagerId);
    const activeManagedLoans = managedLoans.filter(({ loan }) => loan.status !== "paid");

    if (range) {
      activeManagedLoans.forEach(({ loan: l, resolvedManagerId }) => {
        const id = resolvedManagerId!;
        ensureManagerBucket(id);
        const { perInstallment } = getCommissionConfig(l);

        const schedules = installmentSchedules.filter((s) => s.loanId === l.id);
        const paidNums = new Set(
          payments.filter((p) => p.loanId === l.id && p.installmentNumber > 0).map((p) => p.installmentNumber)
        );

        let countedThisLoan = false;

        if (schedules.length === 0) {
          if (!paidNums.has(1) && inRange(l.dueDate, range.start, range.end)) {
            byManager[id].projected += perInstallment;
            countedThisLoan = true;
          }
        } else {
          schedules.forEach((s) => {
            if (paidNums.has(s.installmentNumber)) return;
            if (!inRange(s.dueDate, range.start, range.end)) return;
            byManager[id].projected += perInstallment;
            countedThisLoan = true;
          });
        }

        if (countedThisLoan) loanIdsByManager[id].add(l.id);
      });
    } else {
      activeManagedLoans.forEach(({ loan: l, resolvedManagerId }) => {
        const id = resolvedManagerId!;
        ensureManagerBucket(id);
        byManager[id].projected += getCommissionConfig(l).totalCommission;
        loanIdsByManager[id].add(l.id);
      });
    }

    return Object.entries(byManager)
      .map(([id, v]) => {
        const paid = roundCommission99(v.paid);
        const projected = roundCommission99(v.projected);
        return {
          id,
          name: nameById.get(id) ?? "",
          paid,
          projected,
          loanCount: loanIdsByManager[id]?.size ?? 0,
          total: roundCommission99(paid + projected),
        };
      })
      .filter((m) => m.name.trim().length > 0 && (m.paid > 0 || m.projected > 0 || managers.some((mg) => mg.id === m.id)))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  }, [commissions, loans, managers, clients, range, installmentSchedules, payments]);


  const filteredData = useMemo(() => {
    if (selectedManagerIds.length === 0) return data;
    const selectedSet = new Set(selectedManagerIds);
    return data.filter((item) => selectedSet.has(item.id));
  }, [data, selectedManagerIds]);

  useEffect(() => {
    const validManagerIds = new Set(managers.map((manager) => manager.id));
    setSelectedManagerIds((current) => {
      const filtered = current.filter((id) => validManagerIds.has(id));
      return filtered.length === current.length ? current : filtered;
    });
  }, [managers]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MANAGER_FILTER_STORAGE_KEY, JSON.stringify(selectedManagerIds));
  }, [selectedManagerIds]);

  const totalPaid = roundCommission99(filteredData.reduce((s, d) => s + d.paid, 0));
  const totalProjected = roundCommission99(filteredData.reduce((s, d) => s + d.projected, 0));
  const totalGeneral = roundCommission99(totalPaid + totalProjected);
  const filterLabel = selectedManagerIds.length === 0
    ? "Todos os gerentes"
    : selectedManagerIds.length === 1
      ? managers.find((manager) => manager.id === selectedManagerIds[0])?.name ?? "1 gerente"
      : `${selectedManagerIds.length} gerentes`;

  const toggleManagerFilter = (managerId: string) => {
    setSelectedManagerIds((current) => current.includes(managerId)
      ? current.filter((id) => id !== managerId)
      : [...current, managerId]
    );
  };

  return (
    <Card no3d>
      <CardContent className="p-3 sm:p-6">
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex flex-col items-center text-center gap-3 sm:flex-row sm:items-center sm:justify-between sm:text-left sm:gap-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Briefcase className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="flex items-center justify-center gap-2 sm:justify-start">
                  <h3 className="text-sm font-semibold text-foreground">Comissões por gerente</h3>
                  <Popover open={managerFilterOpen} onOpenChange={setManagerFilterOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-md"
                        aria-label="Editar gerentes exibidos"
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar gerente..." />
                        <CommandList>
                          <CommandEmpty>Nenhum gerente encontrado.</CommandEmpty>
                          <CommandGroup>
                            {managers.map((manager) => {
                              const isSelected = selectedManagerIds.includes(manager.id);
                              return (
                                <CommandItem key={manager.id} value={manager.name} onSelect={() => toggleManagerFilter(manager.id)}>
                                  <Check className={`mr-2 h-4 w-4 ${isSelected ? "opacity-100 text-primary" : "opacity-0"}`} />
                                  <span className="flex-1 truncate">{manager.name}</span>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                      {selectedManagerIds.length > 0 ? (
                        <div className="border-t border-border p-2">
                          <Button variant="ghost" size="sm" className="w-full" onClick={() => setSelectedManagerIds([])}>
                            Limpar seleção
                          </Button>
                        </div>
                      ) : null}
                    </PopoverContent>
                  </Popover>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">Acompanhe o total pago e pendente das comissões por gerente</p>
                <p className="text-[10px] text-muted-foreground">Exibindo: {filterLabel}{rangeLabel ? ` • ${rangeLabel}` : ""}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto sm:gap-4">
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:inline-flex h-8 text-xs gap-1.5 shrink-0"
                onClick={() => setYearlyOpen(true)}
              >
                <TrendingUp className="h-3.5 w-3.5" />
                Ver evolução anual
              </Button>
              <div className="grid grid-cols-3 gap-2 w-full sm:w-auto sm:flex sm:gap-6">
                <div className="rounded-md bg-muted/40 sm:bg-transparent px-2 py-1 sm:p-0 text-center sm:text-right">
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase leading-tight">Pendente</p>
                  <p className="text-xs sm:text-sm font-bold text-primary leading-tight">{mask(rawFormatCurrency(totalProjected))}</p>
                </div>
                <div className="rounded-md bg-muted/40 sm:bg-transparent px-2 py-1 sm:p-0 text-center sm:text-right">
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase leading-tight">Pago</p>
                  <p className="text-xs sm:text-sm font-bold text-success leading-tight">{mask(rawFormatCurrency(totalPaid))}</p>
                </div>
                <div className="rounded-md bg-muted/40 sm:bg-transparent px-2 py-1 sm:p-0 text-center sm:text-right">
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase leading-tight">Total</p>
                  <p className="text-xs sm:text-sm font-bold text-foreground leading-tight">{mask(rawFormatCurrency(totalGeneral))}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-center sm:hidden">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => setYearlyOpen(true)}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Ver evolução anual
            </Button>
          </div>
        </div>



        {filteredData.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            {data.length === 0
              ? 'Nenhum gerente cadastrado. Marque um cliente como "Gerente" para acompanhar as comissões aqui.'
              : "Nenhum gerente corresponde ao filtro selecionado."}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
            {filteredData.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedManagerId(m.id)}
                className="rounded-lg border border-border bg-card/50 hover:bg-card hover:border-primary/40 hover:shadow-sm transition-all p-2.5 sm:p-4 flex flex-col items-center text-center gap-2 sm:gap-3 sm:items-stretch sm:text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                  <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-md bg-[#009C3B]/15 dark:bg-emerald-500/25 flex items-center justify-center shrink-0">
                    <UserCog className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#009C3B] dark:text-emerald-300" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-foreground leading-tight break-words sm:truncate" title={m.name}>
                      {m.name}
                    </p>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight mt-0.5">
                      {m.loanCount} {m.loanCount === 1 ? "contrato" : "contratos"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-1.5 sm:gap-2 w-full sm:items-stretch">
                  <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Pendente</span>
                    <span className="text-xs sm:text-sm font-semibold text-primary break-all sm:break-normal">
                      {mask(rawFormatCurrency(m.projected))}
                    </span>
                  </div>
                  <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Pago</span>
                    <span className="text-xs sm:text-sm font-semibold text-success break-all sm:break-normal">
                      {mask(rawFormatCurrency(m.paid))}
                    </span>
                  </div>
                  <div className="border-t border-border w-full my-0.5 sm:my-1" />
                  <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-[10px] sm:text-xs font-medium text-foreground leading-tight">Total geral</span>
                    <span className="text-sm sm:text-base font-bold text-foreground break-all sm:break-normal">
                      {mask(rawFormatCurrency(m.total))}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-3 italic text-center">
          Pago = comissões registradas ou derivadas de juros/quitações pagos no período. Pendente = parcelas com vencimento no período ainda não pagas. Toque em um gerente para ver os detalhes.
        </p>
      </CardContent>

      <ManagerDetailDialog
        open={!!selectedManagerId}
        onClose={() => setSelectedManagerId(null)}
        manager={managers.find((c) => c.id === selectedManagerId) ?? null}
        loans={loans}
        installmentSchedules={installmentSchedules}
        payments={payments}
        commissions={commissions}
        range={range}
        rangeLabel={rangeLabel}
        mask={mask}
      />
      <ManagerCommissionsYearlyDialog
        open={yearlyOpen}
        onClose={() => setYearlyOpen(false)}
        clients={clients}
        loans={loans}
        payments={payments}
        installmentSchedules={installmentSchedules}
      />
    </Card>
  );
}

interface DetailDialogProps {
  open: boolean;
  onClose: () => void;
  manager: Client | null;
  loans: Loan[];
  installmentSchedules: InstallmentSchedule[];
  payments: Payment[];
  commissions: ManagerCommission[];
  range?: { start: Date; end: Date };
  rangeLabel?: string;
  mask: (s: string) => string;
}

function ManagerDetailDialog({
  open,
  onClose,
  manager,
  loans,
  installmentSchedules,
  payments,
  commissions,
  range,
  rangeLabel,
  mask,
}: DetailDialogProps) {
  const detail = useMemo(() => {
    if (!manager) return null;

    const managerLoans = loans.filter((l) => l.hasManager && resolveLoanManagerId(l, [manager]) === manager.id);

    const managerCommissions = commissions.filter((c) => c.managerId === manager.id);
    const commissionByPaymentId = new Map<string, ManagerCommission>();
    const standaloneCommissionsByLoan = new Map<string, ManagerCommission[]>();

    managerCommissions.forEach((c) => {
      if (c.paymentId) {
        commissionByPaymentId.set(c.paymentId, c);
      } else {
        const arr = standaloneCommissionsByLoan.get(c.loanId) ?? [];
        arr.push(c);
        standaloneCommissionsByLoan.set(c.loanId, arr);
      }
    });

    const loansBreakdown = managerLoans.map((l) => {
      const { rate, totalCommission, perInstallment } = getCommissionConfig(l);

      const savedSchedules = installmentSchedules
        .filter((s) => s.loanId === l.id)
        .sort((a, b) => a.installmentNumber - b.installmentNumber);

      const schedules = savedSchedules.length > 0
        ? savedSchedules
        : [{
            loanId: l.id,
            installmentNumber: Math.min(Math.max(1, l.paidInstallments + 1), Math.max(1, l.installments)),
            dueDate: l.dueDate,
            amount: perInstallment,
          }];

      const loanPayments = payments.filter((p) => p.loanId === l.id);
      const paidInstallmentNumbers = new Set<number>();
      const processedDerivedInstallments = new Set<number>();

      const paidItems: DetailItem[] = loanPayments.reduce<DetailItem[]>((acc, p) => {
        const recordedCommission = commissionByPaymentId.get(p.id);
        
        // Se não houver registro formal, derivamos, mas evitamos duplicar por número de parcela
        if (!recordedCommission) {
          if (processedDerivedInstallments.has(p.installmentNumber)) return acc;
          processedDerivedInstallments.add(p.installmentNumber);
        }

        const commissionAmount = recordedCommission?.amount ?? getDerivedPaymentCommission(l, p);
        if (commissionAmount <= 0) return acc;

        if (p.installmentNumber > 0) paidInstallmentNumbers.add(p.installmentNumber);

        const refDate = recordedCommission?.generatedAt ?? p.date;

        acc.push({
          key: p.id,
          label: p.installmentNumber > 0
            ? `Parcela #${p.installmentNumber}`
            : isLegacyInterestPayment(l, p)
              ? (p.installmentNumber === 0 ? "Juros" : "Juros (legado)")
              : "Pagamento",
          paidDate: refDate,
          commission: commissionAmount,
          isPaid: true,
          inPeriod: range ? inRange(refDate, range.start, range.end) : true,
        });

        return acc;
      }, []);

      // Comissões avulsas (sem paymentId) registradas para este empréstimo
      const standalone = standaloneCommissionsByLoan.get(l.id) ?? [];
      standalone.forEach((c) => {
        paidItems.push({
          key: `commission-${c.id}`,
          label: c.commissionType === "full" ? "Comissão integral" : "Comissão de juros",
          paidDate: c.generatedAt,
          commission: c.amount,
          isPaid: true,
          inPeriod: range ? inRange(c.generatedAt, range.start, range.end) : true,
        });
      });

      const pendingItems: DetailItem[] = l.status === "paid"
        ? []
        : schedules
            .filter((s) => !paidInstallmentNumbers.has(s.installmentNumber))
            .map((s) => ({
              key: `${l.id}-${s.installmentNumber}`,
              label: `Parcela #${s.installmentNumber}`,
              dueDate: s.dueDate,
              commission: perInstallment,
              isPaid: false,
              inPeriod: range ? inRange(s.dueDate, range.start, range.end) : true,
            }));

      const paidInPeriod = paidItems.filter((i) => i.inPeriod);
      const pendingInPeriod = pendingItems.filter((i) => i.inPeriod);

      const paidAmount = paidInPeriod.reduce((s, i) => s + i.commission, 0);
      const pendingAmount = pendingInPeriod.reduce((s, i) => s + i.commission, 0);
      const items = [...paidInPeriod, ...pendingInPeriod].sort((a, b) => {
        const dateA = a.dueDate ?? a.paidDate ?? "";
        const dateB = b.dueDate ?? b.paidDate ?? "";
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA.localeCompare(dateB);
      });

      return {
        loan: l,
        rate,
        totalCommission,
        perInstallment,
        items,
        paidAmount,
        pendingAmount,
        relevant: paidInPeriod.length > 0 || pendingInPeriod.length > 0,
      };
    });

    const visible = loansBreakdown.filter((b) => b.relevant).sort((a, b) => {
      const firstA = a.items[0];
      const firstB = b.items[0];
      const dateA = firstA?.dueDate ?? firstA?.paidDate ?? "";
      const dateB = firstB?.dueDate ?? firstB?.paidDate ?? "";
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateA.localeCompare(dateB);
    });
    const totalPaid = visible.reduce((s, b) => s + b.paidAmount, 0);
    const totalPending = visible.reduce((s, b) => s + b.pendingAmount, 0);

    return { visible, totalPaid, totalPending };
  }, [manager, loans, installmentSchedules, payments, commissions, range]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-[#009C3B] dark:text-emerald-300" />
            {manager?.name ?? "Gerente"}
          </DialogTitle>
          <DialogDescription>
            Detalhamento das comissões{rangeLabel ? ` — ${rangeLabel}` : ""}
          </DialogDescription>
        </DialogHeader>

        {detail && (
          <ScrollArea className="flex-1 max-h-[70vh] overflow-y-auto pr-3 -mr-3">
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md bg-muted/40 p-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Pendente</p>
                  <p className="text-sm font-bold text-primary">{mask(rawFormatCurrency(detail.totalPending))}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Pago</p>
                  <p className="text-sm font-bold text-success">{mask(rawFormatCurrency(detail.totalPaid))}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Total</p>
                  <p className="text-sm font-bold text-foreground">{mask(rawFormatCurrency(detail.totalPaid + detail.totalPending))}</p>
                </div>
              </div>

              {detail.visible.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhum empréstimo com movimentação de comissão neste período.
                </p>
              ) : (
                <div className="space-y-3">
                  {detail.visible.map(({ loan, rate, totalCommission, perInstallment, items, paidAmount, pendingAmount }) => (
                    <div key={loan.id} className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-semibold text-foreground">{loan.borrowerName}</p>
                            {loan.tags && loan.tags.length > 0 && loan.tags.map((tag) => (
                              <Badge key={tag} className="bg-primary text-primary-foreground text-[10px] gap-0.5 px-1.5 py-0">
                                <Tag className="h-2.5 w-2.5" />{tag}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Empréstimo: {mask(rawFormatCurrency(loan.amount))} · {loan.installments}x · Comissão: {rate}%
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Total da comissão: {mask(rawFormatCurrency(totalCommission))} · Por parcela: {mask(rawFormatCurrency(perInstallment))}
                          </p>
                        </div>
                        <div className="text-right text-[11px] space-y-0.5">
                          <div className="text-success font-semibold">+ {mask(rawFormatCurrency(paidAmount))} pago</div>
                          <div className="text-primary font-semibold">+ {mask(rawFormatCurrency(pendingAmount))} pendente</div>
                        </div>
                      </div>

                      <div className="border-t border-border pt-2">
                        <p className="text-[10px] uppercase text-muted-foreground mb-1">Movimentações no período</p>
                        <div className="space-y-1">
                          {items.map((item) => (
                            <div key={item.key} className="flex items-center justify-between text-xs gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {item.isPaid ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                                ) : (
                                  <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                                )}
                                <span className="font-medium">{item.label}</span>
                                {item.isPaid ? (
                                  <span className="text-muted-foreground flex items-center gap-1">
                                    <CalendarDays className="h-3 w-3" />
                                    Pago em {formatDate(item.paidDate)}
                                  </span>
                                ) : (() => {
                                  const dueDate = item.dueDate ? new Date(item.dueDate + "T00:00:00") : null;
                                  const today = new Date(); today.setHours(0,0,0,0);
                                  const isOverdue = dueDate && dueDate < today;
                                  const isToday = dueDate && dueDate.getTime() === today.getTime();
                                  const cls = isOverdue
                                    ? "bg-destructive/15 text-destructive border-destructive/30"
                                    : isToday
                                      ? "bg-warning/15 text-warning border-warning/30"
                                      : "bg-primary/10 text-primary border-primary/30";
                                  return (
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-semibold ${cls}`}>
                                      <CalendarDays className="h-3 w-3" />
                                      Vence em {formatDate(item.dueDate)}
                                    </span>
                                  );
                                })()}
                              </div>
                              <Badge
                                variant="outline"
                                className={item.isPaid ? "border-success/40 text-success" : "border-primary/40 text-primary"}
                              >
                                {mask(rawFormatCurrency(item.commission))}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
