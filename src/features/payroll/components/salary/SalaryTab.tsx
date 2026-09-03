import { useState, useEffect } from "react";
import { FolderOpen, Users, ClipboardList, FileText, CalendarDays, History as HistoryIcon } from "lucide-react";
import { SalaryDashboard } from "./SalaryDashboard";
import { EmployeeManager } from "./EmployeeManager";
import { PayrollManager } from "./PayrollManager";
import { PayslipHistory } from "./PayslipHistory";
import { SalaryCalendar } from "./SalaryCalendar";

type SubTab = "dashboard" | "employees" | "payroll" | "payslips" | "calendar" | "history";

const subTabs: { id: SubTab; label: string; icon: any }[] = [
  { id: "dashboard", label: "Dashboard", icon: FolderOpen },
  { id: "employees", label: "Funcionários", icon: Users },
  { id: "payroll", label: "Folha", icon: ClipboardList },
  { id: "payslips", label: "Contracheques", icon: FileText },
  { id: "calendar", label: "Calendário", icon: CalendarDays },
  { id: "history", label: "Histórico", icon: HistoryIcon },
];

interface Props { readOnly?: boolean }

export function SalaryTab({ readOnly }: Props) {
  const [sub, setSub] = useState<SubTab>("payroll");

  useEffect(() => {
    // Ao abrir a aba Salário, desfoca qualquer input para evitar que o teclado suba automaticamente no mobile
    if (document.activeElement && "blur" in document.activeElement) {
      (document.activeElement as HTMLElement).blur();
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="inline-flex gap-1 bg-muted/60 border border-border/50 rounded-xl p-1 min-w-full">
          {subTabs.map((t) => {
            const active = sub === t.id;
            return (
              <button type="button"
                key={t.id}
                onClick={() => setSub(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  active
                    ? "bg-background !text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>


      {sub === "dashboard" && <SalaryDashboard />}
      {sub === "employees" && <EmployeeManager readOnly={readOnly} />}
      {sub === "payroll" && <PayrollManager readOnly={readOnly} />}
      {sub === "payslips" && <PayslipHistory />}
      {sub === "calendar" && <SalaryCalendar />}
      {sub === "history" && <PayslipHistory />}
    </div>
  );
}
