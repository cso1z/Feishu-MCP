import { Request, Response } from 'express';
import { AuthService } from './feishuAuthService.js';
import { Config } from '../utils/config.js';
import { renderFeishuAuthResultHtml } from '../utils/document.js';
import { AuthUtils,TokenCacheManager } from '../utils/auth/index.js';
import { Logger } from '../utils/logger.js';

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

const authService = new AuthService();
const config = Config.getInstance();

export async function callback(req: Request, res: Response) {
  const code = req.query.code as string;
  const state = req.query.state as string;
  Logger.debug(`[callback] query: code=${code ? '***' : 'missing'}, state=${state ? 'present' : 'missing'}`);
  
  if (!code) {
    Logger.warn('[callback] 缺少code参数');
    return sendFail(res, '缺少code参数', CODE.PARAM_ERROR);
  }
  
  if (!state) {
    Logger.warn('[callback] 缺少state参数');
    return sendFail(res, '缺少state参数', CODE.PARAM_ERROR);
  }

  // 解析state参数
  const stateData = AuthUtils.decodeState(state);
  if (!stateData) {
    Logger.warn('[callback] state参数解析失败');
    return sendFail(res, 'state参数格式错误', CODE.PARAM_ERROR);
  }

  const { appId, appSecret, clientKey, redirectUri, userKeyHint } = stateData;
  Logger.debug(`[callback] 解析state成功: clientKey=${clientKey ? '***' : 'missing'}`);

  // 验证state中的appId和appSecret是否与配置匹配
  const configAppId = config.feishu.appId;
  const configAppSecret = config.feishu.appSecret;
  if (appId !== configAppId || appSecret !== configAppSecret) {
    Logger.warn('[callback] state中的appId或appSecret与配置不匹配');
    return sendFail(res, 'state参数验证失败', CODE.PARAM_ERROR);
  }

  // 使用从state中解析的redirect_uri，如果没有则使用默认值
  const redirect_uri = redirectUri || `http://localhost:${config.server.port}/callback`;
  const session = (req as any).session;
  const code_verifier = session?.code_verifier || undefined;

  try {
    // 获取 user_access_token
    const tokenResp = await authService.getUserTokenByCode({
      client_id: appId,
      client_secret: appSecret,
      code,
      redirect_uri,
      code_verifier
    });
    const data = (tokenResp && typeof tokenResp === 'object') ? tokenResp : undefined;
    Logger.debug('[callback] feishu token response:', { code: data?.code, has_access_token: !!data?.access_token, expires_in: data?.expires_in });
    
    if (!data || !data.access_token) {
      return sendFail(res, `获取 access_token 失败，飞书返回错误码: ${data?.code ?? 'unknown'}`, CODE.CUSTOM);
    }
    
    // 使用TokenCacheManager缓存token信息
    const tokenCacheManager = TokenCacheManager.getInstance();
    if (data.access_token && data.expires_in) {
      // 计算过期时间戳
      data.expires_at = Math.floor(Date.now() / 1000) + data.expires_in;
      if (data.refresh_token_expires_in) {
        data.refresh_token_expires_at = Math.floor(Date.now() / 1000) + data.refresh_token_expires_in;
      }
      
      // 添加client_id和client_secret，用于后续刷新token
      data.client_id = appId;
      data.client_secret = appSecret;
      
      // 缓存token信息
      const refreshTtl = data.refresh_token_expires_in || 3600 * 24 * 365; // 默认1年
      tokenCacheManager.cacheUserToken(clientKey, data, refreshTtl, userKeyHint);
      Logger.infoOnce(`[callback] 用户授权成功，token已缓存`);
    }
    
    // 获取用户信息
    const access_token = data.access_token;
    let userInfo = null;
    if (access_token) {
      userInfo = await authService.getUserInfo(access_token);
      Logger.debug('[callback] feishu userInfo:', {
        code: userInfo?.code,
        name: userInfo?.data?.name,
        open_id: userInfo?.data?.open_id,
      });
    }
    
    return sendSuccess(res, { ...data, userInfo, clientKey });
  } catch (e) {
    Logger.error('[callback] 请求飞书token或用户信息失败:', e);
    return sendFail(res, `请求飞书token或用户信息失败: ${e}`, CODE.CUSTOM);
  }
}
