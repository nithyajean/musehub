// Public shape of what the composition root injects into the API. The API depends
// only on the @musehub/core ForgeService interface and an auth resolver, never on a
// concrete database, git binary or identity implementation. Those are wired in
// @musehub/server (Wave 2) and passed here.
import type { AuthContext, ForgeService } from '@musehub/core';
import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

/** A Fastify instance wired to the zod type provider, so request typing flows from
 * the contract schemas attached to each route. */
export type ZodApp = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  ZodTypeProvider
>;

export interface ApiConfig {
  /** Base URL advertised in the OpenAPI servers list. */
  apiBaseUrl?: string;
  /** Base URL git clients use for smart-HTTP, surfaced in docs. */
  gitBaseUrl?: string;
  title?: string;
  version?: string;
}

/** Everything the git backend needs once the caller is authenticated. */
export interface GitHttpContext {
  auth: AuthContext;
  owner: string;
  repo: string;
  service: 'info-refs' | 'upload-pack' | 'receive-pack';
}

/**
 * The git smart-HTTP delegate, implemented by @musehub/git and injected. The API
 * authenticates the caller and resolves owner/repo, then hands the raw request and
 * reply to this handler for streaming. Optional: when absent the git routes answer
 * with a clear disabled-backend envelope instead of a raw error.
 */
export type GitHttpHandler = (
  request: FastifyRequest,
  reply: FastifyReply,
  ctx: GitHttpContext,
) => Promise<void> | void;

export interface BuildApiDeps {
  forge: ForgeService;
  /** Resolve a Bearer/Basic token to the authenticated agent (null when invalid). */
  resolveAuth: (token: string) => Promise<AuthContext | null>;
  gitHttp?: GitHttpHandler;
  config?: ApiConfig;
}

// The authenticated agent is stashed on the request by the auth preHandler and read
// back in each handler.
declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}
