// Camada central e tipada para os eventos globais de UI do app (Fase 3).
//
// Objetivo: parar de espalhar `window.dispatchEvent(new CustomEvent(...))`
// por dezenas de arquivos. Os nomes de evento continuam os mesmos, então
// listeners antigos permanecem funcionando (compatibilidade temporária),
// mas emissores e assinantes novos devem usar `emitAppUIEvent` /
// `onAppUIEvent`, que são tipados.

export type NavigationSource = "user" | "internal";

export type AppUIEvent =
  | { type: "NAVIGATE"; tab: string; subTab?: string; scrollTo?: string; source?: NavigationSource }
  | { type: "OPEN_INCOME_FORM" }
  | { type: "OPEN_LEDGER" }
  | { type: "PRODUCTS_SUBTAB_CHANGE"; subTab: string }
  | { type: "OPEN_VEHICLE_HISTORY"; vehicleId?: string }
  | { type: "OPEN_STOCK_ADJUST" }
  | { type: "METAS_RELOAD" }
  | { type: "ONBOARDING_STARTED" }
  | { type: "SETUP_COMPLETED" }
  | { type: "FIRST_CLIENT_CREATED"; clientId?: string }
  | { type: "FIRST_LOAN_CREATED"; loanId?: string }
  | { type: "ONBOARDING_COMPLETED" }
  | { type: "ONBOARDING_SKIPPED" };

type EventName = AppUIEvent["type"];

/** Nome DOM legado de cada evento — mantido para compatibilidade. */
export const APP_UI_EVENT_NAMES: Record<EventName, string> = {
  NAVIGATE: "app:navigate",
  OPEN_INCOME_FORM: "open-income-form",
  OPEN_LEDGER: "open-ledger",
  PRODUCTS_SUBTAB_CHANGE: "products-subtab-change",
  OPEN_VEHICLE_HISTORY: "open-vehicle-history",
  OPEN_STOCK_ADJUST: "open-stock-adjust",
  METAS_RELOAD: "metas:reload",
  ONBOARDING_STARTED: "app:onboarding-started",
  SETUP_COMPLETED: "app:setup-completed",
  FIRST_CLIENT_CREATED: "app:first-client-created",
  FIRST_LOAN_CREATED: "app:first-loan-created",
  ONBOARDING_COMPLETED: "app:onboarding-completed",
  ONBOARDING_SKIPPED: "app:onboarding-skipped",
};

type Payload<T extends EventName> = Extract<AppUIEvent, { type: T }>;

function detailFor(event: AppUIEvent): unknown {
  switch (event.type) {
    case "NAVIGATE": {
      const { tab, subTab, scrollTo, source } = event;
      return { tab, subTab, scrollTo, source: source ?? "user" };
    }
    case "PRODUCTS_SUBTAB_CHANGE":
      // Listener legado espera a string crua no detail.
      return event.subTab;
    case "OPEN_VEHICLE_HISTORY":
      return event.vehicleId ? { vehicleId: event.vehicleId } : undefined;
    case "FIRST_CLIENT_CREATED":
      return event.clientId ? { clientId: event.clientId } : undefined;
    case "FIRST_LOAN_CREATED":
      return event.loanId ? { loanId: event.loanId } : undefined;
    default:
      return undefined;
  }
}

export function emitAppUIEvent(event: AppUIEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(APP_UI_EVENT_NAMES[event.type], { detail: detailFor(event) }));
}

/** Assina um evento de UI já tipado. Retorna a função de cleanup. */
export function onAppUIEvent<T extends EventName>(
  type: T,
  handler: (event: Payload<T>) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const listener = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    switch (type) {
      case "PRODUCTS_SUBTAB_CHANGE":
        handler({ type, subTab: typeof detail === "string" ? detail : "" } as Payload<T>);
        return;
      case "NAVIGATE": {
        const d = (detail ?? {}) as Record<string, unknown>;
        handler({
          type,
          tab: typeof d.tab === "string" ? d.tab : "",
          subTab: typeof d.subTab === "string" ? d.subTab : undefined,
          scrollTo: typeof d.scrollTo === "string" ? d.scrollTo : undefined,
          source: d.source === "internal" ? "internal" : "user",
        } as Payload<T>);
        return;
      }
      case "OPEN_VEHICLE_HISTORY": {
        const d = (detail ?? {}) as Record<string, unknown>;
        handler({ type, vehicleId: typeof d.vehicleId === "string" ? d.vehicleId : undefined } as Payload<T>);
        return;
      }
      case "FIRST_CLIENT_CREATED": {
        const d = (detail ?? {}) as Record<string, unknown>;
        handler({ type, clientId: typeof d.clientId === "string" ? d.clientId : undefined } as Payload<T>);
        return;
      }
      case "FIRST_LOAN_CREATED": {
        const d = (detail ?? {}) as Record<string, unknown>;
        handler({ type, loanId: typeof d.loanId === "string" ? d.loanId : undefined } as Payload<T>);
        return;
      }
      default:
        handler({ type } as Payload<T>);
    }
  };

  window.addEventListener(APP_UI_EVENT_NAMES[type], listener as EventListener);
  return () => window.removeEventListener(APP_UI_EVENT_NAMES[type], listener as EventListener);
}
