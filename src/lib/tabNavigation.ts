// Pure helper que decide como uma troca de aba deve se comportar.
// Política oficial de navegação/scroll do app:
//   - selecionar a MESMA aba é sempre no-op absoluto (não navega, não rola);
//   - somente `source: "user"` pode rolar, e apenas em troca REAL de aba;
//   - `source: "internal"` NUNCA rola.
export type TabTransitionOptions = {
  source: "user" | "internal";
  scrollToTop?: boolean;
};

export type TabTransitionResult<T extends string> = {
  nextTab: T;
  /** Houve troca real de aba (equivalente a `shouldNavigate`). */
  changed: boolean;
  /** Alias explícito de `changed` para leitura semântica. */
  shouldNavigate: boolean;
  shouldScroll: boolean;
};

export function resolveTabTransition<T extends string>(
  currentTab: T,
  nextTab: T,
  options: TabTransitionOptions = { source: "user" },
): TabTransitionResult<T> {
  if (currentTab === nextTab) {
    // Clique na aba já ativa: preserva posição, subaba, filtros e estado.
    return { nextTab: currentTab, changed: false, shouldNavigate: false, shouldScroll: false };
  }
  const shouldScroll = options.source === "user" && options.scrollToTop !== false;
  return { nextTab, changed: true, shouldNavigate: true, shouldScroll };
}
