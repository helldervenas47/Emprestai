import { captureScroll } from "@/features/loans/lib/preserveScroll";

/**
 * Wrapper para `window.confirm` que preserva a posição de rolagem do app
 * mesmo se o item confirmado for removido/atualizado (delete, cancel, etc.).
 *
 * Captura o scroll ANTES do prompt nativo (que pode mover a viewport em
 * alguns navegadores mobile) e restaura em múltiplos frames depois — igual
 * ao comportamento aplicado globalmente em Dialog/AlertDialog/Sheet/Drawer.
 */
export function confirmWithScroll(message?: string): boolean {
  if (typeof window === "undefined") return false;
  const restore = captureScroll();
  const ok = window.confirm(message);
  restore();
  return ok;
}
