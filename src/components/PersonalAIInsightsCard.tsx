import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Sparkles, RefreshCw, AlertTriangle, ChevronDown, TrendingUp, Lightbulb, FileText, Target, ArrowRight, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { usePersonalInsights } from "@/hooks/usePersonalInsights";
import { getPersonalCategory, resolvePersonalIcon } from "@/features/financial/lib/personalExpenseCategories";
import { usePersonalExpenseCategories } from "@/features/financial/hooks/usePersonalExpenseCategories";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/userClient";
import { cn } from "@/lib/utils";
import { AIReportAudioPlayer } from "@/components/AIReportAudioPlayer";
import { getPersonalInsightsErrorKind, getPersonalInsightsFallbackContent, isFallbackFunctionPayload, readFunctionErrorMessage } from "@/lib/personalInsightsFallback";

export interface CategoryStat {
  category: string;
  spent: number;
  budget: number;
}

interface Props {
  /** YYYY-MM */
  month: string;
  /** Categories that are currently exceeding their budget — used to auto-refresh on changes. */
  exceededCategories: string[];
  /** True when there's at least one expense in the month — avoids generating on empty months. */
  hasExpenses: boolean;
  /** Per-category spend vs budget — drives the "Oportunidades" cards. */
  categoryStats: CategoryStat[];
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/**
 * Parse the AI markdown to extract per-category bullet lines from the
 * "💡 Oportunidades de redução" section. We match a category name appearing
 * in bold (**Categoria**) or as the first word(s) of the bullet.
 */
function extractCategorySuggestions(content: string, categories: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const sections = content.split(/(?=^##\s)/m);
  const oppSection = sections.find((s) => /##\s.*Oportunidades/i.test(s)) || "";
  const bullets = oppSection
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s+/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, ""));

  for (const bullet of bullets) {
    for (const cat of categories) {
      const lower = bullet.toLowerCase();
      if (lower.includes(cat.toLowerCase())) {
        const arr = map.get(cat) || [];
        arr.push(bullet);
        map.set(cat, arr);
        break;
      }
    }
  }
  return map;
}

export function PersonalAIInsightsCard({
  month,
  exceededCategories,
  hasExpenses,
  categoryStats = [],
}: Props) {
  const { data, loading, error, generate } = usePersonalInsights(month);
  const { categories: customCategoriesRaw } = usePersonalExpenseCategories();
  const customCategoryList = useMemo(
    () => customCategoriesRaw.map((c) => ({ name: c.name, icon: resolvePersonalIcon(c.icon), color: c.color })),
    [customCategoriesRaw],
  );
  const lastAutoKeyRef = useRef<string | null>(null);
  const [hasAutoTried, setHasAutoTried] = useState(false);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [showFullReport, setShowFullReport] = useState(false);
  const [reportCategory, setReportCategory] = useState<string | null>(null);
  const [catReport, setCatReport] = useState<string | null>(null);
  const [catReportLoading, setCatReportLoading] = useState(false);
  const [catReportError, setCatReportError] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // Fetch a per-category ad-hoc report when user opens "Ver detalhes completos"
  const openCategoryReport = async (category: string) => {
    setReportCategory(category);
    setShowFullReport(true);
    setCatReport(null);
    setCatReportError(null);
    setCatReportLoading(true);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke(
        "generate-personal-insights",
        { body: { month, category } },
      );
      if (fnError) {
        const message = await readFunctionErrorMessage(fnError);
        setCatReport(getPersonalInsightsFallbackContent(getPersonalInsightsErrorKind(message)));
        return;
      }
      if (isFallbackFunctionPayload(result)) {
        setCatReport((result as any)?.content || getPersonalInsightsFallbackContent("credits"));
        return;
      }
      if ((result as any)?.error) throw new Error((result as any).error);
      setCatReport((result as any).content);
    } catch (e: any) {
      setCatReportError(e?.message || "Falha ao gerar análise da categoria");
    } finally {
      setCatReportLoading(false);
    }
  };

  const openGeneralReport = () => {
    setReportCategory(null);
    setCatReport(null);
    setCatReportError(null);
    setShowFullReport(true);
  };

  // Auto-generate on open (once per month) if no cached version, and on exceeded changes
  useEffect(() => {
    if (!hasExpenses) return;
    const key = `${month}|${exceededCategories.sort().join(",")}`;
    if (!hasAutoTried && !data && !loading) {
      setHasAutoTried(true);
      lastAutoKeyRef.current = key;
      generate(false).catch(() => { /* surface via toast below */ });
      return;
    }
    if (data && lastAutoKeyRef.current && lastAutoKeyRef.current !== key) {
      const prevExceeded = lastAutoKeyRef.current.split("|")[1];
      const currExceeded = exceededCategories.sort().join(",");
      if (prevExceeded !== currExceeded) {
        lastAutoKeyRef.current = key;
        generate(true).catch(() => { /* ignore */ });
      }
    }
    if (!lastAutoKeyRef.current) lastAutoKeyRef.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, exceededCategories.join(","), data, hasExpenses]);

  const handleRefresh = async () => {
    try {
      await generate(true);
      toast.success("Relatório atualizado");
    } catch (e: any) {
      toast.error("Falha ao gerar relatório", { description: e?.message });
    }
  };

  // Per-category AI suggestions
  const suggestionsByCat = useMemo(() => {
    if (!data?.content) return new Map<string, string[]>();
    return extractCategorySuggestions(
      data.content,
      categoryStats.map((s) => s.category),
    );
  }, [data?.content, categoryStats]);

  // Sort: exceeded first, then highest pct, then any with budget > 0, then with spend
  const sortedStats = useMemo(() => {
    return [...categoryStats]
      .filter((s) => s.spent > 0 || s.budget > 0)
      .map((s) => ({
        ...s,
        pct: s.budget > 0 ? (s.spent / s.budget) * 100 : 0,
        over: s.budget > 0 && s.spent > s.budget,
        hasSuggestion: suggestionsByCat.has(s.category),
      }))
      .sort((a, b) => {
        // Exceeded > has suggestion > highest pct > highest spend
        if (a.over !== b.over) return a.over ? -1 : 1;
        if (a.hasSuggestion !== b.hasSuggestion) return a.hasSuggestion ? -1 : 1;
        if (a.budget > 0 && b.budget > 0) return b.pct - a.pct;
        return b.spent - a.spent;
      });
  }, [categoryStats, suggestionsByCat]);

  const MAX_VISIBLE = 6;
  const visibleStats = useMemo(() => sortedStats.slice(0, MAX_VISIBLE), [sortedStats]);
  const hasMore = sortedStats.length > MAX_VISIBLE;

  if (!hasExpenses) return null;

  // Markdown content for the "Último Relatório" subcard (everything except Oportunidades)
  const restContent = data
    ? data.content
        .split(/(?=^##\s)/m)
        .filter((s) => !/##\s.*Oportunidades/i.test(s))
        .join("")
        .trim()
    : "";

  const proseClasses = `prose prose-sm dark:prose-invert max-w-none
    prose-headings:text-foreground prose-p:text-foreground
    prose-strong:text-foreground prose-li:text-foreground
    prose-h2:text-sm prose-h2:font-semibold prose-h2:mt-2 prose-h2:mb-1
    prose-p:my-1 prose-ul:my-1 prose-li:my-0.5`;

  return (
    <Card no3d className="border-primary/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary/20 to-accent/30 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm text-foreground">
                Relatório Inteligente
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Análise gerada por IA com base nos seus gastos do mês
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent("app:navigate", {
                        detail: {
                          tab: "overdue",
                          subTab: "bot-telegram",
                          scrollTo: "telegram-bots-hub",
                        },
                      }),
                    );
                  }}
                  className="shrink-0"
                  aria-label="Configurar envio do relatório no Telegram"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span className="hidden md:inline ml-1">Configurar</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Configurar envio no Telegram</TooltipContent>
            </Tooltip>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              disabled={loading}
              className="shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline ml-1">Atualizar</span>
            </Button>
            {data?.content && (
              <AIReportAudioPlayer
                text={data.content}
                cacheKey={`personal-${month}-${data.generated_at ?? ""}`}
                compact
              />
            )}
          </div>
        </div>

        {exceededCategories.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            <span className="text-muted-foreground">Categorias estouradas:</span>
            {exceededCategories.map((c) => (
              <Badge key={c} variant="destructive" className="text-[10px] py-0 px-1.5">
                {c}
              </Badge>
            ))}
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
            <Sparkles className="h-4 w-4 animate-pulse text-primary" />
            Gerando análise inteligente…
          </div>
        )}

        {error && !data && (
          <div className="text-sm text-destructive p-3 rounded-md bg-destructive/10">
            {error}
          </div>
        )}

        {data && (
          <div className="rounded-lg border border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-primary" />
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Oportunidades por Categoria
                </h4>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={openGeneralReport}
                className="h-7 px-2 text-xs gap-1 text-primary hover:text-primary"
              >
                <FileText className="h-3 w-3" />
                Ver mais
              </Button>
            </div>

            {sortedStats.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                Nenhuma categoria com dados suficientes neste mês.
              </p>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                {visibleStats.map((s) => {
                  const cat = getPersonalCategory(s.category, customCategoryList);
                  const Icon = cat.icon;
                  const isOpen = expandedCat === s.category;
                  const suggestions = suggestionsByCat.get(s.category) || [];
                  const barPct = Math.min(100, s.pct);
                  const barColor = s.over
                    ? "bg-destructive"
                    : "bg-[hsl(210_85%_55%)]";
                  const overPct = s.budget > 0 && s.over
                    ? ((s.spent - s.budget) / s.budget) * 100
                    : 0;
                  const action = s.over
                    ? `Reduzir gastos de ${s.category} ou renegociar limite`
                    : s.budget === 0
                    ? `Definir um orçamento mensal`
                    : s.pct >= 80
                    ? `Evitar novos gastos não essenciais`
                    : `Continuar monitorando — sob controle`;

                  return (
                    <div
                      key={s.category}
                      className={cn(
                        "rounded-lg border bg-card transition-colors duration-200",
                        s.over ? "border-destructive/40" : "border-border",
                        isOpen && "border-primary/40 ring-1 ring-primary/20",
                      )}
                    >
                      {/* Fixed header (always visible) */}
                      <button
                        type="button"
                        onClick={() => setExpandedCat(isOpen ? null : s.category)}
                        className={cn(
                          "w-full text-left p-2.5 rounded-lg",
                          "hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                        )}
                        aria-expanded={isOpen}
                        aria-controls={`opp-detail-${s.category}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="h-7 w-7 rounded-md flex items-center justify-center shrink-0"
                              style={{
                                backgroundColor: `hsl(${cat.color} / 0.15)`,
                                color: `hsl(${cat.color})`,
                              }}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-foreground truncate">
                                {s.category}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {fmt(s.spent)}
                                {s.budget > 0 ? ` / ${fmt(s.budget)}` : " · sem limite"}
                              </p>
                            </div>
                          </div>
                          <ChevronDown
                            className={cn(
                              "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200",
                              isOpen && !isMobile && "rotate-180",
                            )}
                          />
                        </div>

                        {/* Progress bar — always visible */}
                        <div className="mt-2 space-y-0.5">
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all duration-500", barColor)}
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className={cn(s.over ? "text-destructive font-medium" : "text-muted-foreground")}>
                              {s.budget > 0 ? `${s.pct.toFixed(0)}% do limite` : "—"}
                            </span>
                            {s.over && (
                              <span className="text-destructive font-medium inline-flex items-center gap-0.5">
                                <TrendingUp className="h-2.5 w-2.5" /> Estourado
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Inline accordion (desktop/tablet only) */}
                      {!isMobile && (
                        <div
                          id={`opp-detail-${s.category}`}
                          className={cn(
                            "grid transition-all duration-200 ease-out",
                            isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                          )}
                        >
                          <div className="overflow-hidden">
                            <div className="px-2.5 pb-2.5">
                              <DetailBlocks
                                category={s.category}
                                spent={s.spent}
                                budget={s.budget}
                                over={s.over}
                                overPct={overPct}
                                suggestions={suggestions}
                                action={action}
                                onOpenFullReport={() => openCategoryReport(s.category)}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {hasMore && (
              <button
                type="button"
                onClick={openGeneralReport}
                className="w-full text-center text-[11px] text-primary hover:underline pt-1"
              >
                +{sortedStats.length - MAX_VISIBLE} categorias adicionais — ver no relatório completo
              </button>
            )}
          </div>
        )}
      </CardContent>

      {/* Mobile bottom sheet for expanded category */}
      {isMobile && (
        <Sheet
          open={!!expandedCat}
          onOpenChange={(o) => !o && setExpandedCat(null)}
        >
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
            {(() => {
              const s = sortedStats.find((x) => x.category === expandedCat);
              if (!s) return null;
              const cat = getPersonalCategory(s.category, customCategoryList);
              const Icon = cat.icon;
              const suggestions = suggestionsByCat.get(s.category) || [];
              const overPct = s.budget > 0 && s.over
                ? ((s.spent - s.budget) / s.budget) * 100
                : 0;
              const action = s.over
                ? `Reduzir gastos de ${s.category} ou renegociar limite`
                : s.budget === 0
                ? `Definir um orçamento mensal`
                : s.pct >= 80
                ? `Evitar novos gastos não essenciais`
                : `Continuar monitorando — sob controle`;
              return (
                <>
                  <SheetHeader className="text-left">
                    <SheetTitle className="flex items-center gap-2">
                      <div
                        className="h-8 w-8 rounded-md flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: `hsl(${cat.color} / 0.15)`,
                          color: `hsl(${cat.color})`,
                        }}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      {s.category}
                    </SheetTitle>
                    <SheetDescription>
                      {fmt(s.spent)}{s.budget > 0 ? ` de ${fmt(s.budget)}` : " · sem limite"}
                    </SheetDescription>
                  </SheetHeader>
                  {/* Progress bar in sheet */}
                  <div className="mt-3 space-y-1">
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          s.over ? "bg-destructive" : "bg-[hsl(210_85%_55%)]",
                        )}
                        style={{ width: `${Math.min(100, s.pct)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className={cn(s.over ? "text-destructive font-medium" : "text-muted-foreground")}>
                        {s.budget > 0 ? `${s.pct.toFixed(0)}% do limite` : "—"}
                      </span>
                      {s.over && (
                        <span className="text-destructive font-medium inline-flex items-center gap-0.5">
                          <TrendingUp className="h-3 w-3" /> Estourado
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-4">
                    <DetailBlocks
                      category={s.category}
                      spent={s.spent}
                      budget={s.budget}
                      over={s.over}
                      overPct={overPct}
                      suggestions={suggestions}
                      action={action}
                      onOpenFullReport={() => {
                        const cat = s.category;
                        setExpandedCat(null);
                        openCategoryReport(cat);
                      }}
                    />
                  </div>
                </>
              );
            })()}
          </SheetContent>
        </Sheet>
      )}

      {/* Full report dialog (general OR per-category) */}
      <Dialog
        open={showFullReport}
        onOpenChange={(o) => {
          setShowFullReport(o);
          if (!o) {
            setReportCategory(null);
            setCatReport(null);
            setCatReportError(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            {reportCategory ? (
              (() => {
                const cat = getPersonalCategory(reportCategory, customCategoryList);
                const Icon = cat.icon;
                return (
                  <>
                    <Badge variant="outline" className="w-fit text-[10px] gap-1 mb-1 border-primary/30 text-primary">
                      <Sparkles className="h-2.5 w-2.5" /> Relatório individual
                    </Badge>
                    <DialogTitle className="flex items-center gap-2">
                      <div
                        className="h-8 w-8 rounded-md flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: `hsl(${cat.color} / 0.15)`,
                          color: `hsl(${cat.color})`,
                        }}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      {reportCategory}
                    </DialogTitle>
                    <DialogDescription>
                      Análise específica desta categoria, gerada por IA com base nos seus gastos do mês.
                    </DialogDescription>
                  </>
                );
              })()
            ) : (
              <>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Relatório Inteligente — Visão geral
                </DialogTitle>
                <DialogDescription>
                  Análise completa do mês com insights e recomendações de todas as categorias.
                </DialogDescription>
              </>
            )}
          </DialogHeader>

          {/* Per-category content */}
          {reportCategory ? (
            <div className="space-y-3">
              {catReportLoading && (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground gap-2">
                  <Sparkles className="h-4 w-4 animate-pulse text-primary" />
                  Gerando análise de {reportCategory}…
                </div>
              )}
              {catReportError && !catReportLoading && (
                <div className="text-sm text-destructive p-3 rounded-md bg-destructive/10">
                  {catReportError}
                </div>
              )}
              {catReport && !catReportLoading && (
                <>
                  <div className="flex justify-end">
                    <AIReportAudioPlayer
                      text={catReport}
                      cacheKey={`personal-cat-${month}-${reportCategory}`}
                    />
                  </div>
                  <div className={proseClasses}>
                    <ReactMarkdown>{catReport}</ReactMarkdown>
                  </div>
                </>
              )}
              {catReport && !catReportLoading && (
                <div className="pt-2 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setReportCategory(null);
                      setCatReport(null);
                    }}
                    className="text-xs gap-1 h-7"
                  >
                    <ArrowRight className="h-3 w-3 rotate-180" /> Ver relatório geral do mês
                  </Button>
                </div>
              )}
            </div>
          ) : (
            data && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <AIReportAudioPlayer
                    text={restContent || data.content}
                    cacheKey={`personal-full-${month}-${data.generated_at ?? ""}`}
                  />
                </div>
                <div className={proseClasses}>
                  <ReactMarkdown>{restContent || data.content}</ReactMarkdown>
                </div>
                {data.generated_at && (
                  <p className="text-[10px] text-muted-foreground pt-2 border-t border-border">
                    Gerado em {new Date(data.generated_at).toLocaleString("pt-BR")}
                    {data.cached ? " (em cache)" : ""}
                  </p>
                )}
              </div>
            )
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface DetailBlocksProps {
  category: string;
  spent: number;
  budget: number;
  over: boolean;
  overPct: number;
  suggestions: string[];
  action: string;
  onOpenFullReport: () => void;
}

function DetailBlocks({
  category,
  spent,
  budget,
  over,
  overPct,
  suggestions,
  action,
  onOpenFullReport,
}: DetailBlocksProps) {
  const summary = over
    ? `Você ultrapassou em ${overPct.toFixed(0)}% (${fmt(spent - budget)} acima)`
    : budget === 0
    ? `Sem limite definido — ${fmt(spent)} gastos no mês`
    : `${fmt(Math.max(0, budget - spent))} disponíveis até o fim do mês`;

  return (
    <div className="space-y-2.5 text-[11px] animate-fade-in">
      {/* Resumo rápido */}
      <div className="rounded-md bg-muted/40 px-2 py-1.5 flex items-start gap-1.5">
        <TrendingUp className={cn("h-3 w-3 mt-0.5 shrink-0", over ? "text-destructive" : "text-primary")} />
        <p className={cn("font-medium", over ? "text-destructive" : "text-foreground")}>
          {summary}
        </p>
      </div>

      {/* Sugestões da IA */}
      <div>
        <p className="font-semibold text-foreground flex items-center gap-1 mb-1">
          <Lightbulb className="h-3 w-3 text-primary" /> Sugestões da IA
        </p>
        {suggestions.length > 0 ? (
          <ul className="space-y-1 text-foreground/90">
            {suggestions.slice(0, 3).map((sug, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-primary mt-0.5">•</span>
                <span className="flex-1">
                  <ReactMarkdown components={{ p: ({ children }) => <span>{children}</span> }}>
                    {sug}
                  </ReactMarkdown>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground italic">Sem recomendação específica para esta categoria.</p>
        )}
      </div>

      <div className="border-t border-border/60" />

      {/* Ação recomendada */}
      <div>
        <p className="font-semibold text-foreground flex items-center gap-1 mb-1">
          <Target className="h-3 w-3 text-primary" /> Ação recomendada
        </p>
        <p className="text-muted-foreground">{action}</p>
      </div>

      {/* CTA: ver relatório completo */}
      <Button
        variant="outline"
        size="sm"
        onClick={onOpenFullReport}
        className="w-full h-7 text-xs gap-1 mt-1"
      >
        Ver detalhes completos
        <ArrowRight className="h-3 w-3" />
      </Button>
    </div>
  );
}
