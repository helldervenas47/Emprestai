/**
 * Polyfill global para Web Crypto API (crypto.randomUUID)
 * Necessário em contextos não-seguros (ex.: acesso por IP local HTTP no smartphone)
 * e navegadores/WebViews mais antigos onde crypto.randomUUID não está exposto nativamente.
 */
(() => {
  const polyfillRandomUUID = () => {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c: any) =>
      (
        c ^
        (((typeof crypto !== "undefined" && crypto.getRandomValues)
          ? crypto.getRandomValues(new Uint8Array(1))[0]
          : Math.floor(Math.random() * 256)) &
          (15 >> (c / 4)))
      ).toString(16)
    );
  };

  if (typeof globalThis !== "undefined") {
    if (!globalThis.crypto) {
      (globalThis as any).crypto = {};
    }
    if (!globalThis.crypto.randomUUID) {
      globalThis.crypto.randomUUID = polyfillRandomUUID as any;
    }
  }

  if (typeof window !== "undefined") {
    if (!window.crypto) {
      (window as any).crypto = {};
    }
    if (!window.crypto.randomUUID) {
      window.crypto.randomUUID = polyfillRandomUUID as any;
    }
  }
})();
