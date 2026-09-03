import { PeriodMode, PeriodSelection, labelForPeriod } from "@/features/piggyBanks/lib/metasPeriod";
import { Calendar, CalendarDays, CalendarRange, CalendarClock } from "lucide-react";

interface Props {
  value: PeriodSelection;
  onChange: (sel: PeriodSelection) => void;
}

const MODES: { id: PeriodMode; label: string; Icon: any }[] = [
  { id: "month",    label: "Mensal",     Icon: Calendar },
  { id: "quarter",  label: "Trimestral", Icon: CalendarDays },
  { id: "semester", label: "Semestral",  Icon: CalendarRange },
  { id: "year",     label: "Anual",      Icon: CalendarClock },
];

const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export function PeriodFilterCard({ value, onChange }: Props) {
  const setMode = (mode: PeriodMode) => {
    const now = new Date();
    const y = value.year;
    if (mode === "month") onChange({ mode, year: y, month: value.month ?? now.getMonth() + 1 });
    else if (mode === "quarter") onChange({ mode, year: y, quarter: value.quarter ?? (Math.floor(now.getMonth() / 3) + 1) as 1|2|3|4 });
    else if (mode === "semester") onChange({ mode, year: y, semester: value.semester ?? (now.getMonth() < 6 ? 1 : 2) });
    else onChange({ mode: "year", year: y });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3 flex flex-col gap-3 h-full justify-between">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Filtro de Período</p>
        <span className="text-[11px] text-muted-foreground truncate max-w-[60%] text-right">{labelForPeriod(value)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 flex-1 content-stretch">
        {MODES.map(({ id, label, Icon }) => {
          const active = value.mode === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`flex h-full min-h-[44px] items-center justify-center gap-2 rounded-lg border px-2 py-2.5 text-sm font-semibold transition-colors ${
                active
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>


      {/* Sub-seletor */}
      <div className="flex flex-nowrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange({ ...value, year: value.year - 1 })}
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-background text-sm hover:bg-accent"
          aria-label="Ano anterior"
        >‹</button>
        <button
          type="button"
          onClick={() => onChange({ ...value, year: new Date().getFullYear() })}
          title="Voltar para o ano atual"
          className="text-sm font-bold tabular-nums min-w-[46px] text-center hover:text-primary transition-colors"
        >{value.year}</button>
        <button
          type="button"
          onClick={() => onChange({ ...value, year: value.year + 1 })}
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-background text-sm hover:bg-accent"
          aria-label="Próximo ano"
        >›</button>
        </div>

        {value.mode === "month" && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const m = value.month ?? 1;
                if (m === 1) onChange({ ...value, year: value.year - 1, month: 12 });
                else onChange({ ...value, month: m - 1 });
              }}
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-background text-sm hover:bg-accent"
              aria-label="Mês anterior"
            >‹</button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                onChange({ ...value, year: now.getFullYear(), month: now.getMonth() + 1 });
              }}
              title="Voltar para o mês atual"
              className="text-sm font-semibold tabular-nums min-w-[36px] text-center hover:text-primary transition-colors"
            >
              {MONTHS[(value.month ?? 1) - 1]}
            </button>
            <button
              type="button"
              onClick={() => {
                const m = value.month ?? 1;
                if (m === 12) onChange({ ...value, year: value.year + 1, month: 1 });
                else onChange({ ...value, month: m + 1 });
              }}
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-background text-sm hover:bg-accent"
              aria-label="Próximo mês"
            >›</button>
          </div>
        )}
        {value.mode === "quarter" && (
          <div className="flex gap-1.5">
            {[1,2,3,4].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onChange({ ...value, quarter: q as 1|2|3|4 })}
                className={`h-9 w-9 flex items-center justify-center rounded-lg border text-sm font-semibold transition-colors ${
                  value.quarter === q ? "bg-primary/10 border-primary/40 text-primary" : "bg-background border-border text-muted-foreground"
                }`}
              >{q}º</button>
            ))}
          </div>
        )}
        {value.mode === "semester" && (
          <div className="flex gap-1.5">
            {[1,2].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onChange({ ...value, semester: s as 1|2 })}
                className={`h-9 px-3 flex items-center justify-center rounded-lg border text-sm font-semibold transition-colors ${
                  value.semester === s ? "bg-primary/10 border-primary/40 text-primary" : "bg-background border-border text-muted-foreground"
                }`}
              >{s}º Sem</button>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
