import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("App error:", error, errorInfo);
    const message = error?.message || "";
    if (
      message.includes("dynamically imported module") ||
      message.includes("Importing a module script failed") ||
      message.includes("Loading chunk")
    ) {
      const pageRefreshed = sessionStorage.getItem("page_chunk_refreshed");
      if (!pageRefreshed) {
        sessionStorage.setItem("page_chunk_refreshed", "true");
        window.location.reload();
      }
    }
  }

  handleTryAgain = () => {
    const message = this.state.error?.message || "";
    if (
      message.includes("dynamically imported module") ||
      message.includes("Importing a module script failed") ||
      message.includes("Loading chunk")
    ) {
      window.location.reload();
    } else {
      this.setState({ hasError: false, error: null });
    }
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-gray-200 p-6">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-xl font-bold text-red-400">Something went wrong</h1>
            <p className="text-sm text-slate-400 font-mono break-all">
              {this.state.error.message}
            </p>
            <button
              onClick={this.handleTryAgain}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
