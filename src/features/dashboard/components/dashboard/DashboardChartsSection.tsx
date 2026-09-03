import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil, Check, X, Sparkles, ChevronDown, TrendingUp, BadgePercent } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList, Cell } from "recharts";
import { DashboardChartEditor } from "@/features/dashboard/components/dashboard/DashboardChartEditor";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface MonthlyRow { month: string; emprestado: number; recebido: number }
interface InterestRow { month: string; juros: number }

interface Props {
  readOnly: boolean;
  formatCurrency: (v: number) => string;
  riskReturn: { axisPosition: number };
  yearlyAverages: { interestRate: { rate: number | null }; interestReceived: number };
  onRiskAiClick: () => void;
  monthlyChart: MonthlyRow[];
  monthlyChartBase: MonthlyRow[];
  interestChart: InterestRow[];
  interestChartBase: InterestRow[];
  setChartOverrides: (o: Record<string, { emprestado?: number; recebido?: number }>) => void;
  setInterestOverrides: (o: Record<string, number>) => void;
}

function MobileLegend({ items, className }: { items: { label: string; color: string }[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-3 mt-3", className)}>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
          <span className="text-[11px] text-muted-foreground font-medium">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function MobileTooltip({ active, payload, label, formatCurrency }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/50 bg-card/95 px-3 py-2 shadow-lg backdrop-blur-md">
      <p className="text-[11px] font-medium text-foreground mb-1">{label}</p>
      <div className="space-y-0.5">
        {payload.map((p: any, idx: number) => (
          <div key={idx} className="flex items-center gap-2 text-[11px]">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span className="text-muted-foreground">{p.name}:</span>
            <span className="font-semibold text-foreground">{formatCurrency(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardChartsSection({
  readOnly, formatCurrency, riskReturn, yearlyAverages, onRiskAiClick,
  monthlyChart, monthlyChartBase, interestChart, interestChartBase,
  setChartOverrides, setInterestOverrides,
}: Props) {
  const [editingChart, setEditingChart] = useState(false);
  const [tempOverrides, setTempOverrides] = useState<Record<string, { emprestado: string; recebido: string }>>({});
  const [editingInterest, setEditingInterest] = useState(false);
  const [tempInterestOverrides, setTempInterestOverrides] = useState<Record<string, string>>({});
  const [riskOpen, setRiskOpen] = useState(false);
  const riskPos = riskReturn.axisPosition;
  const riskLabel = riskPos < 34 ? "Baixo risco" : riskPos < 67 ? "Moderado" : "Alto risco";
  const riskAccent = riskPos < 34 ? { text: "text-success", border: "border-success/30", soft: "bg-success/10" } : riskPos < 67 ? { text: "text-warning", border: "border-warning/30", soft: "bg-warning/10" } : { text: "text-destructive", border: "border-destructive/30", soft: "bg-destructive/10" };
  const isMobile = useIsMobile();
  const showLabels = !isMobile;
  const compactBRL = (v: number) => {
    if (Math.abs(v) >= 1000) return `R$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
    return `R$${Math.round(v)}`;
  };

  const startEditChart = () => {
    const temp: Record<string, { emprestado: string; recebido: string }> = {};
    monthlyChart.forEach((m) => {
      temp[m.month] = { emprestado: String(m.emprestado), recebido: String(m.recebido) };
    });
    setTempOverrides(temp);
    setEditingChart(true);
  };

  const saveChartOverrides = () => {
    const newOverrides: Record<string, { emprestado?: number; recebido?: number }> = {};
    monthlyChartBase.forEach((m) => {
      const temp = tempOverrides[m.month];
      if (!temp) return;
      const totalEmprestado = parseFloat(temp.emprestado) || 0;
      const totalRecebido = parseFloat(temp.recebido) || 0;
      const diffEmprestado = totalEmprestado - m.emprestado;
      const diffRecebido = totalRecebido - m.recebido;
      if (diffEmprestado !== 0 || diffRecebido !== 0) {
        newOverrides[m.month] = {
          ...(diffEmprestado !== 0 ? { emprestado: diffEmprestado } : {}),
          ...(diffRecebido !== 0 ? { recebido: diffRecebido } : {}),
        };
      }
    });
    setChartOverrides(newOverrides);
    setEditingChart(false);
  };

  const resetChartOverrides = () => { setChartOverrides({}); setEditingChart(false); };

  const startEditInterest = () => {
    const temp: Record<string, string> = {};
    interestChart.forEach((m) => { temp[m.month] = String(m.juros); });
    setTempInterestOverrides(temp);
    setEditingInterest(true);
  };

  const saveInterestOverrides = () => {
    const newOverrides: Record<string, number> = {};
    interestChartBase.forEach((m) => {
      const raw = tempInterestOverrides[m.month];
      if (raw === undefined || raw === "") return;
      const totalVal = parseFloat(raw);
      if (!Number.isFinite(totalVal)) return;
      newOverrides[m.month] = totalVal;
    });
    setInterestOverrides(newOverrides);
    setEditingInterest(false);
  };

  const resetInterestOverrides = () => { setInterestOverrides({}); setEditingInterest(false); };

  return (
    <>
      <Card no3d>
        <CardContent className="p-4 sm:p-6 space-y-4">
          <button
            type="button"
            onClick={() => setRiskOpen((v) => !v)}
            aria-expanded={riskOpen}
            className="w-full flex items-center justify-between gap-3 text-left"
          >
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">Indicador risco vs retorno</h3>
              <p className="text-xs text-muted-foreground">Score simples, classificação e alerta visual da operação atual.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!riskOpen && (
                <div className={`px-3 py-1 rounded-full border ${riskAccent.border} ${riskAccent.soft}`}>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${riskAccent.text}`}>{riskLabel}</span>
                </div>
              )}
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${riskOpen ? "rotate-180" : ""}`} />
            </div>
          </button>

          {riskOpen && (
          <div className="space-y-4">
            <button type="button" onClick={onRiskAiClick} className="w-full rounded-xl border border-primary/20 bg-card/70 p-5 text-left shadow-[0_16px_40px_-20px_hsl(var(--primary)/0.35)] backdrop-blur-xl backdrop-saturate-150 transition-all hover:bg-card/80 hover:border-primary/30">
              <div className="mb-3 flex justify-end">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-card/75 shadow-[0_8px_24px_-14px_hsl(var(--primary)/0.4)] backdrop-blur-xl backdrop-saturate-150">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
                <span>Baixo risco / baixo retorno</span>
                <span>Alto risco / alto retorno</span>
              </div>
              <div className="relative h-6 rounded-full bg-gradient-to-r from-success/40 via-warning/35 to-destructive/45">
                <div className="absolute top-1/2 h-8 w-8 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-background bg-card shadow" style={{ left: `${riskReturn.axisPosition}%` }} />
              </div>
            </button>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/30 bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">Taxa de juros média (ano)</p>
                <p className="text-lg font-bold text-foreground mt-1">{yearlyAverages.interestRate.rate !== null ? `${yearlyAverages.interestRate.rate.toFixed(2)}%` : "Sem dados"}</p>
              </div>
              <div className="rounded-xl border border-border/30 bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">Média juros recebidos (ano)</p>
                <p className="text-lg font-bold text-foreground mt-1">{formatCurrency(yearlyAverages.interestReceived)}</p>
              </div>
            </div>
          </div>
          )}
        </CardContent>
      </Card>


      <Card no3d className="dash-card">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <div className="hidden sm:flex h-6 w-6 items-center justify-center rounded-md bg-warning/15 text-warning">
                  <TrendingUp className="h-3.5 w-3.5" />
                </div>
                <h3 className="text-sm sm:text-base font-semibold text-foreground leading-tight">Histórico Mensal</h3>
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground">Últimos 12 meses</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {editingChart ? (
                <>
                  <Button variant="ghost" size="sm" onClick={resetChartOverrides} className="text-xs text-muted-foreground">Resetar</Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingChart(false)}>
                    <X className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveChartOverrides}>
                    <Check className="h-3.5 w-3.5 text-success" />
                  </Button>
                </>
              ) : !readOnly ? (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={startEditChart} title="Ajustar valores manualmente">
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
              ) : null}
            </div>
          </div>

          {editingChart && (
            <DashboardChartEditor
              rows={monthlyChart}
              columns={[
                {
                  key: "emprestado", label: "Emprestado", labelClass: "text-warning",
                  getValue: (m) => tempOverrides[m]?.emprestado ?? "",
                  onChange: (m, v) => setTempOverrides((prev) => ({ ...prev, [m]: { ...prev[m], emprestado: v } })),
                },
                {
                  key: "recebido", label: "Recebido", labelClass: "text-success",
                  getValue: (m) => tempOverrides[m]?.recebido ?? "",
                  onChange: (m, v) => setTempOverrides((prev) => ({ ...prev, [m]: { ...prev[m], recebido: v } })),
                },
              ]}
            />
          )}

          <div className="h-52 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="34%" barGap={12}>
                <defs>
                  <linearGradient id="emprestadoGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--warning))" />
                    <stop offset="100%" stopColor="hsl(var(--warning) / 0.85)" />
                  </linearGradient>
                  <linearGradient id="recebidoGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--success))" />
                    <stop offset="100%" stopColor="hsl(var(--success) / 0.85)" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.7)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={{ stroke: "hsl(var(--border) / 0.6)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  axisLine={false}
                  tickLine={false}
                  width={isMobile ? 44 : 56}
                  tickMargin={4}
                />
                <Tooltip
                  content={<MobileTooltip formatCurrency={formatCurrency} />}
                  cursor={{ fill: "hsl(var(--muted) / 0.25)" }}
                />
                <Bar dataKey="emprestado" fill="url(#emprestadoGradient)" radius={[4, 4, 0, 0]} barSize={isMobile ? 8 : 18}>
                  <LabelList dataKey="emprestado" position="top" formatter={(v: number) => (!isMobile && v > 0 ? compactBRL(v) : "")} style={{ fontSize: 10, fontWeight: 600, fill: "hsl(var(--warning))" }} offset={10} />
                </Bar>
                <Bar dataKey="recebido" fill="url(#recebidoGradient)" radius={[4, 4, 0, 0]} barSize={isMobile ? 8 : 18}>
                  <LabelList dataKey="recebido" position="top" formatter={(v: number) => (!isMobile && v > 0 ? compactBRL(v) : "")} style={{ fontSize: 10, fontWeight: 600, fill: "hsl(var(--success))" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <MobileLegend
            items={[
              { label: "Emprestado", color: "hsl(var(--warning))" },
              { label: "Recebido", color: "hsl(var(--success))" },
            ]}
          />
        </CardContent>
      </Card>

      <Card no3d className="dash-card">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <div className="hidden sm:flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <BadgePercent className="h-3.5 w-3.5" />
                </div>
                <h3 className="text-sm sm:text-base font-semibold text-foreground leading-tight">Juros Recebidos</h3>
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground">Últimos 12 meses</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {editingInterest ? (
                <>
                  <Button variant="ghost" size="sm" onClick={resetInterestOverrides} className="text-xs text-muted-foreground">Resetar</Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingInterest(false)}><X className="h-3.5 w-3.5 text-destructive" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveInterestOverrides}><Check className="h-3.5 w-3.5 text-success" /></Button>
                </>
              ) : !readOnly ? (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={startEditInterest} title="Ajustar valores manualmente">
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
              ) : null}
            </div>
          </div>

          {editingInterest && (
            <DashboardChartEditor
              rows={interestChart}
              columns={[{
                key: "juros", label: "Juros Recebidos", labelClass: "text-primary",
                getValue: (m) => tempInterestOverrides[m] ?? "",
                onChange: (m, v) => setTempInterestOverrides((prev) => ({ ...prev, [m]: v })),
              }]}
            />
          )}

          <div className="h-52 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={interestChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="32%" barGap={4}>
                <defs>
                  <linearGradient id="jurosGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" />
                    <stop offset="100%" stopColor="hsl(var(--primary) / 0.80)" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.7)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={{ stroke: "hsl(var(--border) / 0.6)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  axisLine={false}
                  tickLine={false}
                  width={isMobile ? 44 : 56}
                  tickMargin={4}
                />
                <Tooltip
                  content={<MobileTooltip formatCurrency={formatCurrency} />}
                  cursor={{ fill: "hsl(var(--muted) / 0.25)" }}
                />
                <Bar dataKey="juros" fill="url(#jurosGradient)" radius={[5, 5, 0, 0]} barSize={isMobile ? 22 : 40}>
                  <LabelList dataKey="juros" position="top" formatter={(v: number) => (!isMobile && v > 0 ? compactBRL(v) : "")} style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--primary))" }} />
                  {interestChart.map((entry, index) => (
                    <Cell key={`cell-${index}`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <MobileLegend
            items={[
              { label: "Juros Recebidos", color: "hsl(var(--primary))" },
            ]}
          />
        </CardContent>
      </Card>
    </>
  );
}
