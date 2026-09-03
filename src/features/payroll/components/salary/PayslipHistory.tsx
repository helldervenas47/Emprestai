import { useMemo, useState } from "react";
import { useEmployees } from "@/features/payroll/hooks/useEmployees";
import { usePayrolls } from "@/features/payroll/hooks/usePayrolls";
import { useAppBranding } from "@/hooks/useAppBranding";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Search, Download } from "lucide-react";
import { generatePayslipPdf } from "@/features/payroll/lib/payslipPdf";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PayslipHistory() {
  const { employees } = useEmployees();
  const { payrolls } = usePayrolls();
  const { branding } = useAppBranding();
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    return payrolls
      .filter((p) => p.status !== "pendente")
      .map((p) => ({ p, emp: employees.find((e) => e.id === p.employeeId) }))
      .filter(({ p, emp }) => {
        const q = search.toLowerCase();
        return !q || (emp?.name ?? "").toLowerCase().includes(q) || p.competence.includes(q);
      })
      .sort((a, b) => b.p.competence.localeCompare(a.p.competence));
  }, [payrolls, employees, search]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou competência (YYYY-MM)" className="pl-9" />
      </div>
      <div className="space-y-2">
        {rows.length === 0 && (
          <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum contracheque emitido.</CardContent></Card>
        )}
        {rows.map(({ p, emp }) => (
          <Card key={p.id}>
            <CardContent className="p-3 flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{emp?.name ?? "Funcionário"}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {format(parseISO(p.competence + "-01"), "MMMM 'de' yyyy", { locale: ptBR })} · Líquido {BRL(p.netSalary)}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => emp && generatePayslipPdf(p, emp, { brandName: branding.brand_name })}>
                <Download className="h-3 w-3" /> PDF
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
