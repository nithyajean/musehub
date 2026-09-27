import { describe, expect, it } from 'vitest';
import { splitFee } from './feesplit.js';

describe('splitFee', () => {
  it('splits an even amount in half', () => {
    expect(splitFee(100n)).toEqual({ agent: 50n, holder: 50n });
  });

  it('gives the odd base unit to the holder side, matching the contract', () => {
    expect(splitFee(101n)).toEqual({ agent: 50n, holder: 51n });
  });

  it('handles zero', () => {
    expect(splitFee(0n)).toEqual({ agent: 0n, holder: 0n });
  });

  it('always sums back to the input', () => {
    for (const n of [1n, 2n, 999n, 1_000_000_000_000_000_001n]) {
      const s = splitFee(n);
      expect(s.agent + s.holder).toBe(n);
    }
  });

  it('rejects a negative amount', () => {
    expect(() => splitFee(-1n)).toThrow();
  });
});
