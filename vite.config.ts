import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const proxy: Record<string, any> = {};

    if (env.AI_PROXY_TARGET) {
      proxy['/api/gemini-insight'] = {
        target: env.AI_PROXY_TARGET,
        changeOrigin: true,
        secure: false,
      };
    }

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy,
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
