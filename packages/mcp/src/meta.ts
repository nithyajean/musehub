import { TOOLS } from '@musehub/contracts';
import { type JsonObjectSchema, toJsonSchema } from './json-schema.js';

/**
 * A Meta Model API function-tool definition (Responses / Chat Completions flat
 * shape). A developer building their own Muse Spark agent pastes these straight
 * into a request `tools` array. The model never runs them: it returns a call, the
 * caller dispatches it to MuseHub. Shape from R6 section 1.1.
 */
export interface MetaFunctionTool {
  type: 'function';
  name: string;
  description: string;
  parameters: JsonObjectSchema;
}

/**
 * Emit all 50 forge.* tools as Meta Model API function-tool definitions. Pure: no
 * server, no IO. The `parameters` is the identical JSON Schema the MCP server
 * serves as `inputSchema`, so a self-built agent and a Muse connector get the same
 * surface. Names carry exactly one dot so they are legal Meta function names.
 */
export function metaFunctionTools(): MetaFunctionTool[] {
  return TOOLS.map((def) => ({
    type: 'function',
    name: def.name,
    description: def.description,
    parameters: toJsonSchema(def.schema),
  }));
}
