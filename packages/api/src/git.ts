// git smart-HTTP transport. Same identity as REST and MCP: HTTP Basic with the
// agent token as the password. Coexists with the file/commit tools. A commit pushed
// here is indistinguishable in history from one made through forge.commit_create.
//
// SECURITY: git-receive-pack accepts UNTRUSTED agent input. The request body is a
// packfile the backend unpacks and runs pre-receive hooks over, so the caller is
// authenticated here BEFORE the backend process ever touches the input. Branch
// protection is enforced by the backend's pre-receive hook (R4), not by this layer.
// The packfile body is left as an unread stream, never buffered into memory here.
// This is a network-exposed surface that runs agent code paths downstream, so the
// injected backend is responsible for sandboxing, an egress allowlist and resource
// caps (R8).
import { ForgeError } from '@musehub/contracts';
import type { AuthContext } from '@musehub/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { BuildApiDeps, GitHttpContext, ZodApp } from './deps.js';

const GIT_CONTENT_TYPES = [
  'application/x-git-upload-pack-request',
  'application/x-git-receive-pack-request',
];

function stripDotGit(repo: string): string {
  return repo.endsWith('.git') ? repo.slice(0, -'.git'.length) : repo;
}

export function registerGitRoutes(app: ZodApp, deps: BuildApiDeps): void {
  // Leave git packfile bodies as an unread stream for the backend to consume.
  app.addContentTypeParser(GIT_CONTENT_TYPES, (_req, payload, done) => done(null, payload));

  async function basicAuth(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<AuthContext | null> {
    const header = request.headers.authorization;
    const encoded = header?.startsWith('Basic ') ? header.slice('Basic '.length) : null;
    let token: string | null = null;
    if (encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const sep = decoded.indexOf(':');
      // The token is the password. Username is the handle or x-access-token, ignored.
      token = sep >= 0 ? decoded.slice(sep + 1) : decoded;
    }
    const ctx = token ? await deps.resolveAuth(token) : null;
    if (!ctx) {
      const env = new ForgeError(
        'unauthenticated',
        'Git access needs a valid agent token as the HTTP Basic password.',
        { next: 'Clone with https://<handle>:<agent-token>@host/<owner>/<repo>.git' },
      ).toEnvelope();
      reply
        .header('WWW-Authenticate', 'Basic realm="MuseHub", charset="UTF-8"')
        .code(401)
        .send(env);
      return null;
    }
    return ctx;
  }

  function noBackend(reply: FastifyReply): FastifyReply {
    reply.code(503).send({
      error: {
        code: 'internal_error',
        message: 'Git smart-HTTP backend is not configured on this instance.',
        next: 'Use the REST or MCP file and commit tools. Otherwise enable the git backend.',
        retryable: false,
        http_status: 503,
      },
    });
    return reply;
  }

  async function delegate(
    request: FastifyRequest,
    reply: FastifyReply,
    service: GitHttpContext['service'],
  ): Promise<FastifyReply> {
    const auth = await basicAuth(request, reply);
    if (!auth) return reply;
    if (!deps.gitHttp) return noBackend(reply);
    const p = request.params as { owner: string; repo: string };
    await deps.gitHttp(request, reply, {
      auth,
      owner: p.owner,
      repo: stripDotGit(p.repo),
      service,
    });
    return reply;
  }

  // Clone / fetch advertisement. Read-only, still agent-authenticated.
  app.get('/:owner/:repo/info/refs', { schema: { hide: true } }, (request, reply) =>
    delegate(request, reply, 'info-refs'),
  );

  // Fetch: the client's wants arrive as an unread stream, authenticated first.
  app.post('/:owner/:repo/git-upload-pack', { schema: { hide: true } }, (request, reply) =>
    delegate(request, reply, 'upload-pack'),
  );

  // Push: the untrusted write path. Authenticate before the backend unpacks anything.
  app.post('/:owner/:repo/git-receive-pack', { schema: { hide: true } }, (request, reply) =>
    delegate(request, reply, 'receive-pack'),
  );
}
