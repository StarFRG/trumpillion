import { monitoring } from '../services/monitoring';

interface ApiOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public statusText?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

export async function apiFetch(url: string, options: ApiOptions = {}): Promise<Response> {
  const { 
    timeout = DEFAULT_TIMEOUT,
    retries = MAX_RETRIES,
    retryDelay = RETRY_DELAY,
    ...fetchOptions 
  } = options;
  
  let lastError: ApiError | null = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(fetchOptions.headers || {})
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new ApiError(`HTTP error! status: ${response.status}`, response.status, response.statusText);
      }

      monitoring.logInfo({
        message: 'API request successful',
        context: { action: 'api_fetch', url, options: fetchOptions }
      });

      return response;
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        lastError = new ApiError('Request timed out', 408, 'Request Timeout');
      } else {
        lastError = error instanceof ApiError ? error : new ApiError('Unknown error');
      }

      monitoring.logError({
        error: lastError,
        context: {
          action: 'api_fetch',
          url,
          attempt,
          maxRetries: retries,
          options: {
            method: fetchOptions.method,
            timeout
          }
        }
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const delay = retryDelay * Math.pow(2, attempt - 1);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  throw lastError ?? new ApiError('API request failed after all retries');
}