import { calendarTools } from '../../modules/calendar/tools/calendarTools.js';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { listTools } from '../dispatcher.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = resolve(__dirname, '../../../tool-schemas');

export function handleHelp(args: string[]): void {
  const toolName = args[0];

  if (!toolName) {
    const authType = (process.env.FEISHU_AUTH_TYPE ?? 'tenant') as 'tenant' | 'user';
    process.stdout.write(JSON.stringify({ tools: listTools(authType) }, null, 2) + '\n');
    return;
  }

  const tableTool = [...calendarTools].find(tool => tool.name === toolName);
  if (tableTool) {
    process.stdout.write(JSON.stringify({
      name: tableTool.name,
      description: tableTool.description,
      arguments: toJsonSchemaCompat(tableTool.schema),
    }, null, 2) + '\n');
    return;
  }

  const filePath = resolve(TOOLS_DIR, `${toolName}.json`);
  if (!existsSync(filePath)) {
    const authType = (process.env.FEISHU_AUTH_TYPE ?? 'tenant') as 'tenant' | 'user';
    process.stdout.write(
      JSON.stringify({ error: `未找到工具 "${toolName}"`, tools: listTools(authType) }, null, 2) + '\n'
    );
    return;
  }

  process.stdout.write(readFileSync(filePath, 'utf-8') + '\n');
}