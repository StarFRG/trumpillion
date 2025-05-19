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

// Global error handler for uncaught exceptions
const handleGlobalError = (event: ErrorEvent) => {
  console.error('Uncaught error:', event.error);
  event.preventDefault();
};

const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
  console.error('Unhandled promise rejection:', event.reason);
  event.preventDefault();
};

// Global polyfills
if (typeof window !== 'undefined') {
  window.global = window;
  window.Buffer = Buffer;
  window.process = process;
  
  // Add global error handlers
  window.addEventListener('error', handleGlobalError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);
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

const initializeApp = () => {
  try {
    const rootEl = typeof document !== 'undefined' ? document.getElementById('root') : null;
    
    if (!rootEl) {
      throw new Error('Root element not found');
    }

    createRoot(rootEl).render(
      <StrictMode>
        <ErrorBoundary>
          <WalletContextProvider>
            <App />
          </WalletContextProvider>
        </ErrorBoundary>
      </StrictMode>
    );
  } catch (error) {
    console.error('Failed to initialize application:', error);
  }
};

initializeApp();