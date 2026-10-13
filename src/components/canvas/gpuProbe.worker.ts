/* ═══════════════════════════════════════════════════════════════════
   GPU PROBE WORKER — "is there a WebGPU adapter?" answered off the main
   thread.

   The first WebGPU touch in a context waits, synchronously, on the GPU
   process bringing WebGPU up: ~70 ms of main thread on a cold start,
   right after first paint. Here it blocks nobody, and it leaves the GPU
   process warm for the renderer that asks again on the main thread.

   Posts true/false, or null when this worker has no WebGPU at all (the
   main thread then probes itself).
   ═══════════════════════════════════════════════════════════════════ */

const gpu = (self.navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;

(gpu ? gpu.requestAdapter().then((a) => !!a, () => false) : Promise.resolve(null)).then((ok) =>
  self.postMessage(ok),
);
