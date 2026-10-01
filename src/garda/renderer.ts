/**
 * Renderer del portale.
 *
 * WebGPU dove il browser lo spedisce, WebGL2 dove no: lo decide three, dentro
 * lo stesso `WebGPURenderer`, e il materiale TSL e' uno solo per entrambi.
 *
 * Su Gecko si forza WebGL2. Stessa regola di `src/lib/runtime.ts` (li' c'e'
 * il perche': TSL su WebGPU in Firefox scatta), duplicata qui perche' questo
 * modulo non importa nulla dal portfolio. `?backend=gpu|gl` scavalca la
 * regola: serve a MISURARE i due backend sulla stessa scena.
 */
import * as THREE from 'three/webgpu';

export type Backend = 'webgpu' | 'webgl2';

export interface RendererHandle {
  renderer: THREE.WebGPURenderer;
  backend: Backend;
}

function isGecko(): boolean {
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    return CSS.supports('-moz-appearance', 'none');
  }
  return /Gecko\/|Firefox\//.test(navigator.userAgent);
}

export async function createRenderer(canvas: HTMLCanvasElement): Promise<RendererHandle> {
  const params = new URLSearchParams(window.location.search);
  const forced = params.get('backend');
  const forceWebGL = forced === 'gl' || (forced !== 'gpu' && isGecko());
  // Timestamp query solo su richiesta (`?gputime=1`): costano, e servono a
  // misurare il tempo GPU vero, non la cadenza di requestAnimationFrame.
  const trackTimestamp = params.get('gputime') === '1';

  const renderer = new THREE.WebGPURenderer({
    canvas,
    powerPreference: 'high-performance',
    antialias: true,
    forceWebGL,
    trackTimestamp,
  });
  // Oltre 2x i frammenti in piu' non si vedono e costano il quadruplo.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  // Niente tone mapping: i colori della palette sono gia' quelli da vedere.
  // Una curva in mezzo li sposterebbe e la direzione artistica non sarebbe
  // piu' scritta in `palette.ts` ma nascosta in un operatore.
  renderer.toneMapping = THREE.NoToneMapping;

  await renderer.init();

  const flags = renderer.backend as unknown as { isWebGPUBackend?: boolean };
  return { renderer, backend: flags.isWebGPUBackend ? 'webgpu' : 'webgl2' };
}
