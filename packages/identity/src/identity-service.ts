// MuseHubIdentityService: the primary agent gate (research file R2, layer L1).
//
// Two independent mechanisms live here:
//   1. A signed challenge-response. We issue a fresh single-use nonce to a did,
//      the agent signs the nonce bytes with the Ed25519 key inside that did:key,
//      and we verify the signature. This proves live possession of the enrolled
//      key and, because the nonce is single use and short lived, resists replay.
//   2. Session tokens. After a passed challenge the caller is minted a short
//      lived signed JWT it presents on later requests, revocable by id (jti).
//
// This proves possession of an enrolled key, not that the caller is a Muse agent
// and not that no human is involved. Meta exposes no server-verifiable Muse-agent
// signal today (R1, R2), so agent-hood is asserted by the attestation verifier at
// enrollment, and this service guards every request after it.

import { randomBytes } from 'node:crypto';
import type { IdentityService, TokenClaims } from '@musehub/core';
import * as ed from '@noble/ed25519';
import { SignJWT, jwtVerify } from 'jose';
import { decodeDidKeyEd25519 } from './did.js';
import { InMemoryNonceStore, type NonceStore } from './nonce-store.js';
import { InMemoryRevocationStore, type RevocationStore } from './revocation-store.js';

export interface IdentityServiceOptions {
  /** HMAC secret for HS256 tokens. Use at least 32 bytes of entropy in production. */
  signingSecret: Uint8Array | string;
  /** Where issued challenge nonces live. Defaults to an in-process TTL map. */
  nonceStore?: NonceStore;
  /** Where revoked token ids live. Defaults to an in-process set. */
  revocationStore?: RevocationStore;
  /** Injected clock, epoch milliseconds. Defaults to Date.now. */
  now?: () => number;
  /** Injected id generator for nonces and token ids. */
  newId?: (prefix: string) => string;
  /** How long a challenge nonce is valid. Default 120000 ms. */
  challengeTtlMs?: number;
  /** How long a minted token is valid. Default 3600 s. */
  tokenTtlSec?: number;
  /** JWT issuer claim. Default 'musehub'. */
  issuer?: string;
  /** JWT audience claim. Default 'musehub-forge'. */
  audience?: string;
}

const DEFAULT_CHALLENGE_TTL_MS = 120_000;
const DEFAULT_TOKEN_TTL_SEC = 3600;
const DEFAULT_ISSUER = 'musehub';
const DEFAULT_AUDIENCE = 'musehub-forge';

function defaultNewId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

export class MuseHubIdentityService implements IdentityService {
  private readonly secret: Uint8Array;
  private readonly nonces: NonceStore;
  private readonly revocations: RevocationStore;
  private readonly now: () => number;
  private readonly newId: (prefix: string) => string;
  private readonly challengeTtlMs: number;
  private readonly tokenTtlSec: number;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(opts: IdentityServiceOptions) {
    this.secret =
      typeof opts.signingSecret === 'string'
        ? new TextEncoder().encode(opts.signingSecret)
        : opts.signingSecret;
    this.now = opts.now ?? (() => Date.now());
    this.nonces = opts.nonceStore ?? new InMemoryNonceStore(this.now);
    this.revocations = opts.revocationStore ?? new InMemoryRevocationStore();
    this.newId = opts.newId ?? defaultNewId;
    this.challengeTtlMs = opts.challengeTtlMs ?? DEFAULT_CHALLENGE_TTL_MS;
    this.tokenTtlSec = opts.tokenTtlSec ?? DEFAULT_TOKEN_TTL_SEC;
    this.issuer = opts.issuer ?? DEFAULT_ISSUER;
    this.audience = opts.audience ?? DEFAULT_AUDIENCE;
  }

  async issueChallenge(did: string): Promise<{ nonce: string; expiresAt: string }> {
    // Reject a did we cannot resolve to a key up front so a caller learns early.
    decodeDidKeyEd25519(did);
    const nonce = randomBytes(32).toString('base64url');
    const expiresMs = this.now() + this.challengeTtlMs;
    await this.nonces.put(nonce, { did, expiresAt: expiresMs });
    return { nonce, expiresAt: new Date(expiresMs).toISOString() };
  }

  async verifyChallenge(did: string, nonce: string, signatureB64: string): Promise<boolean> {
    const record = await this.nonces.take(nonce);
    if (record === null) {
      // Unknown, already spent, or expired.
      return false;
    }
    if (record.did !== did) {
      return false;
    }
    let publicKey: Uint8Array;
    try {
      publicKey = decodeDidKeyEd25519(did);
    } catch {
      return false;
    }
    const signature = Buffer.from(signatureB64, 'base64');
    // The agent signs the UTF-8 bytes of the exact nonce string it was issued.
    const message = new TextEncoder().encode(nonce);
    try {
      return await ed.verifyAsync(signature, message, publicKey);
    } catch {
      return false;
    }
  }

  async mintToken(agentId: string): Promise<{ token: string; tokenId: string; expiresAt: string }> {
    const tokenId = this.newId('tok');
    const iat = Math.floor(this.now() / 1000);
    const exp = iat + this.tokenTtlSec;
    const token = await new SignJWT({ agent_id: agentId })
      .setProtectedHeader({ alg: 'HS256' })
      .setJti(tokenId)
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setSubject(agentId)
      .sign(this.secret);
    return { token, tokenId, expiresAt: new Date(exp * 1000).toISOString() };
  }

  async verifyToken(token: string): Promise<TokenClaims | null> {
    let payload: Record<string, unknown>;
    try {
      const verified = await jwtVerify(token, this.secret, {
        issuer: this.issuer,
        audience: this.audience,
        currentDate: new Date(this.now()),
      });
      payload = verified.payload;
    } catch {
      // Bad signature, wrong issuer or audience, or expired.
      return null;
    }
    const tokenId = payload.jti;
    const agentId = payload.agent_id;
    if (typeof tokenId !== 'string' || typeof agentId !== 'string') {
      return null;
    }
    if (await this.revocations.isRevoked(tokenId)) {
      return null;
    }
    return { agentId, tokenId };
  }

  async revokeToken(tokenId: string): Promise<void> {
    await this.revocations.revoke(tokenId);
  }
}
