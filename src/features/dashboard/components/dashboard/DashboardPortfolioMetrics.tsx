import { BarChart3, Coins, Eye, HandCoins, Landmark, PiggyBank, TrendingUp, Wallet } from "lucide-react";
import { AutoFitText } from "@/components/ui/auto-fit-text";
import { InfoPopover } from "@/features/dashboard/components/dashboard/InfoPopover";
import { DecorSparkline } from "@/features/dashboard/components/dashboard/DecorSparkline";
import { useState } from "react";

interface PortfolioLike {
  capitalOnStreet: number;
  pendingReceivable: number;
  estimatedProfit: number;
}

interface Props {
  portfolio: PortfolioLike;
  periodProfitRealized: number;
  periodProfitExpected: number;
  periodProfitOverdue: number;
  prevProfitRealized?: number;
  prevProfitDue?: number;
  formatCurrency: (value: number) => string;
  onOpenInterestReceived: () => void;
  onOpenInterestExpectedAll: () => void;
  onOpenInterestPending: () => void;
}

type Tone = "primary" | "success" | "warning";

const TONE: Record<Tone, { value: string; icon: string; iconBg: string; blockBg: string }> = {
  primary: { value: "text-primary", icon: "text-primary-foreground", iconBg: "bg-primary", blockBg: "bg-primary/[0.04] border-primary/15" },
  success: { value: "text-success", icon: "text-success-foreground", iconBg: "bg-success", blockBg: "bg-success/[0.05] border-success/20" },
  warning: { value: "text-warning", icon: "text-warning-foreground", iconBg: "bg-warning", blockBg: "bg-warning/[0.06] border-warning/20" },
};

export function DashboardPortfolioMetrics({
  portfolio,
  periodProfitRealized,
  periodProfitExpected,
  periodProfitOverdue,
  prevProfitRealized = 0,
  prevProfitDue = 0,
  formatCurrency,
  onOpenInterestReceived,
  onOpenInterestExpectedAll,
  onOpenInterestPending,
}: Props) {
  const [openInfo, setOpenInfo] = useState<string | null>(null);

  // ————— Lógica de cálculo preservada integralmente —————
  const interestReceivedInPeriod = periodProfitRealized;
  const interestPendingInPeriod = periodProfitExpected;
  const interestDueInPeriod = interestReceivedInPeriod + interestPendingInPeriod;
  const overdueInterestInPeriod = periodProfitOverdue;

  // Variação percentual vs. mês anterior
  const variation = (current: number, previous: number): string | null => {
    if (!previous || previous <= 0) return null;
    const pct = ((current - previous) / previous) * 100;
    const sign = pct >= 0 ? "+" : "-";
    return `${sign}${Math.abs(pct).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  };
  const dueVariation = variation(interestDueInPeriod, prevProfitDue);
  const receivedVariation = variation(interestReceivedInPeriod, prevProfitRealized);

  const valueReference = "R$ 999.999.999,00";

  interface Metric {
    id: string;
    label: string;
    value: string;
    hint: string;
    tone: Tone;
    icon: typeof Wallet;
    tooltip?: string;
    onClick?: () => void;
    secondaryLabel?: string;
    secondaryValue?: string;
    secondaryTone?: Tone;
    isSecondaryRed?: boolean;
  }

  const hero: Metric = {
    id: "receivable",
    label: "A Receber",
    value: formatCurrency(portfolio.pendingReceivable),
    hint: "Principal + juros a receber",
    tone: "success",
    icon: Wallet,
    tooltip: "Valor restante a receber de todos os contratos de empréstimos ativos.",
  };

  const rowTwo: Metric[] = [
    {
      id: "capital",
      label: "Capital na Rua",
      value: formatCurrency(portfolio.capitalOnStreet),
      hint: "Valor total emprestado em contratos ativos",
      tone: "primary",
      icon: Landmark,
      tooltip: "Principal proporcional ainda em aberto: para cada contrato ativo, valor emprestado × (parcelas restantes ÷ total de parcelas). Diminui conforme as parcelas são pagas.",
    },
    {
      id: "profit",
      label: "Lucro Estimado",
      value: formatCurrency(portfolio.estimatedProfit),
      hint: "Lucro previsto da carteira",
      tone: "success",
      icon: TrendingUp,
      tooltip: "Soma dos 'Juros a Receber' pendentes de todos os contratos ativos, usando a mesma fórmula do Histórico do Cliente (saldo restante × proporção de juros + encargos por atraso). Igual ao valor exibido em 'Juros a Receber' no módulo de histórico do cliente.",
    },
  ];

  const rowThree: Metric[] = [
    {
      id: "interest-due",
      label: "Juros a Receber",
      value: formatCurrency(interestDueInPeriod),
      hint: "Juros futuros",
      tone: "warning",
      icon: Coins,
      onClick: onOpenInterestExpectedAll,
      tooltip: "Soma dos 'Juros Recebidos no Mês' + 'Juros Pendentes do Mês'. Representa o total de juros do período: o que já entrou somado ao que ainda falta receber. Clique para ver o detalhamento.",
      ...(dueVariation
        ? {
            secondaryLabel: "vs. mês anterior",
            secondaryValue: dueVariation,
            secondaryTone: "success" as Tone,
            isSecondaryRed: dueVariation.startsWith("-"),
          }
        : {}),
    },
    {
      id: "interest-received",
      label: "Juros Recebidos",
      value: formatCurrency(interestReceivedInPeriod),
      hint: "Juros já recebidos",
      tone: "warning",
      icon: HandCoins,
      onClick: onOpenInterestReceived,
      tooltip: "Critério: DATA DE PAGAMENTO + contabilidade JUROS PRIMEIRO. Cada pagamento amortiza antes o juros pendente do contrato; juros avulsos (sem parcela) contam 100% como juros; na quitação, todo o lucro residual (incl. acordos com bônus ou desconto) é alocado ao último pagamento. Clique para ver o detalhamento.",
      ...(receivedVariation
        ? {
            secondaryLabel: "vs. mês anterior",
            secondaryValue: receivedVariation,
            secondaryTone: "success" as Tone,
            isSecondaryRed: receivedVariation.startsWith("-"),
          }
        : {}),
    },
  ];

  const rowFour: Metric = {
    id: "interest-pending",
    label: "Juros Pendentes",
    value: formatCurrency(interestPendingInPeriod),
    hint: "Juros em aberto",
    tone: "warning",
    icon: PiggyBank,
    onClick: onOpenInterestPending,
    tooltip: "Diferença entre 'Juros a Receber' no vencimento e 'Juros Recebidos no Mês' (pagamento). Clique para ver o detalhamento do que está pendente de recebimento.",
    secondaryLabel: "juros vencidos",
    secondaryValue: formatCurrency(overdueInterestInPeriod),
    secondaryTone: "warning",
    isSecondaryRed: true,
  };

  const Block = ({ m, hero: isHero = false, expanded = false }: { m: Metric; hero?: boolean; expanded?: boolean }) => {
    const t = TONE[m.tone];
    const st = m.secondaryTone ? TONE[m.secondaryTone] : t;
    const Icon = m.icon;

    if (isHero) {
      return (
        <div
          className={[
            "group relative overflow-hidden rounded-[18px] sm:rounded-[20px]",
            "bg-gradient-to-r from-primary to-primary/85 text-primary-foreground",
            "px-4 sm:px-6 py-4 sm:py-6 flex items-center gap-3 sm:gap-5 min-w-0",
            "shadow-[0_10px_30px_-16px_hsl(var(--primary)/0.9)]",
            "transition-all duration-300 hover:brightness-[1.03]",
            m.onClick ? "cursor-pointer" : "",
          ].join(" ")}
          onClick={m.onClick}
        >
          <DecorSparkline tone="light" />
          <span className="relative z-10 shrink-0 flex items-center justify-center h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-white/15 transition-transform duration-300 group-hover:scale-105">
            <Icon className="h-5 w-5 sm:h-7 sm:w-7" />
          </span>
          <div className="relative z-10 flex flex-col gap-1 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-[13px] sm:text-[15px] font-medium text-primary-foreground/90 truncate">
                {m.label}
              </p>
              {m.tooltip && (
                <InfoPopover
                  text={m.tooltip}
                  className="p-0.5 -m-0.5 shrink-0 text-primary-foreground/80"
                  open={openInfo === m.id}
                  onOpenChange={(open) => setOpenInfo(open ? m.id : null)}
                />
              )}
            </div>
            <AutoFitText
              text={m.value}
              referenceText={valueReference}
              maxFontSize={46}
              minFontSize={20}
              className="font-bold tabular-nums leading-tight tracking-tight"
            />
          </div>
        </div>
      );
    }

    return (
      <div
        className={[
          "group relative flex items-start gap-2.5 sm:gap-4 min-w-0 h-full",
          "rounded-[18px] border px-3 sm:px-5 py-3.5 sm:py-5",
          t.blockBg,
          "transition-all duration-300 hover:-translate-y-[2px] hover:shadow-[0_10px_26px_-18px_hsl(220_40%_2%/0.35)]",
          m.onClick ? "cursor-pointer" : "",
          expanded ? "flex-col justify-between" : "",
        ].join(" ")}
        onClick={m.onClick}
      >
        <div className={`flex items-start gap-2.5 sm:gap-4 min-w-0 flex-1 ${expanded ? "w-full" : ""}`}>
          <span
            className={`shrink-0 flex items-center justify-center rounded-full h-9 w-9 sm:h-11 sm:w-11 ${t.iconBg} ${t.icon} transition-transform duration-300 group-hover:scale-105`}
          >
            <Icon className="h-[16px] w-[16px] sm:h-[19px] sm:w-[19px]" />
          </span>

          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-[11.5px] sm:text-[13px] font-medium text-muted-foreground truncate">
                {m.label}
              </p>
              {m.tooltip && (
                <InfoPopover
                  text={m.tooltip}
                  className="p-0.5 -m-0.5 shrink-0"
                  open={openInfo === m.id}
                  onOpenChange={(open) => setOpenInfo(open ? m.id : null)}
                />
              )}
              {m.onClick && (
                <Eye className="h-3.5 w-3.5 ml-auto text-muted-foreground/70 opacity-70 group-hover:opacity-100 transition-opacity shrink-0" />
              )}
            </div>

            <AutoFitText
              text={m.value}
              referenceText={valueReference}
              maxFontSize={28}
              minFontSize={14}
              className={`font-bold tabular-nums leading-tight tracking-tight ${t.value}`}
            />
          </div>
        </div>

        {m.secondaryValue && (
          <div className={`w-full ${expanded ? "mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-border/40" : ""}`}>
            <div className="flex items-center justify-between gap-2 min-w-0">
              <p className={`text-[10.5px] sm:text-[12px] truncate ${m.isSecondaryRed ? "text-red-500 font-semibold" : "text-muted-foreground"}`}>
                {m.secondaryLabel}
              </p>
              <p className={`text-[11px] sm:text-[13px] font-semibold tabular-nums whitespace-nowrap ${m.isSecondaryRed ? "text-red-500" : st.value}`}>
                {m.secondaryValue}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="dash-premium dash-rise">
      <div className="dash-card rounded-[22px] overflow-hidden">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3 px-4 sm:px-6 py-4 sm:py-5 border-b border-border/40">
          <span className="flex items-center justify-center h-11 w-11 rounded-2xl bg-primary/10 text-primary shrink-0">
            <BarChart3 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] sm:text-base font-semibold text-foreground leading-tight">
              Resumo Financeiro
            </h3>
            <p className="text-[11px] sm:text-[12px] text-muted-foreground truncate">
              Visão geral da carteira de empréstimos
            </p>
          </div>
        </div>

        {/* Grade: mobile 2x2x2 · desktop/tablet 1x2x3 */}
        <div className="grid grid-cols-2 @[720px]/dash:grid-cols-6 gap-2.5 sm:gap-4 p-3 sm:p-5">
          <div className="col-span-2 @[720px]/dash:col-span-6">
            <Block m={hero} hero />
          </div>
          {rowTwo.map((m) => (
            <div key={m.id} className="col-span-1 @[720px]/dash:col-span-3">
              <Block m={m} />
            </div>
          ))}
          {rowThree.map((m) => (
            <div key={m.id} className="col-span-1 @[720px]/dash:col-span-2">
              <Block m={m} expanded={Boolean(m.secondaryValue)} />
            </div>
          ))}
          <div className="col-span-2 @[720px]/dash:col-span-2">
            <Block m={rowFour} expanded />
          </div>
        </div>
      </div>
    </div>
  );
}

