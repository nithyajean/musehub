import * as ed from '@noble/ed25519';
import { describe, expect, it } from 'vitest';
import {
  AllowlistAttestationVerifier,
  ENROLLMENT_PURPOSE,
  FirstMatchAttestationVerifier,
  InMemoryAllowlist,
  createEnrollmentProof,
  enrollmentSigningBytes,
} from './attestation.js';
import { encodeDidKeyEd25519 } from './did.js';

async function makeAgent() {
  const priv = ed.utils.randomPrivateKey();
  const pub = await ed.getPublicKeyAsync(priv);
  return { priv, did: encodeDidKeyEd25519(pub) };
}

const ISSUED_AT = '2026-09-26T00:00:00.000Z';

function encodeEnvelope(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

describe('AllowlistAttestationVerifier', () => {
  it('admits an allowlisted did that presents a valid self-signed proof', async () => {
    const agent = await makeAgent();
    const verifier = new AllowlistAttestationVerifier([agent.did]);
    const proof = await createEnrollmentProof(agent.priv, { did: agent.did, issuedAt: ISSUED_AT });
    expect(await verifier.verify(proof)).toEqual({ ok: true, did: agent.did });
  });

  it('returns the bound wallet address when the proof carries one', async () => {
    const agent = await makeAgent();
    const wallet = '0xDB6c6340342e71A63cD11Ebac2185204b7777777';
    const verifier = new AllowlistAttestationVerifier([agent.did]);
    const proof = await createEnrollmentProof(agent.priv, {
      did: agent.did,
      walletAddress: wallet,
      issuedAt: ISSUED_AT,
    });
    expect(await verifier.verify(proof)).toEqual({
      ok: true,
      did: agent.did,
      walletAddress: wallet,
    });
  });

  it('rejects a did that is not on the allowlist', async () => {
    const agent = await makeAgent();
    const verifier = new AllowlistAttestationVerifier([]); // empty allowlist
    const proof = await createEnrollmentProof(agent.priv, { did: agent.did, issuedAt: ISSUED_AT });
    const result = await verifier.verify(proof);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('did_not_allowlisted');
  });

  it('rejects a proof whose signature does not match the claims', async () => {
    const agent = await makeAgent();
    const verifier = new AllowlistAttestationVerifier([agent.did]);
    // Allowlisted did, well-formed envelope, but a zero signature.
    const bad = encodeEnvelope({
      purpose: ENROLLMENT_PURPOSE,
      did: agent.did,
      issuedAt: ISSUED_AT,
      signature: Buffer.from(new Uint8Array(64)).toString('base64'),
    });
    const result = await verifier.verify(bad);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('bad_signature');
  });

  it('rejects a proof whose wallet address was altered after signing', async () => {
    const agent = await makeAgent();
    const verifier = new AllowlistAttestationVerifier([agent.did]);
    // Sign a proof with no wallet, then splice a wallet into the envelope.
    const sig = await ed.signAsync(
      enrollmentSigningBytes({ did: agent.did, issuedAt: ISSUED_AT }),
      agent.priv,
    );
    const tampered = encodeEnvelope({
      purpose: ENROLLMENT_PURPOSE,
      did: agent.did,
      walletAddress: '0x0000000000000000000000000000000000000001',
      issuedAt: ISSUED_AT,
      signature: Buffer.from(sig).toString('base64'),
    });
    const result = await verifier.verify(tampered);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('bad_signature');
  });

  it('rejects a malformed attestation', async () => {
    const verifier = new AllowlistAttestationVerifier([]);
    const result = await verifier.verify(Buffer.from('hello, not json').toString('base64url'));
    expect(result).toEqual({ ok: false, reason: 'malformed_attestation' });
  });

  it('rejects a proof with the wrong purpose tag', async () => {
    const agent = await makeAgent();
    const verifier = new AllowlistAttestationVerifier([agent.did]);
    const wrong = encodeEnvelope({
      purpose: 'some-other-purpose',
      did: agent.did,
      issuedAt: ISSUED_AT,
      signature: Buffer.from(new Uint8Array(64)).toString('base64'),
    });
    const result = await verifier.verify(wrong);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('wrong_purpose');
  });

  it('honors instant revocation through the allowlist', async () => {
    const agent = await makeAgent();
    const allowlist = new InMemoryAllowlist([agent.did]);
    const verifier = new AllowlistAttestationVerifier(allowlist);
    const proof = await createEnrollmentProof(agent.priv, { did: agent.did, issuedAt: ISSUED_AT });
    expect((await verifier.verify(proof)).ok).toBe(true);
    allowlist.revoke(agent.did);
    expect((await verifier.verify(proof)).ok).toBe(false);
  });
});

describe('FirstMatchAttestationVerifier', () => {
  it('returns the first verifier that admits the proof', async () => {
    const agent = await makeAgent();
    const proof = await createEnrollmentProof(agent.priv, { did: agent.did, issuedAt: ISSUED_AT });
    const composite = new FirstMatchAttestationVerifier([
      new AllowlistAttestationVerifier([]), // rejects
      new AllowlistAttestationVerifier([agent.did]), // admits
    ]);
    expect((await composite.verify(proof)).ok).toBe(true);
  });

  it('returns the last reason when every verifier rejects', async () => {
    const agent = await makeAgent();
    const proof = await createEnrollmentProof(agent.priv, { did: agent.did, issuedAt: ISSUED_AT });
    const composite = new FirstMatchAttestationVerifier([new AllowlistAttestationVerifier([])]);
    const result = await composite.verify(proof);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('did_not_allowlisted');
  });

  it('reports no configured verifier when the list is empty', async () => {
    const composite = new FirstMatchAttestationVerifier([]);
    expect(await composite.verify('anything')).toEqual({
      ok: false,
      reason: 'no_verifier_configured',
    });
  });
});
