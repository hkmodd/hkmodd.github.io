import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

/**
 * FPS → device-pixel-ratio governor.
 * Replaces @react-three/drei PerformanceMonitor: same decline / incline /
 * flipflop-fallback contract, zero extra dependency weight.
 *
 * Samples rAF deltas over a 1s window. Below 48 fps → onDecline.
 * Above 56 fps → onIncline. After `flipflops` declines → onFallback.
 *
 * Declines are cumulative for the session and the fallback is permanent, so
 * only frames that say something about sustained throughput may count:
 *  • the first windows after mount are skipped — that is pipeline
 *    compilation behind the lock screen, not this device's frame rate;
 *  • a single frame longer than PAUSE_S restarts the window — a hidden tab,
 *    a GC or a theme swap is a pause, not a framerate.
 * Without this, three such hiccups pinned a Retina background to 1× for good.
 */
const WARMUP_WINDOWS = 2;
const PAUSE_S = 0.5;

interface DprGovernorProps {
  onDecline: () => void;
  onIncline: () => void;
  onFallback: () => void;
  flipflops?: number;
}

export default function DprGovernor({
  onDecline,
  onIncline,
  onFallback,
  flipflops = 3,
}: DprGovernorProps) {
  const frames = useRef(0);
  const acc = useRef(0);
  const declines = useRef(0);
  const locked = useRef(false);
  const warmup = useRef(WARMUP_WINDOWS);

  useFrame((_, dt) => {
    if (locked.current) return;
    if (dt > PAUSE_S) {
      frames.current = 0;
      acc.current = 0;
      return;
    }
    frames.current += 1;
    acc.current += dt;
    if (acc.current < 1) return;

    const fps = frames.current / acc.current;
    frames.current = 0;
    acc.current = 0;
    if (warmup.current > 0) {
      warmup.current -= 1;
      return;
    }

    if (fps < 48) {
      declines.current += 1;
      onDecline();
      if (declines.current >= flipflops) {
        locked.current = true;
        onFallback();
      }
    } else if (fps > 56) {
      onIncline();
    }
  });

  return null;
}
