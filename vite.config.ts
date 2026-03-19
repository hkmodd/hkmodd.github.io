import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

/** Generates version.json in the build output for cache-busting. */
function versionJson(): Plugin {
  return {
    name: 'version-json',
    writeBundle(options) {
      const outDir = options.dir ?? 'dist';
      const version = {
        version: crypto.randomBytes(8).toString('hex'),
        buildTime: new Date().toISOString(),
      };
      fs.writeFileSync(
        path.resolve(outDir, 'version.json'),
        JSON.stringify(version),
      );
    },
  };
}

export default defineConfig(() => {
  return {
    base: '/',
    plugins: [wasm(), topLevelAwait(), react(), tailwindcss(), versionJson()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      target: 'esnext',
      rollupOptions: {
        output: {
          manualChunks: {
            three: ['three', '@react-three/fiber', '@react-three/drei'],
            motion: ['motion'],
          },
        },
      },
    },
    optimizeDeps: {
      exclude: ['neural-engine'],
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
      },
    },
  };
});

