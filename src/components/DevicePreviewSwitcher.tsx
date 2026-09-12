import React, { useState, useEffect, useRef } from "react";
import { Monitor, Smartphone, Tablet, ChevronDown, ChevronUp, RotateCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DeviceMode = "desktop" | "mobile" | "mobile-max" | "tablet";

interface DeviceConfig {
  id: DeviceMode;
  label: string;
  width: string;
  height: string;
  icon: React.ElementType;
}

const DEVICES: DeviceConfig[] = [
  { id: "desktop", label: "PC / Desktop", width: "100%", height: "100%", icon: Monitor },
  { id: "tablet", label: "Tablet (768px)", width: "768px", height: "1024px", icon: Tablet },
  { id: "mobile-max", label: "Mobile Max (430px)", width: "430px", height: "932px", icon: Smartphone },
  { id: "mobile", label: "Mobile (390px)", width: "390px", height: "844px", icon: Smartphone },
];

export function DevicePreviewWrapper({ children }: { children: React.ReactNode }) {
  // Se já estiver sendo executado dentro de um iframe, renderiza diretamente o conteúdo real
  const isInsideIframe = typeof window !== "undefined" && window.self !== window.top;

  const [device, setDevice] = useState<DeviceMode>(() => {
    return (localStorage.getItem("emprestai_preview_device") as DeviceMode) || "desktop";
  });
  const [minimized, setMinimized] = useState<boolean>(() => {
    return localStorage.getItem("emprestai_preview_device_minimized") === "true";
  });

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeSrc, setIframeSrc] = useState<string>(() => {
    if (typeof window === "undefined") return "/";
    return window.location.pathname + window.location.search + window.location.hash;
  });

  useEffect(() => {
    localStorage.setItem("emprestai_preview_device", device);
  }, [device]);

  useEffect(() => {
    localStorage.setItem("emprestai_preview_device_minimized", String(minimized));
  }, [minimized]);

  // Se já está no iframe, renderiza o App real sem adicionar mais wrappers
  if (isInsideIframe) {
    return <>{children}</>;
  }

  const activeDevice = DEVICES.find((d) => d.id === device) || DEVICES[0];

  const reloadIframe = () => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  return (
    <div className="min-h-screen w-full bg-background relative flex flex-col items-center">
      {/* Barra de controle de visualização de dispositivo */}
      <div className="fixed top-2 right-4 z-[9999] flex items-center gap-1.5 p-1 bg-background/95 backdrop-blur-md border border-border rounded-full shadow-2xl transition-all duration-200">
        {!minimized ? (
          <>
            <span className="text-[11px] font-semibold text-muted-foreground px-2 hidden sm:inline-block">
              Simulador Real:
            </span>
            <div className="flex items-center gap-1">
              {DEVICES.map((d) => {
                const Icon = d.icon;
                const isActive = device === d.id;
                return (
                  <Button
                    key={d.id}
                    type="button"
                    size="sm"
                    variant={isActive ? "default" : "ghost"}
                    className={`h-7 px-2.5 text-xs rounded-full gap-1.5 transition-all font-medium ${
                      isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => {
                      setDevice(d.id);
                      if (d.id !== "desktop") {
                        setIframeSrc(window.location.pathname + window.location.search + window.location.hash);
                      }
                    }}
                    title={d.label}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">{d.label.split(" ")[0]}</span>
                  </Button>
                );
              })}
            </div>

            {device !== "desktop" && (
              <>
                <div className="h-4 w-px bg-border mx-0.5" />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
                  onClick={reloadIframe}
                  title="Recarregar tela mobile"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </Button>
              </>
            )}

            <div className="h-4 w-px bg-border mx-0.5" />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => setMinimized(true)}
              title="Minimizar barra"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs rounded-full gap-1.5 bg-background shadow-md text-foreground hover:bg-muted font-medium"
            onClick={() => setMinimized(false)}
            title="Expandir seletor de visualização"
          >
            <activeDevice.icon className="w-3.5 h-3.5 text-primary" />
            <span>{activeDevice.label.split(" ")[0]}</span>
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </Button>
        )}
      </div>

      {/* Renderização real */}
      {device === "desktop" ? (
        <div className="w-full min-h-screen flex-1">{children}</div>
      ) : (
        <div className="w-full min-h-screen bg-neutral-900/90 dark:bg-black/95 py-6 px-4 flex flex-col justify-start items-center overflow-y-auto">
          <div className="text-center mb-3">
            <span className="text-xs font-medium text-neutral-300 bg-neutral-800/80 px-3 py-1 rounded-full border border-neutral-700">
              Viewport real: <strong className="text-white">{activeDevice.width} × {activeDevice.height}</strong> ({activeDevice.label})
            </span>
          </div>

          <div
            style={{ width: activeDevice.width, height: activeDevice.height, maxWidth: "100%" }}
            className="bg-background border-[10px] border-neutral-800 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] rounded-[44px] overflow-hidden flex flex-col relative ring-1 ring-white/10 shrink-0"
          >
            {/* Dynamic Island / Câmera de Smartphone */}
            <div className="w-full bg-background pt-2 pb-1.5 flex justify-center items-center select-none shrink-0 border-b border-border/10">
              <div className="w-24 h-4 bg-black rounded-full flex items-center justify-end pr-2">
                <div className="w-2.5 h-2.5 bg-neutral-800 rounded-full" />
              </div>
            </div>

            {/* Iframe com a viewport e media queries reais de mobile */}
            <iframe
              ref={iframeRef}
              src={iframeSrc}
              title={`Simulador ${activeDevice.label}`}
              className="w-full flex-1 border-none bg-background"
              style={{ width: "100%", height: "100%" }}
            />

            {/* Home Indicator do Smartphone */}
            <div className="w-full bg-background py-1.5 flex justify-center items-center select-none shrink-0 border-t border-border/10">
              <div className="w-32 h-1 bg-neutral-400/50 dark:bg-neutral-600 rounded-full" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
