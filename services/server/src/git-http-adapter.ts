// Bridge the API's GitHttpHandler contract to the @musehub/git smart-HTTP backend.
//
// SECURITY: this path is reached only after the API has authenticated the caller
// as an active agent (HTTP Basic, the agent token as the password). The request
// body is an untrusted packfile, so the backend runs the pre-receive hook as the
// git-side gate before any ref moves. The body is buffered here for the CGI, which
// is fine for a demo scale forge; a production build streams it.
//
// Fastify types are taken from the GitHttpHandler signature rather than imported
// from "fastify" directly, so this package needs no dependency on fastify.
import type { GitHttpHandler } from '@musehub/api';
import type { SmartHttpHandler, SmartHttpResponse } from '@musehub/git';

type GitRequest = Parameters<GitHttpHandler>[0];

/** Read a Fastify request's raw body into one Buffer. Only called for POST paths. */
function readRawBody(request: GitRequest): Promise<Buffer> {
  const raw = request.raw;
  if (raw.readableEnded) {
    return Promise.resolve(Buffer.alloc(0));
  }
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    raw.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    raw.on('end', () => resolve(Buffer.concat(chunks)));
    raw.on('error', reject);
  });
}

// Headers git sets that Fastify recomputes for a Buffer payload, so passing them
// through would double-count the length or fight the framing.
const DROP_RESPONSE_HEADERS = new Set(['content-length', 'transfer-encoding']);

/**
 * Build the GitHttpHandler the API injects. It reconstructs the smart-HTTP request
 * from the Fastify request (the raw URL already carries the `.git` path and the
 * `service=` query git expects) and forwards the authenticated agent handle as
 * REMOTE_USER for the hooks.
 */
export function makeGitHttpHandler(smart: SmartHttpHandler): GitHttpHandler {
  return async (request, reply, ctx): Promise<void> => {
    const method = request.method.toUpperCase();
    const body =
      method === 'GET' || method === 'HEAD' ? Buffer.alloc(0) : await readRawBody(request);
    const response: SmartHttpResponse = await smart({
      method,
      url: request.url,
      headers: request.headers,
      body,
      remoteUser: ctx.auth.agent.handle,
      remoteAddr: request.ip,
    });
    reply.code(response.status);
    for (const [key, value] of Object.entries(response.headers)) {
      if (DROP_RESPONSE_HEADERS.has(key.toLowerCase())) {
        continue;
      }
      reply.header(key, value);
    }
    reply.send(response.body);
  };
}
