import { useEffect } from "react";
import { useAppBranding, FALLBACK_LOGO } from "@/hooks/useAppBranding";

/**
 * Keeps the browser favicon and PWA manifest icons in sync with the
 * configured branding logo. Runs whenever logo_url changes.
 */
export function BrandFaviconSync() {
  const { branding } = useAppBranding();

  useEffect(() => {
    const logoUrl = branding.logo_url || FALLBACK_LOGO;
    const brandName = branding.brand_name || "App";

    // 1) Favicon: update existing <link rel="icon"> tags (and apple-touch-icon)
    const setLinkHref = (rel: string) => {
      const links = document.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`);
      if (links.length === 0) {
        const link = document.createElement("link");
        link.rel = rel;
        link.href = logoUrl;
        document.head.appendChild(link);
      } else {
        links.forEach((l) => {
          l.href = logoUrl;
        });
      }
    };
    setLinkHref("icon");
    setLinkHref("shortcut icon");
    setLinkHref("apple-touch-icon");

    // 2) PWA Manifest: build a dynamic manifest blob with the logo as icon
    try {
      const faviconSize = branding.sizes?.favicon?.desktop ?? 192;
      const manifest = {
        name: brandName,
        short_name: brandName,
        description: brandName,
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#000000",
        icons: [
          { src: logoUrl, sizes: `${faviconSize}x${faviconSize}`, type: "image/png", purpose: "any" },
          { src: logoUrl, sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: logoUrl, sizes: "512x512", type: "image/png", purpose: "any maskable" },
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
  }, [branding.logo_url, branding.brand_name, branding.sizes]);

  return null;
}
