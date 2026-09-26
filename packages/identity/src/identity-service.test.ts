import * as ed from '@noble/ed25519';
import { describe, expect, it } from 'vitest';
import { encodeDidKeyEd25519 } from './did.js';
import { MuseHubIdentityService } from './identity-service.js';

const SECRET = 'test-secret-please-use-32-plus-bytes-in-prod';

async function makeAgent() {
  const priv = ed.utils.randomPrivateKey();
  const pub = await ed.getPublicKeyAsync(priv);
  return { priv, did: encodeDidKeyEd25519(pub) };
}

async function signNonce(priv: Uint8Array, nonce: string): Promise<string> {
  const sig = await ed.signAsync(new TextEncoder().encode(nonce), priv);
  return Buffer.from(sig).toString('base64');
}

function makeService(clock: { t: number }) {
  return new MuseHubIdentityService({
    signingSecret: SECRET,
    now: () => clock.t,
    challengeTtlMs: 1000,
    tokenTtlSec: 60,
  });
}

describe('MuseHubIdentityService challenge-response', () => {
  it('issues a nonce with a future expiry', async () => {
    const clock = { t: 1_700_000_000_000 };
    const svc = makeService(clock);
    const agent = await makeAgent();
    const { nonce, expiresAt } = await svc.issueChallenge(agent.did);
    expect(nonce.length).toBeGreaterThan(0);
    expect(Date.parse(expiresAt)).toBe(clock.t + 1000);
  });

  it('rejects a challenge for a did it cannot resolve', async () => {
    const svc = makeService({ t: 1_700_000_000_000 });
    await expect(svc.issueChallenge('did:web:example.com')).rejects.toThrow();
  });

  it('verifies a correct signature', async () => {
    const clock = { t: 1_700_000_000_000 };
    const svc = makeService(clock);
    const agent = await makeAgent();
    const { nonce } = await svc.issueChallenge(agent.did);
    const sig = await signNonce(agent.priv, nonce);
    expect(await svc.verifyChallenge(agent.did, nonce, sig)).toBe(true);
  });

  it('rejects a tampered signature', async () => {
    const clock = { t: 1_700_000_000_000 };
    const svc = makeService(clock);
    const agent = await makeAgent();
    const { nonce } = await svc.issueChallenge(agent.did);
    const good = await signNonce(agent.priv, nonce);
    const bytes = Buffer.from(good, 'base64');
    bytes[0] = (bytes[0] ?? 0) ^ 0xff; // flip a byte
    expect(await svc.verifyChallenge(agent.did, nonce, bytes.toString('base64'))).toBe(false);
  });

  it('rejects a signature made by a different key', async () => {
    const clock = { t: 1_700_000_000_000 };
    const svc = makeService(clock);
    const agent = await makeAgent();
    const other = await makeAgent();
    const { nonce } = await svc.issueChallenge(agent.did);
    const sigByOther = await signNonce(other.priv, nonce);
    expect(await svc.verifyChallenge(agent.did, nonce, sigByOther)).toBe(false);
  });

  it('rejects when the presented did does not match the challenge', async () => {
    const clock = { t: 1_700_000_000_000 };
    const svc = makeService(clock);
    const agent = await makeAgent();
    const other = await makeAgent();
    const { nonce } = await svc.issueChallenge(agent.did);
    const sig = await signNonce(agent.priv, nonce);
    expect(await svc.verifyChallenge(other.did, nonce, sig)).toBe(false);
  });

  it('consumes a nonce so it cannot be replayed', async () => {
    const clock = { t: 1_700_000_000_000 };
    const svc = makeService(clock);
    const agent = await makeAgent();
    const { nonce } = await svc.issueChallenge(agent.did);
    const sig = await signNonce(agent.priv, nonce);
    expect(await svc.verifyChallenge(agent.did, nonce, sig)).toBe(true);
    expect(await svc.verifyChallenge(agent.did, nonce, sig)).toBe(false);
  });

  it('rejects an expired nonce', async () => {
    const clock = { t: 1_700_000_000_000 };
    const svc = makeService(clock);
    const agent = await makeAgent();
    const { nonce } = await svc.issueChallenge(agent.did);
    const sig = await signNonce(agent.priv, nonce);
    clock.t += 1001; // past the 1000 ms TTL
    expect(await svc.verifyChallenge(agent.did, nonce, sig)).toBe(false);
  });

  it('rejects a nonce that was never issued', async () => {
    const svc = makeService({ t: 1_700_000_000_000 });
    const agent = await makeAgent();
    const sig = await signNonce(agent.priv, 'never-issued');
    expect(await svc.verifyChallenge(agent.did, 'never-issued', sig)).toBe(false);
  });
});

describe('MuseHubIdentityService tokens', () => {
  it('mints a token that verifies back to its claims', async () => {
    const clock = { t: 1_700_000_000_000 };
    const svc = makeService(clock);
    const { token, tokenId } = await svc.mintToken('agent_42');
    const claims = await svc.verifyToken(token);
    expect(claims).toEqual({ agentId: 'agent_42', tokenId });
  });

  it('mints a unique token id each time', async () => {
    const svc = makeService({ t: 1_700_000_000_000 });
    const a = await svc.mintToken('agent_1');
    const b = await svc.mintToken('agent_1');
    expect(a.tokenId).not.toBe(b.tokenId);
  });

  it('returns null after the token is revoked', async () => {
    const clock = { t: 1_700_000_000_000 };
    const svc = makeService(clock);
    const { token, tokenId } = await svc.mintToken('agent_42');
    expect(await svc.verifyToken(token)).not.toBeNull();
    await svc.revokeToken(tokenId);
    expect(await svc.verifyToken(token)).toBeNull();
  });

  it('returns null for an expired token', async () => {
    const clock = { t: 1_700_000_000_000 };
    const svc = makeService(clock);
    const { token } = await svc.mintToken('agent_42');
    clock.t += 61_000; // past the 60 s TTL
    expect(await svc.verifyToken(token)).toBeNull();
  });

  it('returns null for a garbage token', async () => {
    const svc = makeService({ t: 1_700_000_000_000 });
    expect(await svc.verifyToken('not.a.jwt')).toBeNull();
  });

  it('returns null for a token signed with a different secret', async () => {
    const clock = { t: 1_700_000_000_000 };
    const mint = new MuseHubIdentityService({
      signingSecret: 'a-completely-different-secret-value',
      now: () => clock.t,
    });
    const verify = makeService(clock);
    const { token } = await mint.mintToken('agent_42');
    expect(await verify.verifyToken(token)).toBeNull();
  });
});
