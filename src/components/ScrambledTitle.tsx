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

  useEffect(() => {
    return observeIntersect(ref.current, setIsInView, { once: true, margin: '-50px' });
  }, []);

  const scrambled = useScrambleText(text, {
    enabled: isInView,
    speed: 30,
  });

  return (
    <span ref={ref} className={className} style={style}>
      {scrambled}
    </span>
  );
}
