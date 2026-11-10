import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { FeishuApiService } from '../services/feishuApiService.js';
import { formatErrorMessage } from '../utils/error.js';

export function tableTool<S extends z.ZodRawShape>(
  name: string,
  description: string,
  shape: S,
  readOnly: boolean,
  handler: (params: z.output<z.ZodObject<S>>, api: FeishuApiService) => Promise<unknown>,
) {
  const schema = z.object(shape);
  return {
    name,
    description,
    schema,
    readOnly,
    execute: (params: unknown, api: FeishuApiService) => handler(schema.parse(params), api),
  };
}

export interface TableTool {
  name: string;
  description: string;
  schema: z.AnyZodObject;
  readOnly: boolean;
  execute(params: unknown, api: FeishuApiService): Promise<unknown>;
}

/** Share validation and error reporting between MCP and CLI entry points. */
export function registerTableTools(
  server: McpServer,
  api: FeishuApiService,
  tools: TableTool[],
): void {
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema.shape,
        annotations: { readOnlyHint: tool.readOnly },
      },
      async (params: unknown): Promise<CallToolResult> => {
        try {
          const result = await tool.execute(params, api);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          return { isError: true, content: [{ type: 'text', text: formatErrorMessage(error) }] };
        }
      },
    );
  }
}
