import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import os from 'os';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    cacheDir: path.join(os.tmpdir(), 'vite-vietnhatipt-cache'),
    optimizeDeps: {
      include: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react', 'motion/react', 'recharts'],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      // Port/clientPort are configured in server.ts (middlewareMode + hmr.server).
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      // Ignore editor/agent temp dirs (e.g. `.File.tsx.<pid>.<uuid>.tmpdir`) that vanish mid-watch and crash with EBUSY on Windows.
      watch: process.env.DISABLE_HMR === 'true' ? null : { ignored: ['**/*.tmpdir/**', '**/*.tmp'] },
    },
  };
});
