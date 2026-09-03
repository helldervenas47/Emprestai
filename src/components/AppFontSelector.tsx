import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Type, Check } from "lucide-react";
import { useAppFont } from "@/hooks/useAppFont";
import { cn } from "@/lib/utils";

/**
 * Seletor global de fonte do aplicativo. Ao selecionar, a mudança é
 * aplicada em tempo real em toda a interface (via `--app-font-sans`
 * / `--app-font-display`) e persistida em localStorage + banco.
 */
export function AppFontSelector() {
  const { font, setFont, fonts } = useAppFont();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Type className="h-4 w-4 text-primary" /> Fonte do aplicativo
        </CardTitle>
        <CardDescription>
          Escolha a tipografia usada em toda a interface. A mudança é aplicada instantaneamente
          e sincronizada em todos os seus dispositivos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Selecione a fonte
        </Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {fonts.map((f) => {
            const selected = f.id === font;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFont(f.id)}
                className={cn(
                  "group relative text-left rounded-xl border p-4 transition-all overflow-hidden",
                  "hover:shadow-md hover:-translate-y-0.5",
                  selected
                    ? "border-primary ring-2 ring-primary/40 shadow-md bg-primary/5"
                    : "border-border bg-card hover:border-primary/40",
                )}
                aria-pressed={selected}
              >
                {selected && (
                  <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                )}
                <div style={{ fontFamily: f.family }} className="space-y-2">
                  <p className="text-lg font-bold leading-tight tracking-tight text-foreground">
                    {f.label}
                  </p>
                  <p className="text-sm font-normal text-foreground/90">
                    Aa Bb Cc 0123 — Dashboard
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {f.sample}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground pt-1">
          A fonte selecionada é carregada sob demanda para preservar o desempenho e mantém compatibilidade total com o modo claro e escuro.
        </p>
      </CardContent>
    </Card>
  );
}
