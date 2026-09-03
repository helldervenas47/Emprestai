import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertTriangle, CheckCircle2, History, Loader2, ChevronRight } from "lucide-react";
import { runAccountantAudit, type AuditReport, type AuditTotals } from "@/lib/accountantAudit";
import { useAccountantAuditLogs } from "@/hooks/useAccountantAuditLogs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

interface Props {
  loans: any[];
  payments: any[];
  sales: any[];
  expenses: any[];
  period: "month" | "year";
  monthFilter: string;
  yearFilter: string;
  shown: AuditTotals;
}

const fmt = (n: number) =>
  (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function AccountantAuditCard(props: Props) {
  const [report, setReport] = useState<AuditReport | null>(null);
  const [running, setRunning] = useState(false);
  const { logs, saveAudit } = useAccountantAuditLogs();

  const handleAudit = async () => {
    setRunning(true);
    try {
      const r = runAccountantAudit(props);
      setReport(r);
      await saveAudit(r);
      if (r.issues.length === 0) {
        toast.success(`Tudo certo! Confiabilidade: ${r.confidenceScore}%`);
      } else {
        toast.warning(`${r.issues.length} divergência(s) encontrada(s) — confiabilidade ${r.confidenceScore}%`);
      }
    } catch (e) {
      console.error(e);
      toast.error("Falha ao executar auditoria");
    } finally {
      setRunning(false);
    }
  };

  const scoreColor = useMemo(() => {
    const s = report?.confidenceScore ?? 100;
    if (s >= 95) return "text-emerald-600 dark:text-emerald-400";
    if (s >= 80) return "text-yellow-600 dark:text-yellow-400";
    return "text-destructive";
  }, [report]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Auditoria de Dados
          </CardTitle>
          <div className="flex items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <History className="h-4 w-4 mr-1" /> Histórico ({logs.length})
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Histórico de Auditorias</SheetTitle>
                </SheetHeader>
                <div className="mt-4 space-y-3">
                  {logs.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhuma auditoria executada ainda.</p>
                  )}
                  {logs.map((l) => (
                    <div key={l.id} className="border rounded-md p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {new Date(l.executed_at).toLocaleString("pt-BR")}
                        </span>
                        <Badge variant={l.confidence_score >= 95 ? "default" : l.confidence_score >= 80 ? "secondary" : "destructive"}>
                          {l.confidence_score}%
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Período: {l.period_start} → {l.period_end}
                      </p>
                      <p className="text-xs mt-1">
                        {l.issues.length} problema(s) · {l.corrections.length} correção(ões) sugerida(s)
                      </p>
                    </div>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
            <Button size="sm" onClick={handleAudit} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
              Auditar Dados
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!report ? (
          <p className="text-sm text-muted-foreground">
            Clique em <strong>Auditar Dados</strong> para validar os números desta aba contra a fonte
            (empréstimos, pagamentos, despesas e renegociações). Aportes nunca são contados como receita ou despesa.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className={`text-3xl font-bold ${scoreColor}`}>
                {report.confidenceScore}%
              </div>
              <div className="text-sm text-muted-foreground">
                consistente · executado em {new Date(report.executedAt).toLocaleString("pt-BR")}
              </div>
            </div>

            {report.issues.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Todos os totais batem com a origem.
              </div>
            ) : (
              <ScrollArea className="max-h-[28rem] pr-3">
                <ul className="space-y-2">
                  {report.issues.map((it, i) => (
                    <li key={i} className="border rounded-md p-3 text-sm">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className={`h-4 w-4 mt-0.5 ${it.severity === "error" ? "text-destructive" : "text-yellow-500"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-medium">{it.metric}</span>
                            <Badge variant={it.severity === "error" ? "destructive" : "secondary"}>
                              {it.severity === "error" ? "Erro" : "Aviso"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">Origem: {it.origin}</p>
                          <p className="text-xs mt-1">
                            Esperado <strong>{fmt(it.expected)}</strong> · Exibido <strong>{fmt(it.shown)}</strong> · Diferença <strong className={it.diff > 0 ? "text-destructive" : "text-emerald-600"}>{fmt(it.diff)}</strong>
                          </p>

                          {it.breakdown && (
                            <details className="mt-2 group">
                              <summary className="cursor-pointer text-xs font-medium text-primary hover:underline list-none flex items-center gap-1">
                                <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                                Por que deu diferença
                              </summary>
                              <div className="mt-2 space-y-3 pl-4 border-l-2 border-muted">
                                <p className="text-xs text-muted-foreground italic">
                                  {it.breakdown.reason}
                                </p>

                                {it.breakdown.expectedLines.length > 0 && (
                                  <div>
                                    <p className="text-xs font-semibold mb-1">
                                      Linhas que compõem o valor esperado ({it.breakdown.expectedLines.length})
                                    </p>
                                    <div className="rounded border bg-muted/30 max-h-48 overflow-y-auto">
                                      <table className="w-full text-[11px]">
                                        <thead className="bg-muted/60 sticky top-0">
                                          <tr>
                                            <th className="text-left px-2 py-1 font-medium">Origem</th>
                                            <th className="text-left px-2 py-1 font-medium">ID</th>
                                            <th className="text-left px-2 py-1 font-medium">Data</th>
                                            <th className="text-left px-2 py-1 font-medium">Descrição</th>
                                            <th className="text-right px-2 py-1 font-medium">Valor</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {it.breakdown.expectedLines.map((ln, idx) => (
                                            <tr key={`${ln.id}-${idx}`} className="border-t border-muted">
                                              <td className="px-2 py-1 font-mono uppercase text-muted-foreground">{ln.source}</td>
                                              <td className="px-2 py-1 font-mono">{String(ln.id).slice(0, 10)}</td>
                                              <td className="px-2 py-1">{ln.date || "—"}</td>
                                              <td className="px-2 py-1 truncate max-w-[160px]">{ln.label || "—"}</td>
                                              <td className={`px-2 py-1 text-right font-mono ${ln.amount < 0 ? "text-destructive" : ""}`}>
                                                {fmt(ln.amount)}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                        <tfoot>
                                          <tr className="border-t bg-muted/50 font-semibold">
                                            <td className="px-2 py-1" colSpan={4}>Soma esperada</td>
                                            <td className="px-2 py-1 text-right font-mono">
                                              {fmt(it.breakdown.expectedLines.reduce((s, l) => s + l.amount, 0))}
                                            </td>
                                          </tr>
                                        </tfoot>
                                      </table>
                                    </div>
                                  </div>
                                )}

                                {(it.breakdown.extraInShown.length > 0 || it.breakdown.missingInShown.length > 0) && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {it.breakdown.extraInShown.length > 0 && (
                                      <div className="rounded border border-destructive/30 bg-destructive/5 p-2">
                                        <p className="text-[11px] font-semibold text-destructive mb-1">
                                          A mais no exibido ({it.breakdown.extraInShown.length})
                                        </p>
                                        <ul className="space-y-0.5 text-[11px]">
                                          {it.breakdown.extraInShown.map((ln, idx) => (
                                            <li key={idx} className="flex justify-between gap-2">
                                              <span className="truncate">{ln.label || ln.id}</span>
                                              <span className="font-mono shrink-0">{fmt(ln.amount)}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {it.breakdown.missingInShown.length > 0 && (
                                      <div className="rounded border border-yellow-500/30 bg-yellow-500/5 p-2">
                                        <p className="text-[11px] font-semibold text-yellow-600 dark:text-yellow-400 mb-1">
                                          Faltando no exibido ({it.breakdown.missingInShown.length})
                                        </p>
                                        <ul className="space-y-0.5 text-[11px]">
                                          {it.breakdown.missingInShown.map((ln, idx) => (
                                            <li key={idx} className="flex justify-between gap-2">
                                              <span className="truncate">{ln.label || ln.id}</span>
                                              <span className="font-mono shrink-0">{fmt(ln.amount)}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </details>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}

            {report.corrections.length > 0 && (
              <div className="rounded-md bg-muted/40 p-3 text-xs">
                🔧 As métricas acima já são apresentadas com o valor recalculado a partir da origem.
                Nenhum dado original foi alterado.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
