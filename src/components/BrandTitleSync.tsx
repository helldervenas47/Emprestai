import { useEffect } from "react";
import { useAppBranding } from "@/hooks/useAppBranding";

/**
 * Keeps document.title in sync with the configured brand name.
 * Preserves any existing page-specific suffix after " - " or " | ".
 */
export function BrandTitleSync() {
  const { branding } = useAppBranding();

  useEffect(() => {
    const name = branding.brand_name?.trim();
    if (!name) return;
    const current = document.title || "";
    const sepMatch = current.match(/\s[-|]\s(.+)$/);
    document.title = sepMatch ? `${name} - ${sepMatch[1]}` : name;
  }, [branding.brand_name]);

  return null;
}
