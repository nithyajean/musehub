import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';
import {
  type Secp256k1Recover,
  hashPersonalMessage,
  nobleSecp256k1Recover,
  publicKeyToAddress,
  recoverPersonalSignAddress,
  secp256k1Available,
  splitSignature,
  verifyWalletBinding,
} from './wallet.js';

// Verified vector: the secp256k1 public key for private key = 1 derives to this
// address. keccak-checked against @noble/hashes on 2026-09-26.
const PUBKEY_PRIVKEY1 = hexToBytes(
  `04${'79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'}${'483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8'}`,
);
const ADDR_PRIVKEY1 = '0x7e5f4552091a69125d5dfcb7b8c2659029395bdf';

describe('EVM address derivation', () => {
  it('derives the known address from the 65-byte uncompressed public key', () => {
    expect(publicKeyToAddress(PUBKEY_PRIVKEY1)).toBe(ADDR_PRIVKEY1);
  });

  it('also accepts the 64-byte public key without the 0x04 prefix', () => {
    expect(publicKeyToAddress(PUBKEY_PRIVKEY1.slice(1))).toBe(ADDR_PRIVKEY1);
  });

  it('throws on a public key of the wrong length', () => {
    expect(() => publicKeyToAddress(new Uint8Array(33))).toThrow();
  });
});

describe('EIP-191 personal message hashing', () => {
  it('matches the verified digest for "hello"', () => {
    expect(bytesToHex(hashPersonalMessage('hello'))).toBe(
      '50b2c43fd39106bafbba0da34fc430e1f91e3c96ea2acee2bc34119f92b37750',
    );
  });
});

describe('signature splitting', () => {
  it('normalizes v of 27 and 28 to recovery 0 and 1', () => {
    const rs = '11'.repeat(32) + '22'.repeat(32);
    expect(splitSignature(`0x${rs}1b`)?.recovery).toBe(0);
    expect(splitSignature(`0x${rs}1c`)?.recovery).toBe(1);
  });

  it('accepts raw recovery bits 0 and 1', () => {
    const rs = '11'.repeat(32) + '22'.repeat(32);
    expect(splitSignature(`0x${rs}00`)?.recovery).toBe(0);
    expect(splitSignature(`0x${rs}01`)?.recovery).toBe(1);
  });

  it('returns null for a signature of the wrong length', () => {
    expect(splitSignature('0xabcd')).toBeNull();
  });

  it('returns null for non-hex input', () => {
    expect(splitSignature('0xzzzz')).toBeNull();
  });
});

describe('wallet binding with an injected recover function', () => {
  it('verifies a binding when the recovered address matches, and passes the right recovery bit', () => {
    let seenRecovery = -1;
    const fakeRecover: Secp256k1Recover = (_digest, _sig, recovery) => {
      seenRecovery = recovery;
      return PUBKEY_PRIVKEY1;
    };
    const rs = '11'.repeat(32) + '22'.repeat(32);
    const sig = `0x${rs}1b`; // v = 27
    expect(verifyWalletBinding('bind nonce', sig, ADDR_PRIVKEY1, fakeRecover)).toBe(true);
    expect(seenRecovery).toBe(0);
  });

  it('is case-insensitive on the expected address', () => {
    const fakeRecover: Secp256k1Recover = () => PUBKEY_PRIVKEY1;
    const rs = '11'.repeat(32) + '22'.repeat(32);
    expect(
      verifyWalletBinding('bind nonce', `0x${rs}1b`, ADDR_PRIVKEY1.toUpperCase(), fakeRecover),
    ).toBe(true);
  });

  it('rejects a binding when the recovered address differs', () => {
    const fakeRecover: Secp256k1Recover = () => PUBKEY_PRIVKEY1;
    const rs = '11'.repeat(32) + '22'.repeat(32);
    const other = '0x0000000000000000000000000000000000000001';
    expect(verifyWalletBinding('bind nonce', `0x${rs}1b`, other, fakeRecover)).toBe(false);
  });

  it('returns null from recover for a malformed signature', () => {
    const fakeRecover: Secp256k1Recover = () => PUBKEY_PRIVKEY1;
    expect(recoverPersonalSignAddress('bind nonce', '0xdead', fakeRecover)).toBeNull();
  });
});

// The real curve round-trip runs only when @noble/curves is installed. It is a
// declared dependency wired at composition; this package stays green without it.
const HAS_CURVES = await secp256k1Available();

describe('real secp256k1 recovery', () => {
  it.skipIf(!HAS_CURVES)(
    'recovers the signing address end to end (needs @noble/curves)',
    async () => {
      const spec = '@noble/curves/secp256k1';
      const { secp256k1 } = (await import(/* @vite-ignore */ spec)) as {
        secp256k1: {
          utils: { randomPrivateKey(): Uint8Array };
          getPublicKey(key: Uint8Array, compressed: boolean): Uint8Array;
          sign(
            digest: Uint8Array,
            key: Uint8Array,
          ): { toCompactRawBytes(): Uint8Array; recovery: number };
        };
      };
      const priv = secp256k1.utils.randomPrivateKey();
      const expected = publicKeyToAddress(secp256k1.getPublicKey(priv, false));
      const message = 'bind wallet nonce 123';
      const sig = secp256k1.sign(hashPersonalMessage(message), priv);
      const v = (27 + sig.recovery).toString(16).padStart(2, '0');
      const sigHex = `0x${bytesToHex(sig.toCompactRawBytes())}${v}`;
      const recover = await nobleSecp256k1Recover();
      expect(verifyWalletBinding(message, sigHex, expected, recover)).toBe(true);
    },
  );
});
