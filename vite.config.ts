import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react({
      fastRefresh: true,
      jsxRuntime: 'automatic'
    }),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'Trumpillion',
        short_name: 'Trumpillion',
        description: 'Be a Part of History - Create a monumental Trump portrait with a million others',
        theme_color: '#000000',
        background_color: '#ffffff',
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ],
  define: {
    'process.env': process.env
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    hmr: false,
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', DELETE, 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-application-name', 'Wallet'],
      credentials: true,
      maxAge: 86400
    }
  },
  preview: {
    port: 5173,
    strictPort: true
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    commonjsOptions: {
      transformMixedEsModules: true
    }
  }
});