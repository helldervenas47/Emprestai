import React, { useState, useEffect, useRef } from "react";
import { Monitor, Smartphone, Tablet, ChevronDown, ChevronUp, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DeviceMode = "desktop" | "mobile" | "mobile-max" | "tablet";

interface DeviceConfig {
  id: DeviceMode;
  label: string;
  width: number;
  height: number;
  icon: React.ElementType;
}

const DEVICES: DeviceConfig[] = [
  { id: "desktop", label: "PC / Desktop", width: 0, height: 0, icon: Monitor },
  { id: "tablet", label: "Tablet (768px)", width: 768, height: 1024, icon: Tablet },
  { id: "mobile-max", label: "Mobile Max (430px)", width: 430, height: 932, icon: Smartphone },
  { id: "mobile", label: "Mobile (390px)", width: 390, height: 844, icon: Smartphone },
];

export function DevicePreviewWrapper({ children }: { children: React.ReactNode }) {
  const isInsideIframe = typeof window !== "undefined" && window.self !== window.top;

  const [device, setDevice] = useState<DeviceMode>(() => {
    return (localStorage.getItem("emprestai_preview_device") as DeviceMode) || "desktop";
  });
  const [minimized, setMinimized] = useState<boolean>(() => {
    return localStorage.getItem("emprestai_preview_device_minimized") === "true";
  });
  const [scale, setScale] = useState<number>(() => {
    const saved = localStorage.getItem("emprestai_preview_device_scale");
    return saved ? Number(saved) : 0.95;
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

  useEffect(() => {
    localStorage.setItem("emprestai_preview_device_scale", String(scale));
  }, [scale]);

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
                  className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground text-xs"
                  onClick={() => setScale((prev) => Math.max(0.7, Number((prev - 0.05).toFixed(2))))}
                  title="Diminuir zoom do dispositivo"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </Button>
                <span className="text-[10px] font-mono font-medium text-muted-foreground w-8 text-center">
                  {Math.round(scale * 100)}%
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground text-xs"
                  onClick={() => setScale((prev) => Math.min(1.1, Number((prev + 0.05).toFixed(2))))}
                  title="Aumentar zoom do dispositivo"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </Button>
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

      {/* Renderização do App */}
      {device === "desktop" ? (
        <div className="w-full min-h-screen flex-1">{children}</div>
      ) : (
        <div className="w-full min-h-screen bg-neutral-950 py-4 px-2 flex flex-col justify-center items-center overflow-x-hidden">
          <div className="text-center mb-2">
            <span className="text-[11px] font-medium text-neutral-400 bg-neutral-900/90 px-3 py-0.5 rounded-full border border-neutral-800 shadow-sm">
              {activeDevice.label} • Resolução real: <strong className="text-neutral-200">{activeDevice.width}px × {activeDevice.height}px</strong>
            </span>
          </div>

          <div
            style={{
              width: `${activeDevice.width}px`,
              height: `${activeDevice.height}px`,
              transform: `scale(${scale})`,
              transformOrigin: "top center",
              marginBottom: `calc(${activeDevice.height * (scale - 1)}px + 20px)`,
            }}
            className="bg-background border-2 border-neutral-700/80 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] rounded-[32px] overflow-hidden flex flex-col relative ring-1 ring-white/10 shrink-0 transition-transform duration-150"
          >
            {/* Iframe com 100% da área visível sem sobreposições */}
            <iframe
              ref={iframeRef}
              src={iframeSrc}
              title={`Simulador ${activeDevice.label}`}
              className="w-full h-full border-none bg-background flex-1"
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
