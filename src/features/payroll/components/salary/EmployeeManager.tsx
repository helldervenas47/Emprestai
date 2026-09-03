import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Search, User, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { useEmployees } from "@/features/payroll/hooks/useEmployees";
import { useEmployeeGoalBonuses } from "@/features/piggyBanks/hooks/useEmployeeGoalBonuses";
import type { Employee, PaymentType, SalaryItem } from "@/types/salary";
import { EmployeeGoalBonusSection, type GoalBonusDraft } from "./EmployeeGoalBonusSection";
import { EmployeeGoalBonusHistory } from "./EmployeeGoalBonusHistory";
import { toast } from "sonner";
import { formatCPF, isValidCPF, onlyDigits } from "@/lib/brDocuments";

const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props { readOnly?: boolean }

export function EmployeeManager({ readOnly }: Props) {
  const { employees, addEmployee, updateEmployee, deleteEmployee } = useEmployees();
  const { getForEmployee, upsertForEmployee } = useEmployeeGoalBonuses();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [toDelete, setToDelete] = useState<Employee | null>(null);
  const [historyOf, setHistoryOf] = useState<Employee | null>(null);

  const filtered = employees.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.cpf ?? "").includes(search) ||
    onlyDigits(e.cpf ?? "").includes(onlyDigits(search)) ||
    (e.role ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const handleNew = () => { setEditing(null); setOpen(true); };
  const handleEdit = (e: Employee) => { setEditing(e); setOpen(true); };

  const editingBonus = editing ? getForEmployee(editing.id) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar funcionário..." className="pl-9" />
        </div>
        {!readOnly && (
          <Button data-mutation onClick={handleNew}><Plus className="h-4 w-4" /> Novo Funcionário</Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((e) => (
          <Card key={e.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-11 w-11 rounded-full bg-primary/10 grid place-items-center shrink-0">
                    {e.photoUrl
                      ? <img src={e.photoUrl} alt={e.name} className="h-11 w-11 rounded-full object-cover" />
                      : <User className="h-5 w-5 text-primary" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{e.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{e.role || "—"} · {e.department || "Sem setor"}</p>
                  </div>
                </div>
                <Badge variant={e.status === "ativo" ? "default" : "secondary"} className="capitalize text-[10px]">{e.status}</Badge>
              </div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">Salário</span>
                <span className="font-semibold">{BRL(e.baseSalary)}</span>
              </div>
              <div className="text-xs text-muted-foreground capitalize">Pagamento: {e.paymentType}</div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => setHistoryOf(e)} title="Bônus por metas">
                  <Trophy className="h-3 w-3 text-primary" />
                </Button>
                {!readOnly && (
                  <>
                    <Button data-mutation size="sm" variant="outline" className="flex-1" onClick={() => handleEdit(e)}><Pencil className="h-3 w-3" /> Editar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setToDelete(e)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <Card className="sm:col-span-2 lg:col-span-3"><CardContent className="p-8 text-center text-muted-foreground">
            Nenhum funcionário cadastrado.
          </CardContent></Card>
        )}
      </div>

      <EmployeeFormDialog
        open={open}
        onOpenChange={setOpen}
        initial={editing}
        initialBonus={editingBonus}
        onSave={async (data, bonus) => {
          try {
            let empId = editing?.id ?? null;
            if (editing) {
              await updateEmployee(editing.id, data);
              toast.success("Funcionário atualizado");
            } else {
              const created = await addEmployee(data as any);
              empId = created?.id ?? null;
              toast.success("Funcionário cadastrado");
            }
            if (empId) {
              const shouldPersistBonus = Boolean(editingBonus)
                || bonus.enabled
                || bonus.bonusAmount > 0
                || bonus.minScore !== 70
                || Boolean(bonus.startDate)
                || Boolean(bonus.endDate)
                || Boolean(bonus.notes?.trim());

              if (shouldPersistBonus) {
                await upsertForEmployee(empId, {
                  ...bonus,
                  // Mesmo se a UI não tiver sincronizado a data automática a tempo,
                  // persistimos uma vigência válida para não perder valor/switch.
                  startDate: bonus.startDate || new Date().toISOString().slice(0, 10),
                  notes: bonus.notes?.trim() || null,
                });
              }
            }
            setOpen(false);
          } catch (e: any) {
            toast.error(e?.message ?? "Erro ao salvar");
          }
        }}
      />

      <ConfirmDeleteDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir funcionário?"
        description={`Tem certeza que deseja excluir ${toDelete?.name}? Todas as folhas vinculadas também serão removidas.`}
        onConfirm={async () => {
          if (toDelete) {
            await deleteEmployee(toDelete.id);
            toast.success("Funcionário excluído");
            setToDelete(null);
          }
        }}
      />

      <Dialog open={!!historyOf} onOpenChange={(o) => !o && setHistoryOf(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bônus por metas — {historyOf?.name}</DialogTitle>
          </DialogHeader>
          {historyOf && <EmployeeGoalBonusHistory employeeId={historyOf.id} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmployeeFormDialog({ open, onOpenChange, initial, initialBonus, onSave }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: Employee | null;
  initialBonus: import("@/features/piggyBanks/hooks/useEmployeeGoalBonuses").EmployeeGoalBonus | null;
  onSave: (data: Partial<Employee>, bonus: GoalBonusDraft) => void | Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [cpf, setCpf] = useState(initial?.cpf ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [department, setDepartment] = useState(initial?.department ?? "");
  const [registration, setRegistration] = useState(initial?.registration ?? "");
  const [hireDate, setHireDate] = useState(initial?.hireDate ?? "");
  const [status, setStatus] = useState<Employee["status"]>(initial?.status ?? "ativo");
  const [baseSalary, setBaseSalary] = useState(String(initial?.baseSalary ?? ""));
  const [paymentType, setPaymentType] = useState<PaymentType>(initial?.paymentType ?? "mensal");
  const [bank, setBank] = useState(initial?.bank ?? "");
  const [agency, setAgency] = useState(initial?.agency ?? "");
  const [account, setAccount] = useState(initial?.account ?? "");
  const [pixKey, setPixKey] = useState(initial?.pixKey ?? "");
  const [benefits, setBenefits] = useState<SalaryItem[]>(initial?.benefits ?? []);
  const [deductions, setDeductions] = useState<SalaryItem[]>(initial?.deductions ?? []);
  const [addToIncomes, setAddToIncomes] = useState<boolean>(initial?.addToIncomes ?? false);
  const [bonusDirty, setBonusDirty] = useState(false);
  const [bonusDraft, setBonusDraft] = useState<GoalBonusDraft>(() => ({
    enabled: initialBonus?.enabled ?? false,
    minScore: initialBonus?.minScore ?? 70,
    bonusAmount: initialBonus?.bonusAmount ?? 0,
    startDate: initialBonus?.startDate ?? "",
    endDate: initialBonus?.endDate ?? null,
    notes: initialBonus?.notes ?? null,
  }));

  // Resync form whenever the dialog opens with a different employee
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setCpf(initial?.cpf ?? "");
    setRole(initial?.role ?? "");
    setDepartment(initial?.department ?? "");
    setRegistration(initial?.registration ?? "");
    setHireDate(initial?.hireDate ?? "");
    setStatus(initial?.status ?? "ativo");
    setBaseSalary(String(initial?.baseSalary ?? ""));
    setPaymentType(initial?.paymentType ?? "mensal");
    setBank(initial?.bank ?? "");
    setAgency(initial?.agency ?? "");
    setAccount(initial?.account ?? "");
    setPixKey(initial?.pixKey ?? "");
    setBenefits(initial?.benefits ?? []);
    setDeductions(initial?.deductions ?? []);
    setAddToIncomes(initial?.addToIncomes ?? false);
    setBonusDirty(false);
    setBonusDraft({
      enabled: initialBonus?.enabled ?? false,
      minScore: initialBonus?.minScore ?? 70,
      bonusAmount: initialBonus?.bonusAmount ?? 0,
      startDate: initialBonus?.startDate ?? "",
      endDate: initialBonus?.endDate ?? null,
      notes: initialBonus?.notes ?? null,
    });
    // Only resync when dialog opens or the edited employee changes.
    // Do NOT depend on `initialBonus` reference — it changes on every parent
    // re-render (new object from bonuses.find), which would reset the switch
    // back to false while the user is still editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  useEffect(() => {
    if (!open || !initial?.id || !initialBonus || bonusDirty) return;
    setBonusDraft({
      enabled: initialBonus.enabled,
      minScore: initialBonus.minScore,
      bonusAmount: initialBonus.bonusAmount,
      startDate: initialBonus.startDate,
      endDate: initialBonus.endDate,
      notes: initialBonus.notes,
    });
  }, [
    open,
    initial?.id,
    initialBonus?.id,
    initialBonus?.enabled,
    initialBonus?.minScore,
    initialBonus?.bonusAmount,
    initialBonus?.startDate,
    initialBonus?.endDate,
    initialBonus?.notes,
    bonusDirty,
  ]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (cpf && !isValidCPF(cpf)) { toast.error("CPF inválido"); return; }
    onSave({
      name: name.trim(),
      cpf: cpf ? onlyDigits(cpf) : null,
      role: role || null,
      department: department || null,
      registration: registration || null,
      hireDate: hireDate || null,
      status,
      baseSalary: Number(baseSalary) || 0,
      paymentType,
      bank: bank || null,
      agency: agency || null,
      account: account || null,
      pixKey: pixKey || null,
      benefits,
      deductions,
      addToIncomes,
    }, bonusDraft);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>{initial ? "Editar funcionário" : "Novo funcionário"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Nome *</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
            <div><Label>CPF</Label><Input value={formatCPF(cpf)} onChange={(e) => setCpf(formatCPF(e.target.value))} inputMode="numeric" maxLength={14} placeholder="000.000.000-00" /></div>
            <div><Label>Cargo</Label><Input value={role} onChange={(e) => setRole(e.target.value)} /></div>
            <div><Label>Setor</Label><Input value={department} onChange={(e) => setDepartment(e.target.value)} /></div>
            <div><Label>Matrícula</Label><Input value={registration} onChange={(e) => setRegistration(e.target.value)} /></div>
            <div><Label>Admissão</Label><DatePickerField value={hireDate ?? ""} onChange={setHireDate} /></div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="ferias">Férias</SelectItem>
                  <SelectItem value="afastado">Afastado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo pagamento</Label>
              <Select value={paymentType} onValueChange={(v) => setPaymentType(v as PaymentType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="quinzenal">Quinzenal</SelectItem>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="comissao">Comissão</SelectItem>
                  <SelectItem value="hora">Por hora</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Salário base</Label>
              <MoneyInput value={baseSalary} onChange={setBaseSalary} placeholder="0,00" />
            </div>
            <div><Label>Banco</Label><Input value={bank} onChange={(e) => setBank(e.target.value)} /></div>
            <div><Label>Agência</Label><Input value={agency} onChange={(e) => setAgency(e.target.value)} /></div>
            <div><Label>Conta</Label><Input value={account} onChange={(e) => setAccount(e.target.value)} /></div>
            <div><Label>Chave PIX</Label><Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} /></div>
          </div>

          <ItemListEditor title="Benefícios" items={benefits} setItems={setBenefits} />
          <ItemListEditor title="Descontos" items={deductions} setItems={setDeductions} />

          <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <div className="space-y-0.5 min-w-0">
              <Label className="text-sm">Adicionar salário ao saldo da aba Receitas?</Label>
              <p className="text-xs text-muted-foreground">
                Quando ativo, cada pagamento gera também um lançamento de entrada interna em Receitas (apenas composição — não duplica o saldo).
              </p>
            </div>
            <Switch checked={addToIncomes} onCheckedChange={setAddToIncomes} />
          </div>

          <EmployeeGoalBonusSection
            initial={initialBonus}
            value={bonusDraft}
            onChange={(next) => {
              setBonusDirty(true);
              setBonusDraft(next);
            }}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button data-mutation type="submit">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ItemListEditor({ title, items, setItems }: { title: string; items: SalaryItem[]; setItems: (i: SalaryItem[]) => void }) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const add = () => {
    if (!label.trim() || !Number(amount)) return;
    setItems([...items, { label: label.trim(), amount: Number(amount) }]);
    setLabel(""); setAmount("");
  };
  return (
    <div className="space-y-2">
      <Label>{title}</Label>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input placeholder="Descrição" value={label} onChange={(e) => setLabel(e.target.value)} />
        <MoneyInput value={amount} onChange={setAmount} placeholder="0,00" />
        <Button data-mutation type="button" variant="outline" onClick={add}>Adicionar</Button>
      </div>
      {items.length > 0 && (
        <div className="space-y-1">
          {items.map((it, idx) => (
            <div key={idx} className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2 text-sm">
              <span>{it.label}</span>
              <div className="flex items-center gap-3">
                <span className="font-medium">{BRL(it.amount)}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
