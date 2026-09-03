import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";

type Ctx = {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
};

const ActiveTooltipCtx = createContext<Ctx>({ activeId: null, setActiveId: () => {} });

export function ActiveTooltipProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const onOutside = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-chart-card]")) return;
      setActiveId(null);
    };
    const onScroll = () => setActiveId(null);
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("touchstart", onOutside, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onOutside, true);
      document.removeEventListener("touchstart", onOutside, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, []);

  const setter = useCallback((id: string | null) => setActiveId((prev) => (prev === id ? prev : id)), []);

  return (
    <ActiveTooltipCtx.Provider value={{ activeId, setActiveId: setter }}>
      {children}
    </ActiveTooltipCtx.Provider>
  );
}

export function useActiveTooltip(myId: string) {
  const { activeId, setActiveId } = useContext(ActiveTooltipCtx);
  const isActive = activeId === myId;
  const claim = useCallback(() => setActiveId(myId), [myId, setActiveId]);
  const clearAll = useCallback(() => setActiveId(null), [setActiveId]);
  return { isActive, claim, clearAll };
}
