import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WalletContextProvider } from './components/WalletProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App';
import './i18n';
import './index.css';

// Polyfills for Metaplex
import { Buffer } from 'buffer';
import stream from 'stream-browserify';

window.global = window;
window.global ||= window;
(window as any).Buffer = Buffer;
(window as any).process = { env: {} };
(window as any).stream = stream;

// Register Service Worker
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', { 
      scope: '/' 
    }).then(registration => {
      console.log('SW registered:', registration);
    }).catch(error => {
      console.error('SW registration failed:', error);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <WalletContextProvider>
        <App />
      </WalletContextProvider>
    </ErrorBoundary>
  </StrictMode>
);