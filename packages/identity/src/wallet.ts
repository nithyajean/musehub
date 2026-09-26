// Optional wallet binding (research R2, gate layer L2, anti-sybil).
//
// An EVM address is a stable, portable, pseudonymous per-agent identifier. A
// personal_sign (EIP-191) over our nonce is server-side verifiable by ecrecover,
// so binding an agent to a wallet address gives an accountability and economic
// anti-sybil anchor. A valid signature proves control of a wallet. It does NOT
// prove Muse-agent-hood and it does NOT prove a human is absent, so this is a
// factor layered on top of the attestation gate, never the gate itself.
//
// The secp256k1 public-key recovery is injected (Secp256k1Recover). That keeps
// the message hashing and address derivation, the error-prone parts, testable
// without pulling a curve library into this package, and lets the composition
// root pick an implementation. `nobleSecp256k1Recover` is the production adapter
// over @noble/curves.

import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

/** Recovers the secp256k1 public key that produced `signature` over `digest`.
 *  `signature` is the 64-byte compact r||s, `recovery` is 0 or 1. Returns the
 *  65-byte uncompressed public key (0x04 || X || Y). */
export type Secp256k1Recover = (
  digest: Uint8Array,
  signature: Uint8Array,
  recovery: number,
) => Uint8Array;

function stripHexPrefix(hex: string): string {
  return hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
}

/** EIP-191 personal_sign digest: keccak256("\x19Ethereum Signed Message:\n" + len + message). */
export function hashPersonalMessage(message: string | Uint8Array): Uint8Array {
  const body = typeof message === 'string' ? utf8ToBytes(message) : message;
  const prefix = utf8ToBytes(`\x19Ethereum Signed Message:\n${body.length}`);
  return keccak_256(concatBytes(prefix, body));
}

/** Derive the 0x EVM address from an uncompressed public key (65 bytes with the
 *  0x04 prefix, or the 64-byte X||Y). Lowercase, no EIP-55 checksum. */
export function publicKeyToAddress(publicKey: Uint8Array): string {
  let xy: Uint8Array;
  if (publicKey.length === 65 && publicKey[0] === 0x04) {
    xy = publicKey.slice(1);
  } else if (publicKey.length === 64) {
    xy = publicKey;
  } else {
    throw new Error(`unexpected public key length ${publicKey.length}`);
  }
  const hash = keccak_256(xy);
  return `0x${bytesToHex(hash.slice(-20))}`;
}

/** Split a 65-byte signature hex (r||s||v) into compact r||s plus a 0/1 recovery
 *  bit. Accepts v as 27/28 or 0/1. Returns null on any malformed input. */
export function splitSignature(
  signatureHex: string,
): { compact: Uint8Array; recovery: number } | null {
  let bytes: Uint8Array;
  try {
    bytes = hexToBytes(stripHexPrefix(signatureHex));
  } catch {
    return null;
  }
  if (bytes.length !== 65) {
    return null;
  }
  const compact = bytes.slice(0, 64);
  let v = bytes[64] as number;
  if (v >= 27) {
    v -= 27;
  }
  if (v !== 0 && v !== 1) {
    return null;
  }
  return { compact, recovery: v };
}

/** Recover the signing EVM address from a personal_sign signature, or null if
 *  the signature is malformed. */
export function recoverPersonalSignAddress(
  message: string | Uint8Array,
  signatureHex: string,
  recover: Secp256k1Recover,
): string | null {
  const parts = splitSignature(signatureHex);
  if (parts === null) {
    return null;
  }
  const digest = hashPersonalMessage(message);
  let publicKey: Uint8Array;
  try {
    publicKey = recover(digest, parts.compact, parts.recovery);
  } catch {
    return null;
  }
  try {
    return publicKeyToAddress(publicKey);
  } catch {
    return null;
  }
}

/** True if `signatureHex` is a personal_sign over `message` by `expectedAddress`.
 *  Address comparison is case-insensitive. */
export function verifyWalletBinding(
  message: string | Uint8Array,
  signatureHex: string,
  expectedAddress: string,
  recover: Secp256k1Recover,
): boolean {
  const recovered = recoverPersonalSignAddress(message, signatureHex, recover);
  if (recovered === null) {
    return false;
  }
  return recovered.toLowerCase() === expectedAddress.toLowerCase();
}

// The module specifier is held in a variable so the type checker does not try to
// resolve @noble/curves at build time (it is an optional peer added to
// package.json but wired only at composition). Runtime resolution still works
// once the dependency is installed.
const SECP256K1_MODULE = '@noble/curves/secp256k1';

interface NobleSignature {
  addRecoveryBit(recovery: number): {
    recoverPublicKey(digest: Uint8Array): { toRawBytes(compressed: boolean): Uint8Array };
  };
}
interface NobleSecp256k1 {
  Signature: { fromCompact(bytes: Uint8Array): NobleSignature };
}

/** Production recover adapter backed by @noble/curves. Requires @noble/curves to
 *  be installed (declared in package.json, wired by the composition root). */
export async function nobleSecp256k1Recover(): Promise<Secp256k1Recover> {
  const mod = (await import(/* @vite-ignore */ SECP256K1_MODULE)) as { secp256k1: NobleSecp256k1 };
  const secp = mod.secp256k1;
  return (digest, signature, recovery) =>
    secp.Signature.fromCompact(signature)
      .addRecoveryBit(recovery)
      .recoverPublicKey(digest)
      .toRawBytes(false);
}

/** True if @noble/curves can be resolved at runtime. Lets callers and tests
 *  degrade gracefully when the optional dependency is not installed. */
export async function secp256k1Available(): Promise<boolean> {
  try {
    await import(/* @vite-ignore */ SECP256K1_MODULE);
    return true;
  } catch {
    return false;
  }
}
