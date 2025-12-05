import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const disableHmr = process.env.VITE_DISABLE_HMR === 'true';
const hmrHost = process.env.VITE_HMR_HOST || 'localhost';
const hmrPort = Number(process.env.VITE_HMR_PORT || 3000);
const useSecureHmr = process.env.VITE_HMR_SECURE === 'true';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: true,
    hmr: disableHmr
      ? false
      : {
          protocol: useSecureHmr ? 'wss' : 'ws',
          host: hmrHost,
          clientPort: hmrPort,
          port: hmrPort,
        },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
