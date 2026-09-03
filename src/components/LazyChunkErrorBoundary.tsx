import { Component, ReactNode } from "react";
import { APP_BUILD_ID, recoveryKey } from "@/lib/pwa/buildId";
import { trackPWAEvent } from "@/lib/pwa/events";
import { extractChunkUrl, isModuleLoadError } from "@/lib/pwa/moduleErrors";
import { clearAppPWACaches, unregisterAppServiceWorker } from "@/lib/pwa/appCaches";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  diagnostics: string | null;
}

/** Recuperação: apaga só caches do app + SW do app, preservando a sessão. */
async function recoverAndReload() {
  trackPWAEvent("pwa_recovery_started");
  try {
    await unregisterAppServiceWorker();
    await clearAppPWACaches();
    trackPWAEvent("pwa_recovery_completed");
  } catch (error: any) {
    trackPWAEvent("pwa_recovery_failed", error);
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_r", Date.now().toString());
  window.location.replace(url.toString());
}

export class LazyChunkErrorBoundary extends Component<Props, State> {
  state: State = { error: null, diagnostics: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, diagnostics: null };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    if (!isModuleLoadError(error)) return;

    const chunkUrl = extractChunkUrl(error);
    trackPWAEvent("pwa_lazy_chunk_error", error);

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("[LazyChunkErrorBoundary]", {
        message: error.message,
        chunkUrl,
        componentStack: info?.componentStack,
        buildId: APP_BUILD_ID,
      });
      this.setState({
        diagnostics: `chunk: ${chunkUrl || "desconhecido"}\nmessage: ${error.message}`,
      });
    }

    // Recuperação automática APENAS uma vez por build — se o deploy estiver
    // quebrado, o usuário vê o fallback em vez de entrar em loop de reload.
    try {
      const key = recoveryKey("lazy-chunk");
      if (sessionStorage.getItem(key)) {
        trackPWAEvent("pwa_reload_loop_prevented");
        return;
      }
      sessionStorage.setItem(key, String(Date.now()));
    } catch {
      return;
    }
    void recoverAndReload();
  }

  render() {
    const { error, diagnostics } = this.state;
    if (!error) return this.props.children;
    if (!isModuleLoadError(error)) throw error;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-xl w-full rounded-lg border border-border bg-card p-6 shadow-lg space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">
              Nova versão disponível
            </h2>
            <p className="text-sm text-muted-foreground">
              Uma nova versão do app foi publicada. Recarregue para carregar os
              arquivos atualizados — sua sessão será preservada.
            </p>
          </div>
          {import.meta.env.DEV && diagnostics && (
            <pre className="text-[11px] whitespace-pre-wrap break-all bg-muted p-3 rounded border border-border max-h-64 overflow-auto">
              {diagnostics}
            </pre>
          )}
          <button
            type="button"
            onClick={() => void recoverAndReload()}
            className="w-full inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:bg-primary/90 transition"
          >
            Recarregar
          </button>
          <p className="text-[11px] text-muted-foreground text-center">
            versão {APP_BUILD_ID}
          </p>
        </div>
      </div>
    );
  }
}
