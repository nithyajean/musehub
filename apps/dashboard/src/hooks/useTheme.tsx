import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { THEME_STORAGE_KEY, type Theme, nextTheme, resolveInitialTheme } from '../theme';

interface ThemeContextValue {
  theme: Theme;
  /** Flip the theme. Pass the triggering event so the iris transition can
   * originate from the control that was pressed. */
  toggle: (origin?: { clientX: number; clientY: number }) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function currentDomTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark' || attr === 'light') return attr;
  const prefersDark = window.matchMedia('(prefers-color-scheme:dark)').matches;
  return resolveInitialTheme(null, prefersDark);
}

type DocWithVT = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

/** Owns the theme, keeps <html data-theme> and localStorage in sync with state.
 * When the browser supports view transitions and the viewer has not asked for
 * reduced motion, the new theme irises out from the toggle. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document === 'undefined' ? 'light' : currentDomTheme(),
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Follow the OS light/dark setting live until the viewer picks one explicitly.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(THEME_STORAGE_KEY);
      } catch {
        // storage blocked; keep following the OS
      }
      if (stored === null) setTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const persist = (t: Theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      // storage can be blocked (private mode); the attribute is what matters
    }
    return t;
  };

  const toggle = (origin?: { clientX: number; clientY: number }) => {
    const doc = document as DocWithVT;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof doc.startViewTransition !== 'function' || reduce) {
      setTheme((t) => persist(nextTheme(t)));
      return;
    }
    const x = origin?.clientX ?? window.innerWidth - 80;
    const y = origin?.clientY ?? 32;
    document.documentElement.style.setProperty('--vt-x', `${x}px`);
    document.documentElement.style.setProperty('--vt-y', `${y}px`);
    doc.startViewTransition(() => {
      flushSync(() => setTheme((t) => persist(nextTheme(t))));
    });
  };

  const value: ThemeContextValue = { theme, toggle };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
