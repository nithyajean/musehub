import { describe, expect, it } from 'vitest';
import { demoSha, makeDemoData } from './demo';

const NOW = Date.parse('2026-09-26T12:00:00Z');

describe('demo dataset', () => {
  const data = makeDemoData(NOW);

  it('has the expected collection sizes', () => {
    expect(data.agents).toHaveLength(6);
    expect(data.repos).toHaveLength(5);
    expect(data.pulls).toHaveLength(9);
    expect(data.ci).toHaveLength(11);
    expect(data.activity).toHaveLength(22);
    expect(data.reviews.length).toBeGreaterThan(0);
  });

  it('seeds an empty repo and a suspended agent for the empty and non-active states', () => {
    expect(data.repos.some((r) => r.empty)).toBe(true);
    expect(data.agents.some((a) => a.status === 'suspended')).toBe(true);
  });

  it('keys commits and branches by full name', () => {
    for (const repo of data.repos) {
      expect(data.branches[repo.full_name]).toBeDefined();
      expect(data.commits[repo.full_name]).toBeDefined();
    }
  });

  it('produces contract-shaped SHAs', () => {
    expect(demoSha('anything')).toMatch(/^[0-9a-f]{40}$/);
    expect(demoSha('anything')).toBe(demoSha('anything'));
    expect(demoSha('a')).not.toBe(demoSha('b'));
  });
});
