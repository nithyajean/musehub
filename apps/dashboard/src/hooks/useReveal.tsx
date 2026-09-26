import { type CSSProperties, type ElementType, type ReactNode, useEffect, useRef } from 'react';

/**
 * Reveal-on-scroll. A wrapper that starts translucent and slides up once it
 * enters the viewport, then stays. Purely decorative: under
 * prefers-reduced-motion the stylesheet renders it visible from the start,
 * and if IntersectionObserver is missing it shows at once.
 */
export function Reveal({
  as: Tag = 'div',
  children,
  className,
  delay = 0,
  scale = false,
  id,
  style,
}: {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  /** Stagger offset in ms. */
  delay?: number;
  scale?: boolean;
  id?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-in');
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add('is-in');
            io.disconnect();
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const classes = ['reveal', scale ? 'reveal-scale' : '', className ?? ''].join(' ').trim();
  const vars = { ...style, '--d': `${delay}ms` } as CSSProperties;
  return (
    <Tag ref={ref} id={id} className={classes} style={vars}>
      {children}
    </Tag>
  );
}
