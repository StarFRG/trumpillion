import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WalletContextProvider } from './components/WalletProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App';
import './i18n';
import './index.css';
import * as Sentry from '@sentry/react';

// Sentry initialization with simplified config
if (import.meta.env.PROD) {
  Sentry.init({
    dsn: 'https://0a8b9f06f41a248baab05358a12fb6ff@o4509111588225024.ingest.de.sentry.io/4509111601397840',
    integrations: [
      new Sentry.BrowserTracing({
        tracePropagationTargets: ['localhost', /^https:\/\/trumpillion\.com/],
      })
    ],
    tracesSampleRate: 1.0,
    enabled: true
  });
}

// Essential polyfills
import { Buffer } from 'buffer';
import process from 'process';

// Global polyfills
if (typeof window !== 'undefined') {
  window.global = window;
  window.Buffer = Buffer;
  window.process = process;
}

// Register Service Worker
if (
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  import.meta.env.PROD &&
  (window.location.protocol === 'https:' || window.location.hostname === 'localhost')
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    }).then(registration => {
      if (import.meta.env.DEV) {
        console.log('✅ Service Worker registered:', registration);
      }
    }).catch(error => {
      console.error('❌ SW registration failed:', error);
      Sentry.captureException(error);
    });
  });
}

const rootEl = typeof document !== 'undefined' ? document.getElementById('root') : null;
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <WalletContextProvider>
          <App />
        </WalletContextProvider>
      </ErrorBoundary>
    </StrictMode>
  );
}