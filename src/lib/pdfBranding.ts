import { supabase } from "@/integrations/supabase/userClient";
import logoIconFallback from "@/assets/logo-icon.png";

export interface PdfBranding {
  logoDataUrl: string | null;
  logoSize: number; // pixels for the 'report' area / desktop
  brandName: string;
}

let cached: PdfBranding | null = null;

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function getPdfBranding(): Promise<PdfBranding> {
  if (cached) return cached;
  let logoUrl: string | null = null;
  let size = 80;
  let brandName = "EmprestAI";
  try {
    const { data } = await supabase
      .from("app_branding" as any)
      .select("logo_url, brand_name, sizes")
      .limit(1)
      .maybeSingle();
    if (data) {
      const row = data as any;
      logoUrl = row.logo_url || null;
      brandName = row.brand_name || brandName;
      const reportDesktop = row.sizes?.report?.desktop;
      if (typeof reportDesktop === "number" && reportDesktop > 0) size = reportDesktop;
    }
  } catch {
    // ignore — fallback applied
  }
  const dataUrl = logoUrl
    ? await urlToDataUrl(logoUrl)
    : await urlToDataUrl(logoIconFallback);
  cached = { logoDataUrl: dataUrl, logoSize: size, brandName };
  return cached;
}

/** Invalidate cache (call after admin saves new branding) */
export function clearPdfBrandingCache() {
  cached = null;
}

/** Public URL of the configured logo (for HTML contracts) */
export async function getBrandingLogoUrl(): Promise<{ url: string; size: number; brandName: string }> {
  let url: string = logoIconFallback;
  let size = 80;
  let brandName = "EmprestAI";
  try {
    const { data } = await supabase
      .from("app_branding" as any)
      .select("logo_url, brand_name, sizes")
      .limit(1)
      .maybeSingle();
    if (data) {
      const row = data as any;
      if (row.logo_url) url = row.logo_url;
      if (row.brand_name) brandName = row.brand_name;
      const rd = row.sizes?.report?.desktop;
      if (typeof rd === "number" && rd > 0) size = rd;
    }
  } catch {
    // ignore
  }
  return { url, size, brandName };
}
