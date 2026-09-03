import { Component, ReactNode } from "react";

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean }

/** Local boundary that swallows errors (e.g., failed lazy chunks) and renders fallback (default null). */
export class SilentErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(): State { return { hasError: true }; }
  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.warn("[SilentErrorBoundary] suppressed error:", error);
  }
  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
