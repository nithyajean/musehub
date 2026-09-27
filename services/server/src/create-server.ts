// The composition root. Builds every concrete adapter, assembles the core Ports,
// constructs the one ForgeService, and serves the REST API and the MCP server on a
// single process behind a single agent identity.
//
// SECURITY POSTURE: the MCP endpoint (/mcp) and the git smart-HTTP endpoints are
// network-exposed and carry untrusted agent input. resolveAuth gates every REST,
// MCP and git call to an active, allowlisted agent, and the CI runner keeps egress
// denied and each job sandboxed (see @musehub/ci). Run behind TLS with per-token
// rate limits before exposing this publicly.
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { buildApi } from '@musehub/api';
import type { GitHttpHandler, ZodApp } from '@musehub/api';
import { createCiRunner, fromDockerode } from '@musehub/ci';
import { ForgeError } from '@musehub/contracts';
import type { AuthContext, ForgeService, Ports } from '@musehub/core';
import { PrefixedIdGen, SystemClock, createDb, createStores, migrate } from '@musehub/db';
import type { Db } from '@musehub/db';
import { createGitBackend, gitHttpBackend } from '@musehub/git';
import {
  AllowlistAttestationVerifier,
  InMemoryAllowlist,
  InMemoryNonceStore,
  InMemoryRevocationStore,
  MuseHubIdentityService,
} from '@musehub/identity';
import { mountMcpServer } from '@musehub/mcp';
import type { McpHttpServer } from '@musehub/mcp';
import { createForgeService } from '@musehub/service';
import { type ServerConfig, dockerAvailable, resolveTokenSecret } from './config.js';
import { makeGitHttpHandler } from './git-http-adapter.js';
import { createGitWorkspaceProvider } from './workspace-provider.js';

// dockerode has no type declarations, so it is loaded through createRequire and
// treated as unknown by fromDockerode rather than statically imported. This keeps
// the composition root type-clean from every package that consumes it, and only
// loads the module when a Docker CI path is actually wired.
const requireCjs = createRequire(import.meta.url);
type DockerCtor = new () => unknown;

export interface ListenResult {
  port: number;
  api: string;
  mcp: string;
  git: string;
}

/** The assembled forge process. The e2e and demo drive it through these handles. */
export interface MuseHubServer {
  app: ZodApp;
  ports: Ports;
  forge: ForgeService;
  identity: MuseHubIdentityService;
  allowlist: InMemoryAllowlist;
  config: ServerConfig;
  resolveAuth(token: string): Promise<AuthContext | null>;
  urls(): ListenResult | null;
  listen(port?: number): Promise<ListenResult>;
  close(): Promise<void>;
}

const DEFAULT_DB_URL = ':memory:';

/** Build and wire the whole forge. Call listen(port) to start serving. */
export async function createServer(config: ServerConfig = {}): Promise<MuseHubServer> {
  const host = config.host ?? '127.0.0.1';
  const gitBin = config.gitBin ?? 'git';
  const dataDir = config.dataDir ?? `${process.cwd()}/.musehub-data`;
  const dbUrl = config.dbUrl ?? DEFAULT_DB_URL;
  const gitRoot = config.gitRoot ?? `${dataDir}/git`;

  // Persistence: one db handle, one clock, one id generator, the eight stores.
  const db: Db = createDb(dbUrl);
  await migrate(db);
  const clock = new SystemClock();
  const ids = new PrefixedIdGen();
  const stores = createStores(db, { clock, ids });

  // Identity gate. The signing secret is injected; the nonce and revocation stores
  // are in-process here (swap for shared stores across nodes in production).
  const identity = new MuseHubIdentityService({
    signingSecret: resolveTokenSecret(config.tokenSecret),
    nonceStore: new InMemoryNonceStore(),
    revocationStore: new InMemoryRevocationStore(),
    ...(config.tokenTtlSec !== undefined ? { tokenTtlSec: config.tokenTtlSec } : {}),
  });
  const allowlist = new InMemoryAllowlist(config.allowlist ?? []);
  const attestation = new AllowlistAttestationVerifier(allowlist);

  // Git backend plus a smart-HTTP handler over the same bare-repo store.
  const git = createGitBackend({ root: gitRoot, gitBin });
  const smartHttp = gitHttpBackend({ root: gitRoot, gitBin });

  // CI runner. Real Docker when present or forced, else the labeled stub path. The
  // WorkspaceProvider bridges the runner to the git backend it cannot reach itself.
  const workspace = createGitWorkspaceProvider(git, gitRoot, gitBin);
  const useDocker = config.ciDocker ?? dockerAvailable();
  const docker = useDocker ? fromDockerode(new (requireCjs('dockerode') as DockerCtor)()) : null;
  if (docker === null) {
    // Do not let stub CI be a silent rubber stamp. In stub mode jobs are simulated,
    // not executed, so a merge can pass CI without running any code. Say so loudly.
    console.warn(
      'MuseHub CI: running in STUB mode (no Docker daemon). Jobs are simulated, not executed, so a merge can pass its required CI check without running code. Set MUSEHUB_CI_DOCKER=1 with a reachable Docker daemon for real sandboxed CI before enforcing merges in production.',
    );
  }
  const runner = createCiRunner({
    store: stores.ci,
    clock,
    workspace,
    docker,
    options: { resultsDir: config.ciResultsDir ?? null },
  });

  // Mutable so the git/api base URLs can be filled with the real port on listen;
  // the service reads these fields per call when it builds a repo's clone_url.
  const portsConfig = { gitBaseUrl: '', apiBaseUrl: '' };

  const ports: Ports = {
    clock,
    ids,
    agents: stores.agents,
    repos: stores.repos,
    pulls: stores.pulls,
    reviews: stores.reviews,
    issues: stores.issues,
    ci: stores.ci,
    audit: stores.audit,
    sessions: stores.sessions,
    git,
    identity,
    attestation,
    runner,
    config: portsConfig,
  };

  const forge = createForgeService(ports);

  // The one gate REST, MCP and git all pass through: verify the token, load the
  // agent, require it to be active.
  const resolveAuth = async (token: string): Promise<AuthContext | null> => {
    const claims = await identity.verifyToken(token);
    if (!claims) {
      return null;
    }
    const agent = await stores.agents.getById(claims.agentId);
    if (!agent || agent.status !== 'active') {
      return null;
    }
    return { agent, tokenId: claims.tokenId };
  };

  const gitHttp: GitHttpHandler = makeGitHttpHandler(smartHttp);

  const app = await buildApi({
    forge,
    resolveAuth,
    gitHttp,
    config: { title: 'MuseHub forge API', version: '0.1.0' },
  });

  // The MCP server shares the process, the ForgeService and the identity. Its
  // resolveAuth throws unauthenticated so a bad token surfaces as an in-band tool
  // error the model can read rather than a null context.
  const mcp: McpHttpServer = mountMcpServer({
    forge,
    resolveAuth: async (token) => {
      const ctx = token ? await resolveAuth(token) : null;
      if (!ctx) {
        throw new ForgeError('unauthenticated', 'A valid agent token is required for MCP tools.', {
          next: 'Enroll via forge.enroll, then send the token as an Authorization: Bearer header.',
        });
      }
      return ctx;
    },
  });

  // Mount MCP on /mcp. hijack so the SDK transport owns the raw response; Fastify
  // already parsed the JSON body, which is forwarded for initialize detection.
  app.route({
    method: ['GET', 'POST', 'DELETE'],
    url: '/mcp',
    schema: { hide: true },
    handler: async (request, reply) => {
      reply.hijack();
      await mcp.handleRequest(request.raw, reply.raw, request.body);
    },
  });

  // Admin read surface for the dashboard. listAudit and listBranches are not agent
  // tools, so they sit here behind the same Bearer gate rather than on the tool API.
  const unauthorized = {
    error: {
      code: 'unauthenticated',
      message: 'Admin read needs a valid agent token.',
      retryable: false,
      http_status: 401,
    },
  };
  const tokenFrom = (authorization: string | undefined): string | null =>
    typeof authorization === 'string' && authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : null;

  app.get('/v1/admin/audit', { schema: { hide: true } }, async (request, reply) => {
    const token = tokenFrom(request.headers.authorization);
    const ctx = token ? await resolveAuth(token) : null;
    if (!ctx) {
      return reply.code(401).send(unauthorized);
    }
    const q = request.query as { actor?: string; cursor?: string; limit?: string };
    const limit = q.limit ? Math.min(100, Math.max(1, Number.parseInt(q.limit, 10) || 30)) : 30;
    return forge.listAudit(ctx, {
      ...(q.actor !== undefined ? { actor: q.actor } : {}),
      ...(q.cursor !== undefined ? { cursor: q.cursor } : {}),
      limit,
    });
  });

  app.get(
    '/v1/admin/repos/:owner/:repo/branches',
    { schema: { hide: true } },
    async (request, reply) => {
      const token = tokenFrom(request.headers.authorization);
      const ctx = token ? await resolveAuth(token) : null;
      if (!ctx) {
        return reply.code(401).send(unauthorized);
      }
      const p = request.params as { owner: string; repo: string };
      return forge.listBranches(ctx, `${p.owner}/${p.repo}`);
    },
  );

  let listenResult: ListenResult | null = null;

  async function listen(port?: number): Promise<ListenResult> {
    const chosen = port ?? config.port ?? 0;
    await app.listen({ port: chosen, host });
    const address = app.server.address() as AddressInfo;
    const urlHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
    const base = `http://${urlHost}:${address.port}`;
    portsConfig.gitBaseUrl = base;
    portsConfig.apiBaseUrl = base;
    listenResult = { port: address.port, api: base, mcp: `${base}/mcp`, git: base };
    return listenResult;
  }

  async function close(): Promise<void> {
    await mcp.closeAll().catch(() => {});
    await app.close().catch(() => {});
    await db.close().catch(() => {});
  }

  return {
    app,
    ports,
    forge,
    identity,
    allowlist,
    config,
    resolveAuth,
    urls: () => listenResult,
    listen,
    close,
  };
}
