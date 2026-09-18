import React, { useEffect, useState, useRef } from "react";
import logoIconFallback from "@/assets/logo-icon.png";
import { useAppBranding } from "@/hooks/useAppBranding";

interface SplashScreenProps {
  onStartExit?: () => void;
  onFinish?: () => void;
}

export function SplashScreen({ onStartExit, onFinish }: SplashScreenProps) {
  const { branding } = useAppBranding();
  const [phase, setPhase] = useState<"initial" | "symbol" | "name" | "settled" | "exiting" | "done">("initial");
  const hasFinishedRef = useRef(false);

  const logoSrc = branding.pwa_icon_url || branding.logo_url || logoIconFallback;
  const brandName = branding.brand_name || "EmprestAI";

  useEffect(() => {
    const isReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (isReduced) {
      setPhase("settled");
      const tExit = setTimeout(() => {
        setPhase("exiting");
        onStartExit?.();
      }, 200);
      const tDone = setTimeout(() => {
        if (!hasFinishedRef.current) {
          hasFinishedRef.current = true;
          setPhase("done");
          onFinish?.();
        }
      }, 400);
      return () => {
        clearTimeout(tExit);
        clearTimeout(tDone);
      };
    }

    // 0ms - 300ms: Fundo inicial escuro ativo
    const tSymbol = setTimeout(() => setPhase("symbol"), 300);
    // 800ms: Revelar suavemente o nome
    const tName = setTimeout(() => setPhase("name"), 800);
    // 1200ms: Conclusão da animação da logo -> início da estabilização visual (180ms)
    const tSettled = setTimeout(() => setPhase("settled"), 1200);
    // 1380ms: Fim da estabilização -> início do crossfade suave de 400ms para o Dashboard
    const tExit = setTimeout(() => {
      setPhase("exiting");
      onStartExit?.();
    }, 1380);
    // 1780ms: Término completo da transição de 400ms e desmontagem da Splash
    const tDone = setTimeout(() => {
      if (!hasFinishedRef.current) {
        hasFinishedRef.current = true;
        setPhase("done");
        onFinish?.();
      }
    }, 1780);

    return () => {
      clearTimeout(tSymbol);
      clearTimeout(tName);
      clearTimeout(tSettled);
      clearTimeout(tExit);
      clearTimeout(tDone);
    };
  }, [onStartExit, onFinish]);

  const handleContainerTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (phase === "exiting" && e.target === e.currentTarget && e.propertyName === "opacity") {
      if (!hasFinishedRef.current) {
        hasFinishedRef.current = true;
        setPhase("done");
        onFinish?.();
      }
    }
  };

  if (phase === "done") return null;

  return (
    <div
      onTransitionEnd={handleContainerTransitionEnd}
      className={`fixed inset-0 z-[999999] flex flex-col items-center justify-center overflow-hidden select-none pointer-events-none transition-opacity duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
        phase === "exiting" ? "opacity-0" : "opacity-100"
      }`}
      style={{
        background:
          "radial-gradient(circle at 15% 15%, rgba(0, 229, 255, 0.28) 0%, rgba(0, 110, 255, 0.12) 35%, transparent 65%), " +
          "radial-gradient(circle at 85% 85%, rgba(0, 82, 255, 0.42) 0%, rgba(0, 30, 120, 0.25) 45%, transparent 70%), " +
          "linear-gradient(145deg, #03143F 0%, #020C28 45%, #010617 100%)",
        willChange: phase === "exiting" ? "opacity" : "auto",
      }}
      aria-hidden="true"
    >
      {/* Ondas de luz suaves no fundo que espelham a arte da logo */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40 mix-blend-screen"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 60% 40% at 10% 20%, rgba(0, 229, 255, 0.35) 0%, transparent 70%), " +
            "radial-gradient(ellipse 70% 50% at 90% 80%, rgba(0, 102, 255, 0.5) 0%, transparent 70%)",
        }}
      />

      {/* Contêiner Central */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-4">
        {/* Símbolo / Logo Oficial */}
        <div
          className={`relative flex items-center justify-center transition-all duration-[500ms] ${
            phase === "initial"
              ? "opacity-0 scale-[0.82] translate-y-2"
              : phase === "symbol" || phase === "name"
              ? "opacity-100 scale-100 translate-y-0"
              : "opacity-100 scale-[1.012] translate-y-0"
          }`}
          style={{
            transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
            willChange: "transform, opacity",
          }}
        >
          {/* Logo Imagem com squircle e iluminação azul viva */}
          <div className="relative overflow-hidden rounded-[26px] w-24 h-24 sm:w-28 sm:h-28 shadow-[0_16px_48px_rgba(0,102,255,0.4)] ring-1 ring-cyan-300/30 bg-transparent flex items-center justify-center">
            <img
              src={logoSrc}
              alt={brandName}
              className="w-full h-full object-cover pointer-events-none"
              draggable={false}
              loading="eager"
            />

            {/* Brilho sutil atravessando as áreas coloridas do símbolo */}
            <div
              className="absolute inset-0 pointer-events-none bg-gradient-to-r from-transparent via-cyan-200/30 to-transparent"
              style={{
                transform:
                  phase === "initial"
                    ? "translateX(-150%) skewX(-20deg)"
                    : "translateX(150%) skewX(-20deg)",
                transition: "transform 750ms cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            />
          </div>
        </div>

        {/* Nome da Marca Tipográfico */}
        <div
          className={`transition-all duration-[400ms] ${
            phase === "initial" || phase === "symbol"
              ? "opacity-0 translate-y-1.5"
              : "opacity-100 translate-y-0"
          }`}
          style={{
            transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
            willChange: "transform, opacity",
          }}
        >
          <span className="text-[22px] sm:text-[24px] font-bold tracking-tight text-white drop-shadow-[0_2px_16px_rgba(0,210,255,0.45)] font-['Space_Grotesk',sans-serif]">
            {brandName}
          </span>
        </div>
      </div>
    </div>
  );
}
