import * as React from "react";

interface AutoFitTextProps {
  /** Texto a ser exibido (ex.: valor monetário já formatado). */
  text: string;
  /** Texto de referência usado para o cálculo de encaixe. Quando fornecido,
   *  todos os elementos que compartilham a mesma referência terão o mesmo
   *  tamanho de fonte, independentemente do número de dígitos do valor real. */
  referenceText?: string;
  /** Tamanho máximo da fonte em px. */
  maxFontSize: number;
  /** Tamanho mínimo da fonte em px (o texto nunca fica menor que isso). */
  minFontSize: number;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

/**
 * Renderiza um texto em uma única linha, reduzindo automaticamente o
 * tamanho da fonte até que ele caiba na largura disponível do container.
 *
 * Usado nos cards financeiros do Dashboard para garantir que valores
 * acumulados com até 9 dígitos (ex.: R$ 999.999.999,00) apareçam por
 * inteiro em todas as versões (mobile, tablet e desktop).
 *
 * Quando `referenceText` é informado, a medida é feita contra ele, e não contra
 * o `text` real. Isso garante que todos os cards que compartilham a mesma
 * referência usem o mesmo tamanho de fonte, evitando que valores com mais
 * dígitos fiquem menores que os demais.
 */
export function AutoFitText({
  text,
  referenceText,
  maxFontSize,
  minFontSize,
  className,
  style,
  title,
}: AutoFitTextProps) {
  const containerRef = React.useRef<HTMLSpanElement>(null);
  const measureRef = React.useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = React.useState(maxFontSize);

  const measureAgainst = referenceText ?? text;

  const fit = React.useCallback(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const available = container.clientWidth;
    if (!available) return;

    // Mede sempre no tamanho máximo para obter a largura "natural".
    measure.style.fontSize = `${maxFontSize}px`;
    const natural = measure.scrollWidth;
    if (!natural) return;

    const ratio = available / natural;
    const next =
      ratio >= 1
        ? maxFontSize
        : Math.max(minFontSize, Math.floor(maxFontSize * ratio * 10) / 10);

    setFontSize((prev) => (Math.abs(prev - next) < 0.05 ? prev : next));
  }, [maxFontSize, minFontSize, measureAgainst]);

  React.useLayoutEffect(() => {
    fit();
  }, [fit, text, referenceText]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(container);
    return () => ro.disconnect();
  }, [fit]);

  return (
    <span
      ref={containerRef}
      className={`block min-w-0 max-w-full overflow-hidden ${className || ""}`}
      style={{ ...style, fontSize: `${fontSize}px`, whiteSpace: "nowrap" }}
      title={title ?? text}
    >
      {text}
      {/* Elemento oculto usado apenas para medir a largura natural do texto */}
      <span
        ref={measureRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          visibility: "hidden",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          left: -9999,
          top: -9999,
        }}
      >
        {measureAgainst}
      </span>
    </span>
  );
}
