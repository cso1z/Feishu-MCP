import axios from 'axios';
import { Config } from '../utils/config.js';
import { CacheManager } from '../utils/cache.js';
import { Logger } from '../utils/logger.js';

export class AuthService {
  public config = Config.getInstance();
  private cache = CacheManager.getInstance();

  // 获取token主入口
  public async getToken(options?: {
    client_id?: string;
    client_secret?: string;
    authType?: 'tenant' | 'user';
  }): Promise<any> {
    Logger.warn('[AuthService] getToken called', options);
    const config = this.config.feishu;
    const client_id = options?.client_id || config.appId;
    const client_secret = options?.client_secret || config.appSecret;
    const authType = options?.authType || config.authType;
    const clientKey = await CacheManager.getClientKey(client_id, client_secret);
    Logger.warn('[AuthService] getToken resolved clientKey', clientKey, 'authType', authType);
    if (authType === 'tenant') {
      return this.getTenantToken(client_id, client_secret, clientKey);
    } else {
      let tokenObj = this.cache.getUserToken(clientKey);
      const now = Date.now() / 1000;
      if (!tokenObj || tokenObj.refresh_token_expires_at < now) {
        Logger.warn('[AuthService] No user token in cache, need user auth', clientKey);
        // 返回授权链接
        const redirect_uri = encodeURIComponent(`http://localhost:${this.config.server.port}/callback`);
        const scope = encodeURIComponent('base:app:read bitable:app bitable:app:readonly board:whiteboard:node:read contact:user.employee_id:readonly docs:document.content:read docx:document docx:document.block:convert docx:document:create docx:document:readonly drive:drive drive:drive:readonly drive:file drive:file:upload sheets:spreadsheet sheets:spreadsheet:readonly space:document:retrieve space:folder:create wiki:space:read wiki:space:retrieve wiki:wiki wiki:wiki:readonly offline_access');
        const state = clientKey;
        const url = `https://accounts.feishu.cn/open-apis/authen/v1/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}&scope=${scope}&state=${state}`;
        return { needAuth: true, url };
      }
      Logger.debug('[AuthService] User token found in cache', tokenObj);
      if (tokenObj.expires_at && tokenObj.expires_at < now) {
        Logger.warn('[AuthService] User token expired, try refresh', tokenObj);
        if (tokenObj.refresh_token) {
          tokenObj = await this.refreshUserToken(tokenObj.refresh_token, clientKey, client_id, client_secret);
        } else {
          Logger.warn('[AuthService] No refresh_token, clear cache and require re-auth', clientKey);
          this.cache.cacheUserToken(clientKey, null, 0);
          return { needAuth: true, url: '请重新授权' };
        }
      }
      Logger.warn('[AuthService] Return user access_token', tokenObj.access_token);
      // 计算剩余有效期（秒）
      const expires_in = tokenObj.expires_at ? Math.max(tokenObj.expires_at - now, 0) : undefined;
      return { access_token: tokenObj.access_token, expires_in, ...tokenObj };
    }
  }

  // 获取tenant_access_token
  private async getTenantToken(client_id: string, client_secret: string, clientKey: string): Promise<any> {
    Logger.warn('[AuthService] getTenantToken called', { client_id, clientKey });
    // 尝试从缓存获取
    const cacheKey = clientKey;
    const cachedTokenObj = this.cache.getTenantToken(cacheKey) as unknown as { tenant_access_token: string; expire_at: number };
    if (cachedTokenObj) {
      Logger.warn('[AuthService] Tenant token cache hit', cacheKey);
      const { tenant_access_token, expire_at } = cachedTokenObj;
      const now = Math.floor(Date.now() / 1000);
      const expires_in = expire_at ? Math.max(expire_at - now, 0) : undefined;
      return { access_token: tenant_access_token, expires_in };
    }
    try {
      const requestData = {
        app_id: client_id,
        app_secret: client_secret,
      };
      const url = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
      const headers = { 'Content-Type': 'application/json' };
      Logger.debug('[AuthService] Requesting tenant_access_token', url, requestData);
      const response = await axios.post(url, requestData, { headers });
      const data = response.data;
      Logger.debug('[AuthService] tenant_access_token response', data);
      if (!data || typeof data !== 'object') {
        Logger.error('[AuthService] tenant_access_token invalid response', data);
        throw new Error('获取飞书访问令牌失败：响应格式无效');
      }
      if (data.code !== 0) {
        Logger.error('[AuthService] tenant_access_token error', data);
        throw new Error(`获取飞书访问令牌失败：${data.msg || '未知错误'} (错误码: ${data.code})`);
      }
      if (!data.tenant_access_token) {
        Logger.error('[AuthService] tenant_access_token missing in response', data);
        throw new Error('获取飞书访问令牌失败：响应中没有token');
      }
      // 计算绝对过期时间戳
      const expire_at = Math.floor(Date.now() / 1000) + (data.expire || 0);
      const tokenObj = {
        tenant_access_token: data.tenant_access_token,
        expire_at
      };
      this.cache.cacheTenantToken(cacheKey, tokenObj, data.expire);
      Logger.warn('[AuthService] tenant_access_token cached', cacheKey);
      // 返回token对象和expires_in
      return { access_token: data.tenant_access_token, expires_in: data.expire, expire_at };
    } catch (error) {
      Logger.error('[AuthService] getTenantToken error', error);
      throw new Error('获取飞书访问令牌失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  // 刷新user_access_token
  private async refreshUserToken(refresh_token: string, clientKey: string, client_id: string, client_secret: string): Promise<any> {
    Logger.warn('[AuthService] refreshUserToken called', { clientKey });
    const body = {
      grant_type: 'refresh_token',
      client_id,
      client_secret,
      refresh_token
    };
    Logger.debug('[AuthService] refreshUserToken request', body);
    const response = await axios.post('https://open.feishu.cn/open-apis/authen/v2/oauth/token', body, { headers: { 'Content-Type': 'application/json' } });
    const data = response.data;
    Logger.debug('[AuthService] refreshUserToken response', data);
    if (data && data.access_token && data.expires_in) {
      data.expires_in = Math.floor(Date.now() / 1000) + data.expires_in;
      this.cache.cacheUserToken(clientKey, data, data.expires_in);
      Logger.warn('[AuthService] Refreshed user_access_token cached', clientKey);
    } else {
      Logger.warn('[AuthService] refreshUserToken failed', data);
    }
    return data;
  }

  // 获取用户信息
  public async getUserInfo(access_token: string): Promise<any> {
    Logger.warn('[AuthService] getUserInfo called');
    try {
      const response = await axios.get(
        'https://open.feishu.cn/open-apis/authen/v1/user_info',
        { headers: { Authorization: `Bearer ${access_token}` } }
      );
      Logger.debug('[AuthService] getUserInfo response', response.data);
      return response.data;
    } catch (error) {
      Logger.error('[AuthService] getUserInfo error', error);
      throw error;
    }
  }

  // 通过授权码换取user_access_token
  public async getUserTokenByCode({ client_id, client_secret, code, redirect_uri, code_verifier }: {
    client_id: string;
    client_secret: string;
    code: string;
    redirect_uri: string;
    code_verifier?: string;
  }) {
    Logger.warn('[AuthService] getUserTokenByCode called', { client_id, code, redirect_uri });
    const clientKey = await CacheManager.getClientKey(client_id, client_secret);
    const body: any = {
      grant_type: 'authorization_code',
      client_id,
      client_secret,
      code,
      redirect_uri
    };
    if (code_verifier) body.code_verifier = code_verifier;
    Logger.debug('[AuthService] getUserTokenByCode request', body);
    const response = await fetch('https://open.feishu.cn/open-apis/authen/v2/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    Logger.debug('[AuthService] getUserTokenByCode response', data);
    // 缓存user_access_token
    if (data && data.access_token && data.expires_in) {
      data.expires_at = Math.floor(Date.now() / 1000) + data.expires_in;
      data.refresh_token_expires_at = Math.floor(Date.now() / 1000) + data.refresh_token_expires_in;
      // 缓存时间应为 refresh_token 的有效期，防止缓存被提前清理
      const refreshTtl = data.refresh_expires_in || 3600 * 24 * 365; // 默认1年
      this.cache.cacheUserToken(clientKey, data, refreshTtl);
      Logger.warn('[AuthService] user_access_token cached', clientKey, 'refreshTtl', refreshTtl);
    } else {
      Logger.warn('[AuthService] getUserTokenByCode failed', data);
    }
    return data;
  }
} 