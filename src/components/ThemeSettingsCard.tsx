import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Palette, Check, Sun, Moon, MonitorSmartphone, RotateCcw } from "lucide-react";
import { APP_THEMES, useAppTheme, type AppMode } from "@/hooks/useAppTheme";
import { cn } from "@/lib/utils";

/** Converte HEX → "H S% L%" para colocar em --primary/--accent */
function hexToHslString(hex: string): string {
  const m = hex.replace("#", "");
  const bigint = parseInt(m.length === 3 ? m.split("").map(c => c + c).join("") : m, 16);
  const r = ((bigint >> 16) & 255) / 255;
  const g = ((bigint >> 8) & 255) / 255;
  const b = (bigint & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function hslStringToHex(hsl: string | null, fallback = "#4f46e5"): string {
  if (!hsl) return fallback;
  const m = hsl.match(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
  if (!m) return fallback;
  const h = parseFloat(m[1]) / 360, s = parseFloat(m[2]) / 100, l = parseFloat(m[3]) / 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function ThemeSettingsCard() {
  const { theme, mode, primary, secondary, setTheme, setMode, setPrimary, setSecondary, resetCustom } = useAppTheme();

  const primaryHex = useMemo(() => hslStringToHex(primary, "#4f46e5"), [primary]);
  const secondaryHex = useMemo(() => hslStringToHex(secondary, "#22d3ee"), [secondary]);

  const modes: { id: AppMode; label: string; icon: React.ReactNode }[] = [
    { id: "auto", label: "Automático", icon: <MonitorSmartphone className="h-3.5 w-3.5" /> },
    { id: "light", label: "Claro", icon: <Sun className="h-3.5 w-3.5" /> },
    { id: "dark", label: "Escuro", icon: <Moon className="h-3.5 w-3.5" /> },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Palette className="h-4 w-4 text-primary" /> Personalização visual
        </CardTitle>
        <CardDescription>
          Escolha um tema para o aplicativo. Pré-visualização instantânea, alternância sem reiniciar
          e salvamento automático das suas preferências.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Modo claro/escuro/auto */}
        <div className="space-y-2">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Modo de aparência
          </Label>
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
            {modes.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  mode === m.id
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Temas com aparência fixa (ex.: Cyberpunk) ignoram o modo selecionado.
          </p>
        </div>

        {/* Grade de temas */}
        <div className="space-y-2">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Tema
          </Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {APP_THEMES.map(t => {
              const selected = t.id === theme;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  className={cn(
                    "group relative text-left rounded-xl border p-3 transition-all overflow-hidden",
                    "hover:shadow-md hover:-translate-y-0.5",
                    selected
                      ? "border-primary ring-2 ring-primary/40 shadow-md"
                      : "border-border bg-card/60"
                  )}
                >
                  {/* preview swatch */}
                  <div
                    className="h-16 w-full rounded-lg mb-3 relative overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${t.swatch[0]} 0%, ${t.swatch[1]} 50%, ${t.swatch[2]} 100%)`,
                    }}
                  >
                    <div className="absolute inset-0 flex items-end p-2 gap-1">
                      {t.swatch.map((c, i) => (
                        <span
                          key={i}
                          className="h-3 w-3 rounded-full ring-1 ring-white/40 shadow-sm"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    {selected && (
                      <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{t.name}</p>
                    {t.id === "padrao" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                        Padrão
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {t.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Cores customizadas */}
        <div className="space-y-3 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Cores personalizadas
            </Label>
            {(primary || secondary) && (
              <Button variant="ghost" size="sm" onClick={resetCustom} className="h-7 text-xs gap-1">
                <RotateCcw className="h-3 w-3" /> Restaurar
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-card/50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Cor principal</p>
                <p className="text-xs text-muted-foreground truncate">
                  {primary ? `hsl(${primary})` : "Padrão do tema"}
                </p>
              </div>
              <input
                type="color"
                value={primaryHex}
                onChange={(e) => setPrimary(hexToHslString(e.target.value))}
                className="h-10 w-12 rounded cursor-pointer border border-border bg-transparent"
                aria-label="Escolher cor principal"
              />
            </div>
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-card/50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Cor secundária</p>
                <p className="text-xs text-muted-foreground truncate">
                  {secondary ? `hsl(${secondary})` : "Padrão do tema"}
                </p>
              </div>
              <input
                type="color"
                value={secondaryHex}
                onChange={(e) => setSecondary(hexToHslString(e.target.value))}
                className="h-10 w-12 rounded cursor-pointer border border-border bg-transparent"
                aria-label="Escolher cor secundária"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            As cores se aplicam a botões, links, gráficos e destaques em toda a interface.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
