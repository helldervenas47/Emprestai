import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Image as ImageIcon,
  Upload,
  Trash2,
  Loader2,
  Monitor,
  Tablet,
  Smartphone,
  RotateCcw,
  Type,
  Sparkles,
  Globe,
  AppWindow,
  CheckCircle2,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAppBranding,
  DEFAULT_SIZES,
  FALLBACK_LOGO,
  DEFAULT_BRAND_NAME,
  type LogoArea,
  type LogoDevice,
  type LogoSizes,
} from "@/hooks/useAppBranding";

const AREA_LABELS: Record<LogoArea, { title: string; description: string }> = {
  header: { title: "Cabeçalho / menu lateral", description: "Símbolo/Logo no topo do app e na barra lateral." },
  auth: { title: "Tela de login e cadastro", description: "Logo principal nas páginas de autenticação." },
  favicon: { title: "Favicon e Ícone PWA", description: "Ícone na aba do navegador e ao instalar o app no celular." },
  report: { title: "Relatórios e exportações", description: "Logo em PDFs, relatórios e contratos gerados." },
};

const DEVICES: { key: LogoDevice; label: string; Icon: typeof Monitor; min: number; max: number }[] = [
  { key: "desktop", label: "Desktop", Icon: Monitor, min: 16, max: 240 },
  { key: "tablet", label: "Tablet", Icon: Tablet, min: 16, max: 200 },
  { key: "mobile", label: "Mobile", Icon: Smartphone, min: 16, max: 160 },
];

export function BrandingSettings() {
  const {
    branding,
    loading,
    uploadLogo,
    uploadPwaIcon,
    removeLogo,
    removePwaIcon,
    saveSizes,
    saveBrandName,
  } = useAppBranding();

  const headerFileRef = useRef<HTMLInputElement>(null);
  const pwaFileRef = useRef<HTMLInputElement>(null);

  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [uploadingPwa, setUploadingPwa] = useState(false);
  const [removingHeader, setRemovingHeader] = useState(false);
  const [removingPwa, setRemovingPwa] = useState(false);
  const [savingSizes, setSavingSizes] = useState(false);
  const [savingName, setSavingName] = useState(false);

  const [draftSizes, setDraftSizes] = useState<LogoSizes>(branding.sizes);
  const [draftName, setDraftName] = useState<string>(branding.brand_name);

  useEffect(() => {
    setDraftSizes(branding.sizes);
  }, [branding.sizes]);

  useEffect(() => {
    setDraftName(branding.brand_name);
  }, [branding.brand_name]);

  // Upload do Símbolo do Menu (apenas o "E" sem fundo/borda)
  const handleHeaderFile = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem válido (PNG, SVG ou WEBP).");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("O arquivo deve ter no máximo 4MB.");
      return;
    }
    setUploadingHeader(true);
    try {
      await uploadLogo(file);
      toast.success("Símbolo do cabeçalho/menu atualizado com sucesso!");
    } catch (e: any) {
      toast.error("Falha no upload: " + (e?.message || "erro desconhecido"));
    } finally {
      setUploadingHeader(false);
      if (headerFileRef.current) headerFileRef.current.value = "";
    }
  };

  // Upload do Ícone PWA / Favicon (ícone completo com fundo azul)
  const handlePwaFile = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem válido (PNG, JPG ou WEBP).");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("O arquivo deve ter no máximo 4MB.");
      return;
    }
    setUploadingPwa(true);
    try {
      await uploadPwaIcon(file);
      toast.success("Ícone do PWA e Favicon atualizado com sucesso!");
    } catch (e: any) {
      toast.error("Falha no upload: " + (e?.message || "erro desconhecido"));
    } finally {
      setUploadingPwa(false);
      if (pwaFileRef.current) pwaFileRef.current.value = "";
    }
  };

  const handleRemoveHeader = async () => {
    setRemovingHeader(true);
    try {
      await removeLogo();
      toast.success("Logo do cabeçalho restaurada para o padrão.");
    } catch (e: any) {
      toast.error("Falha ao remover: " + (e?.message || "erro desconhecido"));
    } finally {
      setRemovingHeader(false);
    }
  };

  const handleRemovePwa = async () => {
    setRemovingPwa(true);
    try {
      await removePwaIcon();
      toast.success("Ícone PWA restaurado para o padrão.");
    } catch (e: any) {
      toast.error("Falha ao remover: " + (e?.message || "erro desconhecido"));
    } finally {
      setRemovingPwa(false);
    }
  };

  const handleSaveSizes = async () => {
    setSavingSizes(true);
    try {
      await saveSizes(draftSizes);
      toast.success("Tamanhos e proporções salvos com sucesso.");
    } catch (e: any) {
      toast.error("Falha ao salvar: " + (e?.message || "erro desconhecido"));
    } finally {
      setSavingSizes(false);
    }
  };

  const handleResetSizes = () => {
    setDraftSizes(DEFAULT_SIZES);
  };

  const updateSize = (area: LogoArea, device: LogoDevice, value: number) => {
    setDraftSizes((prev) => ({
      ...prev,
      [area]: { ...prev[area], [device]: value },
    }));
  };

  const dirty = JSON.stringify(draftSizes) !== JSON.stringify(branding.sizes);
  const nameDirty = (draftName || "").trim() !== branding.brand_name;

  const headerLogoSrc = branding.logo_url || FALLBACK_LOGO;
  const pwaIconSrc = branding.pwa_icon_url || branding.logo_url || FALLBACK_LOGO;
  const currentBrandName = draftName || DEFAULT_BRAND_NAME;

  const handleSaveName = async () => {
    setSavingName(true);
    try {
      await saveBrandName(draftName);
      toast.success("Nome do aplicativo e marca salvo com sucesso.");
    } catch (e: any) {
      toast.error("Falha ao salvar: " + (e?.message || "erro desconhecido"));
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Grade de Uploads: 1. Menu/Cabeçalho e 2. PWA/Favicon */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Upload 1: Símbolo do Cabeçalho & Menu (Sem fundo, apenas o E) */}
        <div className="flex flex-col justify-between p-4 rounded-xl border border-border bg-card/60 space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <AppWindow className="h-3.5 w-3.5 text-primary" /> 1. Menu Lateral & Favicon (Navegador)
              </span>
              <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                Apenas o "E" (Sem fundo)
              </Badge>
            </div>

            <div className="flex items-center gap-3.5 p-3 rounded-lg bg-muted/40 border border-border/50">
              <div className="relative h-14 w-14 rounded-xl bg-background/80 border border-border/60 flex items-center justify-center overflow-hidden shrink-0 shadow-xs p-1">
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <img src={headerLogoSrc} alt="Símbolo Cabeçalho" className="max-h-full max-w-full object-contain" />
                )}
              </div>
              <div className="min-w-0 space-y-0.5">
                <p className="text-xs font-semibold text-foreground">Menu Lateral, Cabeçalho e Aba do Navegador</p>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {branding.logo_url ? "Símbolo personalizado ativo" : "Usando símbolo padrão do sistema"}
                </p>
                <p className="text-[10px] text-primary/80">Recomendado: PNG com fundo transparente</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1 border-t border-border/40">
            <Button
              size="sm"
              variant="default"
              onClick={() => headerFileRef.current?.click()}
              disabled={uploadingHeader}
              className="h-8 text-xs gap-1.5 flex-1"
            >
              {uploadingHeader ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando…</>
              ) : (
                <><Upload className="h-3.5 w-3.5" /> Enviar apenas o "E"</>
              )}
            </Button>
            {branding.logo_url && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleRemoveHeader}
                disabled={removingHeader}
                className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                {removingHeader ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            )}
            <input
              ref={headerFileRef}
              type="file"
              accept="image/png,image/svg+xml,image/webp"
              className="hidden"
              onChange={(e) => handleHeaderFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        {/* Upload 2: Ícone do PWA & Favicon (Com fundo azul completo) */}
        <div className="flex flex-col justify-between p-4 rounded-xl border border-border bg-card/60 space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Smartphone className="h-3.5 w-3.5 text-primary" /> 2. Ícone do PWA & Favicon
              </span>
              <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                Ícone App Celular
              </Badge>
            </div>

            <div className="flex items-center gap-3.5 p-3 rounded-lg bg-muted/40 border border-border/50">
              <div className="relative h-14 w-14 rounded-2xl bg-black/5 dark:bg-white/5 border border-border/60 flex items-center justify-center overflow-hidden shrink-0 shadow-md">
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <img src={pwaIconSrc} alt="Ícone PWA" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="min-w-0 space-y-0.5">
                <p className="text-xs font-semibold text-foreground">Tela Inicial & Aba do Navegador</p>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {branding.pwa_icon_url
                    ? "Ícone PWA independente ativo"
                    : branding.logo_url
                    ? "Utilizando a logo geral como ícone"
                    : "Usando ícone padrão do sistema"}
                </p>
                <p className="text-[10px] text-primary/80">Recomendado: Imagem quadrada (512×512 px) com fundo</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1 border-t border-border/40">
            <Button
              size="sm"
              variant="default"
              onClick={() => pwaFileRef.current?.click()}
              disabled={uploadingPwa}
              className="h-8 text-xs gap-1.5 flex-1"
            >
              {uploadingPwa ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando…</>
              ) : (
                <><Upload className="h-3.5 w-3.5" /> Enviar ícone PWA</>
              )}
            </Button>
            {branding.pwa_icon_url && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleRemovePwa}
                disabled={removingPwa}
                className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                {removingPwa ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            )}
            <input
              ref={pwaFileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => handlePwaFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
      </div>

      {/* Pré-visualizações ao Vivo (Mockups) */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Pré-visualização ao vivo da marca e ícones
        </Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Mockup 1: Menu / Cabeçalho Lateral (Símbolo transparente sem borda) */}
          <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <AppWindow className="h-3.5 w-3.5 text-primary" /> Menu Lateral / Cabeçalho
            </div>
            <div className="flex flex-col justify-center p-3 bg-muted/50 rounded-lg border border-border/40 min-h-[110px]">
              <div className="bg-background rounded-lg border border-border/80 p-2.5 flex items-center gap-2.5 shadow-xs">
                <div className="h-8 w-8 flex items-center justify-center overflow-hidden shrink-0">
                  <img src={headerLogoSrc} alt="Header Logo" className="max-h-full max-w-full object-contain" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-foreground block truncate">
                    {currentBrandName}
                  </span>
                  <span className="text-[9px] text-muted-foreground block tracking-wider uppercase">
                    CONTROLE DE EMPRÉSTIMOS
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Mockup 2: Tela Inicial do Celular (Ícone PWA com fundo) */}
          <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Smartphone className="h-3.5 w-3.5 text-primary" /> Ícone no Celular (PWA)
            </div>
            <div className="flex flex-col items-center justify-center p-3 bg-muted/50 rounded-lg border border-border/40 min-h-[110px]">
              <div className="h-14 w-14 rounded-2xl bg-black/5 dark:bg-white/5 border border-border/60 shadow-md flex items-center justify-center overflow-hidden transition-transform hover:scale-105">
                <img src={pwaIconSrc} alt="Ícone PWA" className="w-full h-full object-cover" />
              </div>
              <span className="text-[11px] font-semibold text-foreground mt-2 truncate max-w-[120px] text-center">
                {currentBrandName}
              </span>
            </div>
          </div>

          {/* Mockup 3: Aba do Navegador (Favicon) */}
          <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Globe className="h-3.5 w-3.5 text-primary" /> Aba do Navegador (Favicon)
            </div>
            <div className="flex flex-col justify-center p-3 bg-muted/50 rounded-lg border border-border/40 min-h-[110px]">
              <div className="bg-background rounded-t-lg border border-border/80 p-2 flex items-center gap-2 shadow-xs">
                <div className="h-4 w-4 rounded-sm flex items-center justify-center overflow-hidden shrink-0">
                  <img src={headerLogoSrc} alt="Favicon" className="max-h-full max-w-full object-contain" />
                </div>
                <span className="text-xs font-medium text-foreground truncate flex-1">
                  {currentBrandName} — Sistema
                </span>
                <span className="text-[10px] text-muted-foreground">×</span>
              </div>
              <div className="bg-background/40 h-6 rounded-b-lg border-x border-b border-border/60" />
            </div>
          </div>
        </div>
      </div>

      {/* Nome da marca */}
      <div className="space-y-2 p-4 rounded-xl border border-border bg-card/60">
        <Label htmlFor="brand-name" className="flex items-center gap-2 text-sm font-semibold">
          <Type className="h-4 w-4 text-primary" /> Nome do aplicativo e da marca
        </Label>
        <p className="text-xs text-muted-foreground">
          Texto exibido no título da aba, nome do app instalado (PWA), cabeçalho e telas de login.
        </p>
        <div className="flex gap-2 pt-1">
          <Input
            id="brand-name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder={DEFAULT_BRAND_NAME}
            maxLength={40}
            className="flex-1 h-9 text-xs"
          />
          <Button size="sm" onClick={handleSaveName} disabled={!nameDirty || savingName} className="h-9 text-xs">
            {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Salvar nome"}
          </Button>
        </div>
      </div>

      {/* Opções avançadas: tamanhos por área × dispositivo */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <ImageIcon className="h-4 w-4 text-primary" /> Opções avançadas de exibição — tamanhos (px)
            </h4>
            <p className="text-xs text-muted-foreground">
              Ajuste as dimensões de exibição da logo em cada dispositivo e área do sistema.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={handleResetSizes} className="h-8 text-xs text-muted-foreground">
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Padrões
          </Button>
        </div>

        <Accordion type="multiple" className="w-full space-y-2">
          {(Object.keys(AREA_LABELS) as LogoArea[]).map((area) => (
            <AccordionItem value={area} key={area} className="border border-border/80 rounded-xl px-3 bg-card/40">
              <AccordionTrigger className="text-xs font-semibold py-3 hover:no-underline">
                <div className="text-left space-y-0.5">
                  <div className="text-foreground">{AREA_LABELS[area].title}</div>
                  <div className="text-[11px] text-muted-foreground font-normal">
                    {AREA_LABELS[area].description}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-4">
                <div className="space-y-5">
                  {DEVICES.map(({ key, label, Icon, min, max }) => {
                    const value = draftSizes[area]?.[key] ?? DEFAULT_SIZES[area][key];
                    const previewImage = area === "favicon" ? pwaIconSrc : headerLogoSrc;

                    return (
                      <div key={key} className="space-y-2 bg-muted/30 p-3 rounded-lg border border-border/40">
                        <div className="flex items-center justify-between gap-4">
                          <Label className="flex items-center gap-2 text-xs font-medium text-foreground">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {label}
                          </Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              value={value}
                              min={min}
                              max={max}
                              onChange={(e) => {
                                const n = Number(e.target.value);
                                if (!Number.isFinite(n)) return;
                                updateSize(area, key, Math.max(min, Math.min(max, Math.round(n))));
                              }}
                              className="w-20 h-8 text-xs text-right"
                            />
                            <span className="text-xs text-muted-foreground w-6">px</span>
                          </div>
                        </div>
                        <Slider
                          value={[value]}
                          min={min}
                          max={max}
                          step={1}
                          onValueChange={(v) => updateSize(area, key, v[0])}
                        />
                        <div className="flex items-center gap-3 pt-1">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Prévia:</span>
                          <div className="flex items-center justify-center bg-background rounded-md border border-border p-1.5">
                            <img
                              src={previewImage}
                              alt="Prévia"
                              style={{ width: `${value}px`, height: `${value}px` }}
                              className="object-contain"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="flex justify-end pt-2">
          <Button size="sm" onClick={handleSaveSizes} disabled={!dirty || savingSizes} className="h-9 text-xs">
            {savingSizes ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Salvando…</> : "Salvar tamanhos"}
          </Button>
        </div>
      </div>
    </div>
  );
}
