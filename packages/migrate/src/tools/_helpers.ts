/**
 * Shared helpers for MCP tool definitions.
 */

import { z, type ZodRawShape } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface McpTool<TSchema extends ZodRawShape> {
  /** zod schema describing the tool input */
  shape: TSchema;
  /** the handler invoked when the tool is called */
  handler: ToolCallback<TSchema>;
}

export function defineTool<TSchema extends ZodRawShape>(
  shape: TSchema,
  handler: ToolCallback<TSchema>
): McpTool<TSchema> {
  return { shape, handler };
}

/**
 * Build a JSON-schema representation of a zod shape for documentation purposes.
 * The MCP SDK accepts zod shapes directly so this is mostly used in tests.
 */
export function describeSchema(shape: ZodRawShape): Record<string, unknown> {
  return z.toJSONSchema(z.object(shape), { target: 'draft-07' }) as Record<string, unknown>;
}

export { z };
