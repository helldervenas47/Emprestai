/** Gráfico de linha meramente decorativo (não representa dados). */
export function DecorSparkline({ tone = "blue", subtle = false }: { tone?: "blue" | "orange" | "light"; subtle?: boolean }) {
  const stroke =
    tone === "orange" ? "#f97316" : tone === "light" ? "#ffffff" : "#2563EB";
  const fillOpacity = subtle ? "0.15" : tone === "light" ? "0.50" : "0.42";
  const strokeOpacity = subtle ? "0.45" : tone === "light" ? "0.95" : "1";
  const strokeWidth = subtle ? 3 : tone === "light" ? 5 : 4;
  return (
    <svg
      className="dash-sparkline"
      viewBox="0 0 400 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M0,78 L40,66 L80,72 L120,48 L160,56 L200,34 L240,42 L280,22 L320,30 L360,12 L400,20 L400,100 L0,100 Z"
        fill={stroke}
        fillOpacity={fillOpacity}
      />
      <path
        d="M0,78 L40,66 L80,72 L120,48 L160,56 L200,34 L240,42 L280,22 L320,30 L360,12 L400,20"
        fill="none"
        stroke={stroke}
        strokeOpacity={strokeOpacity}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Linha de projeção sutil para dar profundidade de gráfico */}
      <path
        d="M0,90 L40,84 L80,86 L120,76 L160,80 L200,70 L240,74 L280,64 L320,68 L360,60 L400,62"
        fill="none"
        stroke={stroke}
        strokeOpacity={subtle ? "0.25" : tone === "light" ? "0.45" : "0.65"}
        strokeWidth={strokeWidth - 1}
        strokeLinejoin="round"
        strokeLinecap="round"
        strokeDasharray="4 6"
      />
    </svg>
  );
}


