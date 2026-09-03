// Validação leve do BR Code PIX (EMVCo Merchant Presented).
// Formato TLV: cada campo = ID(2) + LEN(2) + VALUE(LEN). CRC16-CCITT-FALSE nos últimos 4 dígitos do campo 6304.

export interface PixBrCodeInfo {
  valid: boolean;
  reason?: string;
  amount?: number;       // 5402 em reais quando presente
  merchantName?: string; // 59
  merchantCity?: string; // 60
  txid?: string;         // 05 dentro de 26/27/...
}

function crc16ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function parsePixBrCode(raw: string): PixBrCodeInfo {
  const s = (raw || "").trim();
  if (s.length < 20) return { valid: false, reason: "Código muito curto." };
  if (!s.startsWith("000201")) return { valid: false, reason: "Não começa com 000201 (PIX Copia e Cola)." };
  const crcIdx = s.lastIndexOf("6304");
  if (crcIdx < 0 || s.length - crcIdx !== 8) return { valid: false, reason: "CRC ausente ou inválido." };
  const payloadForCrc = s.slice(0, crcIdx + 4);
  const expected = crc16ccitt(payloadForCrc);
  const provided = s.slice(crcIdx + 4).toUpperCase();
  if (expected !== provided) return { valid: false, reason: "CRC incorreto — verifique se copiou o código inteiro." };

  // Extrai campos top-level
  const fields: Record<string, string> = {};
  let i = 0;
  while (i < crcIdx) {
    const id = s.slice(i, i + 2);
    const len = parseInt(s.slice(i + 2, i + 4), 10);
    if (isNaN(len)) break;
    const val = s.slice(i + 4, i + 4 + len);
    fields[id] = val;
    i += 4 + len;
  }

  const amount = fields["54"] ? Number(fields["54"]) : undefined;
  return {
    valid: true,
    amount: amount && !isNaN(amount) ? amount : undefined,
    merchantName: fields["59"],
    merchantCity: fields["60"],
    txid: fields["62"],
  };
}
