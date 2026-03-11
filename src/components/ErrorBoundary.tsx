import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8 text-center">
          <div className="max-w-md">
            <h1 className="text-2xl font-bold text-destructive mb-3">Something went wrong</h1>
            <p className="text-muted-foreground mb-4">
              The app encountered an unexpected error. Check the browser console for details.
            </p>
            <pre className="text-left text-xs bg-muted p-4 rounded overflow-auto max-h-48 mb-6">
              {this.state.error?.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
