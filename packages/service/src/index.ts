// @musehub/service - public surface. The brain is createForgeService, which
// builds the one ForgeService over the injected @musehub/core ports. Both the
// REST API and the MCP server consume it. Helper modules stay internal.
export { createForgeService } from './service.js';
