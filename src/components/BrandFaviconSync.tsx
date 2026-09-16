import { useEffect } from "react";
import { useAppBranding, FALLBACK_LOGO } from "@/hooks/useAppBranding";

/**
 * Keeps the browser favicon and PWA manifest icons in sync with the
 * configured branding logo. Runs whenever logo_url changes.
 */
export function BrandFaviconSync() {
  const { branding } = useAppBranding();

  useEffect(() => {
    const headerLogoUrl = branding.logo_url || FALLBACK_LOGO;
    const pwaIconUrl = branding.pwa_icon_url || branding.logo_url || FALLBACK_LOGO;
    const brandName = branding.brand_name || "App";

    // 1) Favicon da aba do navegador: usa exatamente o mesmo do menu lateral (logo_url)
    const setLinkHref = (rel: string, href: string) => {
      const links = document.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`);
      if (links.length === 0) {
        const link = document.createElement("link");
        link.rel = rel;
        link.href = href;
        document.head.appendChild(link);
      } else {
        links.forEach((l) => {
          l.href = href;
        });
      }
    };
    setLinkHref("icon", headerLogoUrl);
    setLinkHref("shortcut icon", headerLogoUrl);
    setLinkHref("apple-touch-icon", pwaIconUrl);

    // 2) PWA Manifest: build a dynamic manifest blob with the logo as icon
    try {
      const faviconSize = branding.sizes?.favicon?.desktop ?? 192;
      const manifest = {
        name: brandName,
        short_name: brandName,
        description: brandName,
        start_url: "/",
        display: "standalone",
        background_color: "#15181D",
        theme_color: "#15181D",
        icons: [
          { src: pwaIconUrl, sizes: `${faviconSize}x${faviconSize}`, type: "image/png", purpose: "any" },
          { src: pwaIconUrl, sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: pwaIconUrl, sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      };
      const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
      const url = URL.createObjectURL(blob);
      let manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      if (!manifestLink) {
        manifestLink = document.createElement("link");
        manifestLink.rel = "manifest";
        document.head.appendChild(manifestLink);
      }
      const previous = manifestLink.href;
      manifestLink.href = url;
      // Revoke the previous blob URL (if any) to avoid leaks
      if (previous && previous.startsWith("blob:")) {
        try { URL.revokeObjectURL(previous); } catch { /* ignore */ }
      }
    } catch {
      // ignore manifest errors
    }
  }, [branding.pwa_icon_url, branding.logo_url, branding.brand_name, branding.sizes]);

  return null;
}
