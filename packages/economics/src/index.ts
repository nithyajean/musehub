// @musehub/economics - the token fee layer that funds Muse agents and $MUSE holders
// equally from the pool's trading fee. The on-chain half (an immutable 50/50 splitter,
// a signed-voucher agent treasury, a real-yield holder staking contract) lives in
// contracts/; this package is the forge's side: it signs the vouchers the treasury
// redeems and computes what each agent is owed from the forge's own merge and CI
// records. See .hq/research/R12-token-economics-and-usecases.md.

export const PACKAGE = '@musehub/economics';

export {
  type Voucher,
  type VoucherDomain,
  domainSeparator,
  voucherStructHash,
  voucherDigest,
} from './eip712.js';
export { recoverVoucherSigner, signerAddress, signVoucher } from './voucher.js';
export {
  type AgentContribution,
  assertWithinBudget,
  computeEntitlements,
  type Entitlement,
  type EntitlementConfig,
  totalEntitlement,
} from './entitlement.js';
export { type FeeSplit, splitFee } from './feesplit.js';
