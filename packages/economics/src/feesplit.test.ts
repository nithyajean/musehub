import { describe, expect, it } from 'vitest';
import { MAX_OWNER_BPS, splitFee } from './feesplit.js';

describe('splitFee', () => {
  it('splits evenly when the owner share is zero', () => {
    expect(splitFee(100n, 0n)).toEqual({ owner: 0n, agent: 50n, holder: 50n });
  });

  it('takes 0.15% off the top then splits the rest evenly', () => {
    expect(splitFee(100_000_000_000_000_000_000n, 15n)).toEqual({
      owner: 150_000_000_000_000_000n, // 0.15e18
      agent: 49_925_000_000_000_000_000n, // 49.925e18
      holder: 49_925_000_000_000_000_000n,
    });
  });

  it('gives the odd base unit to the holder side, matching the contract', () => {
    expect(splitFee(101n, 0n)).toEqual({ owner: 0n, agent: 50n, holder: 51n });
  });

  it('always sums back to the input', () => {
    for (const n of [1n, 2n, 999n, 1_000_000_000_000_000_001n]) {
      const s = splitFee(n, 15n);
      expect(s.owner + s.agent + s.holder).toBe(n);
    }
  });

  it('keeps agents and holders equal on an even remainder', () => {
    const s = splitFee(1_000_000n, 15n);
    expect(s.agent).toBe(s.holder);
  });

  it('rejects a negative amount', () => {
    expect(() => splitFee(-1n, 15n)).toThrow();
  });

  it('rejects an owner share above the cap', () => {
    expect(() => splitFee(100n, MAX_OWNER_BPS + 1n)).toThrow();
  });
});
