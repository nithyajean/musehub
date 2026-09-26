import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDef } from '@musehub/contracts';
import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * A JSON Schema for an object argument set. This is the one shape emitted to both
 * the MCP `inputSchema` and the Meta Model API function-tool `parameters`, so it
 * stays a plain self-contained object with no external refs.
 */
export interface JsonObjectSchema {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

/**
 * Convert a forge tool's zod schema to a self-contained JSON Schema. `$refStrategy:
 * 'none'` inlines every sub-schema so a single tool definition can be pasted on its
 * own. The `$schema` marker is dropped because neither surface needs it. Every
 * forge schema is a strict object, so the top-level type is always `object`.
 */
export function toJsonSchema(schema: ZodTypeAny): JsonObjectSchema {
  const generated = zodToJsonSchema(schema, {
    $refStrategy: 'none',
    target: 'jsonSchema7',
  }) as Record<string, unknown>;
  const { $schema: _drop, ...rest } = generated;
  return { ...rest, type: 'object' } as JsonObjectSchema;
}

/** Build the MCP tool descriptor (name, model-read description, JSON Schema input). */
export function toMcpTool(def: ToolDef): Tool {
  return {
    name: def.name,
    description: def.description,
    inputSchema: toJsonSchema(def.schema) as Tool['inputSchema'],
  };
}
