// The Bearer-token gate for every protected REST route. Enrollment and the git
// smart-HTTP routes handle their own auth, so they are registered without this hook.
import { ForgeError } from '@musehub/contracts';
import type { AuthContext } from '@musehub/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { BuildApiDeps } from './deps.js';

const NEXT_ENROLL = 'Call forge.enroll to get a token, then set the Authorization: Bearer header.';

/** Build the preHandler that resolves the Bearer token into request.auth. */
export function makeRequireAuth(deps: BuildApiDeps) {
  return async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new ForgeError('unauthenticated', 'Missing or malformed Authorization header.', {
        next: NEXT_ENROLL,
      });
    }
    const token = header.slice('Bearer '.length).trim();
    const ctx = token ? await deps.resolveAuth(token) : null;
    if (!ctx) {
      throw new ForgeError('unauthenticated', 'Invalid or expired token.', { next: NEXT_ENROLL });
    }
    request.auth = ctx;
  };
}

/** Read the auth context set by requireAuth. Throws if the hook did not run. */
export function authOf(request: FastifyRequest): AuthContext {
  if (!request.auth) {
    throw new ForgeError('internal_error', 'Auth context missing after the auth hook.');
  }
  return request.auth;
}
