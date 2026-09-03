import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Image as ImageIcon, Upload, Trash2, Loader2, Monitor, Tablet, Smartphone, RotateCcw, Type } from "lucide-react";
import { toast } from "sonner";
import { useAppBranding, DEFAULT_SIZES, FALLBACK_LOGO, DEFAULT_BRAND_NAME, type LogoArea, type LogoDevice, type LogoSizes } from "@/hooks/useAppBranding";

const AREA_LABELS: Record<LogoArea, { title: string; description: string }> = {
  header: { title: "Cabeçalho / menu lateral", description: "Logo no topo do app e na navegação." },
  auth: { title: "Tela de login e cadastro", description: "Logo nas páginas de autenticação." },
  favicon: { title: "Favicon e PWA", description: "Ícone no navegador e ao instalar o app." },
  report: { title: "Relatórios e exportações", description: "Logo em PDFs e contratos gerados." },
};

const DEVICES: { key: LogoDevice; label: string; Icon: typeof Monitor; min: number; max: number }[] = [
  { key: "desktop", label: "Desktop", Icon: Monitor, min: 16, max: 240 },
  { key: "tablet", label: "Tablet", Icon: Tablet, min: 16, max: 200 },
  { key: "mobile", label: "Mobile", Icon: Smartphone, min: 16, max: 160 },
];

export function BrandingSettings() {
  const { branding, loading, uploadLogo, removeLogo, saveSizes, saveBrandName } = useAppBranding();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
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

  const handleFile = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("A logo deve ter no máximo 4MB.");
      return;
    }
    setUploading(true);
    try {
      await uploadLogo(file);
      toast.success("Logo atualizada.");
    } catch (e: any) {
      toast.error("Falha no upload: " + (e?.message || "erro desconhecido"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await removeLogo();
      toast.success("Logo removida. Voltando ao padrão.");
    } catch (e: any) {
      toast.error("Falha ao remover: " + (e?.message || "erro desconhecido"));
    } finally {
      setRemoving(false);
    }
  };

  const handleSaveSizes = async () => {
    setSavingSizes(true);
    try {
      await saveSizes(draftSizes);
      toast.success("Tamanhos salvos.");
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
  const previewSrc = branding.logo_url || FALLBACK_LOGO;

  const handleSaveName = async () => {
    setSavingName(true);
    try {
      await saveBrandName(draftName);
      toast.success("Nome da marca salvo.");
    } catch (e: any) {
      toast.error("Falha ao salvar: " + (e?.message || "erro desconhecido"));
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload da logo */}
      <div className="space-y-3">
        <div className="flex items-center gap-4 p-4 rounded-lg border border-border bg-muted/30">
          <div className="h-20 w-20 rounded-lg bg-background border border-border flex items-center justify-center overflow-hidden shrink-0">
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <img src={previewSrc} alt="Logo atual" className="max-h-full max-w-full object-contain" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Logo oficial do sistema</p>
            <p className="text-xs text-muted-foreground mt-1 break-all">
              {branding.logo_url ? "Logo personalizada ativa" : "Usando logo padrão do sistema"}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando…</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" /> Enviar nova logo</>
                )}
              </Button>
              {branding.logo_url && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleRemove}
                  disabled={removing}
                  className="text-destructive hover:text-destructive"
                >
                  {removing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                  Remover
                </Button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Formatos aceitos: PNG, JPG, WEBP ou SVG. Tamanho máximo: 4MB. Recomendado: imagem quadrada com fundo transparente.
        </p>
      </div>

      {/* Nome da marca */}
      <div className="space-y-2 p-4 rounded-lg border border-border bg-muted/30">
        <Label htmlFor="brand-name" className="flex items-center gap-2 text-sm font-medium">
          <Type className="h-4 w-4 text-primary" /> Nome da marca
        </Label>
        <p className="text-xs text-muted-foreground">
          Texto exibido ao lado da logo no cabeçalho, sidebar e telas de autenticação.
        </p>
        <div className="flex gap-2">
          <Input
            id="brand-name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder={DEFAULT_BRAND_NAME}
            maxLength={40}
            className="flex-1"
          />
          <Button size="sm" onClick={handleSaveName} disabled={!nameDirty || savingName}>
            {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
          </Button>
        </div>
      </div>

      {/* Opções avançadas: tamanhos por área × dispositivo */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-primary" /> Opções avançadas — tamanhos
            </h4>
            <p className="text-xs text-muted-foreground">
              Defina o tamanho em pixels para cada área e dispositivo.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={handleResetSizes}>
            <RotateCcw className="h-4 w-4 mr-2" /> Padrões
          </Button>
        </div>

        <Accordion type="multiple" className="w-full">
          {(Object.keys(AREA_LABELS) as LogoArea[]).map((area) => (
            <AccordionItem value={area} key={area}>
              <AccordionTrigger className="text-sm">
                <div className="text-left">
                  <div>{AREA_LABELS[area].title}</div>
                  <div className="text-xs text-muted-foreground font-normal">
                    {AREA_LABELS[area].description}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-5 py-2">
                  {DEVICES.map(({ key, label, Icon, min, max }) => {
                    const value = draftSizes[area]?.[key] ?? DEFAULT_SIZES[area][key];
                    return (
                      <div key={key} className="space-y-2">
                        <div className="flex items-center justify-between gap-4">
                          <Label className="flex items-center gap-2 text-sm">
                            <Icon className="h-4 w-4 text-muted-foreground" /> {label}
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
                              className="w-20 h-9 text-sm text-right"
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
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Prévia</span>
                          <div className="flex items-center justify-center bg-muted/40 rounded border border-border p-2">
                            <img
                              src={previewSrc}
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

        <div className="flex justify-end mt-4">
          <Button size="sm" onClick={handleSaveSizes} disabled={!dirty || savingSizes}>
            {savingSizes ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</> : "Salvar tamanhos"}
          </Button>
        </div>
      </div>
    </div>
  );
}
