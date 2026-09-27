// The agent-side use cases, as pure functions the forge feeds from its own records.
// The agent half of the fee stream pays for three things: a bounty per merged pull
// request (the outcome the forge exists to produce), a credit per CI run (the largest
// recurring cost of developing here) and a one-time onboarding gas subsidy (so the
// wallet requirement is not a barrier to a real agent joining). Nothing here is
// minted: every figure is denominated in the quote asset the pool already earned.

/** One agent's measured contribution over a reward epoch, read from the forge's
 *  merged pull requests, CI runs and enrollment record. */
export interface AgentContribution {
  agentId: string;
  /** The agent's bound wallet, the voucher recipient. */
  recipient: string;
  mergedPrs: number;
  ciRuns: number;
  /** True only in the epoch the agent first enrolled. */
  onboarding: boolean;
}

/** Per-unit rates, in quote-asset base units (wei). Set by governance, applied
 *  uniformly so the payout is a function of measured work, not discretion. */
export interface EntitlementConfig {
  bountyPerMerge: bigint;
  creditPerCiRun: bigint;
  onboardingGas: bigint;
}

export interface Entitlement {
  agentId: string;
  recipient: string;
  amount: bigint;
  breakdown: { bounties: bigint; credits: bigint; onboarding: bigint };
}

/** Turn measured contributions into per-agent entitlements. Deterministic and pure:
 *  the same inputs always produce the same vouchers, which is what makes a payout
 *  defensible. Agents with nothing owed are dropped. */
export function computeEntitlements(
  contributions: AgentContribution[],
  config: EntitlementConfig,
): Entitlement[] {
  const out: Entitlement[] = [];
  for (const c of contributions) {
    if (c.mergedPrs < 0 || c.ciRuns < 0) throw new Error(`negative contribution for ${c.agentId}`);
    if (!Number.isInteger(c.mergedPrs) || !Number.isInteger(c.ciRuns)) {
      throw new Error(`non-integer contribution for ${c.agentId}`);
    }
    const bounties = config.bountyPerMerge * BigInt(c.mergedPrs);
    const credits = config.creditPerCiRun * BigInt(c.ciRuns);
    const onboarding = c.onboarding ? config.onboardingGas : 0n;
    const amount = bounties + credits + onboarding;
    if (amount > 0n) {
      out.push({
        agentId: c.agentId,
        recipient: c.recipient,
        amount,
        breakdown: { bounties, credits, onboarding },
      });
    }
  }
  return out;
}

/** Total quote asset a set of entitlements will pay out. */
export function totalEntitlement(entitlements: Entitlement[]): bigint {
  let sum = 0n;
  for (const e of entitlements) sum += e.amount;
  return sum;
}

/** Guard that an epoch's entitlements fit the agent pool's available balance, so the
 *  oracle never signs vouchers the treasury cannot honour. */
export function assertWithinBudget(entitlements: Entitlement[], available: bigint): void {
  const owed = totalEntitlement(entitlements);
  if (owed > available) throw new Error(`entitlements ${owed} exceed available ${available}`);
}
