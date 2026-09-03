import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/userClient";
import { useEmployees } from "@/features/payroll/hooks/useEmployees";
import { usePayrolls } from "@/features/payroll/hooks/usePayrolls";
import { todayInAppTz } from "@/lib/timezone";
import type { PayrollItems, SalaryItem } from "@/types/salary";
import { assertWritable } from "@/lib/readOnlyState";

const EARNING_TYPES = [
  { value: "13_salario", label: "13º Salário" },
  { value: "ferias", label: "Férias" },
  { value: "1_3_ferias", label: "1/3 de Férias" },
  { value: "adicional", label: "Adicional" },
  { value: "bonificacao", label: "Bonificação" },
  { value: "hora_extra", label: "Hora Extra" },
  { value: "comissao", label: "Comissão" },
  { value: "outros", label: "Outros proventos" },
];

export function ExtraEarningDialog() {
  const { dataOwnerId } = useAuth();
  const { employees } = useEmployees();
  const { refresh } = usePayrolls();

  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [type, setType] = useState<string>("13_salario");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("0");
  const [paymentDate, setPaymentDate] = useState(todayInAppTz());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setType("13_salario");
      setDescription("");
      setAmount("0");
      setPaymentDate(todayInAppTz());
      setNotes("");
      setSubmitting(false);
    }
  }, [open]);

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.status === "ativo" || e.status === "ferias"),
    [employees]
  );

  const competenceLabel = useMemo(() => {
    try {
      return format(parseISO(paymentDate + "T00:00:00"), "MMMM 'de' yyyy", { locale: ptBR });
    } catch { return ""; }
  }, [paymentDate]);

  const typeLabel = EARNING_TYPES.find((t) => t.value === type)?.label ?? "Provento";

  const handleSubmit = async () => {
    assertWritable();
    if (submitting) return;
    const v = Number(amount) || 0;
    if (!employeeId) { toast.error("Selecione um funcionário"); return; }
    if (v <= 0) { toast.error("Informe um valor maior que zero"); return; }
    if (!paymentDate) { toast.error("Informe a data de pagamento"); return; }

    const employee = employees.find((e) => e.id === employeeId);
    if (!employee) { toast.error("Funcionário não encontrado"); return; }

    setSubmitting(true);
    try {
      const competence = paymentDate.slice(0, 7);
      const label = description.trim()
        ? `${typeLabel} - ${description.trim()}`
        : typeLabel;
      const newItem: SalaryItem = { label, amount: v, kind: type };

      // Sempre cria um contracheque separado para cada lançamento, usando a
      // data de pagamento como vencimento. Assim, datas diferentes (mesmo
      // dentro da mesma competência) nunca se misturam na mesma folha.
      if (!dataOwnerId) throw new Error("Sessão inválida");
      const items: PayrollItems = { earnings: [newItem], deductions: [] };
      const { error } = await supabase.from("payrolls" as any).insert({
        user_id: dataOwnerId,
        employee_id: employeeId,
        competence,
        gross_salary: v,
        total_benefits: 0,
        total_deductions: 0,
        net_salary: v,
        paid_amount: 0,
        status: "pendente",
        due_date: paymentDate,
        items: items as any,
        notes: notes.trim() ? `[${typeLabel}] ${notes.trim()}` : `[${typeLabel}]`,
      } as any);
      if (error) throw error;
      await refresh();

      toast.success("Provento adicionado", {
        description: `${typeLabel} lançado na folha de ${competenceLabel}`,
      });
      setOpen(false);
    } catch (e: any) {
      toast.error("Falha ao adicionar provento", { description: e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) setOpen(o); }}>
      {createPortal(
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label="Adicionar provento"
            title="Adicionar provento (13º, férias, etc)"
            className="group fixed z-50 h-11 w-11 md:h-12 md:w-12 rounded-full flex items-center justify-center animate-fade-in touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-all duration-200 hover:scale-105 active:scale-95 gradient-primary text-primary-foreground shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.6)] hover:shadow-[0_12px_32px_-8px_hsl(var(--primary)/0.8)] right-[calc(env(safe-area-inset-right)+16px)] bottom-[calc(env(safe-area-inset-bottom)+76px)] md:bottom-[calc(env(safe-area-inset-bottom)+20px)]"
          >
            <Plus className="h-5 w-5 relative drop-shadow-[0_1px_2px_hsl(var(--primary)/0.5)]" strokeWidth={2.75} />
          </button>
        </DialogTrigger>,
        document.body
      )}
      <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Lançar provento trabalhista</DialogTitle>
          <DialogDescription>
            Adicione 13º, férias ou outros proventos. A folha será atualizada conforme a data de pagamento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Funcionário</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {activeEmployees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
                {activeEmployees.length === 0 && (
                  <div className="px-2 py-3 text-sm text-muted-foreground">Nenhum funcionário cadastrado.</div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Tipo de provento</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EARNING_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Descrição (opcional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Férias 30 dias - jul/2026"
              maxLength={120}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor</Label>
              <MoneyInput value={amount} onChange={setAmount} />
            </div>
            <div>
              <Label>Data de pagamento</Label>
              <DatePickerField value={paymentDate} onChange={setPaymentDate} />
            </div>
          </div>

          {competenceLabel && (
            <div className="text-xs text-muted-foreground">
              Será lançado na folha de <span className="font-medium capitalize">{competenceLabel}</span>.
            </div>
          )}

          <div>
            <Label>Observações (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Detalhes adicionais"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting || !employeeId || !Number(amount)}>
            {submitting ? "Salvando..." : "Lançar provento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
