import { AutoFitText } from "@/components/ui/auto-fit-text";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DecorSparkline } from "@/features/dashboard/components/dashboard/DecorSparkline";
import {
  Wallet, Calendar, Check, X, ArrowDownToLine, DollarSign, Banknote, Smartphone,
  Percent, ExternalLink, Target, TrendingUp, Info, Eye, EyeOff, ChevronDown, ChevronUp,
} from "lucide-react";
import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHideValues } from "@/contexts/HideValuesContext";
import { calculateTotalWithInterest } from "@/features/loans/hooks/useLoans";
import { rawFormatCurrency } from "@/features/dashboard/components/dashboard/dashboardHelpers";
import { ZeroRateOpenLoansDialog } from "@/features/dashboard/components/dashboard/ZeroRateOpenLoansDialog";
import type { Loan } from "@/types/loan";

function InfoRow({
  icon: Icon,
  label,
  value,
  negative,
  onClick,
  iconClassName,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  negative?: boolean;
  onClick?: () => void;
  iconClassName?: string;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`dash-row flex items-center justify-between gap-2 w-full min-w-0 px-2.5 py-1.5 sm:px-3 sm:py-2 ${
        onClick ? "cursor-pointer hover:opacity-80 transition-opacity" : ""
      }`}
    >
      <span className="flex items-center gap-2 min-w-0 flex-1">
        <Icon className={`h-4 w-4 shrink-0 ${iconClassName || "text-primary"}`} />
        <span className="text-[13px] sm:text-[13px] md:text-sm font-medium truncate dash-muted min-w-0">
          {label}
        </span>
      </span>
      <AutoFitText
        text={value}
        maxFontSize={16}
        minFontSize={10}
        className={`font-semibold tabular-nums text-right max-w-[62%] shrink ${
          negative ? "text-destructive" : "dash-value"
        }`}
      />
    </Wrapper>

  );
}


type GoalLike = { targetValue: number } | null | undefined;

interface Props {
  readOnly: boolean;
  // Saldo
  accountBalance: number;
  editingBalance: boolean;
  tempBalance: string;
  setTempBalance: (v: string) => void;
  saveBalance: () => void;
  cancelEditBalance: () => void;
  // Recebido
  receivedByMethod: {
    total: number;
    unassigned: number;
    items: Array<{ id: string; name: string; amount: number }>;
  };
  setReceivedDetailMethodId: (id: string | null) => void;
  // Taxa de Juros
  data: {
    monthlyInterestRate: { hasData: boolean; rate: number | null };
    loanCount: number;
    filteredLoans: Loan[];
    periodProfitRealized: number;
    periodProfitExpected: number;
    periodProfitPct: number;
  };
  portfolio: {
    forecastSunday: number;
    forecastEndMonth: number;
    globalInterestRate: number;
  };
  expandedBreakdown: string | null;
  setExpandedBreakdown: (v: string | null) => void;
  interestGoal: GoalLike;
  profitGoal: GoalLike;
  profitTargetAmount: number;
  formatCurrency: (v: number) => string;
  /** Todos os empréstimos (sem filtro de período) — usado no detalhamento de taxa 0%. */
  allLoans?: Loan[];
}

export function DashboardMainCards({
  readOnly,
  accountBalance,
  editingBalance,
  tempBalance,
  setTempBalance,
  saveBalance,
  cancelEditBalance,
  receivedByMethod,
  setReceivedDetailMethodId,
  data,
  portfolio,
  expandedBreakdown,
  setExpandedBreakdown,
  interestGoal,
  profitGoal,
  profitTargetAmount,
  formatCurrency,
  allLoans,
}: Props) {
  const { mask } = useHideValues();
  const isMobile = useIsMobile();
  const [showZeroRate, setShowZeroRate] = useState(false);
  const [showZeroRateOpen, setShowZeroRateOpen] = useState(false);
  return (

    <div className="dash-premium space-y-2.5 sm:space-y-3">

      <div className="grid grid-cols-1 @[720px]/dash:grid-cols-2 gap-2.5 sm:gap-3 items-stretch">

      {/* Saldo em Conta */}
      <div
        className={`dash-card dash-card-hero dash-rise h-full ${!editingBalance ? "cursor-pointer" : ""}`}
        style={{ animationDelay: '60ms' }}
        onClick={() => {
          if (!editingBalance) {
            window.dispatchEvent(new CustomEvent("open-ledger"));
          }
        }}
      >
        <div className="p-4 sm:p-5 h-full flex flex-col">
          <div className="flex items-center gap-3">
            <div className="dash-icon h-11 w-11 sm:h-12 sm:w-12 shrink-0">
              <Wallet className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="dash-label text-[12px] leading-tight">Saldo em Conta</p>
              {editingBalance ? (
                <div className="flex items-center gap-1 mt-1">
                  <Input type="number" value={tempBalance} onChange={(e) => setTempBalance(e.target.value)}
                    className="h-8 w-32 text-sm" onKeyDown={(e) => e.key === "Enter" && saveBalance()} onClick={(e) => e.stopPropagation()} autoFocus />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); saveBalance(); }}><Check className="h-4 w-4 text-success" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); cancelEditBalance(); }}><X className="h-4 w-4 text-destructive" /></Button>
                </div>
              ) : (
                <AutoFitText text={mask(formatCurrency(accountBalance))} maxFontSize={38} minFontSize={16} className={`mt-0.5 font-extrabold tabular-nums tracking-tight ${accountBalance < 0 ? "text-destructive" : "text-primary"}`} />
              )}
            </div>
          </div>

          <div className="mt-auto pt-3 sm:pt-4 space-y-1.5">

            <InfoRow
              icon={Calendar}
              label="Domingo"
              value={mask(formatCurrency(accountBalance + portfolio.forecastSunday))}
              negative={(accountBalance + portfolio.forecastSunday) < 0}
              iconClassName="text-primary"
            />
            <InfoRow
              icon={Target}
              label="Fim do mês"
              value={mask(formatCurrency(accountBalance + portfolio.forecastEndMonth))}
              negative={(accountBalance + portfolio.forecastEndMonth) < 0}
              iconClassName="text-primary"
            />
          </div>
        </div>
      </div>



      {/* Valores Recebidos — dinâmico conforme filtro de período */}
      <div className="dash-card dash-card-hero dash-rise cursor-pointer h-full" style={{ animationDelay: '110ms' }} onClick={() => setReceivedDetailMethodId("__all__")}>
        <div className="p-4 sm:p-5 h-full flex flex-col">

          <div className="flex items-center gap-3">
            <div className="dash-icon dash-icon-success h-11 w-11 sm:h-12 sm:w-12 shrink-0">
              <ArrowDownToLine className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="dash-label text-[12px] leading-tight">Valores Recebidos</p>
              <AutoFitText text={formatCurrency(receivedByMethod.total)} maxFontSize={38} minFontSize={16} className="mt-0.5 font-extrabold tabular-nums text-success tracking-tight" />
            </div>
          </div>
          <div className="mt-auto pt-3 sm:pt-4 space-y-1.5">
            {receivedByMethod.items.length === 0 && receivedByMethod.unassigned <= 0 ? (
              <p className="text-[12px] dash-muted text-center py-3">Nenhum pagamento no período</p>
            ) : (
              <>
                {receivedByMethod.items.map((it) => {
                  const lower = it.name.toLowerCase();
                  const Icon = lower.includes("pix") ? Smartphone
                    : lower.includes("dinheiro") ? Banknote
                    : DollarSign;
                  const displayName = lower.includes("pix") ? "Pix"
                    : lower.includes("dinheiro") ? "Dinheiro"
                    : it.name;
                  const iconClassName = lower.includes("pix") || lower.includes("dinheiro") ? "text-success" : "text-muted-foreground";
                  return (
                    <InfoRow
                      key={it.id}
                      icon={Icon}
                      label={displayName}
                      value={formatCurrency(it.amount)}
                      iconClassName={iconClassName}
                    />
                  );
                })}
                {receivedByMethod.unassigned > 0 && (
                  <InfoRow
                    icon={DollarSign}
                    label="Sem forma"
                    value={formatCurrency(receivedByMethod.unassigned)}
                    iconClassName="text-muted-foreground"
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      </div>

      {/* Taxa de Juros Mensal */}
      <div className="dash-card dash-card-hero-soft dash-rise cursor-pointer" style={{ animationDelay: '160ms' }} onClick={() => setExpandedBreakdown("interest-rate")}>

        <DecorSparkline tone="orange" subtle />
        <div className="p-4 sm:p-5 flex flex-col">

          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="dash-icon dash-icon-warning h-10 w-10 sm:h-11 sm:w-11 shrink-0">
                <Percent className="h-5 w-5" />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <p className="dash-label text-[12px] leading-tight">Taxa de Juros Mensal</p>
                {(() => {
                  const interestBearing = data.filteredLoans.filter((l) => (Number(l.interestRate) || 0) > 0);
                  return (
                    <div className="mt-1 flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[28px] sm:text-[34px] font-extrabold tabular-nums whitespace-nowrap dash-value tracking-tight leading-none">
                          {data.monthlyInterestRate.hasData && data.monthlyInterestRate.rate !== null ? `${data.monthlyInterestRate.rate.toFixed(2)}%` : "Sem dados"}
                        </p>
                        <p className="text-[12px] dash-muted mt-1.5">{interestBearing.length} no período</p>
                      </div>
                      <span className="text-[12px] dash-muted text-right shrink-0">Geral: <span className="font-bold text-warning">{portfolio.globalInterestRate.toFixed(1)}%</span></span>
                    </div>
                  );
                })()}
              </div>
            </div>
            <ExternalLink className="h-4 w-4 dash-muted shrink-0" />
          </div>

          <div className="mt-3 pt-3 border-t dash-divider">


            {interestGoal ? (() => {
              const currentRate = data.monthlyInterestRate.rate;
              const hasRate = currentRate !== null;
              const pct = hasRate && interestGoal.targetValue > 0 ? Math.min(150, (currentRate / interestGoal.targetValue) * 100) : 0;
              const reached = hasRate && currentRate >= interestGoal.targetValue;
              const status = reached ? "atingida" : pct >= 80 ? "perto" : "abaixo";
              const color = reached ? "text-success" : pct >= 80 ? "text-warning" : "text-destructive";
              return (
                <>
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="flex items-center gap-1.5 dash-muted font-bold"><Target className="h-3.5 w-3.5" /> Meta: {interestGoal.targetValue.toFixed(1)}%</span>
                    <span className={`dash-badge ${hasRate ? color : "dash-muted"}`}>{hasRate ? (status === "atingida" ? "Atingida" : status === "perto" ? "Quase" : "Abaixo") : "--"}</span>
                  </div>
                  <div className="dash-progress mt-2">
                    <span className="dash-progress-fill dash-progress-fill-warning" style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </>
              );
            })() : (
              <p className="text-[12px] dash-muted italic flex items-center gap-1.5"><Target className="h-3.5 w-3.5" /> Defina meta em Relatórios</p>
            )}
          </div>
        </div>
      </div>


      {/* Dialog com os empréstimos considerados */}
      <Dialog open={expandedBreakdown === "interest-rate"} onOpenChange={(o) => !o && setExpandedBreakdown(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-warning" />
              Taxa de Juros Mensal
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Como a taxa de juros mensal é calculada"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="start" className="w-80 text-xs leading-relaxed">
                  <p className="font-semibold text-foreground mb-1.5">Como funciona este card</p>
                  <p className="text-muted-foreground mb-1.5">
                    A <strong>Taxa de Juros Mensal</strong> mostra a rentabilidade média dos empréstimos ativos no período selecionado.
                  </p>
                  <p className="text-muted-foreground mb-1">
                    <strong>Fórmula:</strong> Juros a Receber ÷ Valor Emprestado × 100. Apenas contratos com taxa maior que 0% são considerados.
                  </p>
                  <p className="text-muted-foreground">
                    <strong>Taxa global</strong> é a média de todas as taxas cadastradas, independente do filtro de período. Empréstimos com taxa 0% aparecem em seção separada.
                  </p>
                </PopoverContent>
              </Popover>
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const eligible = data.filteredLoans.filter((l) => (Number(l.interestRate) || 0) > 0);
            const safe = (n: number) => (Number.isFinite(n) ? n : 0);
            const totalLent = eligible.reduce((s, l) => s + safe(Number(l.amount)), 0);
            const totalToReceive = eligible.reduce(
              (s, l) => s + safe(calculateTotalWithInterest(l.amount, l.interestRate, l.installments)),
              0,
            );
            const rawInterest = totalToReceive - totalLent;
            if (rawInterest < 0) {
              console.warn("[TaxaJurosMensal] Inconsistência: A Receber menor que Emprestado", { totalLent, totalToReceive });
            }
            const interest = Math.max(0, rawInterest);
            const rate = totalLent > 0 ? (interest / totalLent) * 100 : 0;
            const cards = [
              { label: "Emprestado", value: rawFormatCurrency(totalLent), tone: "text-foreground" },
              { label: "A Receber", value: rawFormatCurrency(totalToReceive), tone: "text-foreground" },
              { label: "Juros a Receber", value: rawFormatCurrency(interest), tone: "text-success" },
              { label: "Taxa de Juros", value: `${rate.toFixed(2).replace(".", ",")}%`, tone: "text-warning" },
            ];
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-3">
                {cards.map((c) => (
                  <div
                    key={c.label}
                    className="rounded-[14px] border border-border/60 bg-card shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] p-3 flex flex-col justify-center items-center text-center min-h-[80px]"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground leading-tight">
                      {c.label}
                    </p>
                    <p className={`mt-1.5 text-base sm:text-lg font-bold tabular-nums leading-tight break-words ${c.tone}`}>
                      {c.value}
                    </p>
                  </div>
                ))}
              </div>
            );
          })()}

          {(() => {
            const zeroRateLoans = data.filteredLoans.filter(
              (l) => (Number(l.interestRate) || 0) === 0,
            );
            const totalZeroLent = zeroRateLoans.reduce((s, l) => s + Number(l.amount || 0), 0);
            return (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => zeroRateLoans.length > 0 && setShowZeroRate((v) => !v)}
                  disabled={zeroRateLoans.length === 0}
                  className={`w-full flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm transition-colors ${
                    zeroRateLoans.length > 0
                      ? "bg-muted/30 hover:bg-muted/50 cursor-pointer"
                      : "bg-muted/20 text-muted-foreground cursor-default"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Percent className="h-4 w-4 text-muted-foreground" />
                    Empréstimos com taxa 0%
                    <span className="text-xs text-muted-foreground">({zeroRateLoans.length})</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {rawFormatCurrency(totalZeroLent)}
                    </span>
                    {zeroRateLoans.length > 0 &&
                      (showZeroRate ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ))}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowZeroRateOpen(true)}
                  className="mt-2 w-full flex items-center justify-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium text-warning hover:bg-warning/20 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Ver todos os empréstimos com taxa 0% em aberto
                </button>

                {showZeroRate && (
                  <div className="space-y-2 mt-2">
                    {zeroRateLoans.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        Nenhum empréstimo com taxa 0% no período
                      </p>
                    ) : (
                      zeroRateLoans.map((l) => (
                        <div
                          key={l.id}
                          className="flex items-center justify-between text-xs bg-muted/30 rounded-lg p-3"
                        >
                          <div>
                            <p className="font-medium text-foreground">{l.borrowerName}</p>
                            <p className="text-muted-foreground">
                              Emprestado: {rawFormatCurrency(l.amount)} • {l.installments ?? 1}{" "}
                              parcela(s)
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="font-medium text-muted-foreground">Taxa 0%</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="space-y-2 mt-4">


            {(() => {
              const interestBearing = data.filteredLoans.filter((l) => (Number(l.interestRate) || 0) > 0);
              if (interestBearing.length === 0) {
                return <p className="text-sm text-muted-foreground text-center py-8">Nenhum empréstimo com juros no período</p>;
              }
              return interestBearing.map((l) => {
                const totalToReceive = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
                const totalPct = l.amount > 0 ? ((totalToReceive - l.amount) / l.amount) * 100 : 0;
                return (
                  <div key={l.id} className="flex items-center justify-between text-xs bg-muted/30 rounded-lg p-3">
                    <div>
                      <p className="font-medium text-foreground">{l.borrowerName}</p>
                      <p className="text-muted-foreground">
                        Emprestado: {rawFormatCurrency(l.amount)} → Receber: {rawFormatCurrency(totalToReceive)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-warning">{totalPct.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </DialogContent>
      </Dialog>

      <ZeroRateOpenLoansDialog
        open={showZeroRateOpen}
        onOpenChange={setShowZeroRateOpen}
        loans={allLoans ?? data.filteredLoans}
      />



      {/* Profit Card — Faturamento do Período */}
      <div className="dash-card dash-card-hero-soft dash-rise" style={{ animationDelay: '210ms' }}>

        <DecorSparkline tone="blue" subtle />
        <div className="p-4 sm:p-5 flex flex-col">
          <div className="flex items-center gap-3 mb-3">
            <div className="dash-icon h-10 w-10 sm:h-11 sm:w-11 shrink-0">
              <TrendingUp className="h-5 w-5" />
            </div>
            <p className="dash-label text-[12px] leading-tight">Faturamento do Período</p>
          </div>

          {/* Grade 2x2 de métricas: labels na linha de cima, valores alinhados abaixo */}
          <div className="grid grid-cols-2 grid-rows-[auto_1fr] gap-x-4 gap-y-1">

            {/* Label Previsto */}
            <div className="flex items-center gap-1">
              <span className="dash-label text-[11px]">Previsto</span>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Como o Previsto é calculado"
                    className="dash-muted hover:text-foreground transition-colors"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-72 text-xs leading-relaxed">
                  <p className="font-semibold text-foreground mb-1">Como é calculado</p>
                  <p className="text-muted-foreground">
                    Soma dos <strong>lucros já realizados</strong> com os
                    <strong> lucros pendentes</strong> que vencem no período selecionado.
                  </p>
                </PopoverContent>
              </Popover>
            </div>

            {/* Label Realizado */}
            <div className="flex items-center justify-end gap-1">
              <span className="dash-label text-[11px]">Realizado</span>
            </div>

            {/* Valor Previsto */}
            <AutoFitText
              text={formatCurrency(data.periodProfitRealized + data.periodProfitExpected)}
              maxFontSize={isMobile ? 20 : 26}
              minFontSize={12}
              className="font-extrabold tabular-nums dash-value tracking-tight self-end"
            />

            {/* Valor Realizado */}
            <AutoFitText
              text={formatCurrency(data.periodProfitRealized)}
              maxFontSize={isMobile ? 20 : 26}
              minFontSize={12}
              className="font-extrabold tabular-nums text-success self-end text-right"
            />

          </div>

          {/* Rodapé compacto: meta + barra */}
          <div className="mt-3 pt-3 border-t dash-divider">

            {profitGoal ? (() => {
              const pct = profitTargetAmount > 0 ? Math.min(150, (data.periodProfitRealized / profitTargetAmount) * 100) : 0;
              const reached = data.periodProfitRealized >= profitTargetAmount && profitTargetAmount > 0;
              const color = reached ? "text-success" : "text-primary";
              return (
                <>
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="flex items-center gap-1.5 dash-muted font-bold min-w-0 truncate"><Target className="h-3.5 w-3.5 shrink-0" /> Meta: {formatCurrency(profitTargetAmount)}</span>
                    <span className={`font-bold whitespace-nowrap shrink-0 tabular-nums ${color}`}>{pct.toFixed(1)}%</span>
                  </div>
                  <div className="dash-progress mt-2">
                    <span className="dash-progress-fill" style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </>
              );
            })() : (
              <p className="text-[12px] dash-muted italic flex items-center gap-1.5"><Target className="h-3.5 w-3.5" /> Defina uma meta em Relatórios → Metas</p>
            )}
          </div>
        </div>
      </div>

    </div>

  );
}
