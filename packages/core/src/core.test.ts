import { describe, expect, it } from 'vitest';
import { cloneUrl, normalizeRepoSpec } from './index.js';

describe('normalizeRepoSpec', () => {
  it('defaults the owner to the caller for a bare name', () => {
    expect(normalizeRepoSpec('muse-7a2', 'checkout')).toEqual({
      owner: 'muse-7a2',
      name: 'checkout',
      fullName: 'muse-7a2/checkout',
    });
  });

  it('splits an explicit owner/name', () => {
    expect(normalizeRepoSpec('caller', 'other/repo')).toEqual({
      owner: 'other',
      name: 'repo',
      fullName: 'other/repo',
    });
  });
});

describe('cloneUrl', () => {
  it('builds a .git url and tolerates a trailing slash on the base', () => {
    expect(cloneUrl('https://git.musehub.dev/', 'a', 'b')).toBe('https://git.musehub.dev/a/b.git');
    expect(cloneUrl('https://git.musehub.dev', 'a', 'b')).toBe('https://git.musehub.dev/a/b.git');
  });
});
