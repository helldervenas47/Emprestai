import { useMemo } from "react";
import { useAppBranding, FALLBACK_LOGO, type LogoArea, type LogoDevice } from "@/hooks/useAppBranding";
import { useIsMobile, useIsMobileOrTablet } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface AppLogoProps {
  area: LogoArea;
  /** Force a specific device size (used for previews / SSR-like use) */
  device?: LogoDevice;
  className?: string;
  alt?: string;
  rounded?: boolean;
}

export function AppLogo({ area, device, className, alt = "Logo", rounded = false }: AppLogoProps) {
  const { branding } = useAppBranding();
  const isMobile = useIsMobile();
  const isSmall = useIsMobileOrTablet();

  const detected: LogoDevice = device ?? (isMobile ? "mobile" : isSmall ? "tablet" : "desktop");
  const size = branding.sizes[area]?.[detected] ?? 40;
  const src = branding.logo_url || FALLBACK_LOGO;

  const style = useMemo(() => ({ width: `${size}px`, height: `${size}px` }), [size]);

  return (
    <img
      src={src}
      alt={alt}
      style={style}
      className={cn("object-contain shrink-0", rounded && "rounded-xl overflow-hidden", className)}
      draggable={false}
    />
  );
}
