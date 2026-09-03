import { bankName } from "./banks";

export interface ParsedBoleto {
  kind: "bancario" | "arrecadacao";
  digits: string;          // linha digitável só com dígitos
  barcode: string;         // 44 dígitos reconstruídos
  bankCode?: string;       // só para boleto bancário
  bankName?: string;       // só para boleto bancário
  currency?: string;       // 9 = Real
  dueDate: string | null;  // ISO yyyy-mm-dd (pode ser null para arrecadação sem data)
  amount: number;          // em reais (0 se "valor a calcular")
  validDigits: boolean;    // DV dos campos da linha
  validBarcode: boolean;   // DV geral do código de barras
  segment?: string;        // arrecadação: 1=Prefeitura, 2=Saneamento, 3=Energia/Gás, 4=Telecom, 5=Órgão Governamental, 6=Carnês, 7=Trânsito, 9=Outros
  segmentLabel?: string;
  warnings: string[];
}

const FATOR_BASE = new Date(Date.UTC(1997, 9, 7)); // 1997-10-07

function onlyDigits(input: string): string {
  return (input || "").replace(/\D+/g, "");
}

/** Módulo 10 — pesos 2,1,2,1... da direita para a esquerda. */
function mod10(input: string): number {
  let sum = 0;
  let mult = 2;
  for (let i = input.length - 1; i >= 0; i--) {
    let n = Number(input[i]) * mult;
    if (n > 9) n = Math.floor(n / 10) + (n % 10);
    sum += n;
    mult = mult === 2 ? 1 : 2;
  }
  const rest = sum % 10;
  return rest === 0 ? 0 : 10 - rest;
}

/** Módulo 11 — pesos 2..9 cíclicos da direita para a esquerda. */
function mod11(input: string, options: { ifZero?: number; ifEleven?: number } = {}): number {
  let sum = 0;
  let mult = 2;
  for (let i = input.length - 1; i >= 0; i--) {
    sum += Number(input[i]) * mult;
    mult = mult === 9 ? 2 : mult + 1;
  }
  const rest = sum % 11;
  const dv = 11 - rest;
  if (dv === 0 || dv === 10 || dv === 11) {
    return options.ifZero ?? (dv === 11 ? options.ifEleven ?? 1 : 1);
  }
  return dv;
}

function addDaysUTC(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86_400_000);
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/*  Boleto bancário (47 dígitos)                                              */
/* -------------------------------------------------------------------------- */

function parseBancario(d: string): ParsedBoleto {
  const warnings: string[] = [];
  // Campos da linha digitável
  const c1 = d.slice(0, 9);
  const dv1 = d[9];
  const c2 = d.slice(10, 20);
  const dv2 = d[20];
  const c3 = d.slice(21, 31);
  const dv3 = d[31];
  const dvGeral = d[32];
  const fator = d.slice(33, 37);
  const valor = d.slice(37, 47);

  const validDigits =
    Number(dv1) === mod10(c1) &&
    Number(dv2) === mod10(c2) &&
    Number(dv3) === mod10(c3);

  if (!validDigits) warnings.push("Dígito verificador dos campos inválido — confira a digitação.");

  // Reconstrói o código de barras (44 dígitos)
  const barcode =
    d.slice(0, 4) +      // banco + moeda
    dvGeral +            // DV geral
    fator +
    valor +
    d.slice(4, 9) +      // restante do campo 1
    d.slice(10, 20) +    // campo 2
    d.slice(21, 31);     // campo 3

  // Valida DV geral (posição 5 do código de barras), módulo 11
  const withoutDv = barcode.slice(0, 4) + barcode.slice(5);
  const expectedDv = mod11(withoutDv, { ifZero: 1, ifEleven: 1 });
  const validBarcode = Number(dvGeral) === expectedDv;
  if (!validBarcode) warnings.push("Dígito verificador geral inválido.");

  // Vencimento — Febraban: base 07/10/1997 + fator (dias).
  // Quando o fator atinge 9999 ele reinicia em 1000 (ciclo de 9000 dias ≈ 24,6 anos).
  // Regra prática: se a data calculada cair mais de ~3 anos antes de hoje,
  // somamos 9000 dias até trazer para a janela atual.
  const fatorNum = Number(fator);
  let dueDate: string | null = null;
  if (fatorNum > 0) {
    let candidate = addDaysUTC(FATOR_BASE, fatorNum);
    const now = Date.now();
    const threeYearsAgo = now - 3 * 365 * 86_400_000;
    while (candidate.getTime() < threeYearsAgo) {
      candidate = addDaysUTC(candidate, 9000);
    }
    dueDate = toISODate(candidate);
  } else {
    warnings.push("Boleto sem fator de vencimento (a vista ou inválido).");
  }

  const bankCode = d.slice(0, 3);
  const currency = d[3];
  const amount = Number(valor) / 100;
  if (amount === 0) warnings.push("Valor zerado — provavelmente é boleto com valor a calcular.");

  return {
    kind: "bancario",
    digits: d,
    barcode,
    bankCode,
    bankName: bankName(bankCode),
    currency,
    dueDate,
    amount,
    validDigits,
    validBarcode,
    warnings,
  };
}

/* -------------------------------------------------------------------------- */
/*  Boleto de arrecadação (48 dígitos)                                        */
/* -------------------------------------------------------------------------- */

const SEGMENT_LABELS: Record<string, string> = {
  "1": "Prefeitura",
  "2": "Saneamento",
  "3": "Energia elétrica / Gás",
  "4": "Telecomunicações",
  "5": "Órgão governamental",
  "6": "Carnês / convênios privados",
  "7": "Multas de trânsito",
  "9": "Outros",
};

function parseArrecadacao(d: string): ParsedBoleto {
  const warnings: string[] = [];
  // 4 campos de 12 dígitos (11 dados + 1 DV). DV é mod10 quando d[2]=6/7 e mod11 quando d[2]=8/9.
  const idDv = d[2];
  const useMod10 = idDv === "6" || idDv === "7";
  const f1 = d.slice(0, 11);
  const dv1 = d[11];
  const f2 = d.slice(12, 23);
  const dv2 = d[23];
  const f3 = d.slice(24, 35);
  const dv3 = d[35];
  const f4 = d.slice(36, 47);
  const dv4 = d[47];

  const dvFn = useMod10 ? mod10 : (s: string) => mod11(s, { ifZero: 0, ifEleven: 0 });
  const validDigits =
    Number(dv1) === dvFn(f1) &&
    Number(dv2) === dvFn(f2) &&
    Number(dv3) === dvFn(f3) &&
    Number(dv4) === dvFn(f4);
  if (!validDigits) warnings.push("Dígito verificador dos campos inválido — confira a digitação.");

  // Código de barras: junta os 4 campos sem os DVs (44 dígitos)
  const barcode = f1 + f2 + f3 + f4;

  // Valor: posições 5-15 do código de barras (centavos)
  const valor = barcode.slice(4, 15);
  const amount = Number(valor) / 100;

  const segment = d[1];
  const segmentLabel = SEGMENT_LABELS[segment] ?? `Segmento ${segment}`;

  return {
    kind: "arrecadacao",
    digits: d,
    barcode,
    currency: undefined,
    dueDate: null,
    amount,
    validDigits,
    validBarcode: validDigits, // arrecadação não tem DV geral separado
    segment,
    segmentLabel,
    warnings,
  };
}

/* -------------------------------------------------------------------------- */
/*  API pública                                                               */
/* -------------------------------------------------------------------------- */

export function parseLinhaDigitavel(input: string): ParsedBoleto | { error: string } {
  const d = onlyDigits(input);
  if (d.length === 47) return parseBancario(d);
  if (d.length === 48) return parseArrecadacao(d);
  if (d.length === 44) {
    // Já é o próprio código de barras — diferenciar por primeiro dígito
    if (d[0] === "8") {
      // arrecadação: precisa reconstruir a linha digitável com DVs
      const f1 = d.slice(0, 11);
      const f2 = d.slice(11, 22);
      const f3 = d.slice(22, 33);
      const f4 = d.slice(33, 44);
      const useMod10 = d[2] === "6" || d[2] === "7";
      const dvFn = useMod10 ? mod10 : (s: string) => mod11(s, { ifZero: 0, ifEleven: 0 });
      const linha = f1 + dvFn(f1) + f2 + dvFn(f2) + f3 + dvFn(f3) + f4 + dvFn(f4);
      return parseArrecadacao(linha);
    } else {
      // bancário: barcode → linha
      const banco = d.slice(0, 4);
      const dvGeral = d[4];
      const fator = d.slice(5, 9);
      const valor = d.slice(9, 19);
      const livre = d.slice(19);
      const c1 = banco + livre.slice(0, 5);
      const c2 = livre.slice(5, 15);
      const c3 = livre.slice(15, 25);
      const linha = c1 + mod10(c1) + c2 + mod10(c2) + c3 + mod10(c3) + dvGeral + fator + valor;
      return parseBancario(linha);
    }
  }
  return { error: `Quantidade de dígitos inválida (${d.length}). Esperado 47 (boleto) ou 48 (arrecadação).` };
}

export function formatLinhaDigitavel(d: string): string {
  const x = onlyDigits(d);
  if (x.length === 47) {
    // 5.5 5.6 5.6 1 14
    return `${x.slice(0, 5)}.${x.slice(5, 10)} ${x.slice(10, 15)}.${x.slice(15, 21)} ${x.slice(21, 26)}.${x.slice(26, 32)} ${x.slice(32, 33)} ${x.slice(33)}`;
  }
  if (x.length === 48) {
    return `${x.slice(0, 12)} ${x.slice(12, 24)} ${x.slice(24, 36)} ${x.slice(36, 48)}`;
  }
  return x;
}
