import * as React from "react";
import { Suspense, type ReactNode } from "react";

/**
 * Envolve componentes lazy renderizados como overlay (Dialog / Sheet / Drawer /
 * Form modal) em seu próprio `<Suspense>` + `ErrorBoundary` locais. Isso impede
 * que a suspensão (ou a falha de download) do chunk do modal desmonte a árvore
 * do `<Suspense>` externo — que envolve toda a aba ativa em `Index.tsx` — o que
 * causava o scroll voltar ao topo ao abrir um modal pela primeira vez.
 *
 * O fallback padrão é `null`: enquanto o chunk baixa, o Radix ainda não pintou
 * o overlay, então o usuário permanece vendo a tela atual sem flash. Um
 * fallback localizado (skeleton dentro do Dialog) pode ser passado via prop.
 */

interface LazyOverlayErrorBoundaryProps {
  children: ReactNode;
  onRetry: () => void;
}

interface LazyOverlayErrorBoundaryState {
  hasError: boolean;
}

class LazyOverlayErrorBoundary extends React.Component<
  LazyOverlayErrorBoundaryProps,
  LazyOverlayErrorBoundaryState
> {
  state: LazyOverlayErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): LazyOverlayErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Registro para diagnóstico — a aba permanece montada.
    console.error("[LazyDialogBoundary] falha ao carregar overlay:", error);
  }

  componentDidUpdate(prevProps: LazyOverlayErrorBoundaryProps) {
    if (prevProps.children !== this.props.children && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-sm rounded-xl border border-border bg-card p-4 shadow-lg"
        >
          <p className="text-sm font-medium text-foreground">
            Não foi possível carregar esta tela.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Verifique sua conexão e tente novamente.
          </p>
          <button
            type="button"
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            onClick={() => {
              this.setState({ hasError: false });
              this.props.onRetry();
            }}
          >
            Tentar novamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export const LazyDialogBoundary = ({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) => {
  const [retryKey, setRetryKey] = React.useState(0);

  return (
    <LazyOverlayErrorBoundary key={retryKey} onRetry={() => setRetryKey((k) => k + 1)}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </LazyOverlayErrorBoundary>
  );
};
