interface ErrorDetails {
  error: Error | string;
  context?: Record<string, any>;
  level?: 'error' | 'warning' | 'info';
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

    // In production, just log to console for now
    console.error('[Production Error]:', {
      error: error instanceof Error ? error.message : error,
      context,
      level,
      user
    });
  }

  logEvent(name: string, data?: Record<string, any>) {
    if (this.isDevelopment) {
      console.log('Event:', name, data);
      return;
    }

    console.log('[Production Event]:', name, data);
  }

  logErrorWithContext(
    err: unknown,
    location: string,
    context: Record<string, any> = {}
  ) {
    const error = err instanceof Error ? err : new Error(String(err));
    
    if (this.isDevelopment) {
      console.error(`[${location}]`, error);
      console.log('Context:', context);
      return;
    }

    console.error('[Production Error]:', {
      location,
      error: error.message,
      context
    });
  }

  addBreadcrumb(
    message: string,
    category?: string,
    level: 'info' | 'warning' | 'error' = 'info',
    data?: Record<string, any>
  ) {
    if (this.isDevelopment) {
      console.log(`Breadcrumb [${category}]:`, message, data);
      return;
    }

    console.log('[Production Breadcrumb]:', {
      message,
      category,
      level,
      data
    });
  }
}

export const monitoring = new MonitoringService();