import { exec } from 'child_process';
import { createServer as createNetServer } from 'net';
import express from 'express';
import { Server } from 'http';
import { Config } from '../../utils/config.js';
import { AuthUtils, TokenCacheManager } from '../../utils/auth/index.js';
import { getRequiredScopes } from '../../services/constants/feishuScopes.js';
import { ModuleRegistry } from '../../modules/index.js';
// callbackService 需延迟导入，避免其模块级 Config.getInstance() 在 CLI 启动时提前触发 yargs


const AUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟
const POLL_INTERVAL_MS = 1000;

/**
 * 在系统默认浏览器中打开 URL（跨平台）
 */
export function openBrowser(url: string): void {
  let cmd: string;
  if (process.platform === 'win32') {
    cmd = `cmd /c start "" "${url}"`;
  } else if (process.platform === 'darwin') {
    cmd = `open "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }
  exec(cmd, (err) => {
    if (err) {
      process.stderr.write(`[feishu-tool] 无法自动打开浏览器，请手动访问上方授权链接\n`);
    }
  });
}

/**
 * 检查端口是否可用
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * 从起始端口开始寻找第一个可用端口（最多尝试 10 个）
 */
async function findAvailablePort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 10; port++) {
    if (await isPortAvailable(port)) return port;
  }
  return startPort; // fallback，让后续绑定时自然报错
}

/**
 * 启动临时 callback express 服务器（延迟导入 callbackService 避免提前触发 Config）
 */
async function startCallbackServer(port: number): Promise<Server> {
  const { callback } = await import('../../services/callbackService.js');
  const app = express();
  app.get('/callback', callback);

  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
}

/**
 * 轮询 TokenCacheManager，等待指定 clientKey 的有效 token 写入
 */
async function waitForToken(clientKey: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const cache = TokenCacheManager.getInstance();

  while (Date.now() < deadline) {
    const status = cache.checkUserTokenStatus(clientKey);
    if (status.isValid) return true;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

/**
 * 处理 AuthRequiredError：启动 callback 服务器，打开浏览器，等待 token
 * 成功后 token 已写入 TokenCacheManager，调用方可直接重试 ToolApi
 * @throws Error 超时或端口绑定失败
 */
export async function handleAuthRequired(userKey: string): Promise<void> {
  const config = Config.getInstance();
  const { appId, appSecret, authBaseUrl } = config.feishu;

  // 1. 寻找可用端口（从配置端口开始）
  const port = await findAvailablePort(config.server.port);
  const redirectUri = `http://localhost:${port}/callback`;

  // 2. 计算 clientKey、scope 和 state
  const clientKey = AuthUtils.generateClientKey(userKey);
  const authType = config.feishu.authType;
  const enabledIds = config.features.enabledModules;
  const effectiveModules = ModuleRegistry.getEnabledModules(enabledIds, authType).map(m => m.id);
  const scopeList = getRequiredScopes(effectiveModules, authType);
  const scope = encodeURIComponent(scopeList.join(' '));
  const state = AuthUtils.encodeState(appId, appSecret, clientKey, redirectUri);

  // 3. 构造飞书 OAuth 授权 URL（与 baseService.generateUserAuthUrl 保持一致）
  const authUrl =
    `${authBaseUrl}/open-apis/authen/v1/authorize` +
    `?client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${scope}` +
    `&state=${encodeURIComponent(state)}`;

  // 4. 启动临时 callback 服务器
  let server: Server;
  try {
    server = await startCallbackServer(port);
  } catch (err) {
    throw new Error(`无法启动授权回调服务器（端口 ${port}）：${err}`);
  }

  // 5. 打开浏览器并向 stderr 输出提示（不污染 stdout）
  openBrowser(authUrl);
  process.stderr.write(
    `\n[feishu-tool] 需要飞书授权，已在浏览器打开授权页（5 分钟内有效）\n` +
    `[feishu-tool] 授权链接：${authUrl}\n\n`
  );

  // 6. 等待 token 写入
  const ok = await waitForToken(clientKey, AUTH_TIMEOUT_MS);

  // 7. 延迟关闭临时服务器，确保 /callback 的 HTTP 响应已发送完毕
  await new Promise<void>((resolve) => setTimeout(resolve, 1000));
  await new Promise<void>((resolve) => server.close(() => resolve()));

  if (!ok) {
    throw new Error('飞书授权超时（5 分钟），请重新执行命令');
  }
}

/** 展示当前 token 授权状态 */
export async function handleAuthStatus(): Promise<void> {
  const config = Config.getInstance();
  const { authType, userKey } = config.feishu;

  if (authType !== 'user') {
    process.stdout.write(JSON.stringify({ authType, status: 'tenant 模式无需用户授权' }) + '\n');
    return;
  }

  const clientKey = AuthUtils.generateClientKey(userKey);
  const status = TokenCacheManager.getInstance().checkUserTokenStatus(clientKey);
  process.stdout.write(JSON.stringify({ authType, userKey, ...status }) + '\n');
}

/** 清除当前用户 token 缓存 */
export async function handleAuthLogout(): Promise<void> {
  const config = Config.getInstance();
  const { userKey } = config.feishu;
  const clientKey = AuthUtils.generateClientKey(userKey);
  const ok = TokenCacheManager.getInstance().removeUserToken(clientKey);
  process.stdout.write(JSON.stringify({
    ok,
    message: ok ? '已退出登录，token 已清除' : '未找到缓存的 token',
  }) + '\n');
}
