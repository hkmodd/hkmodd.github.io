import { useAppStore } from '@/store/useAppStore';

/**
 * One bus. One voice at a time per family.
 * Hover used to fire 2–4 times: CyberCursor mouseover + card mouseenter
 * + mouseout-on-child resetting the hover flag. That is gone.
 */

let audioCtx: AudioContext | null = null;
let master: GainNode | null = null;
let busBound = false;

const HOVER_GAP_MS = 70;
const TYPE_GAP_MS = 36;

let lastHoverAt = 0;
let lastTypeAt = 0;

const INTERACTIVE =
  'a, button, [role="button"], [data-sfx], .holo-card, .dossier-card, .arsenal-card, .btn-cyber, .mag-btn, .cert-tile, .cert-diploma__frame, .chip-3d';

function initAudio(): AudioContext | null {
  if (audioCtx) return audioCtx;
  try {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    master = audioCtx.createGain();
    master.gain.value = 0.85;
    master.connect(audioCtx.destination);
  } catch {
    return null;
  }
  return audioCtx;
}

function dest(): AudioNode | null {
  const ctx = initAudio();
  return ctx && master ? master : null;
}

function muted(): boolean {
  const { reducedMotion, reducedData } = useAppStore.getState();
  return reducedMotion || reducedData;
}

function envelope(gain: GainNode, t: number, peak: number, attack: number, hold: number, release: number) {
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  gain.gain.setValueAtTime(peak, t + attack + hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
}

function tone(
  freq: number,
  type: OscillatorType,
  peak: number,
  attack: number,
  hold: number,
  release: number,
  opts?: { start?: number; slideTo?: number; filter?: number },
) {
  const ctx = initAudio();
  const out = dest();
  if (!ctx || !out) return;
  const t = opts?.start ?? ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (opts?.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + attack + hold + release);

  let node: AudioNode = osc;
  if (opts?.filter) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(opts.filter, t);
    osc.connect(lp);
    node = lp;
  }

  node.connect(gain);
  gain.connect(out);
  envelope(gain, t, peak, attack, hold, release);
  osc.start(t);
  osc.stop(t + attack + hold + release + 0.02);
}

function noiseBurst(peak: number, dur: number, hp: number) {
  const ctx = initAudio();
  const out = dest();
  if (!ctx || !out) return;
  const t = ctx.currentTime;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = hp;
  const gain = ctx.createGain();
  src.connect(filter);
  filter.connect(gain);
  gain.connect(out);
  envelope(gain, t, peak, 0.002, 0.004, dur);
  src.start(t);
  src.stop(t + dur + 0.02);
}

const unlockAudio = () => {
  const ctx = initAudio();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  document.removeEventListener('pointerdown', unlockAudio, true);
};

function interactiveRoot(el: EventTarget | null): HTMLElement | null {
  if (!(el instanceof Element)) return null;
  return el.closest(INTERACTIVE);
}

/** Entering an interactive from outside that same root — never from a child. */
function bindUiBus() {
  if (busBound || typeof document === 'undefined') return;
  busBound = true;

  document.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });

  document.addEventListener(
    'pointerover',
    (e) => {
      const next = interactiveRoot(e.target);
      if (!next) return;
      const prev = interactiveRoot(e.relatedTarget);
      if (prev === next) return;
      sfx.hover();
    },
    { passive: true },
  );

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return;
      if (!interactiveRoot(e.target)) return;
      sfx.confirm();
    },
    { passive: true },
  );
}

export const sfx = {
  hover() {
    if (muted()) return;
    const t = performance.now();
    if (t - lastHoverAt < HOVER_GAP_MS) return;
    lastHoverAt = t;
    // PS2 XMB highlight: dry click + a short rising triangle.
    noiseBurst(0.028, 0.012, 1800);
    tone(880, 'triangle', 0.045, 0.004, 0.012, 0.055, { slideTo: 1320, filter: 3200 });
  },

  confirm() {
    if (muted()) return;
    const ctx = initAudio();
    if (!ctx) return;
    const t = ctx.currentTime;
    // Two-note select, same family as the hover, just fuller.
    noiseBurst(0.02, 0.01, 1200);
    tone(392, 'triangle', 0.055, 0.006, 0.03, 0.08, { start: t, filter: 2400 });
    tone(523.25, 'triangle', 0.05, 0.006, 0.04, 0.1, { start: t + 0.045, filter: 2800 });
  },

  open() {
    if (muted()) return;
    const ctx = initAudio();
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(220, 'triangle', 0.04, 0.01, 0.04, 0.14, { start: t, slideTo: 440, filter: 2000 });
    tone(330, 'sine', 0.03, 0.02, 0.05, 0.16, { start: t + 0.04, filter: 1800 });
  },

  close() {
    if (muted()) return;
    const ctx = initAudio();
    if (!ctx) return;
    tone(520, 'triangle', 0.035, 0.006, 0.02, 0.1, { slideTo: 196, filter: 1600 });
  },

  type() {
    if (muted()) return;
    const t = performance.now();
    if (t - lastTypeAt < TYPE_GAP_MS) return;
    lastTypeAt = t;
    noiseBurst(0.012, 0.008, 2400);
  },

  boot() {
    if (muted()) return;
    const ctx = initAudio();
    if (!ctx) return;
    const t = ctx.currentTime;
    [196, 247, 330, 392].forEach((freq, i) => {
      tone(freq, 'triangle', 0.035, 0.02, 0.06, 0.22, {
        start: t + i * 0.11,
        filter: 1800,
      });
    });
  },

  glitch() {
    if (muted()) return;
    const ctx = initAudio();
    const out = dest();
    if (!ctx || !out) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = Math.tanh(x * 6);
    }
    shaper.curve = curve;
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.42);
    osc.connect(shaper);
    shaper.connect(gain);
    gain.connect(out);
    envelope(gain, t, 0.07, 0.008, 0.08, 0.34);
    osc.start(t);
    osc.stop(t + 0.45);
  },
};

export const playHoverTick = () => sfx.hover();
export const playTypeTick = () => sfx.type();
export const playBootSequence = () => sfx.boot();
export const playGlitchDistortion = () => sfx.glitch();

if (typeof document !== 'undefined') bindUiBus();
