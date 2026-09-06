import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  UserPlus,
  Receipt,
  AlertTriangle,
  Search,
  Zap,
} from "lucide-react";

interface DashboardQuickActionsBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onNewLoan: () => void;
  onNewClient: () => void;
  onOpenPaymentSelector: () => void;
  onFilterOverdue: () => void;
  readOnly?: boolean;
}

export function DashboardQuickActionsBar({
  searchTerm,
  onSearchChange,
  onNewLoan,
  onNewClient,
  onOpenPaymentSelector,
  onFilterOverdue,
  readOnly = false,
}: DashboardQuickActionsBarProps) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-1">
      {/* Campo de Busca Operacional */}
      <div className="relative flex-1 min-w-[200px] max-w-full sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar cliente, telefone ou CPF..."
          className="pl-8 h-9 text-xs rounded-xl bg-card border-border/70 shadow-2xs"
        />
      </div>

      {/* Ações Rápidas */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-0.5">
        {!readOnly && (
          <>
            <Button
              size="sm"
              onClick={onNewLoan}
              className="h-9 px-3 rounded-xl text-xs font-semibold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-2xs shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo Empréstimo</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={onNewClient}
              className="h-9 px-3 rounded-xl text-xs font-semibold gap-1.5 border-border/80 hover:bg-muted shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Novo Cliente</span>
            </Button>
          </>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={onOpenPaymentSelector}
          className="h-9 px-3 rounded-xl text-xs font-semibold gap-1.5 border-primary/30 text-primary hover:bg-primary/10 shrink-0"
        >
          <Receipt className="w-3.5 h-3.5" />
          <span>Registrar Pagamento</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onFilterOverdue}
          className="h-9 px-3 rounded-xl text-xs font-semibold gap-1.5 border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 shrink-0"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Ver Atrasados</span>
        </Button>
      </div>
    </div>
  );
}
