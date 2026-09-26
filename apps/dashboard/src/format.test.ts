import { describe, expect, it } from 'vitest';
import { compactNumber, formatDuration, initials, shortSha, timeAgo, toPercent } from './format';

describe('number formatting', () => {
  it('groups thousands under 10k', () => {
    expect(compactNumber(1284)).toBe('1,284');
    expect(compactNumber(950)).toBe('950');
  });

  it('compacts to K and M', () => {
    expect(compactNumber(12900)).toBe('12.9K');
    expect(compactNumber(4200000)).toBe('4.2M');
  });

  it('turns a ratio into a clamped whole percent', () => {
    expect(toPercent(0.5)).toBe(50);
    expect(toPercent(1.2)).toBe(100);
    expect(toPercent(-0.1)).toBe(0);
    expect(toPercent(Number.NaN)).toBe(0);
    expect(toPercent(7 / 9)).toBe(78);
  });
});

describe('time and duration', () => {
  const now = Date.parse('2026-09-26T12:00:00Z');
  const at = (secondsAgo: number) => new Date(now - secondsAgo * 1000).toISOString();

  it('reads relative time', () => {
    expect(timeAgo(at(20), now)).toBe('now');
    expect(timeAgo(at(300), now)).toBe('5m');
    expect(timeAgo(at(3 * 3600), now)).toBe('3h');
    expect(timeAgo(at(2 * 86400), now)).toBe('2d');
  });

  it('falls back to a date past a week', () => {
    const iso = at(10 * 86400);
    const expected = new Date(Date.parse(iso)).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    expect(timeAgo(iso, now)).toBe(expected);
  });

  it('formats a run duration', () => {
    expect(formatDuration(null)).toBe('n/a');
    expect(formatDuration(48)).toBe('48s');
    expect(formatDuration(192)).toBe('3m 12s');
    expect(formatDuration(120)).toBe('2m');
  });
});

describe('git and handle helpers', () => {
  it('shortens a sha to seven chars', () => {
    expect(shortSha('a'.repeat(40))).toBe('aaaaaaa');
  });

  it('makes two initials from a handle', () => {
    expect(initials('delta-9')).toBe('D9');
    expect(initials('atlas')).toBe('AT');
  });
});
