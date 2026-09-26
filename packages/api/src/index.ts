// @musehub/api - the Fastify HTTP service. Exposes the 30 forge.* operations as
// versioned REST with an OpenAPI document, authenticates every request by the
// Bearer agent token into an AuthContext, maps ForgeError to the wire envelope,
// and mounts the git smart-HTTP proxy. Depends on the @musehub/core ForgeService
// interface (the concrete impl is injected at the composition root). Filled in by
// the api build agent (Wave 1). See .hq/research/R6-agent-api-design.md.
export const PACKAGE = '@musehub/api';
