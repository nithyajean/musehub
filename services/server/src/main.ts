// Environment-driven entrypoint. Reads config from the environment, boots the
// forge and serves REST + MCP + git on one port. Run with `pnpm --filter
// @musehub/server start` (tsx src/main.ts).
//
// SECURITY: the MCP and git endpoints are network-exposed and process untrusted
// agent input. Every call is gated by resolveAuth to an active allowlisted agent
// and CI egress stays denied. Put this behind TLS and per-token rate limits before
// exposing it beyond localhost. The allowlist starts empty unless MUSEHUB_ALLOWLIST
// is set, so no agent can enroll until an operator admits its did.
import { configFromEnv } from './config.js';
import { createServer } from './create-server.js';

async function main(): Promise<void> {
  const config = configFromEnv();
  const server = await createServer(config);
  const urls = await server.listen();

  process.stdout.write('MuseHub forge is up.\n');
  process.stdout.write(`  REST API  ${urls.api}\n`);
  process.stdout.write(`  OpenAPI   ${urls.api}/openapi.json  (Swagger UI at ${urls.api}/docs)\n`);
  process.stdout.write(`  MCP       ${urls.mcp}  (Streamable HTTP, Bearer agent token)\n`);
  process.stdout.write(`  git       ${urls.git}/<owner>/<repo>.git\n`);
  if ((config.allowlist ?? []).length === 0) {
    process.stdout.write(
      'Note: the allowlist is empty. Set MUSEHUB_ALLOWLIST to admit agent did:key values, or no agent can enroll.\n',
    );
  }
  if (!config.tokenSecret) {
    process.stdout.write(
      'Note: MUSEHUB_TOKEN_SECRET is unset, so a random token secret was generated. Tokens will not survive a restart.\n',
    );
  }

  const shutdown = async (signal: string): Promise<void> => {
    process.stdout.write(`\n${signal} received, shutting down.\n`);
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
