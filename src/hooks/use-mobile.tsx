import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}

export function useIsMobileOrTablet() {
  const [isSmall, setIsSmall] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const check = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      const shortSide = Math.min(width, height);

      // Treat as tablet/mobile if:
      // - Width < 1024 (portrait tablet or phone)
      // - OR it's a touch device with short side <= 1024 (landscape tablet)
      const isTabletOrMobile = width < TABLET_BREAKPOINT || (isTouch && shortSide < TABLET_BREAKPOINT);
      setIsSmall(isTabletOrMobile);
    };

    check();
    const onOrientation = () => setTimeout(check, 100);
    window.addEventListener("resize", check);
    // Also listen to orientation changes for PWA
    window.addEventListener("orientationchange", onOrientation);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", onOrientation);
    };

  }, []);

  return !!isSmall;
}
