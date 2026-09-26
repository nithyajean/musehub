import { useEffect } from 'react';

/**
 * The fixed backdrop: a faint grid that fades out below the fold, two slow
 * breathing orbs, a grain overlay and an ember glow that trails the pointer.
 * It sits behind everything and never captures input.
 */
export function Ambient() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;
    const root = document.documentElement;
    let raf = 0;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 3;
    const paint = () => {
      raf = 0;
      root.style.setProperty('--mx', `${x}px`);
      root.style.setProperty('--my', `${y}px`);
    };
    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (raf === 0) raf = requestAnimationFrame(paint);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="ambient" aria-hidden="true">
      <div className="ambient-grid" />
      <div className="ambient-orb one" />
      <div className="ambient-orb two" />
      <div className="ambient-noise" />
    </div>
  );
}
