import * as Sentry from '@sentry/browser';

interface ErrorDetails {
  error: Error | string;
  context?: Record<string, any>;
  level?: Sentry.SeverityLevel;
  user?: {
    id?: string;
    wallet?: string;
    email?: string;
  };
}

class MonitoringService {
  private isDevelopment = import.meta.env.DEV;

  logError({ error, context = {}, level = 'error', user }: ErrorDetails) {
    if (this.isDevelopment) {
      console.error('Error:', error);
      console.log('Context:', { ...context, user });
      return;
    }
  }
}

export const monitoring = new MonitoringService();