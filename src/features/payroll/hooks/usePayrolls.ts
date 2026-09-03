import { useState, useEffect, useCallback, useRef, useId } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { assertWritable } from "@/lib/readOnlyState";
import { recordLedger } from "@/features/financial/lib/ledger";
import { adjustBalance, type Wallet } from "@/features/financial/lib/balance";
import { displayIncomeCategory, incomeCategoryKey, SALARY_INCOME_CATEGORY } from "@/features/financial/lib/incomeCategory";
import { todayInAppTz } from "@/lib/timezone";
import type { Employee, Payroll, PayrollItems, PayrollStatus, SalaryItem } from "@/types/salary";

const linkedExpensePromises = new Map<string, Promise<string | null>>();
const LINKED_EXPENSE_DEDUP_KEY = "payrolls.linkedExpenseDedup.v2";

/**
 * Regra de composição: itens que pertencem à folha mensal (salário base,
 * benefícios, descontos e bônus por metas) NUNCA são separados em
 * contracheques próprios — já estão contemplados no net_salary da folha e,
 * portanto, na despesa vinculada. Apenas proventos avulsos (13º, férias,
 * comissão…) podem viver em contracheques separados.
 */
const COMPOSED_ITEM_KINDS = new Set(["earning", "benefit", "goal_bonus", "deduction"]);

/** Detecta um item de bônus por metas (por kind ou label legado). */
function isGoalBonusItem(it: { kind?: string; label?: string } | undefined | null): boolean {
  if (!it) return false;
  return String(it.kind) === "goal_bonus" || /b[ôo]nus por atingimento das metas/i.test(String(it.label ?? ""));
}

const PAYROLL_COLUMNS =
  "id, employee_id, competence, gross_salary, total_benefits, total_deductions, net_salary, paid_amount, status, due_date, paid_date, payment_method_id, expense_id, income_id, closed, items, notes, created_at, updated_at";
const PAYROLL_PAYMENT_COLUMNS =
  "id, user_id, payroll_id, amount, paid_date, payment_method_id, expense_id, income_id, notes";


function rowToPayroll(r: any): Payroll {
  return {
    id: r.id,
    employeeId: r.employee_id,
    competence: r.competence,
    grossSalary: Number(r.gross_salary ?? 0),
    totalBenefits: Number(r.total_benefits ?? 0),
    totalDeductions: Number(r.total_deductions ?? 0),
    netSalary: Number(r.net_salary ?? 0),
    paidAmount: Number(r.paid_amount ?? 0),
    status: r.status,
    dueDate: r.due_date,
    paidDate: r.paid_date,
    paymentMethodId: r.payment_method_id,
    expenseId: r.expense_id,
    incomeId: r.income_id,
    closed: !!r.closed,
    items: (r.items as PayrollItems) ?? { earnings: [], deductions: [] },
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function sumItems(items: SalaryItem[]) {
  return items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
}

/**
 * Deriva o prefixo da descrição da despesa/lançamento a partir do payroll.
 * Folhas mensais → "Salário". Proventos extras (13º, férias, etc.) usam o
 * label do tipo capturado em `payrolls.notes` no formato `[<label>] ...`,
 * com um mapeamento amigável para "13º Salário" → "Décimo Terceiro".
 */
function payrollDescriptionPrefix(payroll: Payroll): string {
  const notes = String(payroll.notes ?? "").trim();
  const m = notes.match(/^\[([^\]]+)\]/);
  const label = m ? m[1].trim() : "";
  if (!label) return "Salário";
  if (/^13[ºo]?\s*sal[áa]rio$/i.test(label) || /d[ée]cimo\s*terceiro/i.test(label)) {
    return "Décimo Terceiro";
  }
  return label;
}

export function buildPayrollFromEmployee(e: Employee): { items: PayrollItems; gross: number; benefits: number; deductions: number; net: number } {
  const earnings: SalaryItem[] = [
    { label: "Salário base", amount: e.baseSalary, kind: "earning" },
    ...(e.benefits ?? []).map((b) => ({ ...b, kind: "benefit" })),
  ];
  const deductions = (e.deductions ?? []).map((d) => ({ ...d, kind: "deduction" }));
  const gross = e.baseSalary;
  const benefits = sumItems(e.benefits ?? []);
  const totalDeductions = sumItems(deductions);
  const net = gross + benefits - totalDeductions;
  return { items: { earnings, deductions }, gross, benefits, deductions: totalDeductions, net };
}

/**
 * Remove ledger entries matched by metadata key/value. Reverts wallet balances.
 * Used to estornar pagamentos individuais sem afetar a despesa vinculada da folha.
 */
async function removeLedgerByMetadata(key: string, value: string) {
  const { data } = await supabase
    .from("account_ledger")
    .select("id, direction, amount, wallet" as any)
    .contains("metadata", { [key]: value } as any);
  const rows = (data as any[]) ?? [];
  if (rows.length === 0) return;
  const ids = rows.map((r) => r.id);
  await supabase.from("account_ledger").delete().in("id", ids);
  for (const r of rows) {
    const w: Wallet = (r.wallet as Wallet) || "account";
    const delta = r.direction === "in" ? -Number(r.amount) : Number(r.amount);
    if (delta !== 0) await adjustBalance(delta, w);
  }
}

export function usePayrolls(enabled = true) {
  const { user, dataOwnerId } = useAuth();
  const instanceId = useId();
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("payrolls" as any)
      .select(PAYROLL_COLUMNS)
      .order("competence", { ascending: false });
    if (data) setPayrolls((data as any[]).map(rowToPayroll));
    setLoading(false);
  }, [user]);

  useEffect(() => { if (enabled) fetchAll(); }, [enabled, fetchAll]);

  useEffect(() => {
    if (!user || !enabled) return;
    const ownerId = dataOwnerId ?? user.id;
    const safe = (fn: () => void) => {
      try { fn(); } catch (e) { console.warn("[usePayrolls realtime patch failed, refetching]", e); fetchAll(); }
    };
    const ch = supabase
      .channel(`payrolls:${ownerId}:${instanceId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "payrolls", filter: `user_id=eq.${ownerId}` }, (payload) => {
        safe(() => setPayrolls((prev) => {
          const row = rowToPayroll(payload.new as any);
          if (prev.some((p) => p.id === row.id)) return prev;
          return [row, ...prev];
        }));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "payrolls", filter: `user_id=eq.${ownerId}` }, (payload) => {
        safe(() => setPayrolls((prev) => prev.map((p) => p.id === (payload.new as any).id ? rowToPayroll(payload.new as any) : p)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "payrolls" }, (payload) => {
        safe(() => setPayrolls((prev) => prev.filter((p) => p.id !== (payload.old as any).id)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, dataOwnerId, enabled, fetchAll, instanceId]);

  /**
   * Garante que exista uma despesa vinculada a esta folha (1:1).
   * Reutiliza a despesa já vinculada quando presente. Usa também um marker
   * em `expenses.notes` (`[Payroll:<id>]`) para detectar uma despesa órfã
   * já criada anteriormente (evita duplicatas em corrida com realtime).
   */
  const ensureLinkedExpense = useCallback(async (payroll: Payroll, employeeName?: string): Promise<string | null> => {
    assertWritable();
    if (!dataOwnerId) return null;
    if (payroll.expenseId) {
      const { data } = await supabase.from("expenses").select("id").eq("id", payroll.expenseId).maybeSingle();
      if (data) return payroll.expenseId;
    }
    const running = linkedExpensePromises.get(payroll.id);
    if (running) return running;
    const promise = (async () => {
      try {
      // Dedup defensivo: já existe despesa marcada para esta folha?
      const marker = `[Payroll:${payroll.id}]`;
      const { data: existing } = await supabase
        .from("expenses")
        .select("id")
        .eq("user_id", dataOwnerId)
        .ilike("notes", `%${marker}%`)
        .limit(1);
      if (existing && existing.length > 0) {
        const id = (existing[0] as any).id as string;
        await supabase.from("payrolls" as any).update({ expense_id: id } as any).eq("id", payroll.id);
        return id;
      }

      let name = employeeName;
      if (!name && payroll.employeeId) {
        const { data: emp } = await supabase
          .from("employees" as any)
          .select("name")
          .eq("id", payroll.employeeId)
          .maybeSingle();
        if (emp && (emp as any).name) name = (emp as any).name as string;
      }
      const finalName = name ?? "Funcionário";
      const prefix = payrollDescriptionPrefix(payroll);
      const isMainSalary = prefix === "Salário";
      const desc = isMainSalary
        ? `${prefix} Funcionário - ${payroll.competence}`
        : `${prefix} ${finalName} - ${payroll.competence}`;
      const { data: exp, error } = await supabase.from("expenses").insert({
        id: payroll.id,
        user_id: dataOwnerId,
        description: desc,
        amount: payroll.netSalary,
        type: "fixa",
        category: "Salários",
        due_date: payroll.dueDate ?? `${payroll.competence}-05`,
        paid: payroll.status === "pago",
        paid_date: payroll.status === "pago" ? (payroll.paidDate ?? null) : null,
        scope: "business",
        payment_method_id: payroll.paymentMethodId ?? null,
        notes: `${marker} Despesa vinculada à folha de pagamento`,
        metadata: {
          payroll_id: payroll.id,
          employee_id: payroll.employeeId,
          competence: payroll.competence,
          is_payroll_main: true
        }
      } as any).select("id").single();
      if (error || !exp) {
        const { data: deterministic } = await supabase.from("expenses").select("id").eq("id", payroll.id).maybeSingle();
        if (deterministic) {
          await supabase.from("payrolls" as any).update({ expense_id: payroll.id } as any).eq("id", payroll.id);
          return payroll.id;
        }
        return null;
      }
      const expenseId = (exp as any).id as string;
      await supabase.from("payrolls" as any).update({ expense_id: expenseId } as any).eq("id", payroll.id);
        return expenseId;
      } finally {
        linkedExpensePromises.delete(payroll.id);
      }
    })();
    linkedExpensePromises.set(payroll.id, promise);
    return promise;
  }, [dataOwnerId]);

  // Backfill + dedup: roda uma única vez por sessão.
  const backfillRanRef = useRef(false);
  useEffect(() => {
    if (!enabled || !dataOwnerId) return;
    if (backfillRanRef.current) return;
    if (payrolls.length === 0) return;
    backfillRanRef.current = true;
    (async () => {
      // 1. Dedup: remove despesas vinculadas duplicadas (mantém a mais antiga).
      if (!localStorage.getItem(LINKED_EXPENSE_DEDUP_KEY)) {
        const { data: tagged } = await supabase
          .from("expenses")
          .select("id, notes, created_at")
          .eq("user_id", dataOwnerId)
          .ilike("notes", "%[Payroll:%")
          .order("created_at", { ascending: true });
        const seen = new Map<string, string>(); // payrollId -> kept expenseId
        const toDelete: string[] = [];
        for (const row of ((tagged as any[]) ?? [])) {
          const m = String(row.notes || "").match(/\[Payroll:([0-9a-f-]+)\]/i);
          if (!m) continue;
          const pid = m[1];
          if (seen.has(pid)) toDelete.push(row.id);
          else seen.set(pid, row.id);
        }
        if (toDelete.length > 0) {
          await supabase.from("account_ledger").delete().in("expense_id", toDelete);
          await supabase.from("expenses").delete().in("id", toDelete);
        }
        // Garante que o expense_id da folha aponte para o registro mantido.
        for (const [pid, expId] of seen.entries()) {
          await supabase.from("payrolls" as any).update({ expense_id: expId } as any).eq("id", pid);
        }
        localStorage.setItem(LINKED_EXPENSE_DEDUP_KEY, new Date().toISOString());
      }

      // 2. Backfill: cria despesa vinculada para folhas ainda não pagas que não a têm.
      const pending = payrolls.filter((p) => !p.expenseId && p.paidAmount <= 0.01);
      for (const p of pending) {
        await ensureLinkedExpense(p);
      }
    })();
  }, [payrolls, enabled, dataOwnerId, ensureLinkedExpense]);

  const generatePayroll = useCallback(async (employee: Employee, competence: string, dueDate?: string) => {
    assertWritable();
    if (!dataOwnerId) return null;
    const existing = payrolls.find((p) => p.employeeId === employee.id && p.competence === competence);
    if (existing) return existing;
    const calc = buildPayrollFromEmployee(employee);
    const payload = {
      user_id: dataOwnerId,
      employee_id: employee.id,
      competence,
      gross_salary: calc.gross,
      total_benefits: calc.benefits,
      total_deductions: calc.deductions,
      net_salary: calc.net,
      paid_amount: 0,
      status: "pendente" as PayrollStatus,
      due_date: dueDate ?? `${competence}-05`,
      items: calc.items as any,
    };
    const { data, error } = await supabase.from("payrolls" as any).insert(payload as any).select().single();
    if (error) throw error;
    const payroll = rowToPayroll(data);
    // Cria despesa vinculada (1:1) já na criação da folha.
    await ensureLinkedExpense(payroll, employee.name);
    return payroll;
  }, [dataOwnerId, payrolls, ensureLinkedExpense]);

  const generateMonthlyBatch = useCallback(async (employees: Employee[], competence: string) => {
    const created: Payroll[] = [];
    for (const e of employees.filter((x) => x.status === "ativo")) {
      const r = await generatePayroll(e, competence);
      if (r) created.push(r);
    }
    return created;
  }, [generatePayroll]);

  /**
   * Aplica pagamento (total/parcial) SEM criar nova despesa.
   * Atualiza a despesa vinculada (paga somente quando totalmente quitada),
   * registra o movimento no extrato e grava o histórico em payroll_payments.
   */
  const payPayroll = useCallback(async (payroll: Payroll, employee: Employee | undefined, amount: number, opts?: { paidDate?: string; paymentMethodId?: string | null; notes?: string }) => {
    assertWritable();
    if (!dataOwnerId) return;
    const date = opts?.paidDate || todayInAppTz();
    const newPaid = Math.min(payroll.netSalary, payroll.paidAmount + amount);
    const fully = newPaid >= payroll.netSalary - 0.01;
    const status: PayrollStatus = fully ? "pago" : "parcial";
    const empName = employee?.name ?? "Funcionário";
    const descPrefix = payrollDescriptionPrefix(payroll);
    const isMainSalary = descPrefix === "Salário";

    // 1. Garante despesa vinculada (legacy ou nova).
    const expenseId = await ensureLinkedExpense(payroll, empName);

    // 2. Histórico de pagamento (precisa do id para amarrar o ledger).
    const { data: paymentRow } = await supabase.from("payroll_payments" as any).insert({
      user_id: dataOwnerId,
      payroll_id: payroll.id,
      amount,
      paid_date: date,
      payment_method_id: opts?.paymentMethodId ?? null,
      expense_id: expenseId,
      income_id: null,
      notes: opts?.notes ?? null,
    } as any).select("id").single();
    const paymentId = (paymentRow as any)?.id as string | undefined;

    // 3. Extrato — amarra o ledger ao payment_id via metadata para estorno granular.
    await recordLedger({
      direction: "out",
      category: "expense",
      amount,
      description: isMainSalary 
        ? `${descPrefix} Funcionário - ${payroll.competence}`
        : `${descPrefix} - ${empName} (${payroll.competence})`,
      occurred_on: date,
      expense_id: expenseId,
      source: "salary",
      payment_method_id: opts?.paymentMethodId ?? null,
      metadata: {
        payroll_id: payroll.id,
        payroll_payment_id: paymentId ?? null,
        competence: payroll.competence,
        employee_id: payroll.employeeId,
      },
    });

    // 4. Composição opcional em Receitas (sem tocar no extrato).
    let incomeId: string | null = null;
    if (employee?.addToIncomes) {
      const { data: cats } = await supabase
        .from("income_categories" as any)
        .select("name")
        .eq("user_id", dataOwnerId);
      const existing = ((cats as any[]) ?? [])
        .map((c) => c.name as string)
        .find((n) => incomeCategoryKey(n) === "salario");
      const incomeCategory = displayIncomeCategory(existing ?? SALARY_INCOME_CATEGORY);
      const baseDesc = isMainSalary
        ? `${descPrefix} Funcionário - ${payroll.competence}${fully ? "" : " (parcial)"}`
        : `${descPrefix} ${empName} - ${payroll.competence}${fully ? "" : " (parcial)"}`;
      const { data: incomeRow } = await supabase.from("incomes").insert({
        user_id: dataOwnerId,
        description: baseDesc,
        amount,
        category: incomeCategory,
        source: "salary",
        received_date: date,
        actual_received_date: date,
        status: "received",
        recurrence: "once",
        payment_method_id: opts?.paymentMethodId ?? null,
        notes: `Composição interna do salário | payroll_id=${payroll.id} | employee_id=${payroll.employeeId}`,
      } as any).select().single();
      incomeId = (incomeRow as any)?.id ?? null;
      if (paymentId && incomeId) {
        await supabase.from("payroll_payments" as any).update({ income_id: incomeId } as any).eq("id", paymentId);
      }
    }

    // 5. Atualiza a folha.
    await supabase.from("payrolls" as any).update({
      paid_amount: newPaid,
      status,
      paid_date: fully ? date : null,
      payment_method_id: opts?.paymentMethodId ?? null,
      expense_id: expenseId,
      income_id: fully ? incomeId : payroll.incomeId,
      closed: fully ? true : payroll.closed,
    } as any).eq("id", payroll.id);

    // 6. Quando totalmente quitada → marca a despesa vinculada como paga.
    if (fully && expenseId) {
      await supabase.from("expenses").update({
        paid: true,
        paid_date: date,
        payment_method_id: opts?.paymentMethodId ?? null,
      } as any).eq("id", expenseId);
    }
  }, [dataOwnerId, ensureLinkedExpense]);

  /**
   * Estorna um pagamento específico: remove APENAS o lançamento de extrato
   * desse pagamento (via metadata), apaga eventual receita vinculada, recalcula
   * o total pago da folha e, se necessário, desfaz o status "pago" da despesa
   * vinculada. A despesa em si nunca é apagada — ela permanece vinculada à folha.
   */
  const reversePayrollPayment = useCallback(async (paymentId: string) => {
    assertWritable();
    const { data: pay } = await supabase
      .from("payroll_payments" as any)
      .select(PAYROLL_PAYMENT_COLUMNS)
      .eq("id", paymentId)
      .maybeSingle();
    if (!pay) return;
    const p = pay as any;

    await removeLedgerByMetadata("payroll_payment_id", paymentId);
    if (p.income_id) await supabase.from("incomes").delete().eq("id", p.income_id);
    await supabase.from("payroll_payments" as any).delete().eq("id", paymentId);

    const { data: remaining } = await supabase
      .from("payroll_payments" as any)
      .select("amount")
      .eq("payroll_id", p.payroll_id);
    const newPaid = ((remaining as any[]) ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);
    const { data: payrollRow } = await supabase
      .from("payrolls" as any)
      .select("net_salary, expense_id")
      .eq("id", p.payroll_id)
      .maybeSingle();
    const net = Number((payrollRow as any)?.net_salary ?? 0);
    const expenseId = (payrollRow as any)?.expense_id ?? p.expense_id ?? null;
    const fully = newPaid >= net - 0.01;
    const status: PayrollStatus = newPaid <= 0.01 ? "pendente" : fully ? "pago" : "parcial";
    await supabase.from("payrolls" as any).update({
      paid_amount: newPaid,
      status,
      paid_date: fully ? p.paid_date : null,
      closed: fully ? true : false,
    } as any).eq("id", p.payroll_id);

    // Se a folha não está mais totalmente paga → despesa vinculada volta a "pendente".
    if (!fully && expenseId) {
      await supabase.from("expenses").update({ paid: false, paid_date: null } as any).eq("id", expenseId);
    }
  }, []);

  const reopenPayroll = useCallback(async (payroll: Payroll) => {
    assertWritable();
    await supabase.from("payrolls" as any).update({ closed: false } as any).eq("id", payroll.id);
  }, []);

  const closePayroll = useCallback(async (payroll: Payroll) => {
    assertWritable();
    await supabase.from("payrolls" as any).update({ closed: true } as any).eq("id", payroll.id);
  }, []);

  /** Exclui a folha e todos os efeitos colaterais (despesa vinculada, ledger, incomes). */
  const deletePayroll = useCallback(async (id: string) => {
    assertWritable();
    const { data: payrollRow } = await supabase
      .from("payrolls" as any)
      .select("expense_id")
      .eq("id", id)
      .maybeSingle();
    const expenseId = (payrollRow as any)?.expense_id as string | null;

    const { data: payments } = await supabase
      .from("payroll_payments" as any)
      .select("id, income_id")
      .eq("payroll_id", id);
    for (const p of ((payments as any[]) ?? [])) {
      await removeLedgerByMetadata("payroll_payment_id", p.id);
      if (p.income_id) await supabase.from("incomes").delete().eq("id", p.income_id);
    }
    await supabase.from("payroll_payments" as any).delete().eq("payroll_id", id);

    // Despesa vinculada: remove (cascata em ledger residual via expense_id).
    if (expenseId) {
      await supabase.from("account_ledger").delete().eq("expense_id", expenseId);
      await supabase.from("expenses").delete().eq("id", expenseId);
    }
    await supabase.from("payrolls" as any).delete().eq("id", id);
  }, []);

  


  const splitLegacyExtraEarnings = useCallback(async () => {
    assertWritable();
    if (!dataOwnerId) return { split: 0, created: 0 };
    let touched = 0;
    let created = 0;
    for (const p of payrolls) {
      if (p.paidAmount > 0 || p.closed) continue;
      const earnings = p.items?.earnings ?? [];
      if (earnings.length <= 1) continue;

      // Mantém na folha tudo que compõe o salário; separa somente proventos avulsos.
      const keep = earnings.filter((it) => COMPOSED_ITEM_KINDS.has(String(it.kind ?? "earning")));
      const extras = earnings.filter((it) => !COMPOSED_ITEM_KINDS.has(String(it.kind ?? "earning")));
      if (extras.length === 0 || keep.length === 0) continue;
      const deductions = p.items?.deductions ?? [];

      for (const item of extras) {
        // Dedup: não recria um provento avulso que já tenha contracheque próprio.
        const dupe = payrolls.some(
          (o) =>
            o.id !== p.id &&
            o.employeeId === p.employeeId &&
            o.competence === p.competence &&
            (o.items?.earnings ?? []).length === 1 &&
            (o.items?.earnings ?? [])[0]?.label === item.label &&
            Math.abs(Number((o.items?.earnings ?? [])[0]?.amount ?? 0) - (Number(item.amount) || 0)) < 0.01,
        );
        if (dupe) continue;

        const { error } = await supabase.from("payrolls" as any).insert({
          user_id: dataOwnerId,
          employee_id: p.employeeId,
          competence: p.competence,
          gross_salary: Number(item.amount) || 0,
          total_benefits: 0,
          total_deductions: 0,
          net_salary: Number(item.amount) || 0,
          paid_amount: 0,
          status: "pendente",
          due_date: p.dueDate ?? `${p.competence}-05`,
          items: { earnings: [item], deductions: [] } as any,
          notes: `[${item.label}] (reorganizado de folha anterior)`,
        } as any);
        if (error) throw error;
        created++;
      }

      const newEarn = sumItems(keep);
      const newDed = sumItems(deductions);
      const newNet = newEarn - newDed;
      await supabase.from("payrolls" as any).update({
        items: { earnings: keep, deductions } as any,
        gross_salary: newEarn,
        total_benefits: 0,
        total_deductions: newDed,
        net_salary: newNet,
      } as any).eq("id", p.id);

      // Sincroniza a despesa vinculada para não deixar valor "inflado" no financeiro.
      if (p.expenseId) {
        await supabase.from("expenses").update({ amount: newNet } as any).eq("id", p.expenseId);
      }
      touched++;
    }
    await fetchAll();
    return { split: touched, created };
  }, [dataOwnerId, payrolls, fetchAll]);

  /**
   * Reconciliação: garante que cada despesa vinculada reflita exatamente o
   * net_salary da folha (evita duplicidade de bônus/proventos já compostos)
   * e remove contracheques/despesas duplicados de bônus por metas.
   */
  const reconcilePayrollExpenses = useCallback(async () => {
    if (!dataOwnerId) return { fixed: 0, removed: 0 };
    let fixed = 0;
    let removed = 0;

    // 1. Remove folhas duplicadas de bônus por metas: se o bônus já está
    // composto em outra folha do mesmo funcionário/competência, o contracheque
    // avulso do bônus é duplicidade.
    for (const p of payrolls) {
      if (p.paidAmount > 0.01 || p.closed) continue;
      const items = p.items?.earnings ?? [];
      if (items.length !== 1) continue;
      const only = items[0];
      if (!isGoalBonusItem(only)) continue;

      const composedElsewhere = payrolls.some(
        (o) =>
          o.id !== p.id &&
          o.employeeId === p.employeeId &&
          o.competence === p.competence &&
          (o.items?.earnings ?? []).length > 1 &&
          (o.items?.earnings ?? []).some(
            (it) => isGoalBonusItem(it) && Math.abs(Number(it.amount ?? 0) - Number(only.amount ?? 0)) < 0.01,
          ),
      );
      if (!composedElsewhere) continue;


      await deletePayroll(p.id);
      removed++;
    }

    // 2. Sincroniza valores das despesas vinculadas restantes.
    for (const p of payrolls) {
      if (!p.expenseId) continue;
      const { data: exp } = await supabase
        .from("expenses")
        .select("id, amount")
        .eq("id", p.expenseId)
        .maybeSingle();
      if (!exp) continue;
      if (Math.abs(Number((exp as any).amount ?? 0) - Number(p.netSalary)) < 0.01) continue;
      await supabase.from("expenses").update({ amount: p.netSalary } as any).eq("id", p.expenseId);
      fixed++;
    }

    if (removed > 0 || fixed > 0) await fetchAll();
    return { fixed, removed };
  }, [dataOwnerId, payrolls, fetchAll, deletePayroll]);


  const updatePayroll = useCallback(async (id: string, patch: Partial<Payroll>) => {
    assertWritable();
    const p: any = {};
    if (patch.dueDate !== undefined) p.due_date = patch.dueDate;
    if (patch.notes !== undefined) p.notes = patch.notes;
    if (patch.items !== undefined) {
      p.items = patch.items;
      const earnings = sumItems(patch.items.earnings);
      const ded = sumItems(patch.items.deductions);
      p.gross_salary = earnings;
      p.total_deductions = ded;
      p.net_salary = earnings - ded;
    }
    await supabase.from("payrolls" as any).update(p).eq("id", id);

    // Mantém a despesa vinculada sincronizada (valor / vencimento).
    const current = payrolls.find((x) => x.id === id);
    if (current?.expenseId) {
      const expPatch: any = {};
      if (patch.dueDate !== undefined) expPatch.due_date = patch.dueDate;
      if (patch.items !== undefined) {
        const earnings = sumItems(patch.items.earnings);
        const ded = sumItems(patch.items.deductions);
        expPatch.amount = earnings - ded;
      }
      if (Object.keys(expPatch).length > 0) {
        await supabase.from("expenses").update(expPatch).eq("id", current.expenseId);
      }
    }
  }, [payrolls]);

  return {
    payrolls, loading, refresh: fetchAll,
    generatePayroll, generateMonthlyBatch, payPayroll, reversePayrollPayment,
    reopenPayroll, closePayroll, deletePayroll, updatePayroll,
    splitLegacyExtraEarnings, reconcilePayrollExpenses,
  };
}
