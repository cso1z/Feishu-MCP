import { resolve } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

export const GLOBAL_CONFIG_DIR = resolve(homedir(), '.cache', 'feishu-mcp');
export const GLOBAL_CONFIG_FILE = resolve(GLOBAL_CONFIG_DIR, '.env');

const CONFIG_KEYS: Record<string, string> = {
  FEISHU_APP_ID:           '飞书应用 App ID',
  FEISHU_APP_SECRET:       '飞书应用 App Secret',
  FEISHU_AUTH_TYPE:        '认证类型：tenant（应用身份）或 user（用户身份，支持 task/member）',
  FEISHU_ENABLED_MODULES:  '启用的功能模块，逗号分隔，可选值: document,task,member,calendar,all',
  FEISHU_BASE_URL:         '飞书 API 基础地址。飞书国内版：https://open.feishu.cn/open-apis（默认），Lark 国际版：https://open.larksuite.com/open-apis',
  FEISHU_AUTH_BASE_URL:    '飞书授权页面域名。飞书国内版：https://accounts.feishu.cn（默认），Lark 国际版：https://accounts.larksuite.com',
  FEISHU_PUBLIC_BASE_URL:  '服务对外可访问的基础地址，用于生成 user 认证的 OAuth 回调地址',
  FEISHU_SCOPE_VALIDATION: '是否启用权限校验：true 或 false，默认 true',
  PORT:                    '服务监听端口，默认 3333',
};

/** 读取并解析 .env 文件为 key-value 对象 */
export function readEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const result: Record<string, string> = {};
  for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    result[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return result;
}

/** 向 .env 文件写入或更新一个 key */
export function writeEnvKey(filePath: string, key: string, value: string): void {
  mkdirSync(resolve(filePath, '..'), { recursive: true });
  let content = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += (content && !content.endsWith('\n') ? '\n' : '') + `${key}=${value}\n`;
  }
  writeFileSync(filePath, content, 'utf-8');
}

/** 对敏感字段做脱敏处理 */
function maskValue(key: string, value: string): string {
  if (key.includes('SECRET') || key.includes('APP_ID')) {
    if (value.length <= 6) return '****';
    return `${value.slice(0, 3)}****${value.slice(-3)}`;
  }
  return value;
}

/** 展示当前生效配置 */
export function handleConfigShow(envPath: string | undefined): void {
  // 仅当加载来源与全局配置文件不同时，才额外展示全局配置文件内容（避免重复）
  const showGlobal = envPath !== GLOBAL_CONFIG_FILE;
  const output: Record<string, unknown> = {
    configFile: existsSync(GLOBAL_CONFIG_FILE) ? GLOBAL_CONFIG_FILE : null,
    loadedFrom: envPath ?? null,
    config: {
      FEISHU_APP_ID: process.env.FEISHU_APP_ID
        ? maskValue('FEISHU_APP_ID', process.env.FEISHU_APP_ID) : '(未设置)',
      FEISHU_APP_SECRET: process.env.FEISHU_APP_SECRET
        ? maskValue('FEISHU_APP_SECRET', process.env.FEISHU_APP_SECRET) : '(未设置)',
      FEISHU_AUTH_TYPE: process.env.FEISHU_AUTH_TYPE ?? 'tenant (默认)',
      FEISHU_ENABLED_MODULES: process.env.FEISHU_ENABLED_MODULES ?? 'document (默认)',
      FEISHU_BASE_URL: process.env.FEISHU_BASE_URL ?? 'https://open.feishu.cn/open-apis (默认)',
      FEISHU_AUTH_BASE_URL: process.env.FEISHU_AUTH_BASE_URL ?? 'https://accounts.feishu.cn (默认)',
      FEISHU_PUBLIC_BASE_URL: process.env.FEISHU_PUBLIC_BASE_URL ?? '(未设置)',
      PORT: process.env.PORT ?? '3333 (默认)',
    },
  };
  if (showGlobal) {
    const fileConfig = readEnvFile(GLOBAL_CONFIG_FILE);
    output.globalConfigFile = Object.keys(fileConfig).length
      ? Object.fromEntries(Object.entries(fileConfig).map(([k, v]) => [k, maskValue(k, v)]))
      : '(文件不存在)';
  }
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

/** 向配置文件写入 key=value，写入目标与当前加载来源保持一致 */
export function handleConfigSet(key: string | undefined, value: string | undefined, envPath: string | undefined): void {
  if (!key || !value) {
    process.stdout.write(JSON.stringify({
      usage: 'feishu-tool config set <KEY> <VALUE>',
      availableKeys: CONFIG_KEYS,
    }, null, 2) + '\n');
    process.exit(0);
  }
  if (!(key in CONFIG_KEYS)) {
    process.stdout.write(JSON.stringify({
      error: `未知配置项: ${key}`,
      availableKeys: CONFIG_KEYS,
    }) + '\n');
    process.exit(1);
  }
  // 写入目标与读取来源一致：已有加载文件则写入该文件，否则写入全局配置文件
  const targetFile = envPath ?? GLOBAL_CONFIG_FILE;
  writeEnvKey(targetFile, key, value);
  process.stdout.write(JSON.stringify({
    ok: true,
    file: targetFile,
    set: { [key]: key.includes('SECRET') || key.includes('APP_ID') ? maskValue(key, value) : value },
  }) + '\n');
}
