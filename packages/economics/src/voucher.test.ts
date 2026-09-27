import { describe, expect, it } from 'vitest';
import type { Voucher, VoucherDomain } from './eip712.js';
import { recoverVoucherSigner, signVoucher, signerAddress } from './voucher.js';

// Private key 1 has a well-known secp256k1 address. If keccak, public-key derivation
// and address truncation are all correct, this is the address it produces.
const KEY_ONE = '0x0000000000000000000000000000000000000000000000000000000000000001';
const ADDR_ONE = '0x7e5f4552091a69125d5dfcb7b8c2659029395bdf';

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

describe('signerAddress', () => {
  it('derives the known address for private key 1', () => {
    expect(signerAddress(KEY_ONE)).toBe(ADDR_ONE);
  });
});

describe('signVoucher / recoverVoucherSigner', () => {
  it('round-trips to the signer address', () => {
    const sig = signVoucher(KEY_ONE, voucher, domain);
    expect(sig.length).toBe(132); // 0x + 65 bytes
    expect(recoverVoucherSigner(sig, voucher, domain)?.toLowerCase()).toBe(ADDR_ONE);
  });

  it('does not recover the signer when the voucher is tampered', () => {
    const sig = signVoucher(KEY_ONE, voucher, domain);
    const tampered = { ...voucher, amount: voucher.amount + 1n };
    expect(recoverVoucherSigner(sig, tampered, domain)?.toLowerCase()).not.toBe(ADDR_ONE);
  });

  it('returns null for a malformed signature', () => {
    expect(recoverVoucherSigner('0xdead', voucher, domain)).toBeNull();
    expect(recoverVoucherSigner('not-hex', voucher, domain)).toBeNull();
  });

  it('produces a low-s, v in {27,28} signature', () => {
    const sig = signVoucher(KEY_ONE, voucher, domain);
    const v = Number.parseInt(sig.slice(-2), 16);
    expect(v === 27 || v === 28).toBe(true);
  });
});
