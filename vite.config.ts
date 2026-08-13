import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import wasm from 'vite-plugin-wasm';

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

/**
 * Emit <link rel="preload"> for the latin variable-font woff2 subsets.
 * Discovers hashed assets at build time so the HTML always points at the
 * file Vite actually emitted. In dev, points at the fontsource files.
 */
function fontPreload(): Plugin {
  const candidates = [
    'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
    'node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
  ];

  return {
    name: 'font-preload',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const tags: Array<{
          tag: string;
          attrs: Record<string, string>;
          injectTo: 'head';
        }> = [];

        if (ctx.bundle) {
          for (const file of Object.keys(ctx.bundle)) {
            if (!file.endsWith('.woff2')) continue;
            tags.push({
              tag: 'link',
              attrs: {
                rel: 'preload',
                as: 'font',
                type: 'font/woff2',
                href: `/${file}`.replace(/\/{2,}/g, '/'),
                crossorigin: 'anonymous',
              },
              injectTo: 'head',
            });
          }
          return tags;
        }

        for (const rel of candidates) {
          if (!fs.existsSync(path.resolve(rel))) continue;
          tags.push({
            tag: 'link',
            attrs: {
              rel: 'preload',
              as: 'font',
              type: 'font/woff2',
              href: `/${rel.replace(/\\/g, '/')}`,
              crossorigin: 'anonymous',
            },
            injectTo: 'head',
          });
        }
        return tags;
      },
    },
  };
}

export default defineConfig(() => {
  return {
    base: '/',
    plugins: [wasm(), react(), tailwindcss(), versionJson(), fontPreload()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      target: 'esnext',
      modulePreload: {
        resolveDependencies(filename, deps) {
          return deps.filter(
            (d) =>
              !d.includes('three') &&
              !d.includes('NeuralMesh') &&
              !d.includes('r3f'),
          );
        },
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes('node_modules/motion/') ||
              id.includes('node_modules/framer-motion') ||
              id.includes('node_modules/motion-dom') ||
              id.includes('node_modules/motion-utils')
            ) {
              return 'motion';
            }
            // three core only — WebGPU/TSL stay in the lazy GPU chunk.
            // R3F is left to automatic splitting so React/scheduler is
            // not re-exported through an r3f chunk (that hoists 3D into
            // the entry and modulepreload).
            if (id.includes('node_modules/three')) {
              if (
                id.includes('three/webgpu') ||
                id.includes('three/tsl') ||
                id.includes(`${path.sep}nodes${path.sep}`) ||
                id.includes('/nodes/') ||
                id.includes('three.webgpu') ||
                id.includes('three.tsl')
              ) {
                return undefined;
              }
              return 'three';
            }
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
