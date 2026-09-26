// Theme resolution. Pure functions with no DOM access so they unit-test in a
// node env. The DOM side lives in hooks/useTheme.tsx. The storage key here must
// match the inline script in index.html.

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'musehub-theme';

/** Is a string one of our known themes? */
export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/**
 * First-paint theme: a persisted choice wins, else the OS preference. This is the
 * same rule the inline head script runs, kept here so React state agrees with what
 * the script already painted.
 */
export function resolveInitialTheme(stored: string | null, prefersDark: boolean): Theme {
  if (isTheme(stored)) return stored;
  return prefersDark ? 'dark' : 'light';
}

/** The theme a toggle flips to. */
export function nextTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark';
}

/** Label for the control that switches to the other theme. */
export function toggleLabel(current: Theme): string {
  return current === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
}
