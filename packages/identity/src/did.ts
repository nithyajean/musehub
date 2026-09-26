// did:key encoding for Ed25519 public keys.
//
// A did:key wraps a raw public key as `did:key:` + a multibase string. For
// Ed25519 the payload is the multicodec prefix for an ed25519 public key
// (unsigned varint 0xed, which encodes to the two bytes 0xed 0x01) followed by
// the 32 raw key bytes, then base58btc multibase encoded (the 'z' prefix).
// See the W3C did:key method and the multicodec table.

import { base58btc } from 'multiformats/bases/base58';

/** Multicodec prefix for an ed25519 public key. 0xed as an unsigned varint is [0xed, 0x01]. */
const ED25519_PUB_MULTICODEC = Uint8Array.from([0xed, 0x01]);
const DID_KEY_PREFIX = 'did:key:';
const RAW_ED25519_PUBKEY_LEN = 32;

/** Encode a raw 32-byte Ed25519 public key as a did:key string. */
export function encodeDidKeyEd25519(publicKey: Uint8Array): string {
  if (publicKey.length !== RAW_ED25519_PUBKEY_LEN) {
    throw new Error(
      `ed25519 public key must be ${RAW_ED25519_PUBKEY_LEN} bytes, got ${publicKey.length}`,
    );
  }
  const payload = new Uint8Array(ED25519_PUB_MULTICODEC.length + publicKey.length);
  payload.set(ED25519_PUB_MULTICODEC, 0);
  payload.set(publicKey, ED25519_PUB_MULTICODEC.length);
  // base58btc.encode returns a multibase string already carrying the 'z' prefix.
  return DID_KEY_PREFIX + base58btc.encode(payload);
}

/** Decode a did:key string back to its raw 32-byte Ed25519 public key. Throws if it is
 *  not a did:key, not base58btc multibase, not an ed25519 key, or the wrong length. */
export function decodeDidKeyEd25519(did: string): Uint8Array {
  if (!did.startsWith(DID_KEY_PREFIX)) {
    throw new Error('not a did:key');
  }
  const multibase = did.slice(DID_KEY_PREFIX.length);
  if (!multibase.startsWith('z')) {
    throw new Error('did:key must use base58btc multibase (expected a leading z)');
  }
  const payload = base58btc.decode(multibase);
  const expectedLen = ED25519_PUB_MULTICODEC.length + RAW_ED25519_PUBKEY_LEN;
  if (payload.length !== expectedLen) {
    throw new Error(`unexpected did:key payload length ${payload.length}, wanted ${expectedLen}`);
  }
  if (payload[0] !== ED25519_PUB_MULTICODEC[0] || payload[1] !== ED25519_PUB_MULTICODEC[1]) {
    throw new Error('did:key multicodec prefix is not ed25519-pub');
  }
  return payload.slice(ED25519_PUB_MULTICODEC.length);
}

/** True if the string is a well-formed Ed25519 did:key. */
export function isEd25519DidKey(did: string): boolean {
  try {
    decodeDidKeyEd25519(did);
    return true;
  } catch {
    return false;
  }
}
