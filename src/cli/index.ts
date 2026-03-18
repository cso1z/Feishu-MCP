#!/usr/bin/env node

import { resolve } from 'path';
import { config as loadDotEnv } from 'dotenv';
import { Logger } from '../utils/logger.js';
import { dispatch, listTools } from './dispatcher.js';

// 加载 .env 文件
loadDotEnv({ path: resolve(process.cwd(), '.env') });

// 禁用所有日志输出，保持 stdout 纯 JSON
Logger.setEnabled(false);

async function main(): Promise<void> {
  const [, , toolName, rawParams = '{}'] = process.argv;

  // 无参数时打印帮助
  if (!toolName || toolName === '--help' || toolName === '-h') {
    const tools = listTools();
    process.stdout.write(
      JSON.stringify({
        usage: 'feishu-mcp-tool <tool-name> \'<json-params>\'',
        tools,
      }, null, 2) + '\n'
    );
    process.exit(0);
  }

  // 解析参数
  let params: unknown;
  try {
    params = JSON.parse(rawParams);
  } catch {
    process.stdout.write(
      JSON.stringify({ error: `参数解析失败，请提供合法的 JSON 字符串: ${rawParams}` }) + '\n'
    );
    process.exit(1);
  }

  // 调度工具
  try {
    const result = await dispatch(toolName, params);
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(0);
  } catch (err: unknown) {
    let message: string;
    if (err instanceof Error) {
      message = err.message;
    } else if (typeof err === 'object' && err !== null) {
      message = JSON.stringify(err);
    } else {
      message = String(err);
    }
    process.stdout.write(JSON.stringify({ error: message }) + '\n');
    process.exit(1);
  }
}

main();
