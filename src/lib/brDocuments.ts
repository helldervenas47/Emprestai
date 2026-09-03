// Utilidades para documentos brasileiros (CPF, CNPJ, RG).
// Máscaras aplicadas em tempo real e formatação na exibição, para
// suportar tanto registros novos quanto legados salvos sem formatação.

export function onlyDigits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** Formata CPF (000.000.000-00). Aceita valor parcial durante digitação. */
export function formatCPF(value: string | null | undefined): string {
  const d = onlyDigits(value).slice(0, 11);
  if (!d) return "";
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

/** Formata CNPJ (00.000.000/0000-00). */
export function formatCNPJ(value: string | null | undefined): string {
  const d = onlyDigits(value).slice(0, 14);
  if (!d) return "";
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

/** Formata CPF ou CNPJ automaticamente pelo tamanho. */
export function formatCpfOrCnpj(value: string | null | undefined): string {
  const d = onlyDigits(value);
  if (d.length <= 11) return formatCPF(d);
  return formatCNPJ(d);
}

/**
 * Formata RG com separadores brasileiros preservando a quantidade de dígitos.
 * Ex.: 8 dígitos -> 00.000.000-0 (últimos como dígito verificador).
 * Para RGs mais curtos/longos aplica o padrão de blocos 2.3.3-X.
 */
export function formatRG(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  // Preserva a letra final se existir (ex.: 12.345.678-X)
  const tail = /[a-zA-Z]$/.test(raw) ? raw.slice(-1).toUpperCase() : "";
  const digits = onlyDigits(raw).slice(0, 14);
  if (!digits) return tail || "";
  const dv = tail || digits.slice(-1);
  const body = tail ? digits : digits.slice(0, -1);
  // Blocos de 3 a partir da direita no corpo
  const grouped: string[] = [];
  let rest = body;
  while (rest.length > 3) {
    grouped.unshift(rest.slice(-3));
    rest = rest.slice(0, -3);
  }
  if (rest) grouped.unshift(rest);
  if (digits.length <= 1) return dv;
  return `${grouped.join(".")}-${dv}`;
}

/** Validação matemática de CPF (dígitos verificadores). */
export function isValidCPF(value: string | null | undefined): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (base: string, factor: number) => {
    let sum = 0;
    for (const c of base) sum += parseInt(c, 10) * factor--;
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(cpf.slice(0, 9), 10) === parseInt(cpf[9], 10)
    && calc(cpf.slice(0, 10), 11) === parseInt(cpf[10], 10);
}

/** Validação matemática de CNPJ. */
export function isValidCNPJ(value: string | null | undefined): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (base: string) => {
    const weights = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += parseInt(base[i], 10) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(cnpj.slice(0, 12)) === parseInt(cnpj[12], 10)
    && calc(cnpj.slice(0, 13)) === parseInt(cnpj[13], 10);
}

export function isValidCpfOrCnpj(value: string | null | undefined): boolean {
  const d = onlyDigits(value);
  if (d.length === 11) return isValidCPF(d);
  if (d.length === 14) return isValidCNPJ(d);
  return false;
}

/** Formata telefone brasileiro (10 ou 11 dígitos). */
export function formatPhone(value: string | null | undefined): string {
  const d = onlyDigits(value).slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}
