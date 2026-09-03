import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useEmployees } from "@/features/payroll/hooks/useEmployees";
import { usePayrolls } from "@/features/payroll/hooks/usePayrolls";
import { Users, Wallet, AlertCircle, TrendingUp, Gift, Minus, CheckCircle2, CalendarClock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from "recharts";

const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function SalaryDashboard() {
  const { employees } = useEmployees();
  const { payrolls } = usePayrolls();

  const competence = format(new Date(), "yyyy-MM");
  const nextComp = format(new Date(new Date().setMonth(new Date().getMonth() + 1)), "yyyy-MM");

  const monthRows = payrolls.filter((p) => p.competence === competence);
  const nextRows = payrolls.filter((p) => p.competence === nextComp);

  const totals = useMemo(() => {
    const total = monthRows.reduce((s, p) => s + p.netSalary, 0);
    const paid = monthRows.reduce((s, p) => s + p.paidAmount, 0);
    const pending = total - paid;
    const benefits = monthRows.reduce((s, p) => s + p.totalBenefits, 0);
    const deductions = monthRows.reduce((s, p) => s + p.totalDeductions, 0);
    const avg = employees.length ? employees.reduce((s, e) => s + e.baseSalary, 0) / employees.length : 0;
    const next = nextRows.reduce((s, p) => s + p.netSalary, 0) || employees.filter((e) => e.status === "ativo").reduce((s, e) => s + e.baseSalary, 0);
    return { total, paid, pending, benefits, deductions, avg, next };
  }, [monthRows, nextRows, employees]);

  // Evolução últimos 6 meses
  const evolution = useMemo(() => {
    const arr: { mes: string; total: number; pago: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const c = format(d, "yyyy-MM");
      const rows = payrolls.filter((p) => p.competence === c);
      arr.push({
        mes: format(d, "MMM", { locale: ptBR }),
        total: rows.reduce((s, r) => s + r.netSalary, 0),
        pago: rows.reduce((s, r) => s + r.paidAmount, 0),
      });
    }
    return arr;
  }, [payrolls]);

  // Custos por setor
  const bySector = useMemo(() => {
    const map = new Map<string, number>();
    employees.filter((e) => e.status === "ativo").forEach((e) => {
      const k = e.department || "Sem setor";
      map.set(k, (map.get(k) || 0) + e.baseSalary);
    });
    return Array.from(map.entries()).map(([setor, valor]) => ({ setor, valor }));
  }, [employees]);

  // Top funcionários
  const topEmployees = useMemo(() => {
    return [...employees].filter((e) => e.status === "ativo").sort((a, b) => b.baseSalary - a.baseSalary).slice(0, 5);
  }, [employees]);

  const nextClose = format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 5), "dd 'de' MMM", { locale: ptBR });

  return (
    <div className="space-y-4">
      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={<Wallet className="h-4 w-4" />} label="Folha do mês" value={BRL(totals.total)} tone="primary" />
        <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="Total pago" value={BRL(totals.paid)} tone="success" />
        <Stat icon={<AlertCircle className="h-4 w-4" />} label="Pendente" value={BRL(totals.pending)} tone={totals.pending > 0 ? "warn" : "muted"} />
        <Stat icon={<CalendarClock className="h-4 w-4" />} label="Próximo fechamento" value={nextClose} />
        <Stat icon={<TrendingUp className="h-4 w-4" />} label="Média salarial" value={BRL(totals.avg)} />
        <Stat icon={<Minus className="h-4 w-4" />} label="Descontos" value={BRL(totals.deductions)} tone="warn" />
        <Stat icon={<Gift className="h-4 w-4" />} label="Benefícios" value={BRL(totals.benefits)} />
        <Stat icon={<Users className="h-4 w-4" />} label="Próxima folha" value={BRL(totals.next)} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card><CardContent className="p-4 space-y-2">
          <p className="font-semibold text-sm">Evolução mensal</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolution}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => BRL(v)} />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Folha" />
                <Line type="monotone" dataKey="pago" stroke="hsl(var(--success))" strokeWidth={2} dot={false} name="Pago" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-4 space-y-2">
          <p className="font-semibold text-sm">Custos por setor</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bySector}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="setor" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => BRL(v)} />
                <Bar dataKey="valor" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent></Card>
      </div>

      {/* Insights */}
      <Card><CardContent className="p-4 space-y-3">
        <p className="font-semibold text-sm">Top 5 maiores custos</p>
        {topEmployees.length === 0 && <p className="text-sm text-muted-foreground">Nenhum funcionário ativo.</p>}
        {topEmployees.map((e) => (
          <div key={e.id} className="flex items-center justify-between text-sm">
            <div>
              <div className="font-medium">{e.name}</div>
              <div className="text-xs text-muted-foreground">{e.role || "—"} · {e.department || "—"}</div>
            </div>
            <span className="font-semibold">{BRL(e.baseSalary)}</span>
          </div>
        ))}
      </CardContent></Card>
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "primary" | "success" | "warn" | "muted" }) {
  const colors = {
    primary: "text-primary",
    success: "text-emerald-600",
    warn: "text-amber-600",
    muted: "text-muted-foreground",
  } as const;
  const color = tone ? colors[tone] : "text-foreground";
  return (
    <Card><CardContent className="p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className={color}>{icon}</span>{label}
      </div>
      <div className={`text-base sm:text-lg font-semibold mt-1 ${color}`}>{value}</div>
    </CardContent></Card>
  );
}
