#!/usr/bin/env node

import { resolve } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import { config as loadDotEnv } from 'dotenv';
import { Logger } from '../utils/logger.js';
import { dispatch, listTools } from './dispatcher.js';
import { handleConfigShow, handleConfigSet } from './commands/config.js';
import { handleAuthStatus, handleAuthLogout } from './commands/auth.js';
import { handleGuide } from './commands/guide.js';
import { handleHelp } from './commands/help.js';

// 按优先级查找 .env：CWD → ~/.cache/feishu-mcp（与 token 缓存同目录）
const envCandidates = [
  resolve(process.cwd(), '.env'),
  resolve(homedir(), '.cache', 'feishu-mcp', '.env'),
];
const envPath = envCandidates.find(p => existsSync(p));
if (envPath) loadDotEnv({ path: envPath });

// 禁用所有日志输出，保持 stdout 纯 JSON
Logger.setEnabled(false);

// ---- 子命令注册表 ----
type Handler = (args: string[]) => Promise<void> | void;

interface CommandDef {
  description: string;
  handler: Handler;
}

// key 为空字符串表示默认子命令（即直接执行父命令时）
const COMMAND_REGISTRY: Record<string, Record<string, CommandDef>> = {
  config: {
    '':    { description: '查看当前生效配置',                    handler: (_)    => handleConfigShow(envPath) },
    set:   { description: '修改配置 <KEY> <VALUE>（不带参数可查看所有可用 KEY）', handler: (args) => handleConfigSet(args[0], args[1], envPath) },
  },
  auth: {
    '':     { description: '查看 token 授权状态',               handler: (_) => handleAuthStatus() },
    logout: { description: '清除已缓存的 token',                handler: (_) => handleAuthLogout() },
  },
  guide: {
    '':     { description: '飞书应用配置指南（步骤说明）',        handler: (_) => handleGuide() },
  },
  help: {
    '':     { description: '查看工具详细说明 <tool-name>（不带参数列出所有工具）', handler: (args) => handleHelp(args) },
  },
};

async function main(): Promise<void> {
  const [, , cmd, sub, ...rest] = process.argv;

  // 子命令路由：在注册表中查找并执行
  if (cmd && cmd in COMMAND_REGISTRY) {
    const subMap = COMMAND_REGISTRY[cmd];
    // sub 命中具名子命令则执行，否则 fallback 到默认（''）
    const subKey = sub && sub in subMap ? sub : '';
    const def = subMap[subKey];
    if (def) {
      const args = subKey ? rest : (sub ? [sub, ...rest] : []);
      await def.handler(args);
      process.exit(0);
    }
  }

  const toolName = cmd;
  const rawParams = sub ?? '{}';

  // 无参数时打印帮助（按认证类型过滤工具列表，自动从注册表生成子命令说明）
  if (!toolName || toolName === '--help' || toolName === '-h') {
    const authType = (process.env.FEISHU_AUTH_TYPE ?? 'tenant') as 'tenant' | 'user';
    const subcommands: Record<string, string> = {};
    for (const [c, subMap] of Object.entries(COMMAND_REGISTRY)) {
      for (const [s, def] of Object.entries(subMap)) {
        subcommands[s ? `${c} ${s}` : c] = def.description;
      }
    }
    process.stdout.write(JSON.stringify({
      usage: "feishu-tool <tool-name> '<json-params>'",
      subcommands,
      authType,
      toolsNote: authType === 'tenant'
        ? 'task/member 工具需 FEISHU_AUTH_TYPE=user 才可用'
        : '所有工具均可用',
      tools: listTools(authType),
    }, null, 2) + '\n');
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
    // 若工具已返回序列化字符串（如 get_feishu_document_blocks），直接输出避免双重编码
    process.stdout.write((typeof result === 'string' ? result : JSON.stringify(result)) + '\n');
    process.exit(0);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message
      : typeof err === 'object' && err !== null ? JSON.stringify(err)
      : String(err);
    process.stdout.write(JSON.stringify({ error: message }) + '\n');
    process.exit(1);
  }
}

main().catch(() => process.exit(1));