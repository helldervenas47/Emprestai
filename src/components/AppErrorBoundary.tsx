import { Component, ReactNode } from "react";
import { APP_BUILD_ID } from "@/lib/pwa/buildId";
import { trackPWAEvent } from "@/lib/pwa/events";
import { isModuleLoadError } from "@/lib/pwa/moduleErrors";
import { recoverApp, reloadOnce } from "@/lib/pwa/registerPWA";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Error boundary global — ativo em DEV, preview, produção, browser e standalone.
 *
 * Substitui o antigo `DevCacheErrorBoundary`, que devolvia `children` em
 * produção e por isso deixava o app com tela branca quando a árvore quebrava.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    trackPWAEvent(
      isModuleLoadError(error) ? "pwa_module_load_error" : "pwa_recovery_failed",
      error,
    );

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("[AppErrorBoundary]", error, info.componentStack);
    }
  }

  private handleReload = () => {
    reloadOnce("app-error-boundary");
  };

  private handleClearAndReload = () => {
    void recoverApp();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 shadow-lg space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">
              Não foi possível abrir o aplicativo
            </h2>
            <p className="text-sm text-muted-foreground">
              Uma atualização ou falha temporária impediu o carregamento. Seus
              dados e sua sessão continuam salvos.
            </p>
          </div>

          {!!error.message && (
            <pre className="text-[11px] whitespace-pre-wrap break-all bg-muted text-muted-foreground rounded p-2 max-h-40 overflow-auto">
              {error.message}
            </pre>
          )}


          <div className="space-y-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:bg-primary/90 transition"
            >
              Recarregar aplicativo
            </button>
            <button
              type="button"
              onClick={this.handleClearAndReload}
              className="w-full inline-flex items-center justify-center rounded-md border border-border text-foreground text-sm font-medium px-4 py-2 hover:bg-accent transition"
            >
              Limpar cache temporário e recarregar
            </button>
          </div>

          <p className="text-[11px] text-muted-foreground text-center">
            versão {APP_BUILD_ID}
          </p>
        </div>
      </div>
    );
  }
}
