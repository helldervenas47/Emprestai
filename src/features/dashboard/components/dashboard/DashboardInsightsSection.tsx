import { useState } from "react";
import { todayInAppTz } from "@/lib/timezone";
import ReactMarkdown from "react-markdown";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArrowUpRight, ArrowDownRight, Trash2, Sparkles, ChevronDown } from "lucide-react";
import { AIReportAudioPlayer } from "@/components/AIReportAudioPlayer";
import type { useDashboardMetrics } from "@/features/dashboard/components/dashboard/useDashboardMetrics";

type Metrics = ReturnType<typeof useDashboardMetrics>;

interface Props {
  readOnly: boolean;
  isMobile: boolean;
  rangeLabel: string;
  formatCurrency: (v: number) => string;
  data: Metrics["data"];
  receivedDetail: Metrics["receivedDetail"];
  // Transactions
  txFilter: "all" | "in" | "out";
  setTxFilter: (f: "all" | "in" | "out") => void;
  showAllTx: boolean;
  setShowAllTx: (b: boolean) => void;
  onDeletePayment?: (id: string) => void;
  onDeleteSale?: (id: string) => void;
  onDeleteLoan?: (id: string) => void;
  // Health info
  showHealthInfo: boolean;
  setShowHealthInfo: (b: boolean) => void;
  // Interest received sheet
  showInterestDetail: boolean;
  setShowInterestDetail: (b: boolean) => void;
  interestReceivedSearch: string;
  setInterestReceivedSearch: (s: string) => void;
  // Received by method
  receivedDetailMethodId: string | null;
  setReceivedDetailMethodId: (id: string | null) => void;
  // Interest expected sheet
  showInterestExpectedDetail: boolean;
  setShowInterestExpectedDetail: (b: boolean) => void;
  interestExpectedFilter: "all" | "pending" | "overdue";
  setInterestExpectedFilter: (f: "all" | "pending" | "overdue") => void;
  interestExpectedSearch: string;
  setInterestExpectedSearch: (s: string) => void;
  // Risk AI
  riskAiOpen: boolean;
  setRiskAiOpen: (b: boolean) => void;
  riskAiLoading: boolean;
  riskAiReport: string;
  riskAiTitle: string;
  generateRiskAiReport: () => void;
}

export function DashboardInsightsSection(props: Props) {
  const {
    readOnly, isMobile, rangeLabel, formatCurrency,
    data, receivedDetail,
    txFilter, setTxFilter, showAllTx, setShowAllTx,
    onDeletePayment, onDeleteSale, onDeleteLoan,
    showHealthInfo, setShowHealthInfo,
    showInterestDetail, setShowInterestDetail,
    interestReceivedSearch, setInterestReceivedSearch,
    receivedDetailMethodId, setReceivedDetailMethodId,
    showInterestExpectedDetail, setShowInterestExpectedDetail,
    interestExpectedFilter, setInterestExpectedFilter,
    interestExpectedSearch, setInterestExpectedSearch,
    riskAiOpen, setRiskAiOpen, riskAiLoading, riskAiReport, riskAiTitle, generateRiskAiReport,
  } = props;

  const [movementsOpen, setMovementsOpen] = useState(false);

  return (
    <>
      {/* Monthly transactions */}
      <Card no3d>
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setMovementsOpen((o) => !o)}
              aria-expanded={movementsOpen}
              className="flex items-center gap-2 text-left"
            >
              <h3 className="text-sm font-semibold text-foreground">Movimentações — {rangeLabel}</h3>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${movementsOpen ? "rotate-180" : ""}`} />
            </button>
            {movementsOpen && (
              <div className="flex items-center gap-2">
                <div className="flex bg-muted rounded-lg p-0.5">
                  {([
                    { id: "in" as const, label: "Entradas" },
                    { id: "out" as const, label: "Saídas" },
                  ]).map((f) => (
                    <button type="button" key={f.id} onClick={() => setTxFilter(f.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${txFilter === f.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
                {!showAllTx && data.transactions.length > 10 && (
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowAllTx(true)}>
                    Ver todas ({data.transactions.length})
                  </Button>
                )}
                {showAllTx && (
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowAllTx(false)}>
                    Resumir
                  </Button>
                )}
              </div>
            )}
          </div>

          {movementsOpen && (
            <div className="mt-4">
              {(() => {
                const filtered = data.transactions.filter((t) => txFilter === "all" ? true : t.type === txFilter);
                const displayed = showAllTx ? filtered : filtered.slice(0, 10);
                const totalIn = filtered.filter(t => t.type === "in").reduce((s, t) => s + t.amount, 0);
                const totalOut = filtered.filter(t => t.type === "out").reduce((s, t) => s + t.amount, 0);

                if (filtered.length === 0) {
                  return <p className="text-sm text-muted-foreground text-center py-6">Nenhuma movimentação no período</p>;
                }

                return (
                  <>
                    <div className="flex gap-4 mb-3 text-xs">
                      {(txFilter === "all" || txFilter === "in") && (
                        <span className="text-success font-medium">↑ Entradas: {formatCurrency(totalIn)} ({filtered.filter(t => t.type === "in").length})</span>
                      )}
                      {(txFilter === "all" || txFilter === "out") && (
                        <span className="text-destructive font-medium">↓ Saídas: {formatCurrency(totalOut)} ({filtered.filter(t => t.type === "out").length})</span>
                      )}
                    </div>
                    <div className={`space-y-2 ${showAllTx ? "max-h-[600px]" : "max-h-[400px]"} overflow-y-auto`}>
                      {displayed.map((t) => (
                        <div key={t.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${t.type === "in" ? "bg-success/10" : "bg-destructive/10"}`}>
                            {t.type === "in" ? <ArrowUpRight className="h-4 w-4 text-success" /> : <ArrowDownRight className="h-4 w-4 text-destructive" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{t.description}</p>
                            <p className="text-xs text-muted-foreground">{new Date(`${t.date}T00:00:00`).toLocaleDateString("pt-BR")}</p>
                          </div>
                          <span className={`text-sm font-semibold shrink-0 ${t.type === "in" ? "text-success" : "text-destructive"}`}>
                            {t.type === "in" ? "+" : "−"}{formatCurrency(t.amount)}
                          </span>
                          {!readOnly && (
                            <Button
                              size="icon" variant="ghost"
                              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                if (t.source === "payment" && onDeletePayment) onDeletePayment(t.id);
                                else if (t.source === "sale" && onDeleteSale) onDeleteSale(t.id);
                                else if (t.source === "loan" && onDeleteLoan) onDeleteLoan(t.id);
                              }}
                              title="Excluir lançamento"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Health Info Dialog */}
      <Dialog open={showHealthInfo} onOpenChange={setShowHealthInfo}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Como cada indicador é calculado
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-4 text-sm">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="font-semibold text-foreground mb-1">Score (0–100)</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Pontuação geral da carteira combinando taxa de recebimento, inadimplência e atividade dos contratos.
                Acima de <span className="text-success font-medium">70</span> = saudável,
                entre <span className="text-warning font-medium">40 e 70</span> = atenção,
                abaixo de <span className="text-destructive font-medium">40</span> = crítico.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="font-semibold text-foreground mb-1">Taxa de Recebimento</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Percentual do que já foi efetivamente recebido em relação ao total esperado da carteira no período.
                <br />
                <span className="font-mono text-[11px]">= (Recebido ÷ Total esperado) × 100</span>
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="font-semibold text-foreground mb-1">Inadimplência</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Percentual do valor da carteira que está em atraso em relação ao total a receber.
                <br />
                <span className="font-mono text-[11px]">= (Valor atrasado ÷ Total a receber) × 100</span>
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="font-semibold text-foreground mb-1">Recebido</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Soma de todos os pagamentos efetivamente registrados no período selecionado (critério: data de pagamento).
                Inclui parcelas, juros avulsos e quitações.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="font-semibold text-foreground mb-1">Atrasado</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Soma do valor restante de todas as parcelas com vencimento anterior à data de hoje que ainda não foram quitadas.
                O número de contratos abaixo é a quantidade de empréstimos com pelo menos uma parcela vencida.
                Clique no card para ver o detalhamento por cliente.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Interest Detail Sheet */}
      <Sheet open={showInterestDetail} onOpenChange={setShowInterestDetail}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
          <SheetHeader>
            <SheetTitle>Juros Recebidos — {rangeLabel}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            <Input
              placeholder="Buscar por nome do cliente..."
              value={interestReceivedSearch}
              onChange={(e) => setInterestReceivedSearch(e.target.value)}
              className="h-9"
            />
            {(() => {
              const q = interestReceivedSearch.trim().toLowerCase();
              const filtered = q
                ? data.interestDetailRecords.filter((r) => r.borrowerName.toLowerCase().includes(q))
                : data.interestDetailRecords;
              if (filtered.length === 0) {
                return <p className="text-sm text-muted-foreground text-center py-4">Nenhum registro encontrado.</p>;
              }
              return (
                <>
                  {filtered.map((rec, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/30">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <p className="text-sm font-medium truncate">{rec.borrowerName}</p>
                          {rec.tags && rec.tags.length > 0 && rec.tags.map((t, idx) => (
                            <Badge key={idx} variant="outline" className="text-[9px] h-4 py-0 px-1 border-primary/40 text-primary bg-primary/5">
                              #{t}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(rec.date + "T00:00:00").toLocaleDateString("pt-BR")} — {rec.type === "quitação" ? "Lucro na quitação" : "Juros da parcela"}
                        </p>
                      </div>
                      <div className="text-right ml-3">
                        <p className="text-sm font-bold text-warning">{formatCurrency(rec.interestPortion)}</p>
                        {rec.type === "juros" && (
                          <p className="text-[10px] text-muted-foreground">de {formatCurrency(rec.totalPayment)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <p className="text-sm font-semibold">Total{q ? " (filtrado)" : ""}</p>
                    <p className="text-sm font-bold text-warning">
                      {formatCurrency(filtered.reduce((s, r) => s + r.interestPortion, 0))}
                    </p>
                  </div>
                </>
              );
            })()}
          </div>
        </SheetContent>
      </Sheet>

      {/* Received by payment method detail */}
      <Sheet open={!!receivedDetailMethodId} onOpenChange={(o) => { if (!o) setReceivedDetailMethodId(null); }}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Recebido via {receivedDetail?.methodName} — {rangeLabel}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {!receivedDetail || receivedDetail.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum recebimento nesta forma de pagamento no período.</p>
            ) : (
              <>
                {receivedDetail.rows.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/30">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.borrowerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.date + "T00:00:00").toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-success ml-3">{formatCurrency(r.amount)}</p>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <p className="text-sm font-semibold">Total</p>
                  <p className="text-sm font-bold text-success">{formatCurrency(receivedDetail.total)}</p>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Interest Expected Detail Sheet */}
      <Sheet open={showInterestExpectedDetail} onOpenChange={setShowInterestExpectedDetail}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
          <SheetHeader>
            <SheetTitle>
              {interestExpectedFilter === "pending"
                ? "Juros Pendentes do Mês"
                : interestExpectedFilter === "overdue"
                ? "Juros Vencidos"
                : "Juros a Receber no Mês"} — {rangeLabel}
            </SheetTitle>
          </SheetHeader>
          {(() => {
            const q = interestExpectedSearch.trim().toLowerCase();
            const matches = (name: string) => !q || name.toLowerCase().includes(q);
            const today = todayInAppTz();
            const allPending = data.interestExpectedRecords
              .filter((r) => !r.paid && matches(r.borrowerName))
              .slice()
              .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
            const overdueRecs = allPending.filter((r) => r.dueDate < today);
            const pendingRecs = interestExpectedFilter === "overdue" ? overdueRecs : allPending;
            const pendingTotal = pendingRecs.reduce((s, r) => s + r.interestPortion, 0);
            const overdueTotal = overdueRecs.reduce((s, r) => s + r.interestPortion, 0);
            const receivedRecs = data.interestDetailRecords
              .filter((r) => matches(r.borrowerName))
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date));
            const receivedTotal = receivedRecs.reduce((s, r) => s + r.interestPortion, 0);
            const showReceived = interestExpectedFilter === "all";
            const isOverdueView = interestExpectedFilter === "overdue";
            const pendingLabel = isOverdueView ? "Vencidos" : "Pendentes";
            const pendingColor = isOverdueView ? "text-destructive" : "text-warning";
            const pendingValueColor = isOverdueView ? "text-destructive" : "text-warning";
            const grandTotal = pendingTotal + (showReceived ? receivedTotal : 0);
            return (
              <div className="mt-4 space-y-4">
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant={interestExpectedFilter === "all" ? "default" : "outline"} onClick={() => setInterestExpectedFilter("all")} className="h-8 text-xs">Todos</Button>
                  <Button size="sm" variant={interestExpectedFilter === "pending" ? "default" : "outline"} onClick={() => setInterestExpectedFilter("pending")} className="h-8 text-xs">Pendentes ({allPending.length})</Button>
                  <Button size="sm" variant={interestExpectedFilter === "overdue" ? "default" : "outline"} onClick={() => setInterestExpectedFilter("overdue")} className="h-8 text-xs">Vencidos ({overdueRecs.length})</Button>
                </div>
                <Input
                  placeholder="Buscar por nome do cliente..."
                  value={interestExpectedSearch}
                  onChange={(e) => setInterestExpectedSearch(e.target.value)}
                  className="h-9"
                />
                {showReceived && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-success">Recebidos</p>
                      <p className="text-xs text-muted-foreground">{receivedRecs.length} registro(s)</p>
                    </div>
                    {receivedRecs.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-3">Nenhum juros recebido neste período.</p>
                    ) : (
                      <>
                        {receivedRecs.map((rec, i) => (
                          <div key={`r-${i}`} className="flex items-center justify-between p-3 rounded-lg bg-success/5 border border-success/30">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-success/20 text-success">Recebido</span>
                                <p className="text-sm font-medium truncate">{rec.borrowerName}</p>
                                {rec.tags && rec.tags.length > 0 && rec.tags.map((t, idx) => (
                                  <Badge key={idx} variant="outline" className="text-[9px] h-4 py-0 px-1 border-primary/40 text-primary bg-primary/5">
                                    #{t}
                                  </Badge>
                                ))}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {new Date(rec.date + "T00:00:00").toLocaleDateString("pt-BR")} — {rec.type}
                              </p>
                            </div>
                            <div className="text-right ml-3">
                              <p className="text-sm font-bold text-success">{formatCurrency(rec.interestPortion)}</p>
                              <p className="text-[10px] text-muted-foreground">de {formatCurrency(rec.totalPayment)}</p>
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between pt-2 border-t border-border/60">
                          <p className="text-xs font-semibold">Subtotal recebido</p>
                          <p className="text-sm font-bold text-success">{formatCurrency(receivedTotal)}</p>
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className={`text-xs font-semibold uppercase tracking-wider ${pendingColor}`}>{pendingLabel}</p>
                    <p className="text-xs text-muted-foreground">{pendingRecs.length} registro(s)</p>
                  </div>
                  {pendingRecs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">
                      {isOverdueView ? "Nenhum juros vencido." : "Nenhum juros pendente neste período."}
                    </p>
                  ) : (
                    <>
                      {pendingRecs.map((rec, i) => {
                        const isOverdue = rec.dueDate < today;
                        const rowBg = isOverdueView || isOverdue ? "bg-destructive/5 border-destructive/30" : "bg-warning/5 border-warning/30";
                        const badgeBg = isOverdueView || isOverdue ? "bg-destructive/20 text-destructive" : "bg-warning/20 text-warning";
                        const valueColor = isOverdueView || isOverdue ? "text-destructive" : "text-warning";
                        const badgeLabel = isOverdueView || isOverdue ? "Vencido" : "Pendente";
                        return (
                          <div key={`p-${i}`} className={`flex items-center justify-between p-3 rounded-lg border ${rowBg}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${badgeBg}`}>{badgeLabel}</span>
                                <p className="text-sm font-medium truncate">{rec.borrowerName}</p>
                                {rec.tags && rec.tags.length > 0 && rec.tags.map((t, idx) => (
                                  <Badge key={idx} variant="outline" className="text-[9px] h-4 py-0 px-1 border-primary/40 text-primary bg-primary/5">
                                    #{t}
                                  </Badge>
                                ))}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {new Date(rec.dueDate + "T00:00:00").toLocaleDateString("pt-BR")} — Parcela {rec.installmentNumber}/{rec.totalInstallments}
                              </p>
                            </div>
                            <div className="text-right ml-3">
                              <p className={`text-sm font-bold ${valueColor}`}>{formatCurrency(rec.interestPortion)}</p>
                              <p className="text-[10px] text-muted-foreground">de {formatCurrency(rec.installmentAmount)}</p>
                            </div>
                          </div>
                        );
                      })}
                      {(() => {
                        const overdueInView = pendingRecs.filter((r) => r.dueDate < today);
                        const dueSoonInView = pendingRecs.filter((r) => r.dueDate >= today);
                        const overdueInViewTotal = overdueInView.reduce((s, r) => s + r.interestPortion, 0);
                        const dueSoonInViewTotal = dueSoonInView.reduce((s, r) => s + r.interestPortion, 0);
                        return (
                          <div className="mt-2 space-y-1 rounded-lg border border-border/60 bg-muted/30 p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-medium text-destructive">
                                Subtotal Vencidos ({overdueInView.length})
                              </p>
                              <p className="text-sm font-semibold text-destructive">{formatCurrency(overdueInViewTotal)}</p>
                            </div>
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-medium text-warning">
                                Subtotal Pendentes ({dueSoonInView.length})
                              </p>
                              <p className="text-sm font-semibold text-warning">{formatCurrency(dueSoonInViewTotal)}</p>
                            </div>
                          </div>
                        );
                      })()}
                      <div className="flex items-center justify-between pt-2 border-t border-border/60">
                        <p className="text-xs font-semibold">Subtotal {pendingLabel}</p>
                        <p className={`text-sm font-bold ${pendingValueColor}`}>{formatCurrency(pendingTotal)}</p>
                      </div>

                    </>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t-2 border-border">
                  <p className="text-sm font-semibold">
                    {showReceived
                      ? "Total (Recebidos + Pendentes)"
                      : isOverdueView
                      ? "Total Vencidos"
                      : "Total Pendente"}
                  </p>
                  <p className="text-base font-bold text-foreground">{formatCurrency(grandTotal)}</p>
                </div>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Risk AI Dialog/Sheet */}
      {isMobile ? (
        <Sheet open={riskAiOpen} onOpenChange={setRiskAiOpen}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl bg-card/80 backdrop-blur-xl backdrop-saturate-150">
            <SheetHeader className="rounded-xl border border-primary/20 bg-card/70 p-4 shadow-[0_16px_40px_-20px_hsl(var(--primary)/0.35)] backdrop-blur-xl backdrop-saturate-150">
              <SheetTitle className="flex items-center gap-2 text-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-card/75 shadow-[0_8px_24px_-14px_hsl(var(--primary)/0.4)] backdrop-blur-xl backdrop-saturate-150">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                {riskAiTitle}
              </SheetTitle>
            </SheetHeader>

            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-card/70 p-4 shadow-[0_12px_32px_-18px_hsl(var(--primary)/0.3)] backdrop-blur-xl backdrop-saturate-150">
                <Button type="button" size="sm" onClick={generateRiskAiReport} disabled={riskAiLoading} className="gap-2">
                  <Sparkles className={`h-3.5 w-3.5 ${riskAiLoading ? "animate-pulse" : ""}`} />
                  {riskAiLoading ? "Gerando..." : "Gerar novamente"}
                </Button>
                {!riskAiLoading && riskAiReport && (
                  <AIReportAudioPlayer text={riskAiReport} cacheKey={`risk-ai-mobile-${riskAiTitle}-${riskAiReport.length}`} />
                )}
              </div>

              <div className="rounded-xl border border-primary/20 bg-card/70 p-4 shadow-[0_12px_32px_-18px_hsl(var(--primary)/0.3)] backdrop-blur-xl backdrop-saturate-150">
                {riskAiLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="h-4 w-4 animate-pulse text-primary" />Analisando risco, retorno e prioridades de ação...</div>
                ) : (
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-p:text-foreground prose-headings:text-foreground prose-strong:text-foreground">
                    <ReactMarkdown>{riskAiReport}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={riskAiOpen} onOpenChange={setRiskAiOpen}>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto border-primary/20 bg-card/80 backdrop-blur-xl backdrop-saturate-150">
            <DialogHeader className="rounded-xl border border-primary/20 bg-card/70 p-4 pr-12 text-left shadow-[0_16px_40px_-20px_hsl(var(--primary)/0.35)] backdrop-blur-xl backdrop-saturate-150">
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-card/75 shadow-[0_8px_24px_-14px_hsl(var(--primary)/0.4)] backdrop-blur-xl backdrop-saturate-150">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                {riskAiTitle}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-card/70 p-4 shadow-[0_12px_32px_-18px_hsl(var(--primary)/0.3)] backdrop-blur-xl backdrop-saturate-150">
                <Button type="button" size="sm" onClick={generateRiskAiReport} disabled={riskAiLoading} className="gap-2">
                  <Sparkles className={`h-3.5 w-3.5 ${riskAiLoading ? "animate-pulse" : ""}`} />
                  {riskAiLoading ? "Gerando..." : "Gerar novamente"}
                </Button>
                {!riskAiLoading && riskAiReport && (
                  <AIReportAudioPlayer text={riskAiReport} cacheKey={`risk-ai-desktop-${riskAiTitle}-${riskAiReport.length}`} />
                )}
              </div>

              <div className="rounded-xl border border-primary/20 bg-card/70 p-4 shadow-[0_12px_32px_-18px_hsl(var(--primary)/0.3)] backdrop-blur-xl backdrop-saturate-150">
                {riskAiLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="h-4 w-4 animate-pulse text-primary" />Analisando risco, retorno e prioridades de ação...</div>
                ) : (
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-p:text-foreground prose-headings:text-foreground prose-strong:text-foreground">
                    <ReactMarkdown>{riskAiReport}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
