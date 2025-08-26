import { Request, Response } from 'express';
import { AuthService } from './feishuAuthService.js';
import { Config } from '../utils/config.js';
import { CacheManager } from '../utils/cache.js';
import { renderFeishuAuthResultHtml } from '../utils/document.js';

// 通用响应码
const CODE = {
  SUCCESS: 0,
  PARAM_ERROR: 400,
  CUSTOM: 500,
};

// 封装响应方法
function sendSuccess(res: Response, data: any) {
  const html = renderFeishuAuthResultHtml(data);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
}
function sendFail(res: Response, msg: string, code: number = CODE.CUSTOM) {
  const html = renderFeishuAuthResultHtml({ error: msg, code });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
}

function getProtocol(req: Request): string {
  const config = Config.getInstance();

  // 如果是生产环境，强制使用HTTPS
  if (config.server.env === 'prod') {
    return 'https';
  }

  // 否则检查X-Forwarded-Proto头，如果没有则使用req.protocol
  return req.get('X-Forwarded-Proto') || req.protocol;
}

const authService = new AuthService();
const config = Config.getInstance();


export async function callback(req: Request, res: Response) {
  const code = req.query.code as string;
  // const state = req.query.state as string;
  console.log(`[callback] query:`, req.query);
  if (!code) {
    console.log('[callback] 缺少code参数');
    return sendFail(res, '缺少code参数', CODE.PARAM_ERROR);
  }
  // 校验state（clientKey）
  const client_id = config.feishu.appId;
  const client_secret = config.feishu.appSecret;
  // const expectedClientKey = await CacheManager.getClientKey(client_id, client_secret);
  // if (state !== expectedClientKey) {
  //   console.log('[callback] state(clientKey)不匹配');
  //   return sendFail(res, 'state(clientKey)不匹配', CODE.PARAM_ERROR);
  // }

  const protocol = getProtocol(req);
  const host = req.get('X-Forwarded-Host') || req.get('host');
  const baseUrl = `${protocol}://${host}`;
  const redirect_uri = `${baseUrl}/callback`;
  const session = (req as any).session;
  const code_verifier = session?.code_verifier || undefined;

  try {
    // 获取 user_access_token
    const tokenResp = await authService.getUserTokenByCode({
      client_id,
      client_secret,
      code,
      redirect_uri,
      code_verifier
    });
    const data = (tokenResp && typeof tokenResp === 'object') ? tokenResp : undefined;
    console.log('[callback] feishu response:', data);
    if (!data || data.code !== 0 || !data.access_token) {
      return sendFail(res, `获取 access_token 失败，飞书返回: ${JSON.stringify(tokenResp)}`, CODE.CUSTOM);
    }
    // 获取用户信息
    const access_token = data.access_token;
    let userInfo = null;
    if (access_token) {
      userInfo = await authService.getUserInfo(access_token);
      console.log('[callback] feishu userInfo:', userInfo);
    }
    // 存储 access_token
    const refreshTtl = tokenResp.refresh_token_expires_in || 3600 * 24 * 365; // 默认1年
    CacheManager.getInstance().cacheUserToken(userInfo.data.open_id, tokenResp, refreshTtl);
    return sendSuccess(res, { ...data, userInfo });
  } catch (e) {
    console.error('[callback] 请求飞书token或用户信息失败:', e);
    return sendFail(res, `请求飞书token或用户信息失败: ${e}`, CODE.CUSTOM);
  }
}

export async function getTokenByParams({ client_id, client_secret, token_type }: { client_id: string, client_secret: string, token_type?: string }, baseUrl: string) {
  const authService = new AuthService();
  if (client_id) authService.config.feishu.appId = client_id;
  if (client_secret) authService.config.feishu.appSecret = client_secret;
  if (token_type) authService.config.feishu.authType = token_type === 'user' ? 'user' : 'tenant';
  return await authService.getToken(baseUrl);
} 