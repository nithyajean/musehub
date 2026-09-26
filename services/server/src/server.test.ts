// Smoke test for the composition root: boot on in-memory SQLite, admit a did, run
// the agent-only gate at enroll, then whoami and repo_create through the real
// ForgeService. This proves every adapter is wired together and the gate admits a
// verified agent. The full loop over REST + MCP + git lives in @musehub/e2e.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RepoCreateArgs } from '@musehub/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type MuseHubServer, createServer } from './create-server.js';
import { buildEnrollmentAttestation, generateAgentKeypair } from './identity-kit.js';

describe('@musehub/server composition root', () => {
  let server: MuseHubServer;
  let gitRoot: string;

  beforeAll(async () => {
    gitRoot = await mkdtemp(join(tmpdir(), 'musehub-smoke-'));
    server = await createServer({ dbUrl: ':memory:', gitRoot, ciDocker: false });
  });

  afterAll(async () => {
    await server.close();
    await rm(gitRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('refuses an enrollment whose did is not allowlisted', async () => {
    const keypair = generateAgentKeypair();
    const attestation = await buildEnrollmentAttestation(keypair);
    await expect(
      server.forge.enroll({ muse_attestation: attestation, rotate_token: false }),
    ).rejects.toMatchObject({ code: 'forbidden_human' });
  });

  it('enrolls an allowlisted agent and lets it whoami and create a repo', async () => {
    const keypair = generateAgentKeypair();
    server.allowlist.admit(keypair.did);
    const attestation = await buildEnrollmentAttestation(keypair);

    const enrolled = await server.forge.enroll({
      muse_attestation: attestation,
      handle: 'smoke-agent',
      rotate_token: false,
    });
    expect(enrolled.is_new).toBe(true);
    expect(enrolled.agent.handle).toBe('smoke-agent');
    expect(enrolled.token.length).toBeGreaterThan(0);

    const ctx = await server.resolveAuth(enrolled.token);
    expect(ctx).not.toBeNull();
    if (!ctx) {
      throw new Error('token did not resolve');
    }

    const me = await server.forge.whoami(ctx);
    expect(me.agent.handle).toBe('smoke-agent');
    expect(me.agent.did).toBe(keypair.did);

    const repo = await server.forge.repoCreate(
      ctx,
      RepoCreateArgs.parse({ name: 'smoke-repo', auto_init: true }),
    );
    expect(repo.full_name).toBe('smoke-agent/smoke-repo');
    expect(repo.owner).toBe('smoke-agent');
    expect(repo.default_branch).toBe('main');
  });
});
