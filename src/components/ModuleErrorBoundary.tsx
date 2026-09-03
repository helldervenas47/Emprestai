import { Component, ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  /** Nome do módulo exibido na mensagem (ex.: "Receitas"). */
  name: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Boundary local por módulo. Evita que uma falha em uma aba (ex.: Receitas ou
 * Despesas) derrube toda a árvore do app e caia no AppErrorBoundary com a
 * mensagem genérica "Não foi possível abrir o aplicativo".
 *
 * Mostra a mensagem real do erro para diagnóstico e permite tentar novamente
 * sem recarregar a página inteira.
 */
export class ModuleErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // eslint-disable-next-line no-console
    console.error(`[ModuleErrorBoundary:${this.props.name}]`, error, info?.componentStack);
  }

  private retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 sm:p-6 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div className="min-w-0 space-y-1">
            <h3 className="text-sm font-semibold text-foreground">
              Não foi possível carregar {this.props.name}
            </h3>
            <p className="text-xs text-muted-foreground">
              Os demais módulos continuam funcionando. Tente novamente — se
              persistir, envie a mensagem abaixo para o suporte.
            </p>
          </div>
        </div>
        <pre className="text-[11px] whitespace-pre-wrap break-all bg-muted/60 p-3 rounded-lg border border-border max-h-40 overflow-auto text-muted-foreground">
          {error.message || String(error)}
        </pre>
        <button
          type="button"
          onClick={this.retry}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:bg-primary/90 transition"
        >
          <RotateCcw className="h-4 w-4" />
          Tentar novamente
        </button>
      </div>
    );
  }
}
