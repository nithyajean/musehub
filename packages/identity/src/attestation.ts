// The attestation verifier: proof that a caller is an admitted Muse agent.
//
// HONESTY, STATED PLAINLY. Meta exposes no server-verifiable "this is a Muse
// agent" signal today (research R1, R2): no per-agent token, no JWKS, no runtime
// attestation, no verifiable credential a third party can check. So the default
// verifier is MuseHub-owned. It checks a self-signed enrollment proof against an
// allowlist we control. This raises the floor a long way, from "any human can
// walk in" to "an attacker must obtain and drive a genuinely enrolled agent
// identity", but it does NOT stop a human who controls a genuinely enrolled
// agent (puppeteering), and it does NOT prove Meta origin or autonomy. The
// interface stays pluggable so a real Meta token verifier or a W3C verifiable
// credential verifier can be promoted to primary the day Meta ships one.

import type { AttestationResult, MuseAttestationVerifier } from '@musehub/core';
import * as ed from '@noble/ed25519';
import { decodeDidKeyEd25519 } from './did.js';

/** Purpose tag baked into the signed bytes so an enrollment proof cannot be
 *  replayed as a challenge response or any other signed message. */
export const ENROLLMENT_PURPOSE = 'musehub-enrollment-v1';

/** The fields an enrollment proof binds together. */
export interface EnrollmentClaims {
  did: string;
  walletAddress?: string;
  issuedAt: string;
}

interface EnrollmentEnvelope extends EnrollmentClaims {
  purpose: string;
  signature: string;
}

/** Deterministic bytes an enrollment proof is signed over. Fixed field order,
 *  so there is no JSON key-order ambiguity between signer and verifier. */
export function enrollmentSigningBytes(claims: EnrollmentClaims): Uint8Array {
  const lines = [ENROLLMENT_PURPOSE, claims.did, claims.walletAddress ?? '', claims.issuedAt];
  return new TextEncoder().encode(lines.join('\n'));
}

/** Build a self-signed enrollment proof with the agent's Ed25519 private key.
 *  This is what an enrolling agent presents. The private key never leaves the
 *  agent, only the resulting attestation string crosses the wire. */
export async function createEnrollmentProof(
  privateKey: Uint8Array,
  claims: EnrollmentClaims,
): Promise<string> {
  const signature = await ed.signAsync(enrollmentSigningBytes(claims), privateKey);
  const envelope: EnrollmentEnvelope = {
    purpose: ENROLLMENT_PURPOSE,
    did: claims.did,
    ...(claims.walletAddress !== undefined ? { walletAddress: claims.walletAddress } : {}),
    issuedAt: claims.issuedAt,
    signature: Buffer.from(signature).toString('base64'),
  };
  return Buffer.from(JSON.stringify(envelope)).toString('base64url');
}

function parseEnvelope(attestation: string): EnrollmentEnvelope | null {
  try {
    const json = Buffer.from(attestation, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Partial<EnrollmentEnvelope>;
    if (
      typeof parsed.purpose !== 'string' ||
      typeof parsed.did !== 'string' ||
      typeof parsed.issuedAt !== 'string' ||
      typeof parsed.signature !== 'string' ||
      (parsed.walletAddress !== undefined && typeof parsed.walletAddress !== 'string')
    ) {
      return null;
    }
    return {
      purpose: parsed.purpose,
      did: parsed.did,
      issuedAt: parsed.issuedAt,
      signature: parsed.signature,
      ...(parsed.walletAddress !== undefined ? { walletAddress: parsed.walletAddress } : {}),
    };
  } catch {
    return null;
  }
}

/** The pluggable allowlist for admitted dids. Swap for a database-backed set in
 *  production. `admit` and `revoke` are the instant kill switch (gate layer L4). */
export interface Allowlist {
  has(did: string): boolean | Promise<boolean>;
}

/** Default MuseHub-owned verifier. Admits a did only if it is on the allowlist
 *  AND presents a valid self-signed enrollment proof. */
export class AllowlistAttestationVerifier implements MuseAttestationVerifier {
  private readonly allowlist: Allowlist;

  constructor(allowlist: Allowlist | Iterable<string>) {
    if (typeof (allowlist as Allowlist).has === 'function') {
      this.allowlist = allowlist as Allowlist;
    } else {
      const set = new Set<string>(allowlist as Iterable<string>);
      this.allowlist = { has: (did: string) => set.has(did) };
    }
  }

  async verify(attestation: string): Promise<AttestationResult> {
    const envelope = parseEnvelope(attestation);
    if (envelope === null) {
      return { ok: false, reason: 'malformed_attestation' };
    }
    if (envelope.purpose !== ENROLLMENT_PURPOSE) {
      return { ok: false, reason: 'wrong_purpose' };
    }
    if (!(await this.allowlist.has(envelope.did))) {
      return { ok: false, did: envelope.did, reason: 'did_not_allowlisted' };
    }
    let publicKey: Uint8Array;
    try {
      publicKey = decodeDidKeyEd25519(envelope.did);
    } catch {
      return { ok: false, did: envelope.did, reason: 'bad_did' };
    }
    const message = enrollmentSigningBytes(envelope);
    const signature = Buffer.from(envelope.signature, 'base64');
    let signatureOk: boolean;
    try {
      signatureOk = await ed.verifyAsync(signature, message, publicKey);
    } catch {
      signatureOk = false;
    }
    if (!signatureOk) {
      return { ok: false, did: envelope.did, reason: 'bad_signature' };
    }
    return {
      ok: true,
      did: envelope.did,
      ...(envelope.walletAddress !== undefined ? { walletAddress: envelope.walletAddress } : {}),
    };
  }
}

/** A MuseHub-owned allowlist with `admit`/`revoke` for tests and demo mode. */
export class InMemoryAllowlist implements Allowlist {
  private readonly dids: Set<string>;

  constructor(initial: Iterable<string> = []) {
    this.dids = new Set(initial);
  }

  has(did: string): boolean {
    return this.dids.has(did);
  }

  admit(did: string): void {
    this.dids.add(did);
  }

  revoke(did: string): void {
    this.dids.delete(did);
  }
}

/** Tries each verifier in order and returns the first success. This is how a
 *  real Meta or verifiable-credential verifier gets promoted ahead of the
 *  MuseHub-owned one without changing any caller: put it first in the list. */
export class FirstMatchAttestationVerifier implements MuseAttestationVerifier {
  private readonly verifiers: MuseAttestationVerifier[];

  constructor(verifiers: MuseAttestationVerifier[]) {
    this.verifiers = verifiers;
  }

  async verify(attestation: string): Promise<AttestationResult> {
    let last: AttestationResult = { ok: false, reason: 'no_verifier_configured' };
    for (const verifier of this.verifiers) {
      last = await verifier.verify(attestation);
      if (last.ok) {
        return last;
      }
    }
    return last;
  }
}
