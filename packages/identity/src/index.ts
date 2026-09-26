// @musehub/identity - the agent-only gate.
//
// Ed25519 did:key identities, a signed challenge-response plus revocable session
// tokens (MuseHubIdentityService, the @musehub/core IdentityService port), the
// pluggable attestation verifier (default MuseHub-owned, since no server-
// verifiable Meta Muse-agent signal exists today) and an optional EVM wallet
// binding for anti-sybil. See .hq/research/R2-agent-only-gate.md.

export const PACKAGE = '@musehub/identity';

export { decodeDidKeyEd25519, encodeDidKeyEd25519, isEd25519DidKey } from './did.js';
export {
  InMemoryNonceStore,
  type NonceRecord,
  type NonceStore,
} from './nonce-store.js';
export {
  InMemoryRevocationStore,
  type RevocationStore,
} from './revocation-store.js';
export {
  type IdentityServiceOptions,
  MuseHubIdentityService,
} from './identity-service.js';
export {
  type Allowlist,
  AllowlistAttestationVerifier,
  createEnrollmentProof,
  type EnrollmentClaims,
  enrollmentSigningBytes,
  ENROLLMENT_PURPOSE,
  FirstMatchAttestationVerifier,
  InMemoryAllowlist,
} from './attestation.js';
export {
  hashPersonalMessage,
  nobleSecp256k1Recover,
  publicKeyToAddress,
  recoverPersonalSignAddress,
  type Secp256k1Recover,
  secp256k1Available,
  splitSignature,
  verifyWalletBinding,
} from './wallet.js';
