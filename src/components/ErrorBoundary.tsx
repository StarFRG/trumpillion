import React, { Component, ErrorInfo, ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import { monitoring } from '../services/monitoring';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  eventId: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    eventId: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { 
      hasError: true, 
      error,
      eventId: null
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("UI Error:", error, errorInfo);

    if (import.meta.env.PROD) {
      Sentry.withScope((scope) => {
        scope.setExtras(errorInfo);
        const eventId = Sentry.captureException(error);
        this.setState({ eventId });
      });

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

  private handleReportFeedback = () => {
    if (this.state.eventId) {
      Sentry.showReportDialog({
        eventId: this.state.eventId,
        lang: 'de',
        title: 'Ein Fehler ist aufgetreten',
        subtitle: 'Unser Team wurde benachrichtigt.',
        subtitle2: 'Wenn Sie uns bei der Behebung helfen möchten, teilen Sie uns mit, was passiert ist.',
        labelName: 'Name',
        labelEmail: 'E-Mail',
        labelComments: 'Was ist passiert?',
        labelClose: 'Schließen',
        labelSubmit: 'Absenden',
        errorGeneric: 'Beim Senden Ihres Feedbacks ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.',
        errorFormEntry: 'Einige Felder wurden nicht korrekt ausgefüllt. Bitte korrigieren Sie die Fehler und versuchen Sie es erneut.',
        successMessage: 'Ihr Feedback wurde gesendet. Vielen Dank!'
      });
    }
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
            <div className="space-y-3">
              <button
                onClick={this.handleReload}
                className="w-full bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Seite neu laden
              </button>
              {import.meta.env.PROD && this.state.eventId && (
                <button
                  onClick={this.handleReportFeedback}
                  className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-6 py-2 rounded-lg transition-colors"
                >
                  Problem melden
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;