import { createContext, useContext, useState, ReactNode } from "react";

interface HideValuesContextType {
  hidden: boolean;
  toggle: () => void;
  mask: (value: string) => string;
}

const HideValuesContext = createContext<HideValuesContextType>({
  hidden: false,
  toggle: () => {},
  mask: (v) => v,
});

export function HideValuesProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("hvcred-hide-values") === "true";
    }
    return false;
  });

  const toggle = () => {
    setHidden((prev) => {
      const next = !prev;
      localStorage.setItem("hvcred-hide-values", String(next));
      return next;
    });
  };

  const mask = (value: string) => (hidden ? "••••••" : value);

  return (
    <HideValuesContext.Provider value={{ hidden, toggle, mask }}>
      {children}
    </HideValuesContext.Provider>
  );
}

export function useHideValues() {
  return useContext(HideValuesContext);
}
