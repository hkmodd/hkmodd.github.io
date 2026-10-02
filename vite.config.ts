import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import wasm from 'vite-plugin-wasm';

/** One id per build. Baked into the bundle (`__BUILD_VERSION__`) AND written
    to version.json, so the running page can ask "is the server newer than
    the code I am executing?" — not "newer than what I saw last visit". */
const BUILD_VERSION = crypto.randomBytes(8).toString('hex');

/** Generates version.json in the build output for cache-busting. */
function versionJson(): Plugin {
  return {
    name: 'version-json',
    writeBundle(options) {
      const outDir = options.dir ?? 'dist';
      const version = {
        version: BUILD_VERSION,
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
            // Latin only. The bundle also holds the cyrillic/greek/vietnamese/
            // latin-ext subsets the Garda page pulls in through the full
            // fontsource import; preloading those forced ~44 KB of fonts no
            // page renders into the portfolio's critical path.
            if (!/-latin-wght-normal-[\w-]+\.woff2$/.test(file)) continue;
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
    define: {
      __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      target: 'esnext',
      // Il portale Garda e' una pagina a se'. Entry separata, non lazy chunk
      // del portfolio: cosi' il grafo dei moduli e' fisicamente disgiunto e
      // "il portfolio non si porta dietro un byte del gioco" e' verificabile
      // guardando il bundle, non promesso a parole.
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
        input: {
          main: path.resolve(import.meta.dirname, 'index.html'),
          garda: path.resolve(import.meta.dirname, 'garda.html'),
        },
        output: {
          // Native Rolldown groups, not the `manualChunks` shim. Under the
          // shim a group captures its modules' dependencies too, in an order
          // we do not control: `motion` swallowed React, so the entry could
          // never load without the animation library. Priorities settle who
          // owns a shared module — React first, always.
          codeSplitting: {
            groups: [
              {
                name: 'react',
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                priority: 30,
              },
              {
                name: 'motion',
                test: /node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/,
                priority: 20,
              },
              {
                // three core only — WebGPU/TSL stay in the lazy GPU chunk.
                // three/examples (GLTFLoader, DRACOLoader, Sky…) li usa solo il
                // portale Garda. Lasciandoli cadere nel chunk `three` finivano
                // dentro il bundle che carica anche il portfolio: misurato, il
                // chunk condiviso si portava dietro il loader glTF e gli URL
                // degli asset Draco. Restano col loro importatore.
                name: 'three',
                priority: 10,
                test: (id) =>
                  /node_modules[\\/]three[\\/]/.test(id) &&
                  !/examples[\\/]jsm/.test(id) &&
                  !/three[\\/](webgpu|tsl)|[\\/]nodes[\\/]|three\.(webgpu|tsl)/.test(id),
              },
            ],
          },
        },
      },
    },
    optimizeDeps: {
      // Rapier importa il proprio .wasm come modulo ESM: il prebundle di Vite
      // lo romperebbe. Lo gestisce vite-plugin-wasm, gia' nella lista plugin.
      exclude: ['neural-engine', '@dimforge/rapier3d-simd'],
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
