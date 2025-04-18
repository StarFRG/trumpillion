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
  private isDevelopment = typeof process !== 'undefined'
    ? process.env.NODE_ENV !== 'production'
    : typeof import.meta !== 'undefined' && import.meta.env?.DEV;

  logError({ error, context = {}, level = 'error', user }: ErrorDetails) {
    if (this.isDevelopment) {
      console.error('Error:', error);
      console.log('Context:', { ...context, user });
      return;
    }

    if (user) {
      Sentry.setUser(user);
    }

    if (error instanceof Error) {
      Sentry.captureException(error, {
        level,
        extra: context
      });
    } else {
      Sentry.captureMessage(error, {
        level,
        extra: context
      });
    }
  }

  logEvent(name: string, data?: Record<string, any>) {
    if (this.isDevelopment) {
      console.log('Event:', name, data);
      return;
    }

    Sentry.captureMessage(name, {
      level: 'info',
      extra: data
    });
  }

  setUser(user: { id?: string; wallet?: string; email?: string; } | null) {
    if (this.isDevelopment) {
      console.log('Setting user:', user);
      return;
    }

    if (user) {
      Sentry.setUser(user);
    } else {
      Sentry.setUser(null);
    }
  }

  logErrorWithContext(
    err: unknown,
    location: string,
    context: Record<string, any> = {}
  ) {
    if (this.isDevelopment) {
      console.error(`[${location}]`, err);
      console.log('Context:', context);
      return;
    }

    const error = err instanceof Error ? err : new Error(String(err));
    
    Sentry.captureException(error, {
      tags: { location },
      extra: {
        ...context,
        errorMessage: error.message,
        errorStack: error.stack
      }
    });
  }

  clearUser() {
    if (this.isDevelopment) {
      console.log('Clearing user');
      return;
    }

    Sentry.setUser(null);
  }

  addBreadcrumb(
    message: string,
    category?: string,
    level: Sentry.SeverityLevel = 'info',
    data?: Record<string, any>
  ) {
    if (this.isDevelopment) {
      console.log(`Breadcrumb [${category}]:`, message, data);
      return;
    }

    Sentry.addBreadcrumb({
      message,
      category,
      level,
      data
    });
  }
}

export const monitoring = new MonitoringService();