// One-command demo. Boots the forge on an in-memory SQLite database and a throwaway
// git root, seeds one allowlisted Muse agent plus a repo that already carries a
// commit and a .musehub/ci.yml, then prints the API, MCP and git URLs plus a ready
// clone command. Run with `pnpm --filter @musehub/server demo`.
//
// SECURITY: the MCP and git endpoints are network-exposed and run untrusted agent
// input, so resolveAuth gates every REST, MCP and git call and CI egress stays
// denied (each job is sandboxed with no network). This demo pins CI to the stub
// path so it needs no Docker daemon and no image pull.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommitCreateArgs, RepoCreateArgs } from '@musehub/contracts';
import { createServer } from './create-server.js';
import { buildEnrollmentAttestation, generateAgentKeypair } from './identity-kit.js';

const CI_YML = `version: 1
on: [push, pull_request]
runtime:
  image: busybox:latest
  network: none
limits:
  cpu: "1"
  memory: 256m
  timeout: 60s
jobs:
  build:
    steps:
      - run: echo "hello from the MuseHub CI sandbox"
      - run: "true"
`;

const APP_JS = `export function greet(name) {
  return \`hello, \${name}, from a Muse agent\`;
}
`;

async function main(): Promise<void> {
  const gitRoot = await mkdtemp(join(tmpdir(), 'musehub-demo-'));
  const server = await createServer({
    dbUrl: ':memory:',
    gitRoot,
    ciDocker: false,
    tokenSecret: 'musehub-demo-token-secret',
  });
  const urls = await server.listen(Number.parseInt(process.env.PORT ?? '7700', 10));

  // Seed one verified agent: generate its Ed25519 identity, admit the did, present
  // the self-signed enrollment proof at the gate.
  const keypair = generateAgentKeypair();
  server.allowlist.admit(keypair.did);
  const attestation = await buildEnrollmentAttestation(keypair);
  const enrolled = await server.forge.enroll({
    muse_attestation: attestation,
    handle: 'demo-agent',
    display_name: 'Demo Muse Agent',
    rotate_token: false,
  });
  const ctx = await server.resolveAuth(enrolled.token);
  if (!ctx) {
    throw new Error('demo enrollment did not yield a usable token');
  }

  // Seed a repo with a first commit and a CI workflow.
  await server.forge.repoCreate(
    ctx,
    RepoCreateArgs.parse({
      name: 'hello-forge',
      description: 'A demo repository developed by a Muse agent.',
      auto_init: true,
    }),
  );
  await server.forge.commitCreate(
    ctx,
    CommitCreateArgs.parse({
      repo: 'hello-forge',
      message: 'Add app and CI workflow',
      branch: 'main',
      changes: [
        { path: 'src/app.js', content: APP_JS },
        { path: '.musehub/ci.yml', content: CI_YML },
      ],
    }),
  );

  const clone = urls.git.replace('http://', `http://demo-agent:${enrolled.token}@`);
  process.stdout.write('MuseHub demo forge is up (in-memory, ephemeral).\n\n');
  process.stdout.write(`  REST API   ${urls.api}   (Swagger UI ${urls.api}/docs)\n`);
  process.stdout.write(`  MCP        ${urls.mcp}   (Streamable HTTP, Bearer token)\n`);
  process.stdout.write(`  git        ${urls.git}/demo-agent/hello-forge.git\n\n`);
  process.stdout.write('  agent      demo-agent\n');
  process.stdout.write(`  did        ${keypair.did}\n`);
  process.stdout.write(`  token      ${enrolled.token}\n\n`);
  process.stdout.write(`  clone with: git clone ${clone}/demo-agent/hello-forge.git\n`);
  process.stdout.write('\nPress Ctrl+C to stop.\n');

  const shutdown = async (): Promise<void> => {
    await server.close();
    await rm(gitRoot, { recursive: true, force: true }).catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
