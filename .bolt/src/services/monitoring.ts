import * as Sentry from '@sentry/browser';

interface ErrorDetails {
  error: Error | string;
  context?: Record<string, any>;
  level?: Sentry.SeverityLevel;
}

class MonitoringService {
  private isDevelopment = import.meta.env.DEV;
  private initialized = false;

  constructor() {
    this.initializeSentry();
  }

  private initializeSentry() {
    if (this.initialized || this.isDevelopment) return;

    try {
      Sentry.init({
        dsn: import.meta.env.VITE_SENTRY_DSN || '',
        environment: import.meta.env.MODE,
        enabled: !this.isDevelopment,
        tracesSampleRate: 1.0,
        integrations: [
          new Sentry.BrowserTracing(),
        ],
      });
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize Sentry:', error);
    }
  }

  logError({ error, context = {}, level = 'error' }: ErrorDetails) {
    if (this.isDevelopment) {
      console.error('Error:', error);
      console.log('Context:', context);
      return;
    }

    if (!this.initialized) {
      this.initializeSentry();
    }

    try {
      if (error instanceof Error) {
        Sentry.captureException(error, {
          level,
          extra: context,
        });
      } else {
        Sentry.captureMessage(error.toString(), {
          level,
          extra: context,
        });
      }
    } catch (e) {
      console.error('Failed to log error to Sentry:', e);
    }
  }

  logPerformance(metric: string, value: number, tags: Record<string, string> = {}) {
    if (this.isDevelopment) {
      console.log(`Performance Metric - ${metric}:`, value, tags);
      return;
    }

    if (!this.initialized) {
      this.initializeSentry();
    }

    try {
      Sentry.addBreadcrumb({
        category: 'performance',
        message: metric,
        data: { value, ...tags },
        level: 'info',
      });

      Sentry.setTag('metric_name', metric);
      Sentry.setMeasurement(metric, value, 'millisecond');
    } catch (e) {
      console.error('Failed to log performance metric to Sentry:', e);
    }
  }

  logEvent(name: string, properties: Record<string, any> = {}) {
    if (this.isDevelopment) {
      console.log(`Event - ${name}:`, properties);
      return;
    }

    if (!this.initialized) {
      this.initializeSentry();
    }

    try {
      Sentry.addBreadcrumb({
        category: 'event',
        message: name,
        data: properties,
        level: 'info',
      });

      Sentry.captureMessage(name, {
        level: 'info',
        extra: properties,
      });
    } catch (e) {
      console.error('Failed to log event to Sentry:', e);
    }
  }

  setUser(id: string, email?: string, username?: string) {
    if (this.isDevelopment) {
      console.log('Set user:', { id, email, username });
      return;
    }

    if (!this.initialized) {
      this.initializeSentry();
    }

    try {
      Sentry.setUser({
        id,
        email,
        username,
      });
    } catch (e) {
      console.error('Failed to set user in Sentry:', e);
    }
  }

  clearUser() {
    if (!this.initialized) return;
    
    try {
      Sentry.setUser(null);
    } catch (e) {
      console.error('Failed to clear user in Sentry:', e);
    }
  }
}

export const monitoring = new MonitoringService();