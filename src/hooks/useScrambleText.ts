import { useEffect, useRef, useState } from 'react';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:<>?';

/**
 * Produces a "scramble text" decryption effect — characters cycle through
 * random glyphs before settling on the final string. Returns the current
 * display text.
 */
export function useScrambleText(
  target: string,
  options?: {
    /** Trigger scramble when this changes */
    trigger?: unknown;
    /** Duration per character in ms (default: 40) */
    speed?: number;
    /** Delay before starting (ms) */
    delay?: number;
    /** Whether the effect should run (default: true) */
    enabled?: boolean;
  }
) {
  const { speed = 40, delay = 0, enabled = true, trigger } = options ?? {};
  const [display, setDisplay] = useState(target);
  const frameRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setDisplay(target);
      return;
    }

    let cancelled = false;
    let resolved = 0;

    const timeout = setTimeout(() => {
      const run = () => {
        if (cancelled) return;
        if (resolved >= target.length) {
          setDisplay(target);
          return;
        }

        const next = target
          .split('')
          .map((char, i) => {
            if (i < resolved) return char;
            if (char === ' ') return ' ';
            return CHARS[Math.floor(Math.random() * CHARS.length)];
          })
          .join('');

        setDisplay(next);
        resolved++;
        frameRef.current = window.setTimeout(run, speed);
      };

      run();
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      clearTimeout(frameRef.current);
    };
  }, [target, speed, delay, enabled, trigger]);

  return display;
}
