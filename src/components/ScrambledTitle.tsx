import { useRef, useState, useEffect } from 'react';
import { useScrambleText } from '@/hooks/useScrambleText';
import { observeIntersect } from '@/hooks/useReveal';

interface ScrambledTitleProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function ScrambledTitle({ text, className, style }: ScrambledTitleProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [wave, setWave] = useState(0);

  useEffect(() => {
    return observeIntersect(
      ref.current,
      (visible) => {
        setIsInView(visible);
        if (visible) setWave((n) => n + 1);
      },
      { once: false, margin: '-80px 0px' },
    );
  }, []);

  const scrambled = useScrambleText(text, {
    enabled: isInView,
    trigger: wave,
    speed: 30,
  });

  return (
    <span ref={ref} className={className} style={style}>
      {scrambled}
    </span>
  );
}
