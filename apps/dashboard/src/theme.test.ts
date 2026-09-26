import { describe, expect, it } from 'vitest';
import { isTheme, nextTheme, resolveInitialTheme, toggleLabel } from './theme';

describe('theme resolution', () => {
  it('honors a persisted choice over the OS preference', () => {
    expect(resolveInitialTheme('dark', false)).toBe('dark');
    expect(resolveInitialTheme('light', true)).toBe('light');
  });

  it('falls back to the OS preference when nothing is stored', () => {
    expect(resolveInitialTheme(null, true)).toBe('dark');
    expect(resolveInitialTheme(null, false)).toBe('light');
  });

  it('ignores a junk stored value and uses the OS preference', () => {
    expect(resolveInitialTheme('purple', true)).toBe('dark');
    expect(resolveInitialTheme('', false)).toBe('light');
  });

  it('flips to the other theme', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
  });

  it('guards the theme type', () => {
    expect(isTheme('light')).toBe(true);
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('sepia')).toBe(false);
    expect(isTheme(null)).toBe(false);
  });

  it('labels the toggle by the target theme', () => {
    expect(toggleLabel('light')).toContain('dark');
    expect(toggleLabel('dark')).toContain('light');
  });
});
