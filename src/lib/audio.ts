import { useAppStore } from '@/store/useAppStore';

// Singleton AudioContext
let audioCtx: AudioContext | null = null;

// Initialize on first user interaction to bypass browser autoplay policies
const initAudio = () => {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return audioCtx;
};

// Eagerly unlock audio on first interaction (Crucial for iOS Safari / Mobile)
const unlockAudio = () => {
  try {
    const ctx = initAudio();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    // Play a silent buffer to truly unlock Safari's audio engine
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);

    // Clean up listeners once unlocked
    document.removeEventListener('touchstart', unlockAudio, true);
    document.removeEventListener('pointerdown', unlockAudio, true);
    document.removeEventListener('click', unlockAudio, true);
  } catch (e) {
    // Ignore errors
  }
};

if (typeof document !== 'undefined') {
  document.addEventListener('touchstart', unlockAudio, { capture: true, passive: true });
  document.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
  document.addEventListener('click', unlockAudio, { capture: true, passive: true });
}

// Safe play wrapper checking reducedMotion
const playSynth = (callback: (ctx: AudioContext, masterGain: GainNode) => void) => {
  const { reducedMotion } = useAppStore.getState();
  if (reducedMotion) return; // Mute all synth if reduced motion is active
  
  const ctx = initAudio();
  if (!ctx) return;
  
  // If we are still suspended (e.g. BootScreen played without interaction), try to resume
  // It might fail on mobile, but that's expected and avoids throwing errors.
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  callback(ctx, masterGain);
};

// 1. Hover Tick - A very short, high frequency ping
export const playHoverTick = () => {
  playSynth((ctx, masterGain) => {
    masterGain.gain.value = 0.015; // Very low volume
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1800, ctx.currentTime + 0.03);
    
    osc.connect(masterGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.03);
  });
};

// 2. Boot Sequence - A rising techy chord
export const playBootSequence = () => {
  playSynth((ctx, masterGain) => {
    masterGain.gain.value = 0.04;
    
    // Play 3 rapid chords
    [220, 330, 440].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
      
      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0, ctx.currentTime + i * 0.15);
      oscGain.gain.linearRampToValueAtTime(1, ctx.currentTime + i * 0.15 + 0.05);
      oscGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.3);
      
      osc.connect(oscGain);
      oscGain.connect(masterGain);
      
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.3);
    });
  });
};

// 3. Glitch / Red Team Transition - Aggressive, distorted drop
export const playGlitchDistortion = () => {
  playSynth((ctx, masterGain) => {
    masterGain.gain.value = 0.06;
    
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.5);
    
    // Simple distortion curve
    const waveShaper = ctx.createWaveShaper();
    const curve = new Float32Array(4096);
    for (let i = 0; i < 4096; i++) {
      const x = (i * 2) / 4096 - 1;
      curve[i] = (3 + 20) * x * 20 * (Math.PI / 180) / (Math.PI + 20 * Math.abs(x));
    }
    waveShaper.curve = curve;
    waveShaper.oversample = '4x';
    
    osc.connect(waveShaper);
    waveShaper.connect(masterGain);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  });
};

// 4. Typing Tick for ScrambleText
export const playTypeTick = () => {
  playSynth((ctx, masterGain) => {
    masterGain.gain.value = 0.005; // Even quieter
    const osc = ctx.createOscillator();
    osc.type = 'square';
    // Randomize frequency slightly for mechanical feel
    const freq = 600 + Math.random() * 200;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    
    osc.connect(masterGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.015);
  });
};
