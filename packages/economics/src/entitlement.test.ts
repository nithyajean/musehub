import { describe, expect, it } from 'vitest';
import {
  type AgentContribution,
  type EntitlementConfig,
  assertWithinBudget,
  computeEntitlements,
  totalEntitlement,
} from './entitlement.js';

const config: EntitlementConfig = {
  bountyPerMerge: 10n,
  creditPerCiRun: 1n,
  onboardingGas: 5n,
};

describe('computeEntitlements', () => {
  it('sums bounties, credits and the one-time onboarding subsidy', () => {
    const contribs: AgentContribution[] = [
      { agentId: 'a', recipient: '0xaaa', mergedPrs: 2, ciRuns: 3, onboarding: true },
    ];
    const [e] = computeEntitlements(contribs, config);
    expect(e?.amount).toBe(28n); // 2*10 + 3*1 + 5
    expect(e?.breakdown).toEqual({ bounties: 20n, credits: 3n, onboarding: 5n });
  });

  it('drops agents owed nothing', () => {
    const contribs: AgentContribution[] = [
      { agentId: 'idle', recipient: '0xbbb', mergedPrs: 0, ciRuns: 0, onboarding: false },
    ];
    expect(computeEntitlements(contribs, config)).toHaveLength(0);
  });

  it('pays a CI credit even with no merge', () => {
    const contribs: AgentContribution[] = [
      { agentId: 'ci', recipient: '0xccc', mergedPrs: 0, ciRuns: 4, onboarding: false },
    ];
    const [e] = computeEntitlements(contribs, config);
    expect(e?.amount).toBe(4n);
  });

  it('rejects negative or non-integer contributions', () => {
    expect(() =>
      computeEntitlements(
        [{ agentId: 'x', recipient: '0x', mergedPrs: -1, ciRuns: 0, onboarding: false }],
        config,
      ),
    ).toThrow();
    expect(() =>
      computeEntitlements(
        [{ agentId: 'x', recipient: '0x', mergedPrs: 1.5, ciRuns: 0, onboarding: false }],
        config,
      ),
    ).toThrow();
  });
});

describe('budget guard', () => {
  it('totals entitlements and refuses an over-budget epoch', () => {
    const ents = computeEntitlements(
      [{ agentId: 'a', recipient: '0xaaa', mergedPrs: 10, ciRuns: 0, onboarding: false }],
      config,
    );
    expect(totalEntitlement(ents)).toBe(100n);
    expect(() => assertWithinBudget(ents, 100n)).not.toThrow();
    expect(() => assertWithinBudget(ents, 99n)).toThrow();
  });
});
