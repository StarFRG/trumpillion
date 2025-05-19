import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WalletContextProvider } from './components/WalletProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App';
import './i18n';
import './index.css';

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