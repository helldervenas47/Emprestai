import React, { useState, useEffect } from "react";
import { Monitor, Smartphone, Tablet, ChevronDown, ChevronUp, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DeviceMode = "desktop" | "mobile" | "mobile-max" | "tablet";

interface DeviceConfig {
  id: DeviceMode;
  label: string;
  width: string;
  icon: React.ElementType;
}

const DEVICES: DeviceConfig[] = [
  { id: "desktop", label: "PC / Desktop", width: "100%", icon: Monitor },
  { id: "tablet", label: "Tablet (768px)", width: "768px", icon: Tablet },
  { id: "mobile-max", label: "Mobile Max (430px)", width: "430px", icon: Smartphone },
  { id: "mobile", label: "Mobile (390px)", width: "390px", icon: Smartphone },
];

export function DevicePreviewWrapper({ children }: { children: React.ReactNode }) {
  const [device, setDevice] = useState<DeviceMode>(() => {
    return (localStorage.getItem("emprestai_preview_device") as DeviceMode) || "desktop";
  });
  const [minimized, setMinimized] = useState<boolean>(() => {
    return localStorage.getItem("emprestai_preview_device_minimized") === "true";
  });

  useEffect(() => {
    localStorage.setItem("emprestai_preview_device", device);
  }, [device]);

  useEffect(() => {
    localStorage.setItem("emprestai_preview_device_minimized", String(minimized));
  }, [minimized]);

  const activeDevice = DEVICES.find((d) => d.id === device) || DEVICES[0];

  return (
    <div className="min-h-screen w-full bg-background relative flex flex-col items-center">
      {/* Barra de controle de visualização de dispositivo */}
      <div className="fixed top-2 right-4 z-[9999] flex items-center gap-1.5 p-1 bg-background/90 backdrop-blur-md border border-border/80 rounded-full shadow-2xl transition-all duration-200">
        {!minimized ? (
          <>
            <span className="text-[11px] font-medium text-muted-foreground px-2 hidden sm:inline-block">
              Visualização:
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
                    onClick={() => setDevice(d.id)}
                    title={d.label}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">{d.label.split(" ")[0]}</span>
                  </Button>
                );
              })}
            </div>
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

      {/* Container responsivo do App */}
      {device === "desktop" ? (
        <div className="w-full min-h-screen flex-1">{children}</div>
      ) : (
        <div className="w-full min-h-screen bg-muted/30 py-4 px-2 sm:px-4 flex justify-center items-start overflow-x-auto">
          <div
            style={{ width: activeDevice.width, maxWidth: "100%" }}
            className="bg-background border border-border shadow-2xl rounded-3xl overflow-hidden min-h-[844px] max-h-[92vh] flex flex-col relative transition-all duration-300 ring-1 ring-black/5 dark:ring-white/10"
          >
            {/* Notch / Speaker visual de smartphone */}
            <div className="w-full bg-background border-b border-border/40 py-1 flex justify-center items-center select-none shrink-0">
              <div className="w-16 h-1 bg-muted-foreground/25 rounded-full" />
            </div>

            {/* Conteúdo com rolagem interna fiel ao celular */}
            <div className="flex-1 w-full overflow-y-auto overflow-x-hidden relative">
              {children}
            </div>

            {/* Barra home indicator visual de smartphone */}
            <div className="w-full bg-background border-t border-border/40 py-1.5 flex justify-center items-center select-none shrink-0">
              <div className="w-28 h-1 bg-muted-foreground/30 rounded-full" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
