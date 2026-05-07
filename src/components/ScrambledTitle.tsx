import { useRef } from 'react';
import { useInView } from 'motion/react';
import { useScrambleText } from '@/hooks/useScrambleText';

interface ScrambledTitleProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function ScrambledTitle({ text, className, style }: ScrambledTitleProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  // Trigger scramble every time it comes into view
  const isInView = useInView(ref, { once: false, margin: '-50px' });
  
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
