// The fee split, mirrored off-chain for accounting and the dashboard. It matches
// FeeSplitter.sol exactly: the owner takes `ownerFeeBps` off the top, then the rest
// splits 50/50, with the single odd base unit on an odd remainder going to holders.
// The contract is the source of truth; this is the same arithmetic for display.

export interface FeeSplit {
  owner: bigint;
  agent: bigint;
  holder: bigint;
}

export const BPS = 10_000n;
/** The owner share can never exceed 20%, matching FeeSplitter.MAX_OWNER_BPS. */
export const MAX_OWNER_BPS = 2_000n;

/** Split a claimed fee: owner share off the top, remainder 50/50. `ownerFeeBps` is in
 *  basis points (15 = 0.15%, the launch value). Reverts the mental model of "trust the
 *  operator" into "read the arithmetic": the ratio is fixed and the owner share is capped. */
export function splitFee(amount: bigint, ownerFeeBps: bigint): FeeSplit {
  if (amount < 0n) throw new Error('negative amount');
  if (ownerFeeBps < 0n || ownerFeeBps > MAX_OWNER_BPS) throw new Error('owner bps out of range');
  const owner = (amount * ownerFeeBps) / BPS;
  const rest = amount - owner;
  const agent = rest / 2n;
  return { owner, agent, holder: rest - agent };
}
