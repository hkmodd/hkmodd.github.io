import { useRef, useState, MouseEvent } from 'react';
import { motion } from 'motion/react';
import { playHoverTick } from '@/lib/audio';

import type { HTMLMotionProps } from 'motion/react';

interface MagneticButtonProps extends HTMLMotionProps<"a"> {
  children: React.ReactNode;
  accent: string;
  variant?: 'primary' | 'secondary';
  magneticPull?: number;
}

export default function MagneticButton({ 
  children, 
  accent, 
  variant = 'primary', 
  magneticPull = 0.3,
  className = '',
  onMouseEnter,
  onClick,
  href,
  target,
  rel,
  ...props 
}: MagneticButtonProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!ref.current) return;
    const { clientX, clientY } = e;
    const { width, height, left, top } = ref.current.getBoundingClientRect();
    const centerX = left + width / 2;
    const centerY = top + height / 2;
    
    // Magnetic pull: distance from center * pull factor
    const x = (clientX - centerX) * magneticPull;
    const y = (clientY - centerY) * magneticPull;
    
    setPosition({ x, y });
  };

  const handleMouseLeave = () => {
    setPosition({ x: 0, y: 0 });
  };

  const handleMouseEnter = (e: MouseEvent<HTMLAnchorElement>) => {
    playHoverTick();
    if (onMouseEnter) onMouseEnter(e);
  };

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
    if (onClick) onClick(e);
  };

  const isPrimary = variant === 'primary';

  return (
    <motion.a
      ref={ref}
      href={href}
      target={target}
      rel={rel}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={handleMouseEnter}
      onClick={handleClick}
      animate={{ x: position.x, y: position.y }}
      transition={{ type: 'spring', stiffness: 150, damping: 15, mass: 0.1 }}
      className={`relative overflow-hidden font-mono text-[10px] sm:text-xs tracking-widest uppercase flex items-center justify-center gap-1.5 px-5 py-2 rounded-full transition-all duration-300 backdrop-blur-md ${className}`}
      style={{
        color: isPrimary ? '#fff' : accent,
        border: `1px solid ${isPrimary ? accent : `${accent}40`}`,
        background: isPrimary ? `${accent}40` : `transparent`,
        boxShadow: isPrimary ? `0 0 20px ${accent}20, inset 0 0 10px ${accent}20` : 'none',
        textShadow: isPrimary ? '0 1px 4px rgba(0,0,0,0.8)' : 'none',
      }}
      whileHover={{ 
        background: isPrimary ? `${accent}80` : `${accent}15`,
        boxShadow: isPrimary ? `0 0 30px ${accent}40, inset 0 0 15px ${accent}40` : `0 0 15px ${accent}20`,
        scale: 1.05
      }}
      whileTap={{ scale: 0.95 }}
      {...props}
    >
      <motion.span 
        animate={{ x: position.x * 0.3, y: position.y * 0.3 }}
        transition={{ type: 'spring', stiffness: 150, damping: 15, mass: 0.1 }}
        className="flex items-center gap-1.5 whitespace-nowrap"
      >
        {children}
      </motion.span>
    </motion.a>
  );
}
