import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Cross-platform WASM build (Ubuntu CI + Windows). Sets SIMD128 via env. */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wasmDir = path.join(root, 'wasm');
const outDir = path.join(root, 'src', 'wasm', 'pkg');

console.log('Building WASM neural engine (simd128)...');

const result = spawnSync(
  'wasm-pack',
  ['build', '--target', 'web', '--out-dir', outDir, '--release'],
  {
    cwd: wasmDir,
    env: { ...process.env, RUSTFLAGS: '-C target-feature=+simd128' },
    stdio: 'inherit',
    shell: true,
  },
);

if (result.status !== 0) {
  console.error('wasm-pack build failed');
  process.exit(result.status ?? 1);
}

console.log('WASM build complete (simd128).');
