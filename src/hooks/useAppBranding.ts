import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import logoIconFallback from "@/assets/logo-icon.png";
import { clearPdfBrandingCache } from "@/lib/pdfBranding";

export type LogoArea = "header" | "auth" | "favicon" | "report";
export type LogoDevice = "desktop" | "tablet" | "mobile";

export type LogoSizes = Record<LogoArea, Record<LogoDevice, number>>;

export interface AppBranding {
  id: string;
  logo_url: string | null;
  brand_name: string;
  sizes: LogoSizes;
  updated_at: string;
}

const DEFAULT_SIZES: LogoSizes = {
  header: { desktop: 40, tablet: 36, mobile: 32 },
  auth: { desktop: 96, tablet: 80, mobile: 64 },
  favicon: { desktop: 64, tablet: 64, mobile: 64 },
  report: { desktop: 80, tablet: 72, mobile: 64 },
};

export const FALLBACK_LOGO = logoIconFallback;
export const DEFAULT_BRAND_NAME = "EmprestAI";

const SELECT_COLS = "id, logo_url, brand_name, sizes, updated_at";

function mapRow(row: any): AppBranding {
  return {
    id: row.id,
    logo_url: row.logo_url ?? null,
    brand_name: row.brand_name || DEFAULT_BRAND_NAME,
    sizes: { ...DEFAULT_SIZES, ...(row.sizes ?? {}) } as LogoSizes,
    updated_at: row.updated_at,
  };
}

const DEFAULT_BRANDING: AppBranding = {
  id: "default",
  logo_url: null,
  brand_name: DEFAULT_BRAND_NAME,
  sizes: DEFAULT_SIZES,
  updated_at: "",
};

let cache: AppBranding | null = null;
const subscribers = new Set<(b: AppBranding) => void>();

function notify(b: AppBranding) {
  cache = b;
  clearPdfBrandingCache();
  subscribers.forEach((cb) => cb(b));
}

async function fetchBranding(): Promise<AppBranding> {
  const { data, error } = await supabase
    .from("app_branding" as any)
    .select(SELECT_COLS)
    .limit(1)
    .maybeSingle();
  if (error || !data) return { ...DEFAULT_BRANDING, updated_at: new Date().toISOString() };
  return mapRow(data);
}

async function updateAndNotify(patch: Record<string, any>): Promise<void> {
  // Tenta atualizar a linha singleton existente
  const { data: updated, error: updErr } = await supabase
    .from("app_branding" as any)
    .update(patch as any)
    .eq("singleton", true)
    .select(SELECT_COLS)
    .maybeSingle();
  if (updErr) throw updErr;
  if (updated) {
    notify(mapRow(updated));
    return;
  }
  // Linha singleton ainda não existe — cria com upsert
  const { data: inserted, error: insErr } = await supabase
    .from("app_branding" as any)
    .upsert({ singleton: true, ...patch } as any, { onConflict: "singleton" })
    .select(SELECT_COLS)
    .single();
  if (insErr) throw insErr;
  notify(mapRow(inserted));
}

export function useAppBranding() {
  const [branding, setBranding] = useState<AppBranding>(cache ?? DEFAULT_BRANDING);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let alive = true;
    if (!cache) {
      fetchBranding().then((b) => {
        if (!alive) return;
        notify(b);
        setBranding(b);
        setLoading(false);
      });
    }
    const sub = (b: AppBranding) => setBranding(b);
    subscribers.add(sub);
    return () => {
      alive = false;
      subscribers.delete(sub);
    };
  }, []);

  const refresh = useCallback(async () => {
    const b = await fetchBranding();
    notify(b);
  }, []);

  const saveSizes = useCallback((sizes: LogoSizes) => updateAndNotify({ sizes }), []);

  const saveBrandName = useCallback(async (brand_name: string) => {
    const trimmed = (brand_name || "").trim() || DEFAULT_BRAND_NAME;
    await updateAndNotify({ brand_name: trimmed });
  }, []);

  const uploadLogo = useCallback(async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("branding")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from("branding").getPublicUrl(path);
    const url = `${pub.publicUrl}?v=${Date.now()}`;
    await updateAndNotify({ logo_url: url });
  }, []);

  const removeLogo = useCallback(() => updateAndNotify({ logo_url: null }), []);

  return { branding, loading, refresh, saveSizes, saveBrandName, uploadLogo, removeLogo };
}

export { DEFAULT_SIZES };
