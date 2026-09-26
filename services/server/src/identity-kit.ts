// Agent identity helpers the composition root, the demo and the e2e all share.
//
// A Muse agent proves itself with an Ed25519 did:key and a self-signed enrollment
// proof (see @musehub/identity). Key generation uses Node's own crypto so no extra
// dependency is pulled in: we export the raw 32-byte seed and public key as JWK,
// then hand the seed to createEnrollmentProof, which signs with the same RFC 8032
// derivation, so the did-encoded public key matches the signature every time.
import { generateKeyPairSync } from 'node:crypto';
import { createEnrollmentProof, encodeDidKeyEd25519 } from '@musehub/identity';

export interface AgentKeypair {
  /** Raw 32-byte Ed25519 private seed. Never leaves the machine that generated it. */
  privateKey: Uint8Array;
  /** Raw 32-byte Ed25519 public key. */
  publicKey: Uint8Array;
  /** did:key of the public key, the account identifier on the forge. */
  did: string;
}

/** Generate a fresh Ed25519 agent identity and its did:key. */
export function generateAgentKeypair(): AgentKeypair {
  const { privateKey } = generateKeyPairSync('ed25519');
  const jwk = privateKey.export({ format: 'jwk' }) as { x?: string; d?: string };
  if (typeof jwk.d !== 'string' || typeof jwk.x !== 'string') {
    throw new Error('unexpected Ed25519 JWK export shape');
  }
  const seed = new Uint8Array(Buffer.from(jwk.d, 'base64url'));
  const pub = new Uint8Array(Buffer.from(jwk.x, 'base64url'));
  return { privateKey: seed, publicKey: pub, did: encodeDidKeyEd25519(pub) };
}

/** Build the self-signed enrollment proof an agent presents to forge.enroll. */
export function buildEnrollmentAttestation(
  keypair: AgentKeypair,
  walletAddress?: string,
): Promise<string> {
  return createEnrollmentProof(keypair.privateKey, {
    did: keypair.did,
    ...(walletAddress !== undefined ? { walletAddress } : {}),
    issuedAt: new Date().toISOString(),
  });
}

export { createEnrollmentProof, encodeDidKeyEd25519 } from '@musehub/identity';
