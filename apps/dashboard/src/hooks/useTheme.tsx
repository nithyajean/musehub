import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { THEME_STORAGE_KEY, type Theme, nextTheme, resolveInitialTheme } from '../theme';

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function currentDomTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark' || attr === 'light') return attr;
  const prefersDark = window.matchMedia('(prefers-color-scheme:dark)').matches;
  return resolveInitialTheme(null, prefersDark);
}

/** Owns the theme, keeps <html data-theme> and localStorage in sync with state. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document === 'undefined' ? 'light' : currentDomTheme(),
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // storage can be blocked (private mode); the attribute is what matters
    }
  }, [theme]);

  const value: ThemeContextValue = { theme, toggle: () => setTheme((t) => nextTheme(t)) };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
