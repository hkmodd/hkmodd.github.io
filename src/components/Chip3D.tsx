import type { ReactNode } from 'react';
import { useHolographicTilt } from '@/hooks/useHolographicTilt';

/** 3D section chip — punk ink, holographic volume. Desktop tilt only. */
export default function Chip3D({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const { ref, onMouseMove, onMouseLeave } = useHolographicTilt<HTMLDivElement>(10);
  return (
    <div
      ref={ref}
      className={`chip-3d ${className}`.trim()}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );
}
