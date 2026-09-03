import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Loan, Payment, InstallmentSchedule } from "@/types/loan";
import { buildOfficialInstallmentPlan } from "@/features/loans/lib/calculateLoanFinancialState";
import { getOverdueAmount, getOverdueInstallments } from "@/features/loans/lib/loanInstallmentAmount";
import { rawFormatCurrency } from "@/features/loans/components/list/formatting";
import { useHideValues } from "@/contexts/HideValuesContext";
import { todayInAppTz } from "@/lib/timezone";
import { cn } from "@/lib/utils";

interface OverdueAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
}

interface MonthlyDetails {
  loanId: string;
  borrowerName: string;
  principal: number;
  interest: number;
  lateFees: number;
  total: number;
}

export function OverdueAnalysisDialog({
  open,
  onOpenChange,
  loans,
  payments,
  installmentSchedules,
}: OverdueAnalysisDialogProps) {
  const EPS = 0.01;
  const { mask } = useHideValues();
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  const monthlyData = useMemo(() => {
    const months = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];

    const data = months.map((month, index) => {
      let principal = 0;
      let interest = 0;
      let lateFees = 0;
      const details: MonthlyDetails[] = [];

      loans.forEach(loan => {
        if (loan.status === "paid") return;

        const loanPayments = payments.filter(p => p.loanId === loan.id);
        const todayStr = todayInAppTz();
        const totalOverdue = getOverdueAmount(loan, installmentSchedules, todayStr, loanPayments);
        if (totalOverdue <= EPS) return;

        const overdueInsts = getOverdueInstallments(loan, installmentSchedules, todayStr);
        
        const totalFeesPaid = loanPayments.reduce((sum, p) => {
          const md = (p.metadata ?? {}) as any;
          return sum + (Number(md.late_interest_amount || 0) + Number(md.penalty_amount || 0));
        }, 0);
        
        let runningFeesPaid = totalFeesPaid;

        const schedules = installmentSchedules.filter(s => s.loanId === loan.id);
        const { plan } = buildOfficialInstallmentPlan(loan, schedules);

        overdueInsts.forEach(inst => {
          const dueDate = new Date(inst.dueDate + "T00:00:00");
          
          let instLateFees = 0;
          const days = Math.max(0, Math.floor((new Date(todayStr + "T00:00:00").getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
          
          if (days > 0) {
            const penalty = Number(loan.penaltyValue) || 0;
            let mora = 0;
            if (loan.lateInterestValue != null && loan.lateInterestValue > 0) {
              const lateBase = inst.amount;
              mora = loan.lateInterestType === "fixed"
                ? loan.lateInterestValue * days
                : lateBase * (loan.lateInterestValue / 100) * days;
            }
            const totalAppliedFees = Math.round((penalty + mora) * 100) / 100;
            const feesPaidOnThisInst = Math.min(totalAppliedFees, runningFeesPaid);
            runningFeesPaid = Math.max(0, runningFeesPaid - feesPaidOnThisInst);
            instLateFees = Math.max(0, Math.round((totalAppliedFees - feesPaidOnThisInst) * 100) / 100);
          }

          if (dueDate.getFullYear() === year && dueDate.getMonth() === index) {
            const planEntry = plan.find(p => p.installmentNumber === inst.installmentNumber);
            let pAmount = 0;
            let iAmount = 0;
            
            if (planEntry && planEntry.due > 0) {
               const principalRatio = planEntry.principal / planEntry.due;
               pAmount = Math.max(0, Math.round((inst.amount * principalRatio) * 100) / 100);
               iAmount = Math.max(0, Math.round((inst.amount - pAmount) * 100) / 100);
            } else {
               pAmount = inst.amount;
            }

            principal += pAmount;
            interest += iAmount;
            lateFees += instLateFees;

            details.push({
              loanId: loan.id,
              borrowerName: loan.borrowerName || "Cliente sem nome",
              principal: pAmount,
              interest: iAmount,
              lateFees: instLateFees,
              total: Math.round((pAmount + iAmount + instLateFees) * 100) / 100
            });
          }
        });
      });

      return {
        month,
        principal: Math.round(principal * 100) / 100,
        interest: Math.round(interest * 100) / 100,
        lateFees: Math.round(lateFees * 100) / 100,
        total: Math.round((principal + interest + lateFees) * 100) / 100,
        details
      };
    });

    const totals = data.reduce((acc, curr) => ({
      principal: acc.principal + curr.principal,
      interest: acc.interest + curr.interest,
      lateFees: acc.lateFees + curr.lateFees,
      total: acc.total + curr.total
    }), { principal: 0, interest: 0, lateFees: 0, total: 0 });

    return { 
      rows: data, 
      totals: {
        principal: Math.round(totals.principal * 100) / 100,
        interest: Math.round(totals.interest * 100) / 100,
        lateFees: Math.round(totals.lateFees * 100) / 100,
        total: Math.round(totals.total * 100) / 100
      } 
    };
  }, [loans, payments, installmentSchedules, year]);

  const selectedMonthData = selectedMonthIndex !== null ? monthlyData.rows[selectedMonthIndex] : null;

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!val) {
        setSelectedMonthIndex(null);
        setIsDetailDialogOpen(false);
      }
      onOpenChange(val);
    }}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center sm:text-left">Análise Anual de Atrasados</DialogTitle>
        </DialogHeader>

        <div className="py-2 sm:py-4 space-y-4 sm:space-y-6">
          <div className="flex justify-center">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-9 rounded-full"
                onClick={() => setYear(y => y - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-8 sm:h-9 px-6 sm:px-8 rounded-full text-sm font-semibold"
                onClick={() => setYear(new Date().getFullYear())}
              >
                {year}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-9 rounded-full"
                onClick={() => setYear(y => y + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="border rounded-xl overflow-hidden bg-card shadow-sm overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-[100px] sm:w-[150px] text-xs font-bold uppercase tracking-wider">Mês</TableHead>
                  <TableHead className="text-right text-xs font-bold uppercase tracking-wider hidden sm:table-cell">Principal</TableHead>
                  <TableHead className="text-right text-xs font-bold uppercase tracking-wider hidden sm:table-cell">Juros/Enc</TableHead>
                  <TableHead className="text-right text-xs font-bold uppercase tracking-wider">Total</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyData.rows.map((row, idx) => (
                  <TableRow 
                    key={row.month} 
                    className={cn(
                      "hover:bg-muted/30 transition-colors cursor-pointer",
                      selectedMonthIndex === idx && "bg-muted/50"
                    )}
                    onClick={() => {
                      setSelectedMonthIndex(idx);
                      setIsDetailDialogOpen(true);
                    }}
                  >
                    <TableCell className="font-medium text-sm py-3">{row.month}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm hidden sm:table-cell">
                      {mask(rawFormatCurrency(row.principal))}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm hidden sm:table-cell">
                      {mask(rawFormatCurrency(row.interest + row.lateFees))}
                    </TableCell>
                    <TableCell className="text-right font-bold text-destructive text-sm whitespace-nowrap">
                      {mask(rawFormatCurrency(row.total))}
                    </TableCell>
                    <TableCell className="text-right pr-2">
                      <Info className={cn("h-4 w-4 text-muted-foreground/50 transition-colors", row.details.length > 0 && "text-primary/70")} />
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 hover:bg-muted/50 font-bold border-t-2">
                  <TableCell className="text-sm">TOTAL</TableCell>
                  <TableCell className="text-right text-sm hidden sm:table-cell">
                    {mask(rawFormatCurrency(monthlyData.totals.principal))}
                  </TableCell>
                  <TableCell className="text-right text-sm hidden sm:table-cell">
                    {mask(rawFormatCurrency(monthlyData.totals.interest + monthlyData.totals.lateFees))}
                  </TableCell>
                  <TableCell className="text-right text-destructive text-base sm:text-lg whitespace-nowrap">
                    {mask(rawFormatCurrency(monthlyData.totals.total))}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
            <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto p-4 sm:p-6 rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold">
                  Detalhamento: {selectedMonthData?.month}
                </DialogTitle>
              </DialogHeader>
              <div className="py-4 space-y-3">
                {selectedMonthData?.details.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhum registro encontrado.</p>
                ) : (
                  <div className="grid gap-2">
                    {selectedMonthData?.details.map((detail, dIdx) => (
                      <div key={`${detail.loanId}-${dIdx}`} className="bg-muted/30 p-3 rounded-xl border border-border/50 flex flex-col gap-1">
                        <div className="flex justify-between items-start gap-2">
                          <span className="font-semibold text-sm line-clamp-1">{detail.borrowerName}</span>
                          <span className="font-bold text-destructive text-sm whitespace-nowrap">
                            {mask(rawFormatCurrency(detail.total))}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-3 text-[10px] text-muted-foreground uppercase tracking-tight">
                          <span>Principal: {mask(rawFormatCurrency(detail.principal))}</span>
                          <span>Juros: {mask(rawFormatCurrency(detail.interest))}</span>
                          {detail.lateFees > 0 && (
                            <span className="text-destructive/80 font-medium">Multas/Mora: {mask(rawFormatCurrency(detail.lateFees))}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
          
          <p className="text-[10px] text-muted-foreground text-center pt-2">
            * Valores atualizados até {todayInAppTz()}. Clique no mês para detalhar.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
