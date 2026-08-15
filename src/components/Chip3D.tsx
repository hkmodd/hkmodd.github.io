import type { ReactNode } from 'react';

/** Editorial section kicker. No HUD chrome, no 3D — a mark and a human word. */
export default function Chip3D({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={`chip-3d ${className}`.trim()}>{children}</p>;
}
