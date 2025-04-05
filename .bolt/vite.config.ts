import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'Trumpillion',
        short_name: 'Trumpillion',
        description: 'Be a Part of History - Create a monumental Trump portrait with a million others',
        theme_color: '#000000',
        background_color: '#ffffff',
        icons: [
          {
            src: 'icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        sourcemap: true
      }
    })
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  define: {
    'global': 'globalThis',
    'process.env': {},
  },
  resolve: {
    alias: {
      stream: 'stream-browserify',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'solana-vendor': [
            '@solana/web3.js',
            '@solana/wallet-adapter-react',
            '@solana/wallet-adapter-base'
          ],
          'ui-vendor': ['framer-motion', 'lucide-react'],
        },
      },
    },
    sourcemap: true,
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    open: true,
  },
  preview: {
    port: 5173,
    strictPort: true,
    host: true,
  }
});