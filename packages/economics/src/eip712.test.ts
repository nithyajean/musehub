import { bytesToHex } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';
import {
  type Voucher,
  type VoucherDomain,
  domainSeparator,
  voucherDigest,
  voucherStructHash,
} from './eip712.js';

// Known answers computed independently with `cast` (Foundry) over the canonical
// Solidity ABI encoding. If the TS encoding matches these, it matches the contract.
const domain: VoucherDomain = {
  chainId: 31337n,
  verifyingContract: '0x2222222222222222222222222222222222222222',
};
const voucher: Voucher = {
  recipient: '0x1111111111111111111111111111111111111111',
  amount: 1_000_000_000_000_000_000n,
  nonce: 7n,
  deadline: 1_893_456_000n,
};

const EXPECTED_DOMAIN = '7ce8479b06c3d00a2ebc9f878f3c73309bb157ef807916017900bacf47ade08a';
const EXPECTED_STRUCT = '094c1a7dff3960c5ebcf3afe1bcc652a48afa162007b73b7ff186aa98e7861ac';
const EXPECTED_DIGEST = 'a1cd6e90735a302dc42bb997ab16f0571434655a302320ab5bf2288947325d94';

describe('EIP-712 hashing matches the Solidity contract', () => {
  it('computes the domain separator cast produces', () => {
    expect(bytesToHex(domainSeparator(domain))).toBe(EXPECTED_DOMAIN);
  });

  it('computes the struct hash cast produces', () => {
    expect(bytesToHex(voucherStructHash(voucher))).toBe(EXPECTED_STRUCT);
  });

  it('computes the digest cast produces', () => {
    expect(bytesToHex(voucherDigest(voucher, domain))).toBe(EXPECTED_DIGEST);
  });

  it('changes the digest when any field changes', () => {
    const base = bytesToHex(voucherDigest(voucher, domain));
    expect(bytesToHex(voucherDigest({ ...voucher, nonce: 8n }, domain))).not.toBe(base);
    expect(bytesToHex(voucherDigest(voucher, { ...domain, chainId: 1n }))).not.toBe(base);
  });
});
