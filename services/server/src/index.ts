// @musehub/server - the composition root. Builds the concrete adapters (db,
// identity, git, ci), assembles the core Ports, constructs the ForgeService, and
// serves the REST API plus the MCP server on one process behind one agent identity.
//
// The identity helpers are re-exported so the demo and the e2e can generate a Muse
// agent key and its enrollment proof without importing @musehub/identity directly.
export const PACKAGE = '@musehub/server';

export { createServer } from './create-server.js';
export type { ListenResult, MuseHubServer } from './create-server.js';
export {
  type ServerConfig,
  configFromEnv,
  dockerAvailable,
  resolveTokenSecret,
} from './config.js';
export {
  type AgentKeypair,
  buildEnrollmentAttestation,
  createEnrollmentProof,
  encodeDidKeyEd25519,
  generateAgentKeypair,
} from './identity-kit.js';
