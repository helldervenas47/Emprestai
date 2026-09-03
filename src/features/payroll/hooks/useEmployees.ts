import { useState, useEffect, useCallback, useId } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import type { Employee, SalaryItem } from "@/types/salary";
import { assertWritable } from "@/lib/readOnlyState";

function rowToEmployee(r: any): Employee {
  return {
    id: r.id,
    name: r.name,
    cpf: r.cpf,
    role: r.role,
    department: r.department,
    registration: r.registration,
    hireDate: r.hire_date,
    status: r.status ?? "ativo",
    photoUrl: r.photo_url,
    baseSalary: Number(r.base_salary ?? 0),
    paymentType: r.payment_type ?? "mensal",
    hourlyRate: r.hourly_rate != null ? Number(r.hourly_rate) : null,
    commissionPercent: r.commission_percent != null ? Number(r.commission_percent) : null,
    bank: r.bank,
    agency: r.agency,
    account: r.account,
    pixKey: r.pix_key,
    benefits: (r.benefits as SalaryItem[]) ?? [],
    deductions: (r.deductions as SalaryItem[]) ?? [],
    notes: r.notes,
    addToIncomes: !!r.add_to_incomes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const EMPLOYEE_COLUMNS =
  "id, name, cpf, role, department, registration, hire_date, status, photo_url, base_salary, payment_type, hourly_rate, commission_percent, bank, agency, account, pix_key, benefits, deductions, notes, add_to_incomes, created_at, updated_at";

export function useEmployees(enabled = true) {
  const { user, dataOwnerId } = useAuth();
  const instanceId = useId();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("employees" as any)
      .select(EMPLOYEE_COLUMNS)
      .order("name");
    if (data) setEmployees((data as any[]).map(rowToEmployee));
    setLoading(false);
  }, [user]);

  useEffect(() => { if (enabled) fetchAll(); }, [enabled, fetchAll]);

  useEffect(() => {
    if (!user || !enabled || !dataOwnerId) return;
    const ch = supabase
      .channel(`employees:${dataOwnerId}:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employees", filter: `user_id=eq.${dataOwnerId}` },
        () => fetchAll(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, enabled, dataOwnerId, fetchAll, instanceId]);

  const addEmployee = useCallback(async (e: Omit<Employee, "id" | "createdAt" | "updatedAt">) => {
    assertWritable();
    if (!dataOwnerId) return null;
    const payload = {
      user_id: dataOwnerId,
      name: e.name,
      cpf: e.cpf ?? null,
      role: e.role ?? null,
      department: e.department ?? null,
      registration: e.registration ?? null,
      hire_date: e.hireDate ?? null,
      status: e.status,
      photo_url: e.photoUrl ?? null,
      base_salary: e.baseSalary,
      payment_type: e.paymentType,
      hourly_rate: e.hourlyRate ?? null,
      commission_percent: e.commissionPercent ?? null,
      bank: e.bank ?? null,
      agency: e.agency ?? null,
      account: e.account ?? null,
      pix_key: e.pixKey ?? null,
      benefits: e.benefits,
      deductions: e.deductions,
      notes: e.notes ?? null,
      add_to_incomes: !!e.addToIncomes,
    };
    const { data, error } = await supabase.from("employees" as any).insert(payload as any).select().single();
    if (error) throw error;
    return rowToEmployee(data);
  }, [dataOwnerId]);

  const updateEmployee = useCallback(async (id: string, patch: Partial<Employee>) => {
    assertWritable();
    const p: any = {};
    if (patch.name !== undefined) p.name = patch.name;
    if (patch.cpf !== undefined) p.cpf = patch.cpf;
    if (patch.role !== undefined) p.role = patch.role;
    if (patch.department !== undefined) p.department = patch.department;
    if (patch.registration !== undefined) p.registration = patch.registration;
    if (patch.hireDate !== undefined) p.hire_date = patch.hireDate;
    if (patch.status !== undefined) p.status = patch.status;
    if (patch.photoUrl !== undefined) p.photo_url = patch.photoUrl;
    if (patch.baseSalary !== undefined) p.base_salary = patch.baseSalary;
    if (patch.paymentType !== undefined) p.payment_type = patch.paymentType;
    if (patch.hourlyRate !== undefined) p.hourly_rate = patch.hourlyRate;
    if (patch.commissionPercent !== undefined) p.commission_percent = patch.commissionPercent;
    if (patch.bank !== undefined) p.bank = patch.bank;
    if (patch.agency !== undefined) p.agency = patch.agency;
    if (patch.account !== undefined) p.account = patch.account;
    if (patch.pixKey !== undefined) p.pix_key = patch.pixKey;
    if (patch.benefits !== undefined) p.benefits = patch.benefits;
    if (patch.deductions !== undefined) p.deductions = patch.deductions;
    if (patch.notes !== undefined) p.notes = patch.notes;
    if (patch.addToIncomes !== undefined) p.add_to_incomes = patch.addToIncomes;
    await supabase.from("employees" as any).update(p).eq("id", id);
  }, []);

  const deleteEmployee = useCallback(async (id: string) => {
    assertWritable();
    await supabase.from("employees" as any).delete().eq("id", id);
  }, []);

  return { employees, loading, addEmployee, updateEmployee, deleteEmployee, refresh: fetchAll };
}
