import React, { Component, ErrorInfo, ReactNode } from 'react';
import { monitoring } from '../services/monitoring';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("UI Error:", error, errorInfo);

    if (import.meta.env.PROD) {
      monitoring.logError({
        error,
        context: {
          componentStack: errorInfo.componentStack,
          source: "ErrorBoundary"
        }
      });
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6 max-w-md w-full text-center">
            <h2 className="text-xl font-bold text-red-500 mb-4">
              Oops! Etwas ist schiefgelaufen.
            </h2>
            <p className="text-gray-300 mb-6">
              Wir haben den Fehler erfasst. Bitte lade die Seite neu.
            </p>
            <button
              onClick={this.handleReload}
              className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Seite neu laden
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;