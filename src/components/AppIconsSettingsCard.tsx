import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sparkles,
  Check,
  RotateCcw,
  Search,
  Sliders,
  Layers,
  Palette,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import {
  useAppIcons,
  ICON_REGISTRY,
  ICON_CATALOG,
  ICON_PRESETS,
  APP_TAB_INFO,
  type AppTabId,
  type IconPreset,
} from "@/hooks/useAppIcons";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function AppIconsSettingsCard({ embedded = false }: { embedded?: boolean } = {}) {
  const {
    customIcons,
    getTabIconName,
    getTabIcon,
    setIconForTab,
    applyPreset,
    resetToDefaults,
    activePresetId,
    presets,
    catalog,
    tabs,
  } = useAppIcons();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");
  const [activeTabPicker, setActiveTabPicker] = useState<AppTabId | null>(null);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    catalog.forEach((item) => cats.add(item.category));
    return ["Todos", ...Array.from(cats)];
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return catalog.filter((item) => {
      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.label.toLowerCase().includes(query);
      const matchesCategory =
        selectedCategory === "Todos" || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [catalog, searchQuery, selectedCategory]);

  const handleSelectIcon = (tabId: AppTabId, iconName: string, tabLabel: string) => {
    setIconForTab(tabId, iconName);
    setActiveTabPicker(null);
    setSearchQuery("");
    toast.success(`Ícone de "${tabLabel}" atualizado para ${iconName}!`);
  };

  const handleApplyPreset = (preset: IconPreset) => {
    applyPreset(preset.id);
    toast.success(`Estilo "${preset.name}" aplicado a todos os módulos!`);
  };

  const handleReset = () => {
    resetToDefaults();
    toast.info("Ícones restaurados para o padrão original do sistema.");
  };

  const content = (
    <div className="space-y-6">
      {/* Botão de reset se for embedded */}
      {embedded && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-foreground h-8"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restaurar padrões
          </Button>
        </div>
      )}

      {/* Seção 1: Pacotes de Ícones Prontos (Presets) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Estilos prontos (1-clique)
            </Label>
            {activePresetId !== "custom" && (
              <Badge variant="secondary" className="text-[10px] font-medium text-primary bg-primary/10">
                Pacote ativo
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {presets.map((preset) => {
              const isActive = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className={cn(
                    "group relative flex flex-col justify-between p-3.5 rounded-xl border text-left transition-all",
                    "hover:shadow-md hover:-translate-y-0.5",
                    isActive
                      ? "border-primary ring-2 ring-primary/40 bg-primary/5 shadow-xs"
                      : "border-border bg-card/60 hover:border-primary/40"
                  )}
                >
                  <div className="space-y-1.5 w-full">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-foreground truncate">
                        {preset.name}
                      </span>
                      {isActive && (
                        <div className="h-4 w-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-xs">
                          <Check className="h-2.5 w-2.5" />
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                      {preset.description}
                    </p>
                  </div>

                  {/* Mini previews dos ícones do preset */}
                  <div className="flex items-center gap-1.5 pt-3 mt-2 border-t border-border/40">
                    {preset.previewIcons.map((iconName, idx) => {
                      const IconComponent = ICON_REGISTRY[iconName] || Sparkles;
                      return (
                        <div
                          key={idx}
                          className={cn(
                            "h-6 w-6 rounded-md flex items-center justify-center shrink-0 transition-colors",
                            isActive
                              ? "bg-primary/15 text-primary"
                              : "bg-muted/70 text-muted-foreground group-hover:text-foreground"
                          )}
                        >
                          <IconComponent className="h-3.5 w-3.5" />
                        </div>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Seção 2: Personalização Individual por Módulo */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Personalização individual por módulo
            </Label>
            <span className="text-[11px] text-muted-foreground">
              {tabs.length} módulos disponíveis
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {tabs.map((tab) => {
              const currentIconName = getTabIconName(tab.id);
              const CurrentIcon = getTabIcon(tab.id);
              const isOpen = activeTabPicker === tab.id;

              return (
                <Popover
                  key={tab.id}
                  open={isOpen}
                  onOpenChange={(open) => {
                    setActiveTabPicker(open ? tab.id : null);
                    if (!open) setSearchQuery("");
                  }}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "group flex items-center justify-between p-3 rounded-xl border border-border/80 bg-card/40 transition-all text-left",
                        "hover:border-primary/50 hover:bg-accent/40 hover:shadow-xs",
                        isOpen && "ring-2 ring-primary/40 border-primary bg-primary/5"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 shadow-xs group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                          <CurrentIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-xs font-semibold text-foreground truncate">
                            {tab.label}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1.5">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/60" />
                            {currentIconName}
                          </p>
                        </div>
                      </div>

                      <div className="text-[11px] font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0 pl-1">
                        <span>Trocar</span>
                        <ChevronRight className="h-3 w-3" />
                      </div>
                    </button>
                  </PopoverTrigger>

                  <PopoverContent
                    className="w-80 sm:w-96 p-3 shadow-xl rounded-2xl border-border bg-popover"
                    align="start"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b pb-2">
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-foreground">
                            Ícone para "{tab.label}"
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Atual: <span className="font-semibold text-primary">{currentIconName}</span>
                          </p>
                        </div>
                        <div className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                          <CurrentIcon className="h-4 w-4" />
                        </div>
                      </div>

                      {/* Busca rápida */}
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Buscar ícone (ex: Moeda, Carteira, Gráfico)..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="h-8 pl-8 text-xs rounded-lg"
                          autoFocus
                        />
                      </div>

                      {/* Filtro por Categorias */}
                      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
                        {categories.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setSelectedCategory(cat)}
                            className={cn(
                              "px-2 py-0.5 rounded-md text-[10px] font-medium whitespace-nowrap transition-colors",
                              selectedCategory === cat
                                ? "bg-primary text-primary-foreground shadow-xs"
                                : "bg-muted/70 text-muted-foreground hover:text-foreground hover:bg-muted"
                            )}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>

                      {/* Grade de Ícones Selecionáveis */}
                      <div className="max-h-56 overflow-y-auto pr-1 grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                        {filteredCatalog.map((item) => {
                          const IconComp = item.icon;
                          const isSelected = item.name === currentIconName;

                          return (
                            <button
                              key={item.name}
                              type="button"
                              onClick={() => handleSelectIcon(tab.id, item.name, tab.label)}
                              title={`${item.label} (${item.name})`}
                              className={cn(
                                "group relative flex flex-col items-center justify-center p-2 rounded-lg border transition-all aspect-square",
                                isSelected
                                  ? "border-primary bg-primary text-primary-foreground shadow-xs"
                                  : "border-border/60 bg-card hover:border-primary/50 hover:bg-accent/50 text-foreground"
                              )}
                            >
                              <IconComp className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110" />
                              <span className="text-[9px] truncate w-full text-center mt-1 opacity-70 leading-tight">
                                {item.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {filteredCatalog.length === 0 && (
                        <div className="py-6 text-center text-xs text-muted-foreground">
                          Nenhum ícone encontrado com esse termo.
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              );
            })}
          </div>
        </div>
      </div>
    );

  if (embedded) {
    return content;
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Layers className="h-4 w-4 text-primary" /> Ícones do aplicativo
          </CardTitle>
          <CardDescription>
            Personalize os ícones de navegação e módulos do sistema. Escolha um pacote pronto
            com um clique ou defina ícones personalizados para cada aba.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          className="shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restaurar padrões
        </Button>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
