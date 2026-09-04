import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatBRL } from "@/features/creditCards/lib/creditLimit";
import {
  AlertCircle,
  Clock,
  Search,
  MessageCircle,
  Calendar,
  Receipt,
  ArrowUpRight,
  ShieldAlert,
  Tag,
  Coins,
  ChevronDown,
  Layers,
} from "lucide-react";
import type { MonthlyClosingOverdueItem } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  monthLabel: string;
  overdueItems: MonthlyClosingOverdueItem[];
  totalOverdueAmount: number;
  onNavigateToTab?: (tab: string) => void;
}

interface ClientOverdueGroup {
  clientKey: string;
  clientId: string;
  clientName: string;
  clientPhone?: string;
  clientPhotoUrl?: string;
  totalOverdueAmount: number;
  totalRemainingAmount: number;
  totalContractAmount: number;
  totalLateFees: number;
  maxDaysLate: number;
  items: MonthlyClosingOverdueItem[];
}

export function MonthlyClosingOverdueClientsDialog({
  open,
  onOpenChange,
  monthLabel,
  overdueItems = [],
  totalOverdueAmount = 0,
  onNavigateToTab,
}: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});

  const toggleExpand = (clientKey: string) => {
    setExpandedClients((prev) => ({
      ...prev,
      [clientKey]: !prev[clientKey],
    }));
  };

  // 1. Filtra itens com base na busca
  const filteredItems = useMemo(() => {
    let items = overdueItems;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      items = items.filter((item) => {
        const matchName = item.clientName.toLowerCase().includes(term);
        const matchPhone = (item.clientPhone || "").toLowerCase().includes(term);
        const matchLoan = String(item.loanNumber || item.loanId).toLowerCase().includes(term);
        const matchTags = (item.tags || []).some((t) => t.toLowerCase().includes(term));
        return matchName || matchPhone || matchLoan || matchTags;
      });
    }
    return items;
  }, [overdueItems, searchTerm]);

  // 2. Agrupa por cliente (unifica clientes com múltiplos empréstimos)
  const clientGroups = useMemo(() => {
    const groupMap = new Map<string, ClientOverdueGroup>();

    filteredItems.forEach((item) => {
      const key = item.clientId || item.clientName.trim().toLowerCase();
      const existing = groupMap.get(key);

      if (!existing) {
        groupMap.set(key, {
          clientKey: key,
          clientId: item.clientId,
          clientName: item.clientName,
          clientPhone: item.clientPhone,
          clientPhotoUrl: item.clientPhotoUrl,
          totalOverdueAmount: item.overdueAmount,
          totalRemainingAmount: item.remainingAmount,
          totalContractAmount: item.totalAmount || item.totalWithInterest || 0,
          totalLateFees: item.lateFees || 0,
          maxDaysLate: item.daysLate || 0,
          items: [item],
        });
      } else {
        existing.totalOverdueAmount += item.overdueAmount;
        existing.totalRemainingAmount += item.remainingAmount;
        existing.totalContractAmount += (item.totalAmount || item.totalWithInterest || 0);
        existing.totalLateFees += (item.lateFees || 0);
        existing.maxDaysLate = Math.max(existing.maxDaysLate, item.daysLate || 0);
        if (!existing.clientPhone && item.clientPhone) existing.clientPhone = item.clientPhone;
        if (!existing.clientPhotoUrl && item.clientPhotoUrl) existing.clientPhotoUrl = item.clientPhotoUrl;
        existing.items.push(item);
      }
    });

    const groups = Array.from(groupMap.values());
    // Ordena os clientes em ordem alfabética
    groups.sort((a, b) => a.clientName.localeCompare(b.clientName, "pt-BR", { sensitivity: "base" }));
    return groups;
  }, [filteredItems]);

  // Contagem de clientes únicos afetados
  const uniqueClientsCount = useMemo(() => {
    const ids = new Set(overdueItems.map((i) => i.clientId || i.clientName));
    return ids.size;
  }, [overdueItems]);

  const handleOpenWhatsApp = (phone: string, clientName: string, amount: number, isConsolidated = false) => {
    const cleanPhone = phone.replace(/\D/g, "");
    if (!cleanPhone) return;
    const phoneWithDDI = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
    const msgText = isConsolidated
      ? `Olá ${clientName}, identificamos um valor total pendente de ${formatBRL(amount)} referente aos seus contratos em atraso no fechamento de ${monthLabel}. Poderia entrar em contato para regularizarmos os valores? Obrigado!`
      : `Olá ${clientName}, identificamos uma pendência no valor de ${formatBRL(amount)} referente ao fechamento de ${monthLabel}. Poderia entrar em contato para regularizarmos a sua parcela? Obrigado!`;
    const text = encodeURIComponent(msgText);
    window.open(`https://wa.me/${phoneWithDDI}?text=${text}`, "_blank", "noopener,noreferrer");
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-4 sm:p-6 gap-4">
        <DialogHeader className="space-y-1.5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center shrink-0">
              <ShieldAlert className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                Clientes Inadimplentes — {monthLabel}
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
                Contratos com parcelas em atraso consideradas no fechamento deste período (incluindo juros e multas de atraso).
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* CARDS DE RESUMO EXECUTIVO */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 shrink-0">
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-2.5 sm:p-3 space-y-0.5 sm:space-y-1">
            <span className="text-[10px] sm:text-[11px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider block">
              Total em Atraso
            </span>
            <span className="text-xs sm:text-base md:text-lg font-bold text-rose-600 dark:text-rose-400 truncate block">
              {formatBRL(totalOverdueAmount)}
            </span>
          </div>

          <div className="rounded-xl border border-border/70 bg-card p-2.5 sm:p-3 space-y-0.5 sm:space-y-1">
            <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Contratos
            </span>
            <span className="text-xs sm:text-base md:text-lg font-bold text-foreground truncate block">
              {overdueItems.length} {overdueItems.length === 1 ? "contrato" : "contratos"}
            </span>
          </div>

          <div className="rounded-xl border border-border/70 bg-card p-2.5 sm:p-3 space-y-0.5 sm:space-y-1">
            <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Clientes
            </span>
            <span className="text-xs sm:text-base md:text-lg font-bold text-foreground truncate block">
              {uniqueClientsCount} {uniqueClientsCount === 1 ? "cliente" : "clientes"}
            </span>
          </div>
        </div>

        {/* CAMPO DE BUSCA */}
        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, telefone, contrato ou etiqueta..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-10 rounded-xl bg-muted/40 border-border/70 text-xs sm:text-sm"
          />
        </div>

        {/* LISTA ROLÁVEL DE CLIENTES INADIMPLENTES (AGRUPADA POR CLIENTE) */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3 min-h-[220px]">
          {clientGroups.length === 0 ? (
            <div className="text-center py-12 space-y-2 border border-dashed rounded-2xl bg-muted/20">
              <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto opacity-50" />
              <p className="text-sm font-semibold text-foreground">
                {searchTerm ? "Nenhum resultado para a busca" : "Nenhum cliente inadimplente identificado"}
              </p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                {searchTerm
                  ? "Tente buscar com outro termo ou limpe o campo de busca."
                  : `Não foram encontradas parcelas em atraso no período de ${monthLabel}.`}
              </p>
            </div>
          ) : (
            clientGroups.map((group) => {
              const isMultiLoan = group.items.length > 1;
              const isExpanded = !!expandedClients[group.clientKey];
              const hasLateFees = group.totalLateFees > 0;

              // CASO 1: CLIENTE COM APENAS 1 CONTRATO (EXIBIÇÃO DIRETA)
              if (!isMultiLoan) {
                const item = group.items[0];
                const installmentLabel =
                  item.totalInstallments <= 1
                    ? "Parcela única"
                    : item.overdueInstallmentNumbers && item.overdueInstallmentNumbers.length > 0
                    ? `Parcela ${item.overdueInstallmentNumbers.join(", ")}/${item.totalInstallments}`
                    : `Parcela ${item.currentInstallmentNumber || 1}/${item.totalInstallments}`;

                const dueDateFormatted = item.firstOverdueDate
                  ? new Date(`${item.firstOverdueDate.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR")
                  : "-";

                const tags = item.tags || [];

                return (
                  <div
                    key={group.clientKey}
                    className="rounded-2xl border border-border/80 bg-card p-3 sm:p-4 space-y-3 shadow-xs hover:border-rose-500/30 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2.5 sm:gap-3">
                      <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0">
                        <Avatar className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl border border-border shrink-0 mt-0.5 sm:mt-0">
                          {item.clientPhotoUrl ? (
                            <AvatarImage src={item.clientPhotoUrl} alt={item.clientName} />
                          ) : null}
                          <AvatarFallback className="rounded-xl bg-primary/10 text-primary font-bold text-xs">
                            {getInitials(item.clientName)}
                          </AvatarFallback>
                        </Avatar>

                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <h4 className="font-bold text-xs sm:text-sm text-foreground truncate max-w-[180px] sm:max-w-[260px]">
                              {item.clientName}
                            </h4>
                            <Badge
                              variant="outline"
                              className="text-[10px] font-semibold px-2 py-0 bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 shrink-0"
                            >
                              {installmentLabel}
                            </Badge>

                            {hasLateFees && (
                              <Badge
                                variant="outline"
                                className="text-[10px] font-semibold px-1.5 py-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25 shrink-0 inline-flex items-center gap-1"
                                title="Valor inclui juros de mora e/ou multa de atraso"
                              >
                                <Coins className="h-2.5 w-2.5" />
                                +{formatBRL(item.lateFees!)} juros/multa
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground">
                            <span>Contrato #{item.loanNumber || item.loanId.slice(0, 8)}</span>
                            {item.clientPhone && (
                              <>
                                <span>•</span>
                                <span>{item.clientPhone}</span>
                              </>
                            )}
                          </div>

                          {tags.length > 0 && (
                            <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap pt-0.5">
                              {tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 dark:bg-primary/20 text-primary border border-primary/20 dark:border-primary/30 px-2 py-0.5 text-[10px] sm:text-[11px] font-medium max-w-[120px] sm:max-w-[160px] truncate"
                                  title={`Etiqueta: ${tag}`}
                                >
                                  <Tag className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
                                  <span className="truncate">{tag}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] sm:text-[11px] text-muted-foreground block">Vencido no mês</span>
                        <span className="font-bold text-xs sm:text-base text-rose-600 dark:text-rose-400">
                          {formatBRL(item.overdueAmount)}
                        </span>
                      </div>
                    </div>

                    {/* Detalhes do Atraso, Saldo Restante e Ações */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2.5 border-t border-border/50 text-xs">
                      <div className="flex items-center gap-2 sm:gap-3 text-muted-foreground text-[11px] flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          Vencimento: <strong className="text-foreground">{dueDateFormatted}</strong>
                        </span>
                        {item.daysLate > 0 && (
                          <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
                            <Clock className="h-3.5 w-3.5" />
                            {item.daysLate} dia(s) de atraso
                          </span>
                        )}
                        {item.totalInstallments > 1 && item.installmentAmount > 0 && (
                          <span className="flex items-center gap-1">
                            <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                            Próx. Parcela: <strong className="text-foreground">{formatBRL(item.installmentAmount)}</strong>
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          Saldo Restante: <strong className="text-foreground">{formatBRL(item.remainingAmount)}</strong>
                        </span>
                        <span className="flex items-center gap-1">
                          Total Contrato: <strong className="text-foreground">{formatBRL(item.totalAmount || item.totalWithInterest)}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                        {item.clientPhone && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs font-semibold gap-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/30"
                            onClick={() => handleOpenWhatsApp(item.clientPhone!, item.clientName, item.overdueAmount)}
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            <span>Cobrar</span>
                          </Button>
                        )}

                        {onNavigateToTab && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2.5 text-xs font-medium gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              onOpenChange(false);
                              onNavigateToTab("clientes");
                            }}
                          >
                            <span>Ver Cliente</span>
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              // CASO 2: CLIENTE COM MÚLTIPLOS CONTRATOS (RESUMO ACUMULADO + ACCORDION EXPANSÍVEL)
              return (
                <div
                  key={group.clientKey}
                  className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-xs hover:border-rose-500/30 transition-all space-y-0"
                >
                  {/* CABEÇALHO CONSOLIDADO DO CLIENTE */}
                  <div
                    onClick={() => toggleExpand(group.clientKey)}
                    className="p-3.5 sm:p-4 cursor-pointer hover:bg-muted/30 transition-colors select-none space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2.5 sm:gap-3">
                      <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0">
                        <Avatar className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl border border-border shrink-0 mt-0.5 sm:mt-0">
                          {group.clientPhotoUrl ? (
                            <AvatarImage src={group.clientPhotoUrl} alt={group.clientName} />
                          ) : null}
                          <AvatarFallback className="rounded-xl bg-primary/10 text-primary font-bold text-xs">
                            {getInitials(group.clientName)}
                          </AvatarFallback>
                        </Avatar>

                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <h4 className="font-bold text-xs sm:text-sm text-foreground truncate max-w-[180px] sm:max-w-[260px]">
                              {group.clientName}
                            </h4>
                            <Badge
                              variant="outline"
                              className="text-[10px] font-semibold px-2 py-0 bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 shrink-0 inline-flex items-center gap-1"
                            >
                              <Layers className="h-3 w-3" />
                              {group.items.length} contratos em atraso
                            </Badge>

                            {hasLateFees && (
                              <Badge
                                variant="outline"
                                className="text-[10px] font-semibold px-1.5 py-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25 shrink-0 inline-flex items-center gap-1"
                                title="Total de juros de mora e multas acumuladas"
                              >
                                <Coins className="h-2.5 w-2.5" />
                                +{formatBRL(group.totalLateFees)} juros/multa
                              </Badge>
                            )}
                          </div>

                          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                            <span>Resumo acumulado do cliente</span>
                            {group.clientPhone && (
                              <>
                                <span>•</span>
                                <span>{group.clientPhone}</span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] sm:text-[11px] text-muted-foreground block">Total vencido no mês</span>
                        <span className="font-bold text-xs sm:text-base text-rose-600 dark:text-rose-400">
                          {formatBRL(group.totalOverdueAmount)}
                        </span>
                      </div>
                    </div>

                    {/* Resumo consolidado de atraso e botões */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2.5 border-t border-border/50 text-xs">
                      <div className="flex items-center gap-2 sm:gap-3 text-muted-foreground text-[11px] flex-wrap">
                        {group.maxDaysLate > 0 && (
                          <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
                            <Clock className="h-3.5 w-3.5" />
                            Até {group.maxDaysLate} dia(s) de atraso
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          Saldo Restante Total: <strong className="text-foreground">{formatBRL(group.totalRemainingAmount)}</strong>
                        </span>
                        <span className="flex items-center gap-1">
                          Total Contratado: <strong className="text-foreground">{formatBRL(group.totalContractAmount)}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0" onClick={(e) => e.stopPropagation()}>
                        {group.clientPhone && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs font-semibold gap-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/30"
                            onClick={() => handleOpenWhatsApp(group.clientPhone!, group.clientName, group.totalOverdueAmount, true)}
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            <span>Cobrar Tudo ({formatBRL(group.totalOverdueAmount)})</span>
                          </Button>
                        )}

                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-8 px-2.5 text-xs font-semibold gap-1 text-foreground"
                          onClick={() => toggleExpand(group.clientKey)}
                        >
                          <span>{isExpanded ? "Recolher" : `Ver ${group.items.length} contratos`}</span>
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* LISTA EXPANSÍVEL DE CONTRATOS INDIVIDUAIS */}
                  {isExpanded && (
                    <div className="bg-muted/30 border-t border-border/70 p-3 sm:p-4 space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex items-center justify-between px-1 pb-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5 text-primary" />
                          Contratos individuais em atraso ({group.items.length})
                        </span>
                      </div>

                      <div className="space-y-2">
                        {group.items.map((item, itemIdx) => {
                          const installmentLabel =
                            item.totalInstallments <= 1
                              ? "Parcela única"
                              : item.overdueInstallmentNumbers && item.overdueInstallmentNumbers.length > 0
                              ? `Parcela ${item.overdueInstallmentNumbers.join(", ")}/${item.totalInstallments}`
                              : `Parcela ${item.currentInstallmentNumber || 1}/${item.totalInstallments}`;

                          const dueDateFormatted = item.firstOverdueDate
                            ? new Date(`${item.firstOverdueDate.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR")
                            : "-";

                          const hasItemLateFees = item.lateFees != null && item.lateFees > 0;
                          const tags = item.tags || [];

                          return (
                            <div
                              key={`${item.loanId}_${itemIdx}`}
                              className="rounded-xl border border-border/60 bg-card p-3 space-y-2 shadow-xs"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="space-y-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-xs sm:text-sm text-foreground">
                                      Contrato #{item.loanNumber || item.loanId.slice(0, 8)}
                                    </span>
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] font-semibold px-2 py-0 bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 shrink-0"
                                    >
                                      {installmentLabel}
                                    </Badge>
                                    {hasItemLateFees && (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] font-semibold px-1.5 py-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25 shrink-0 inline-flex items-center gap-1"
                                      >
                                        <Coins className="h-2.5 w-2.5" />
                                        +{formatBRL(item.lateFees!)} juros/multa
                                      </Badge>
                                    )}
                                  </div>

                                  {tags.length > 0 && (
                                    <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                      {tags.map((tag) => (
                                        <span
                                          key={tag}
                                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 dark:bg-primary/20 text-primary border border-primary/20 dark:border-primary/30 px-2 py-0.5 text-[10px] font-medium max-w-[130px] truncate"
                                          title={`Etiqueta: ${tag}`}
                                        >
                                          <Tag className="h-2.5 w-2.5 shrink-0" />
                                          <span className="truncate">{tag}</span>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                <div className="text-right shrink-0">
                                  <span className="text-[10px] text-muted-foreground block">Vencido</span>
                                  <span className="font-bold text-xs sm:text-sm text-rose-600 dark:text-rose-400">
                                    {formatBRL(item.overdueAmount)}
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
                                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3 text-muted-foreground" />
                                    Vencimento: <strong className="text-foreground">{dueDateFormatted}</strong>
                                  </span>
                                  {item.daysLate > 0 && (
                                    <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
                                      <Clock className="h-3 w-3" />
                                      {item.daysLate} dia(s) de atraso
                                    </span>
                                  )}
                                  {item.totalInstallments > 1 && item.installmentAmount > 0 && (
                                    <span className="flex items-center gap-1">
                                      <Receipt className="h-3 w-3 text-muted-foreground" />
                                      Próx. Parcela: <strong className="text-foreground">{formatBRL(item.installmentAmount)}</strong>
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    Saldo Restante: <strong className="text-foreground">{formatBRL(item.remainingAmount)}</strong>
                                  </span>
                                  <span className="flex items-center gap-1">
                                    Total Contrato: <strong className="text-foreground">{formatBRL(item.totalAmount || item.totalWithInterest)}</strong>
                                  </span>
                                </div>

                                {item.clientPhone && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-[11px] font-semibold gap-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 self-end sm:self-auto"
                                    onClick={() => handleOpenWhatsApp(item.clientPhone!, `${item.clientName} (Contrato #${item.loanNumber || item.loanId.slice(0, 8)})`, item.overdueAmount)}
                                  >
                                    <MessageCircle className="h-3 w-3" />
                                    <span>Cobrar este contrato</span>
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
