// Sign and recover AgentTreasury vouchers with secp256k1, producing an r||s||v
// signature (65 bytes, low-s, v in {27,28}) that AgentTreasury.claim accepts. This
// is the forge oracle's signing side; the contract is the verifying side.

import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { type Voucher, type VoucherDomain, voucherDigest } from './eip712.js';

function toBytes(pk: string | Uint8Array): Uint8Array {
  if (typeof pk !== 'string') return pk;
  const hex = pk.startsWith('0x') || pk.startsWith('0X') ? pk.slice(2) : pk;
  return hexToBytes(hex);
}

/** The 0x EVM address of an uncompressed (65-byte) or raw (64-byte) public key. */
function publicKeyToAddress(pub: Uint8Array): string {
  const xy = pub.length === 65 ? pub.subarray(1) : pub;
  return `0x${bytesToHex(keccak_256(xy).subarray(-20))}`;
}

/** The EVM address a private key signs as. */
export function signerAddress(privateKey: string | Uint8Array): string {
  return publicKeyToAddress(secp256k1.getPublicKey(toBytes(privateKey), false));
}

/** Sign a voucher with the oracle key. Returns 0x-prefixed r||s||v hex. noble
 *  produces a canonical low-s signature, which is what the contract's malleability
 *  guard requires. */
export function signVoucher(
  privateKey: string | Uint8Array,
  voucher: Voucher,
  domain: VoucherDomain,
): string {
  const sig = secp256k1.sign(voucherDigest(voucher, domain), toBytes(privateKey));
  const v = 27 + sig.recovery;
  return `0x${bytesToHex(sig.toCompactRawBytes())}${v.toString(16).padStart(2, '0')}`;
}

/** Recover the signer address from a voucher signature. Returns null if malformed. The
 *  caller compares it to the expected oracle to accept or reject, exactly as the
 *  contract does. */
export function recoverVoucherSigner(
  signatureHex: string,
  voucher: Voucher,
  domain: VoucherDomain,
): string | null {
  const hex =
    signatureHex.startsWith('0x') || signatureHex.startsWith('0X')
      ? signatureHex.slice(2)
      : signatureHex;
  let bytes: Uint8Array;
  try {
    bytes = hexToBytes(hex);
  } catch {
    return null;
  }
  if (bytes.length !== 65) return null;
  const vByte = bytes[64];
  if (vByte === undefined) return null;
  let recovery = vByte;
  if (recovery >= 27) recovery -= 27;
  if (recovery !== 0 && recovery !== 1) return null;
  try {
    const sig = secp256k1.Signature.fromCompact(bytes.subarray(0, 64)).addRecoveryBit(recovery);
    const pub = sig.recoverPublicKey(voucherDigest(voucher, domain)).toRawBytes(false);
    return publicKeyToAddress(pub);
  } catch {
    return null;
  }
}
