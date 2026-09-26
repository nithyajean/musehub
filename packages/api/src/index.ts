// @musehub/api - the Fastify HTTP service. Exposes the 30 forge.* operations as
// versioned REST with an OpenAPI document at /openapi.json and Swagger UI at /docs,
// authenticates every protected request by the Bearer agent token into an
// AuthContext, maps ForgeError to the wire envelope and mounts the git smart-HTTP
// proxy. Depends only on the @musehub/core ForgeService interface and the
// @musehub/contracts schemas; the concrete implementations are injected by the
// composition root (@musehub/server, Wave 2). See .hq/research/R6-agent-api-design.md.
export { buildApi } from './app.js';
export type {
  ApiConfig,
  BuildApiDeps,
  GitHttpContext,
  GitHttpHandler,
  ZodApp,
} from './deps.js';

export const PACKAGE = '@musehub/api';
