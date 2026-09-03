import { ThumbsUp, AlertTriangle } from "lucide-react";

interface Props {
  ok: boolean;
  size?: number;
}

/**
 * Selo estilo "Bom Condutor" — SVG com borda serrilhada (sunburst),
 * anel interno e ícone + rótulo curto no centro.
 */
export function StatusSeal({ ok, size = 56 }: Props) {
  const label = ok ? "BOM" : "ATENÇÃO";
  const Icon = ok ? ThumbsUp : AlertTriangle;

  // Cores via tokens do design system
  const fill = ok ? "hsl(var(--success))" : "hsl(var(--destructive))";
  const fillDark = ok ? "hsl(var(--success) / 0.85)" : "hsl(var(--destructive) / 0.85)";

  // Gera pontos da estrela/serrilhado
  const spikes = 24;
  const cx = 50;
  const cy = 50;
  const rOuter = 48;
  const rInner = 42;
  const points: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const angle = (Math.PI * i) / spikes - Math.PI / 2;
    points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }

  return (
    <div
      className="shrink-0 relative"
      style={{ width: size, height: size }}
      aria-label={ok ? "Meta OK" : "Meta em atenção"}
      title={ok ? "Desempenho dentro da meta" : "Desempenho abaixo da meta"}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm">
        <defs>
          <radialGradient id={`seal-grad-${ok ? "ok" : "warn"}`} cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor={fill} stopOpacity="1" />
            <stop offset="100%" stopColor={fillDark} stopOpacity="1" />
          </radialGradient>
        </defs>
        {/* Serrilhado externo */}
        <polygon
          points={points.join(" ")}
          fill={`url(#seal-grad-${ok ? "ok" : "warn"})`}
        />
        {/* Anel interno branco */}
        <circle cx="50" cy="50" r="38" fill="none" stroke="hsl(var(--background))" strokeWidth="1.2" opacity="0.9" />
        {/* Fundo central um pouco mais escuro */}
        <circle cx="50" cy="50" r="36" fill={fillDark} opacity="0.15" />
        {/* Texto superior */}
        <text
          x="50"
          y="34"
          textAnchor="middle"
          fontSize="10"
          fontWeight="900"
          fill="hsl(var(--background))"
          style={{ letterSpacing: "0.5px" }}
        >
          {label}
        </text>
      </svg>
      {/* Ícone central */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ paddingTop: size * 0.28 }}>
        <Icon
          className="text-background"
          style={{ width: size * 0.28, height: size * 0.28 }}
          strokeWidth={2.5}
        />
      </div>
    </div>
  );
}
