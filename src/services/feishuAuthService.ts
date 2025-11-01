import axios from 'axios';
import { Config } from '../utils/config.js';
import { Logger } from '../utils/logger.js';
import { TokenCacheManager } from '../utils/auth/tokenCacheManager.js';
import { AuthRequiredError } from '../utils/error.js';

export class AuthService {
  public config = Config.getInstance();

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
    return data;
  }

  /**
   * 刷新用户访问令牌
   * 从缓存中获取token信息并刷新，如果缓存中没有必要信息则使用传入的备用参数
   * @param clientKey 客户端缓存键
   * @param appId 应用ID（可选，如果tokenInfo中没有则使用此参数）
   * @param appSecret 应用密钥（可选，如果tokenInfo中没有则使用此参数）
   * @returns 刷新后的token信息
   * @throws 如果无法获取必要的刷新信息则抛出错误
   */
  public async refreshUserToken(clientKey: string, appId?: string, appSecret?: string): Promise<any> {
    const tokenCacheManager = TokenCacheManager.getInstance();
    
    // 从缓存中获取token信息
    const tokenInfo = tokenCacheManager.getUserTokenInfo(clientKey);
    if (!tokenInfo) {
      throw new Error(`无法获取token信息: ${clientKey}`);
    }
    
    // 获取刷新所需的必要信息
    const actualRefreshToken = tokenInfo.refresh_token;
    const actualAppId = tokenInfo.client_id || appId;
    const actualAppSecret = tokenInfo.client_secret || appSecret;
    
    // 验证必要参数
    if (!actualRefreshToken) {
      throw new Error('无法获取refresh_token，无法刷新用户访问令牌');
    }
    if (!actualAppId || !actualAppSecret) {
      throw new Error('无法获取client_id或client_secret，无法刷新用户访问令牌');
    }
    
    const body = {
      grant_type: 'refresh_token',
      client_id: actualAppId,
      client_secret: actualAppSecret,
      refresh_token: actualRefreshToken
    };
    
    Logger.debug('[AuthService] 刷新用户访问令牌请求:', {
      clientKey,
      client_id: actualAppId,
      has_refresh_token: !!actualRefreshToken
    });
    
    const response = await axios.post('https://open.feishu.cn/open-apis/authen/v2/oauth/token', body, { 
      headers: { 'Content-Type': 'application/json' } 
    });
    const data = response.data;
    
    if (data && data.access_token && data.expires_in) {
      // 计算过期时间戳
      data.expires_at = Math.floor(Date.now() / 1000) + data.expires_in;
      if (data.refresh_token_expires_in) {
        data.refresh_token_expires_at = Math.floor(Date.now() / 1000) + data.refresh_token_expires_in;
      }
      
      // 保留client_id和client_secret（优先使用tokenInfo中的，如果没有则使用实际使用的参数）
      data.client_id = actualAppId;
      data.client_secret = actualAppSecret;
      
      // 缓存新的token信息
      const refreshTtl = data.refresh_token_expires_in || 3600 * 24 * 365; // 默认1年
      tokenCacheManager.cacheUserToken(clientKey, data, refreshTtl);
      Logger.info(`[AuthService] 用户访问令牌刷新并缓存成功: ${clientKey}`);
      
      return data;
    } else {
      Logger.warn('[AuthService] 刷新用户访问令牌失败:', data);
      throw new Error('刷新用户访问令牌失败');
    }
  }

  /**
   * 获取用户访问令牌
   * 检查token状态，如果有效则返回缓存的token，如果过期则尝试刷新
   * @param clientKey 客户端缓存键
   * @param appId 应用ID（可选，如果tokenInfo中没有则使用此参数）
   * @param appSecret 应用密钥（可选，如果tokenInfo中没有则使用此参数）
   * @returns 用户访问令牌
   * @throws 如果无法获取有效的token则抛出AuthRequiredError
   */
  public async getUserAccessToken(clientKey: string, appId?: string, appSecret?: string): Promise<string> {
    const tokenCacheManager = TokenCacheManager.getInstance();
    
    // 检查用户token状态
    const tokenStatus = tokenCacheManager.checkUserTokenStatus(clientKey);
    Logger.debug(`[AuthService] 用户token状态:`, tokenStatus);
    
    if (tokenStatus.isValid && !tokenStatus.shouldRefresh) {
      // token有效且不需要刷新，直接返回
      const cachedToken = tokenCacheManager.getUserToken(clientKey);
      if (cachedToken) {
        Logger.debug('[AuthService] 使用缓存的用户访问令牌');
        return cachedToken;
      }
    }
    
    if (tokenStatus.canRefresh && (tokenStatus.isExpired || tokenStatus.shouldRefresh)) {
      // 可以刷新token
      Logger.info('[AuthService] 尝试刷新用户访问令牌');
      try {
        // 使用统一的刷新方法，它会自动从缓存中获取必要信息
        const refreshedToken = await this.refreshUserToken(clientKey, appId, appSecret);
        if (refreshedToken && refreshedToken.access_token) {
          Logger.info('[AuthService] 用户访问令牌刷新成功');
          return refreshedToken.access_token;
        }
      } catch (error) {
        Logger.warn('[AuthService] 刷新用户访问令牌失败:', error);
        // 刷新失败，清除缓存，需要重新授权
        tokenCacheManager.removeUserToken(clientKey);
      }
    }
    
    // 没有有效的token或刷新失败，需要用户授权
    Logger.warn('[AuthService] 没有有效的用户token，需要用户授权');
    
    throw new AuthRequiredError('user', '需要用户授权');
  }
}