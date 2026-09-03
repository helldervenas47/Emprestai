import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { supabase as userSupabase } from "@/integrations/supabase/userClient";
import { rawFormatCurrency } from "@/features/dashboard/components/dashboard/dashboardHelpers";
import type { AppRole } from "@/hooks/useAuth";

const appSupabase = userSupabase;

type Tone = "positive" | "warning" | "negative";
export interface PrioritizedInsight {
  id: string;
  title: string;
  body: string;
  detail: string;
  recommendation: string;
  score: number;
  tone: Tone;
}

interface Params {
  controller: any;
  formatCurrency: (v: number) => string;
  role: AppRole;
  monthComparison: any;
  interestGoal: any;
  riskReturn: any;
  yearlyAverages: any;
  portfolio: any;
  data: any;
  range: { label: string; start: Date; end: Date };
}

/**
 * Lógica de geração de relatórios IA do Dashboard.
 * Mantém regras de negócio originais — apenas extraídas do componente.
 */
export function useDashboardAiReports({
  controller,
  formatCurrency,
  role,
  monthComparison,
  interestGoal,
  riskReturn,
  yearlyAverages,
  portfolio,
  data,
  range,
}: Params) {
  const {
    setRiskAiOpen,
    setRiskAiLoading,
    setRiskAiTitle,
    setRiskAiReport,
    cachedInsightReports,
    setCachedInsightReports,
    prefetchingInsightReportsRef,
  } = controller;

  const buildLocalAiReport = useCallback((type: "risk-reduction" | "priority-insight", metrics: Record<string, unknown>) => {
    const asNumber = (value: unknown) => {
      const parsed = typeof value === "number" ? value : Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const asPercent = (value: unknown) => `${asNumber(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
    if (type === "priority-insight") {
      const insight = String(metrics.title ?? metrics.insight ?? "Insight prioritário");
      return `## Resumo executivo\n- ${insight}\n- Priorize a ação de maior impacto com base nos indicadores atuais.\n\n## Ação imediata\n- Revise os contratos ou clientes que mais pesam no indicador.\n- Acompanhe o efeito da ação no próximo fechamento do período.`;
    }
    const risk = metrics.riskScore ?? metrics.risco ?? metrics.risk ?? 0;
    const returns = metrics.returnScore ?? metrics.retorno ?? metrics.return ?? 0;
    const defaultRate = metrics.defaultRate ?? metrics.inadimplencia ?? metrics.default_rate ?? 0;
    const received = metrics.received ?? metrics.recebido ?? metrics.totalIncome ?? metrics.income ?? 0;
    return `## Resumo executivo\n- Risco atual: ${asPercent(risk)}; retorno: ${asPercent(returns)}; inadimplência: ${asPercent(defaultRate)}.\n- Recebido no período: ${formatCurrency(asNumber(received))}. Foque em reduzir exposição sem travar operações rentáveis.\n\n## Ações imediatas\n- Priorize cobrança dos maiores saldos em atraso e renegocie contratos com maior risco.\n- Evite novas liberações para perfis com atraso recorrente até o indicador estabilizar.`;
  }, [formatCurrency]);

  const generateAiReport = useCallback(async ({ title, type, metrics, cacheKey, openSheet = true }: { title: string; type: "risk-reduction" | "priority-insight"; metrics: Record<string, unknown>; cacheKey?: string; openSheet?: boolean }) => {
    const localReport = buildLocalAiReport(type, metrics);
    if (openSheet) {
      setRiskAiOpen(true);
      setRiskAiLoading(true);
      setRiskAiTitle(title);
      setRiskAiReport(localReport);
      if (cacheKey && cachedInsightReports[cacheKey]) {
        setRiskAiReport(cachedInsightReports[cacheKey]);
        setRiskAiLoading(false);
        return;
      }
    }
    try {
      const { data: userCheck, error: userErr } = await userSupabase.auth.getUser();
      if (userErr || !userCheck?.user) {
        await userSupabase.auth.signOut({ scope: "local" });
        throw new Error("Sessão expirada. Faça login novamente.");
      }
      const { data: appSession } = await appSupabase.auth.getSession();
      if (!appSession.session?.access_token) {
        if (cacheKey) {
          setCachedInsightReports((current: Record<string, string>) => ({ ...current, [cacheKey]: localReport }));
        }
        if (openSheet) {
          setRiskAiReport(localReport);
        }
        return;
      }
      const { data: result, error } = await appSupabase.functions.invoke("generate-risk-reduction-report", {
        body: { type, metrics },
      });

      if (error) {
        if (cacheKey) {
          setCachedInsightReports((current: Record<string, string>) => ({ ...current, [cacheKey]: localReport }));
        }
        if (openSheet) {
          toast.info("Relatório gerado em modo local", { description: "A IA demorou para responder. Mantivemos o relatório local com os dados disponíveis." });
          setRiskAiReport(localReport);
        }
        return;
      }
      const payload = (result ?? {}) as { report?: string; fallback?: boolean; message?: string };
      if (payload.fallback) {
        const fb = payload.message || "A IA demorou para responder. Um relatório local foi gerado com os dados disponíveis.";
        const report = payload.report ?? `> ${fb}`;
        if (cacheKey) {
          setCachedInsightReports((current: Record<string, string>) => ({ ...current, [cacheKey]: report }));
        }
        if (openSheet) {
          toast.info("Relatório gerado em modo local", { description: fb });
          setRiskAiReport(report);
        }
        return;
      }
      const report = payload.report ?? "Não foi possível gerar o relatório.";
      if (cacheKey) {
        setCachedInsightReports((current: Record<string, string>) => ({ ...current, [cacheKey]: report }));
      }
      if (openSheet) setRiskAiReport(report);
    } catch (error: any) {
      if (cacheKey) {
        setCachedInsightReports((current: Record<string, string>) => ({ ...current, [cacheKey]: localReport }));
      }
      const message = error?.message || "A IA demorou para responder. Um relatório local foi gerado com os dados disponíveis.";
      if (openSheet) {
        toast.info("Relatório gerado em modo local", { description: message });
        setRiskAiReport(localReport);
      }
    } finally {
      if (openSheet) setRiskAiLoading(false);
      if (cacheKey) prefetchingInsightReportsRef.current.delete(cacheKey);
    }
  }, [buildLocalAiReport, cachedInsightReports, prefetchingInsightReportsRef, setCachedInsightReports, setRiskAiLoading, setRiskAiOpen, setRiskAiReport, setRiskAiTitle]);

  const generateRiskAiReport = useCallback(async () => {
    await generateAiReport({
      title: "Relatório IA para reduzir risco",
      type: "risk-reduction",
      metrics: {
        periodo: `Ano ${new Date().getFullYear()}`,
        scoreRisco: riskReturn.riskScore,
        scoreRetorno: riskReturn.returnScore,
        classificacao: riskReturn.classification,
        inadimplenciaPercentual: portfolio.defaultRate,
        atrasoMedioDias: Math.round(riskReturn.averageDelayDays),
        concentracaoReceitaPercentual: Number(riskReturn.concentrationShare.toFixed(1)),
        taxaJurosMediaAnual: yearlyAverages.interestRate.rate,
        jurosRecebidosAno: yearlyAverages.interestReceived,
        lucroGerado: data.periodProfitRealized,
        insightAtual: riskReturn.insight,
      },
    });
  }, [data.periodProfitRealized, generateAiReport, portfolio.defaultRate, riskReturn, yearlyAverages]);

  const prioritizedInsights = useMemo<PrioritizedInsight[]>(() => {
    const current = monthComparison.current;
    const previous = monthComparison.previous;
    if (!current) return [];

    const averageLast3 = monthComparison.series.slice(-3).reduce((acc: any, item: any) => ({
      revenue: acc.revenue + item.revenue,
      profit: acc.profit + item.profit,
      interestRate: acc.interestRate + (item.interestRate ?? 0),
      ticketAverage: acc.ticketAverage + item.ticketAverage,
      serviceVolume: acc.serviceVolume + item.serviceVolume,
      overdueRate: acc.overdueRate + item.overdueRate,
      overdueAmount: acc.overdueAmount + item.overdueAmount,
      top3Share: acc.top3Share + item.top3Share,
    }), { revenue: 0, profit: 0, interestRate: 0, ticketAverage: 0, serviceVolume: 0, overdueRate: 0, overdueAmount: 0, top3Share: 0 });

    const divisor = Math.max(1, monthComparison.series.slice(-3).length);
    const avg3 = {
      revenue: averageLast3.revenue / divisor,
      profit: averageLast3.profit / divisor,
      interestRate: averageLast3.interestRate / divisor,
      ticketAverage: averageLast3.ticketAverage / divisor,
      serviceVolume: averageLast3.serviceVolume / divisor,
      overdueRate: averageLast3.overdueRate / divisor,
      overdueAmount: averageLast3.overdueAmount / divisor,
      top3Share: averageLast3.top3Share / divisor,
    };

    const insights: PrioritizedInsight[] = [];
    const revenueVariation = monthComparison.revenueDelta;
    if (revenueVariation !== null && Math.abs(revenueVariation) > 10) {
      insights.push({
        id: "revenue-variation",
        title: revenueVariation > 0 ? "Crescimento de faturamento" : "Queda de faturamento",
        body: revenueVariation > 0
          ? `Seu faturamento cresceu ${Math.abs(revenueVariation).toFixed(1)}% em relação ao mês passado. Continue focando nos contratos e recebimentos que mais puxaram esse avanço.`
          : `Seu faturamento caiu ${Math.abs(revenueVariation).toFixed(1)}% em relação ao mês passado. Revise a entrada de novos contratos e a cadência de recebimentos para reagir rápido.`,
        detail: `Atual: ${rawFormatCurrency(current.revenue)} • Anterior: ${rawFormatCurrency(previous?.revenue ?? 0)} • Média 3 meses: ${rawFormatCurrency(avg3.revenue)}.`,
        recommendation: revenueVariation > 0 ? "Mantenha foco nos produtos, clientes ou contratos que mais contribuíram para esse crescimento." : "Revise originação, cobrança e recorrência de entradas para recuperar ritmo no próximo ciclo.",
        score: Math.abs(current.revenue - (previous?.revenue ?? 0)) + (revenueVariation < 0 ? 35 : 20),
        tone: revenueVariation > 0 ? "positive" : "negative",
      });
    }

    if (interestGoal && current.interestRate !== null) {
      const diff = current.interestRate - interestGoal.targetValue;
      insights.push({
        id: "interest-goal",
        title: diff >= 0 ? "Rentabilidade acima da meta" : "Rentabilidade abaixo da meta",
        body: diff >= 0
          ? `Você está ${Math.abs(diff).toFixed(1)} p.p. acima da meta de juros do mês. Mantenha o mix atual dos contratos mais rentáveis.`
          : `Sua taxa de juros está ${Math.abs(diff).toFixed(1)} p.p. abaixo da meta do mês. Reavalie preço, prazo e condições dos novos empréstimos.`,
        detail: `Taxa atual: ${current.interestRate.toFixed(2)}% • Meta: ${interestGoal.targetValue.toFixed(2)}% • Diferença: ${diff >= 0 ? "+" : "-"}${Math.abs(diff).toFixed(2)} p.p.`,
        recommendation: diff >= 0 ? "Preserve as condições que estão sustentando a rentabilidade sem elevar demais o risco da carteira." : "Ajuste taxa, prazo e seleção de contratos novos para aproximar a rentabilidade da meta.",
        score: Math.abs(diff) * 30 + (diff < 0 ? 30 : 18),
        tone: diff >= 0 ? "positive" : "warning",
      });
    }

    if (current.overdueRate > 0.2 || (previous && current.overdueRate > previous.overdueRate)) {
      const overdueDelta = previous ? (current.overdueRate - previous.overdueRate) * 100 : current.overdueRate * 100;
      insights.push({
        id: "default-risk",
        title: "Alerta de inadimplência",
        body: current.overdueRate > 0.2
          ? `A inadimplência do período está em ${(current.overdueRate * 100).toFixed(1)}%, sinalizando risco elevado. Priorize cobrança e renegociação dos contratos atrasados.`
          : `A inadimplência aumentou ${Math.abs(overdueDelta).toFixed(1)} p.p. versus o mês anterior. Vale revisar sua política de cobrança antes que isso pressione o caixa.`,
        detail: `Inadimplência atual: ${(current.overdueRate * 100).toFixed(1)}% • Anterior: ${((previous?.overdueRate ?? 0) * 100).toFixed(1)}% • Valor em atraso: ${rawFormatCurrency(current.overdueAmount)}.`,
        recommendation: "Ataque primeiro os maiores atrasos e contratos com maior saldo pendente para aliviar o caixa mais rápido.",
        score: (current.overdueAmount || 0) + (current.overdueRate * 1000),
        tone: "negative",
      });
    }

    if (current.ticketAverage > avg3.ticketAverage && current.serviceVolume < avg3.serviceVolume) {
      insights.push({
        id: "efficiency-up",
        title: "Eficiência por cliente maior",
        body: `Seu ticket médio subiu para ${rawFormatCurrency(current.ticketAverage)}, mas o volume caiu para ${current.serviceVolume} atendimentos. Você está ganhando mais por cliente, porém atendendo menos.`,
        detail: `Ticket médio atual: ${rawFormatCurrency(current.ticketAverage)} • Média 3 meses: ${rawFormatCurrency(avg3.ticketAverage)} • Volume atual: ${current.serviceVolume} • Média 3 meses: ${avg3.serviceVolume.toFixed(1)}.`,
        recommendation: "Tente manter o ticket atual enquanto recupera volume com ofertas ou reativação de clientes recorrentes.",
        score: Math.abs(current.ticketAverage - avg3.ticketAverage) + Math.abs(current.serviceVolume - avg3.serviceVolume) * 20,
        tone: "warning",
      });
    }

    if (current.ticketAverage < avg3.ticketAverage && current.serviceVolume > avg3.serviceVolume) {
      insights.push({
        id: "efficiency-down",
        title: "Mais volume com menor ticket",
        body: `O volume subiu para ${current.serviceVolume} atendimentos, mas o ticket médio caiu para ${rawFormatCurrency(current.ticketAverage)}. Você vendeu mais, porém com menor valor por atendimento.`,
        detail: `Volume atual: ${current.serviceVolume} • Média 3 meses: ${avg3.serviceVolume.toFixed(1)} • Ticket médio atual: ${rawFormatCurrency(current.ticketAverage)} • Média 3 meses: ${rawFormatCurrency(avg3.ticketAverage)}.`,
        recommendation: "Avalie combos, reajustes ou upsell para aumentar valor médio sem perder o fluxo atual.",
        score: Math.abs(current.ticketAverage - avg3.ticketAverage) + Math.abs(current.serviceVolume - avg3.serviceVolume) * 20,
        tone: "warning",
      });
    }

    if (current.top3Share > 0.5) {
      insights.push({
        id: "concentration-risk",
        title: "Dependência de poucos clientes",
        body: `${(current.top3Share * 100).toFixed(1)}% da receita do período veio dos 3 principais clientes. Diversificar a carteira reduz o risco de concentração.`,
        detail: `Top 3 clientes representam ${(current.top3Share * 100).toFixed(1)}% da receita no período, acima do nível saudável para uma carteira equilibrada.`,
        recommendation: "Busque distribuir melhor a receita entre mais clientes para reduzir dependência e volatilidade.",
        score: current.top3Share * 1000,
        tone: "warning",
      });
    }

    const visible = insights.sort((a, b) => b.score - a.score).slice(0, 3);
    if (role === "visualizador") {
      return visible.map((item) => ({ ...item, body: item.body.replace(/meta|inadimplência|rentabilidade|carteira/gi, "desempenho") }));
    }
    return visible;
  }, [interestGoal, monthComparison, role]);

  useEffect(() => {
    const negativeInsights = prioritizedInsights.filter((insight) => insight.tone === "negative");

    negativeInsights.forEach((insight) => {
      if (cachedInsightReports[insight.id] || prefetchingInsightReportsRef.current.has(insight.id)) return;
      prefetchingInsightReportsRef.current.add(insight.id);

      void generateAiReport({
        title: `Relatório IA: ${insight.title}`,
        type: "priority-insight",
        cacheKey: insight.id,
        openSheet: false,
        metrics: {
          periodo: range.label,
          insightId: insight.id,
          insightTitulo: insight.title,
          insightResumo: insight.body,
          detalhe: insight.detail,
          recomendacaoAtual: insight.recommendation,
          classificacao: insight.tone,
          scorePrioridade: insight.score,
          scoreRiscoAtual: riskReturn.riskScore,
          scoreRetornoAtual: riskReturn.returnScore,
          inadimplenciaPercentual: portfolio.defaultRate,
          taxaJurosMedia: data.monthlyInterestRate.rate,
          lucroGerado: data.periodProfitRealized,
        },
      });
    });
  }, [cachedInsightReports, data.monthlyInterestRate.rate, data.periodProfitRealized, generateAiReport, portfolio.defaultRate, prefetchingInsightReportsRef, prioritizedInsights, range.label, riskReturn]);

  return { buildLocalAiReport, generateAiReport, generateRiskAiReport, prioritizedInsights };
}
