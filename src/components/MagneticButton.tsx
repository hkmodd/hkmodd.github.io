import { useRef, type AnchorHTMLAttributes, type ReactNode, type PointerEvent, type MouseEvent } from 'react';


interface MagneticButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children: ReactNode;
  accent: string;
  variant?: 'primary' | 'secondary';
  magneticPull?: number;
}

/** Pointer-driven magnetic pill. Direct style writes, one rAF, no React state. */
export default function MagneticButton({
  children,
  accent,
  variant = 'primary',
  magneticPull = 0.32,
  className = '',
  onMouseEnter,
  onClick,
  href,
  target,
  rel,
  style,
  ...props
}: MagneticButtonProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const raf = useRef(0);
  const pos = useRef({ x: 0, y: 0 });

  const apply = (x: number, y: number) => {
    pos.current = { x, y };
    const el = ref.current;
    const inner = innerRef.current;
    if (!el) return;
    el.style.transition = 'box-shadow 0.25s ease, background 0.25s ease, border-color 0.25s ease';
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.04)`;
    if (inner) {
      inner.style.transition = 'none';
      inner.style.transform = `translate3d(${x * 0.28}px, ${y * 0.28}px, 0)`;
    }
  };

  const rest = () => {
    cancelAnimationFrame(raf.current);
    const el = ref.current;
    const inner = innerRef.current;
    if (!el) return;
    el.style.transition = 'box-shadow 0.25s ease, background 0.25s ease, border-color 0.25s ease, transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)';
    el.style.transform = 'translate3d(0,0,0) scale(1)';
    if (inner) {
      inner.style.transition = 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)';
      inner.style.transform = 'translate3d(0,0,0)';
    }
    pos.current = { x: 0, y: 0 };
  };

  const onPointerMove = (e: PointerEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) * magneticPull;
    const y = (e.clientY - (r.top + r.height / 2)) * magneticPull;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => apply(x, y));
  };

  const isPrimary = variant === 'primary';

  return (
    <a
      ref={ref}
      href={href}
      target={target}
      rel={rel}
      onPointerMove={onPointerMove}
      onPointerLeave={rest}
      onPointerCancel={rest}
      onPointerEnter={(e) => {
        onMouseEnter?.(e as unknown as MouseEvent<HTMLAnchorElement>);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className={`mag-btn relative font-mono text-[10px] sm:text-xs font-extrabold tracking-wider uppercase flex items-center justify-center gap-1.5 px-5 py-2 ${className}`}
      style={{
        color: isPrimary ? '#0a0a0f' : accent,
        border: `2px solid ${accent}`,
        borderRadius: '2px 10px 3px 8px',
        background: isPrimary ? accent : 'transparent',
        boxShadow: `4px 4px 0 ${accent}`,
        transform: 'translateZ(0)',
        transition: 'box-shadow 0.25s ease, transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
        ...style,
      }}
      {...props}
    >
      <span ref={innerRef} className="flex items-center gap-1.5 whitespace-nowrap" style={{ transition: 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)' }}>
        {children}
      </span>
    </a>
  );
}
