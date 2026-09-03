export const SALARY_INCOME_CATEGORY = "Salário";

export function normalizeIncomeCategoryName(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function incomeCategoryKey(value?: string | null) {
  const normalized = normalizeIncomeCategoryName(value);
  if (normalized === "salario" || normalized === "salarios") return "salario";
  return normalized || "outros";
}

export function displayIncomeCategory(value?: string | null) {
  return incomeCategoryKey(value) === "salario" ? SALARY_INCOME_CATEGORY : (value?.trim() || "Outros");
}