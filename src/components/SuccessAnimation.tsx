import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";

interface Props {
  show: boolean;
  onComplete?: () => void;
  message?: string;
}

export function SuccessAnimation({ show, onComplete, message = "Registrado com sucesso!" }: Props) {
  const [visible, setVisible] = useState(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!show) {
      setVisible(false);
      return;
    }

    setVisible(true);
    const timer = window.setTimeout(() => {
      setVisible(false);
      onCompleteRef.current?.();
    }, 1600);

    return () => window.clearTimeout(timer);
  }, [show]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />

      {/* Content */}
      <div className="relative flex flex-col items-center gap-3 animate-scale-in">
        {/* Glow ring */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-success/30 blur-xl scale-150 animate-pulse" />
          <CheckCircle2 className="relative h-20 w-20 text-success drop-shadow-lg" strokeWidth={1.5} />
        </div>
        <p className="text-lg font-semibold text-foreground drop-shadow-sm">{message}</p>

        {/* Particles */}
        <div className="absolute inset-0 overflow-visible">
          {[...Array(8)].map((_, i) => (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 block h-2 w-2 rounded-full bg-success"
              style={{
                animation: `success-particle 0.8s ease-out ${i * 0.05}s forwards`,
                opacity: 0,
                // @ts-ignore
                "--angle": `${i * 45}deg`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
