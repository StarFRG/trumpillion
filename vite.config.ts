import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [
      react({
        fastRefresh: true,
        jsxRuntime: 'automatic'
      })
    ],
    define: {
      'process.env': Object.keys(env).reduce((prev, key) => {
        prev[key] = JSON.stringify(env[key]);
        return prev;
      }, {})
    },
    resolve: {
      alias: {
        'cross-fetch': 'cross-fetch/dist/cross-fetch.js'
      }
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      hmr: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
        'Cross-Origin-Resource-Policy': 'cross-origin'
      }
    },
    preview: {
      port: 5173,
      strictPort: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
        'Cross-Origin-Resource-Policy': 'cross-origin'
      }
    },
    build: {
      target: 'esnext',
      sourcemap: true,
      commonjsOptions: {
        transformMixedEsModules: true
      }
    }
  };
});