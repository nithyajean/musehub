// The 50/50 split, mirrored off-chain for accounting and the dashboard. It matches
// FeeSplitter.sol exactly: the agent side gets floor(amount / 2), the holder side
// gets the rest, so the single odd base unit on an odd amount goes to holders. The
// contract is the source of truth; this is the same arithmetic for display.

export interface FeeSplit {
  agent: bigint;
  holder: bigint;
}

/** Split a claimed fee 50/50. Reverts the mental model of "trust the operator" into
 *  "read the arithmetic": there is no ratio argument, because the split is fixed. */
export function splitFee(amount: bigint): FeeSplit {
  if (amount < 0n) throw new Error('negative amount');
  const agent = amount / 2n;
  return { agent, holder: amount - agent };
}
