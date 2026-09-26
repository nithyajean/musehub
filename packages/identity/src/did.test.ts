import * as ed from '@noble/ed25519';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { base58btc } from 'multiformats/bases/base58';
import { describe, expect, it } from 'vitest';
import { decodeDidKeyEd25519, encodeDidKeyEd25519, isEd25519DidKey } from './did.js';

// Verified vector: the raw Ed25519 public key below encodes to this exact
// did:key. Confirmed against the installed multiformats base58btc on 2026-09-26.
const KNOWN_PUBKEY_HEX = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
const KNOWN_DID = 'did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw';

describe('did:key for Ed25519', () => {
  it('encodes the known public key to the known did:key vector', () => {
    expect(encodeDidKeyEd25519(hexToBytes(KNOWN_PUBKEY_HEX))).toBe(KNOWN_DID);
  });

  it('decodes the known did:key back to the known public key', () => {
    expect(bytesToHex(decodeDidKeyEd25519(KNOWN_DID))).toBe(KNOWN_PUBKEY_HEX);
  });

  it('round-trips a freshly generated keypair', async () => {
    const priv = ed.utils.randomPrivateKey();
    const pub = await ed.getPublicKeyAsync(priv);
    const did = encodeDidKeyEd25519(pub);
    expect(bytesToHex(decodeDidKeyEd25519(did))).toBe(bytesToHex(pub));
  });

  it('always produces a z6Mk-prefixed did for ed25519 keys', async () => {
    for (let i = 0; i < 5; i++) {
      const pub = await ed.getPublicKeyAsync(ed.utils.randomPrivateKey());
      expect(encodeDidKeyEd25519(pub).startsWith('did:key:z6Mk')).toBe(true);
    }
  });

  it('rejects a string that is not a did:key', () => {
    expect(() => decodeDidKeyEd25519('did:web:example.com')).toThrow();
    expect(isEd25519DidKey('did:web:example.com')).toBe(false);
  });

  it('rejects a did:key that is not base58btc multibase', () => {
    // 'f' is the base16 multibase prefix, not base58btc 'z'.
    expect(() => decodeDidKeyEd25519('did:key:fabcdef')).toThrow();
  });

  it('rejects a did:key whose multicodec prefix is not ed25519-pub', () => {
    // Wrong two-byte prefix (0x01 0x01) in front of 32 bytes.
    const bad = new Uint8Array(34);
    bad[0] = 0x01;
    bad[1] = 0x01;
    const did = `did:key:${base58btc.encode(bad)}`;
    expect(() => decodeDidKeyEd25519(did)).toThrow(/ed25519/);
  });

  it('rejects a did:key payload of the wrong length', () => {
    const bad = new Uint8Array([0xed, 0x01, 0x00]); // correct prefix, too short
    const did = `did:key:${base58btc.encode(bad)}`;
    expect(() => decodeDidKeyEd25519(did)).toThrow(/length/);
  });

  it('rejects a public key of the wrong length on encode', () => {
    expect(() => encodeDidKeyEd25519(new Uint8Array(31))).toThrow();
  });
});
