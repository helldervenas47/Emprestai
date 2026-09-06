import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Receipt, ArrowRight, User, HandCoins } from "lucide-react";
import type { Loan, Client } from "@/types/loan";

interface QuickPaymentSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loans: Loan[];
  clients?: Client[];
  formatCurrency: (v: number) => string;
  onSelectLoan: (loan: Loan) => void;
}

export function QuickPaymentSelectorDialog({
  open,
  onOpenChange,
  loans,
  clients = [],
  formatCurrency,
  onSelectLoan,
}: QuickPaymentSelectorDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const clientMap = useMemo(() => {
    const map = new Map<string, Client>();
    clients.forEach((c) => map.set(c.id, c));
    return map;
  }, [clients]);

  const activeLoans = useMemo(() => {
    return loans.filter((l) => l.status === "active");
  }, [loans]);

  const filteredLoans = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return activeLoans.slice(0, 10);

    return activeLoans.filter((l) => {
      const client = l.borrowerId ? clientMap.get(l.borrowerId) : null;
      const clientName = (client?.name || l.borrowerName || "").toLowerCase();
      const phone = (client?.phone || "").toLowerCase();
      const cpf = (client?.cpf || "").toLowerCase();
      const loanId = l.id.toLowerCase();

      return (
        clientName.includes(term) ||
        phone.includes(term) ||
        cpf.includes(term) ||
        loanId.includes(term)
      );
    });
  }, [activeLoans, searchTerm, clientMap]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-border/80 bg-card shadow-2xl rounded-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="p-4 sm:p-5 pb-3 border-b border-border/60 bg-muted/20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                Registrar Recebimento
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Selecione o contrato do cliente para registrar o pagamento.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-4 border-b border-border/40">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por cliente, telefone ou CPF..."
              className="pl-9 h-10 text-xs sm:text-sm rounded-xl"
              autoFocus
            />
          </div>
        </div>

        <div className="p-3 overflow-y-auto flex-1 divide-y divide-border/30">
          {filteredLoans.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Nenhum contrato ativo encontrado para "{searchTerm}".
            </div>
          ) : (
            filteredLoans.map((loan) => {
              const client = loan.borrowerId ? clientMap.get(loan.borrowerId) : null;
              const name = client?.name || loan.borrowerName || "Cliente";
              const amount = Number(loan.remainingAmount ?? loan.amount) || 0;

              return (
                <button
                  key={loan.id}
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    onSelectLoan(loan);
                  }}
                  className="w-full p-3 hover:bg-muted/40 transition-colors rounded-xl flex items-center justify-between text-left gap-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <strong className="text-sm font-semibold text-foreground truncate block">
                      {name}
                    </strong>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>Saldo: <strong className="text-foreground">{formatCurrency(amount)}</strong></span>
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        {loan.interestType || "Mensal"}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-primary shrink-0 text-xs font-semibold">
                    <span>Pagar</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
