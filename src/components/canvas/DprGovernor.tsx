import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

/**
 * FPS → device-pixel-ratio governor.
 * Replaces @react-three/drei PerformanceMonitor: same decline / incline /
 * flipflop-fallback contract, zero extra dependency weight.
 *
 * Samples rAF deltas over a 1s window. Below 48 fps → onDecline.
 * Above 56 fps → onIncline. After `flipflops` declines → onFallback.
 */
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

  useFrame((_, dt) => {
    if (locked.current) return;
    frames.current += 1;
    acc.current += dt;
    if (acc.current < 1) return;

    const fps = frames.current / acc.current;
    frames.current = 0;
    acc.current = 0;

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
