import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Wallet, CalendarClock, Cake } from "lucide-react";
import { addMonths, endOfMonth, format, isSameDay, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEmployees } from "@/features/payroll/hooks/useEmployees";
import { usePayrolls } from "@/features/payroll/hooks/usePayrolls";

const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Event = { type: "pagamento" | "vencimento" | "aniversario"; label: string; amount?: number };

export function SalaryCalendar() {
  const { employees } = useEmployees();
  const { payrolls } = usePayrolls();
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState<Date | null>(null);

  const days = useMemo(() => {
    const start = startOfMonth(cursor);
    const end = endOfMonth(cursor);
    const arr: Date[] = [];
    const startDay = start.getDay();
    for (let i = 0; i < startDay; i++) arr.push(null as any);
    for (let d = 1; d <= end.getDate(); d++) arr.push(new Date(start.getFullYear(), start.getMonth(), d));
    return arr;
  }, [cursor]);

  const monthCompetence = format(cursor, "yyyy-MM");
  const monthPayrolls = payrolls.filter((p) => p.competence === monthCompetence);

  const eventsForDay = (date: Date): Event[] => {
    const items: Event[] = [];
    monthPayrolls.forEach((p) => {
      if (p.paidDate && isSameDay(parseISO(p.paidDate), date)) {
        const emp = employees.find((e) => e.id === p.employeeId);
        items.push({ type: "pagamento", label: emp?.name ?? "Funcionário", amount: p.paidAmount });
      } else if (p.dueDate && isSameDay(parseISO(p.dueDate), date)) {
        const emp = employees.find((e) => e.id === p.employeeId);
        items.push({ type: "vencimento", label: emp?.name ?? "Funcionário", amount: p.netSalary });
      }
    });
    employees.forEach((e) => {
      if (!e.hireDate) return;
      const hd = parseISO(e.hireDate);
      if (hd.getDate() === date.getDate() && hd.getMonth() === date.getMonth()) {
        items.push({ type: "aniversario", label: `${e.name} (admissão)` });
      }
    });
    return items;
  };

  const selectedEvents = selected ? eventsForDay(selected) : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, -1))}><ChevronLeft className="h-4 w-4" /></Button>
        <div className="font-semibold capitalize">{format(cursor, "MMMM 'de' yyyy", { locale: ptBR })}</div>
        <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}><ChevronRight className="h-4 w-4" /></Button>
      </div>

      <Card><CardContent className="p-3">
        <div className="grid grid-cols-7 text-center text-[10px] uppercase text-muted-foreground mb-1">
          {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d, i) => {
            if (!d) return <div key={i} className="aspect-square" />;
            const events = eventsForDay(d);
            const hasPay = events.some((e) => e.type === "pagamento");
            const hasDue = events.some((e) => e.type === "vencimento");
            const hasBday = events.some((e) => e.type === "aniversario");
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelected(d)}
                className="aspect-square rounded-md border border-border/40 p-1 text-[10px] overflow-hidden text-left hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{d.getDate()}</span>
                  <div className="flex gap-0.5">
                    {hasPay && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                    {hasDue && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                    {hasBday && <span className="h-1.5 w-1.5 rounded-full bg-pink-500" />}
                  </div>
                </div>
                <div className="space-y-0.5 mt-0.5">
                  {events.slice(0, 2).map((e, idx) => (
                    <div key={idx} className={`truncate flex items-center gap-0.5 ${
                      e.type === "pagamento" ? "text-emerald-600"
                      : e.type === "vencimento" ? "text-amber-600"
                      : "text-pink-500"
                    }`}>
                      {e.type === "pagamento" ? <Wallet className="h-2.5 w-2.5 shrink-0" />
                        : e.type === "vencimento" ? <CalendarClock className="h-2.5 w-2.5 shrink-0" />
                        : <Cake className="h-2.5 w-2.5 shrink-0" />}
                      <span className="truncate">{e.label}</span>
                    </div>
                  ))}
                  {events.length > 2 && <div className="text-muted-foreground">+{events.length - 2}</div>}
                </div>
              </button>
            );
          })}
        </div>

        {/* Legenda */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground border-t pt-2">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <Wallet className="h-3 w-3 text-emerald-600" /> Pagamento efetuado
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <CalendarClock className="h-3 w-3 text-amber-600" /> Vencimento da folha
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-pink-500" />
            <Cake className="h-3 w-3 text-pink-500" /> Aniversário de admissão
          </div>
        </div>
      </CardContent></Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="capitalize">
              {selected && format(selected, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {selectedEvents.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-6">Nenhum evento neste dia.</div>
            )}
            {selectedEvents.map((e, idx) => (
              <div key={idx} className="flex items-center gap-3 border rounded-md p-3">
                <div className={`h-8 w-8 rounded-full grid place-items-center shrink-0 ${
                  e.type === "pagamento" ? "bg-emerald-500/15 text-emerald-600"
                  : e.type === "vencimento" ? "bg-amber-500/15 text-amber-600"
                  : "bg-pink-500/15 text-pink-500"
                }`}>
                  {e.type === "pagamento" ? <Wallet className="h-4 w-4" />
                    : e.type === "vencimento" ? <CalendarClock className="h-4 w-4" />
                    : <Cake className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{e.label}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {e.type === "pagamento" ? "Pagamento efetuado"
                      : e.type === "vencimento" ? "Vencimento da folha"
                      : "Aniversário de admissão"}
                  </div>
                </div>
                {e.amount != null && (
                  <div className="text-sm font-semibold whitespace-nowrap">{BRL(e.amount)}</div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
