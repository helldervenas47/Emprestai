// Deep links conhecidos para apps de bancos brasileiros.
// Em mobile a tentativa de abrir o scheme cai silenciosamente se o app não estiver instalado.
const SCHEMES: Record<string, string> = {
  "001": "bb://",            // Banco do Brasil
  "033": "santanderbr://",   // Santander
  "104": "caixa://",         // Caixa
  "237": "bradesco://",      // Bradesco
  "260": "nuapp://",         // Nubank
  "077": "bancointer://",    // Inter
  "341": "itau://",          // Itaú
  "336": "c6bank://",        // C6
  "748": "sicredi://",       // Sicredi
  "756": "sicoobapp://",     // Sicoob
  "212": "bancooriginal://", // Original
  "208": "btgpactual://",    // BTG
  "246": "abcbrasil://",     // ABC
  "323": "mercadopago://",   // Mercado Pago
  "380": "picpay://",        // PicPay
  "290": "pagseguro://",     // PagBank
};

export function hasBankAppLink(bankCode?: string | null): boolean {
  return !!bankCode && !!SCHEMES[bankCode];
}

/**
 * Tenta abrir o app do banco. Retorna true se um scheme conhecido foi disparado.
 * Não há como saber com 100% de certeza se o app estava instalado.
 */
export function openBankApp(bankCode?: string | null): boolean {
  if (!bankCode) return false;
  const scheme = SCHEMES[bankCode];
  if (!scheme) return false;
  try {
    window.location.href = scheme;
    return true;
  } catch {
    return false;
  }
}

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}
