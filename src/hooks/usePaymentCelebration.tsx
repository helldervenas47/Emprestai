import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Wallet, ShoppingBag, Receipt, TrendingUp, Sparkles } from "lucide-react";

type CelebrationKind = "loan" | "sale" | "expense" | "generic";

interface CelebrationOptions {
  kind?: CelebrationKind;
  message?: string;
  amount?: number;
  /** Liga/desliga som apenas para esta chamada (default: respeita preferência do usuário) */
  sound?: boolean;
  /** Liga/desliga vibração apenas para esta chamada */
  vibrate?: boolean;
}

interface CelebrationContextValue {
  celebrate: (opts?: CelebrationOptions) => void;
  /** Preferências persistidas em localStorage */
  preferences: {
    enabled: boolean;
    sound: boolean;
    vibrate: boolean;
    confetti: boolean;
  };
  setPreferences: (next: Partial<CelebrationContextValue["preferences"]>) => void;
}

const PREFS_KEY = "paymentCelebration:prefs";

const defaultPrefs = {
  enabled: true,
  sound: false, // som off por padrão (menos invasivo); usuário liga em Configurações
  vibrate: true,
  confetti: true,
};

const CelebrationContext = createContext<CelebrationContextValue | null>(null);

const KIND_META: Record<CelebrationKind, { icon: any; label: string }> = {
  loan: { icon: Wallet, label: "Pagamento registrado!" },
  sale: { icon: ShoppingBag, label: "Venda recebida!" },
  expense: { icon: Receipt, label: "Despesa quitada!" },
  generic: { icon: CheckCircle2, label: "Sucesso!" },
};

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

function playSuccessSound() {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes = [
      { freq: 660, start: 0, dur: 0.12 },
      { freq: 880, start: 0.1, dur: 0.16 },
      { freq: 1175, start: 0.22, dur: 0.22 },
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = n.freq;
      gain.gain.setValueAtTime(0.0001, now + n.start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + n.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.02);
    }
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* silencioso */
  }
}

function vibrateDevice() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([35, 40, 60]);
    }
  } catch {
    /* silencioso */
  }
}

interface ActiveCelebration extends CelebrationOptions {
  id: number;
}

export function PaymentCelebrationProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState(() => {
    if (typeof window === "undefined") return defaultPrefs;
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (!raw) return defaultPrefs;
      return { ...defaultPrefs, ...JSON.parse(raw) };
    } catch {
      return defaultPrefs;
    }
  });
  const [active, setActive] = useState<ActiveCelebration | null>(null);
  const counter = useRef(0);

  const setPreferences = useCallback((next: Partial<typeof defaultPrefs>) => {
    setPrefs((prev) => {
      const merged = { ...prev, ...next };
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
      } catch {
        /* silencioso */
      }
      return merged;
    });
  }, []);

  const celebrate = useCallback(
    (opts?: CelebrationOptions) => {
      if (!prefs.enabled) return;
      counter.current += 1;
      setActive({ id: counter.current, ...(opts || {}) });
      const useSound = opts?.sound ?? prefs.sound;
      const useVibrate = opts?.vibrate ?? prefs.vibrate;
      if (useSound) playSuccessSound();
      if (useVibrate) vibrateDevice();
    },
    [prefs.enabled, prefs.sound, prefs.vibrate],
  );

  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => setActive(null), 1700);
    return () => window.clearTimeout(t);
  }, [active]);

  const value = useMemo(
    () => ({ celebrate, preferences: prefs, setPreferences }),
    [celebrate, prefs, setPreferences],
  );

  return (
    <CelebrationContext.Provider value={value}>
      {children}
      <CelebrationOverlay active={active} confetti={prefs.confetti} />
    </CelebrationContext.Provider>
  );
}

export function usePaymentCelebration() {
  const ctx = useContext(CelebrationContext);
  if (!ctx) {
    // Fallback no-op para que componentes não quebrem se renderizados fora do provider
    return {
      celebrate: () => {},
      preferences: defaultPrefs,
      setPreferences: () => {},
    } as CelebrationContextValue;
  }
  return ctx;
}

function CelebrationOverlay({ active, confetti }: { active: ActiveCelebration | null; confetti: boolean }) {
  if (!active) return null;
  const meta = KIND_META[active.kind || "generic"];
  const Icon = meta.icon;
  const message = active.message || meta.label;

  return (
    <div
      key={active.id}
      className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
      aria-live="polite"
      role="status"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />

      {/* Conteúdo */}
      <div className="relative flex flex-col items-center gap-3 animate-scale-in px-6 text-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-success/30 blur-2xl scale-150 animate-pulse" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-success/10 border-2 border-success/40 shadow-[0_10px_40px_-10px_hsl(var(--success)/0.6)]">
            <Icon className="h-12 w-12 text-success" strokeWidth={1.8} />
          </div>
        </div>

        <p className="text-lg font-semibold text-foreground drop-shadow-sm">{message}</p>

        {typeof active.amount === "number" && active.amount > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-success/10 border border-success/30 px-3 py-1">
            <TrendingUp className="h-3.5 w-3.5 text-success" />
            <span className="text-sm font-bold text-success tabular-nums">{formatBRL(active.amount)}</span>
          </div>
        )}

        {/* Partículas */}
        <div className="absolute inset-0 overflow-visible pointer-events-none">
          {[...Array(confetti ? 14 : 6)].map((_, i) => {
            const angle = (i * 360) / (confetti ? 14 : 6);
            return (
              <span
                key={i}
                className="absolute left-1/2 top-1/2 block h-2 w-2 rounded-full bg-success"
                style={{
                  animation: `success-particle 0.9s ease-out ${i * 0.04}s forwards`,
                  opacity: 0,
                  // @ts-ignore CSS var consumida pela keyframe success-particle
                  "--angle": `${angle}deg`,
                } as React.CSSProperties}
              />
            );
          })}
          {confetti && (
            <Sparkles
              className="absolute -top-6 left-1/2 -translate-x-1/2 h-6 w-6 text-warning animate-pulse"
              aria-hidden
            />
          )}
        </div>
      </div>
    </div>
  );
}
