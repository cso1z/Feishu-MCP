import { TokenCacheManager, UserTokenInfo } from '../utils/tokenCacheManager.js';
import { AuthService } from '../services/feishuAuthService.js';
import { Config } from '../utils/config.js';
import { Logger } from '../utils/logger.js';

/**
 * Token提供者接口
 */
export interface TokenResult {
  success: boolean;
  token?: string;
  error?: string;
}

/**
 * Token提供者 - 统一的token获取入口
 * 职责：
 * 1. 从缓存获取有效token
 * 2. 自动刷新即将过期的token
 * 3. 获取新的token（当缓存miss或无法刷新时）
 * 4. 管理token生命周期
 */
export class TokenProvider {
  private static instance: TokenProvider;
  private readonly tokenCacheManager: TokenCacheManager;
  private readonly authService: AuthService;
  private readonly config: Config;

  private constructor() {
    this.tokenCacheManager = TokenCacheManager.getInstance();
    this.authService = new AuthService();
    this.config = Config.getInstance();
  }

  public static getInstance(): TokenProvider {
    if (!TokenProvider.instance) {
      TokenProvider.instance = new TokenProvider();
    }
    return TokenProvider.instance;
  }

  /**
   * 获取用户访问令牌
   * @param reqKey 用户标识（如Bearer token或sessionId）
   * @returns Token结果
   */
  public async getUserToken(reqKey: string): Promise<TokenResult> {
    try {
      const { appId, appSecret } = this.config.feishu;
      const clientKey = TokenCacheManager.generateClientKey(appId, appSecret, reqKey);
      
      // 1. 检查缓存中的token状态
      const tokenStatus = this.tokenCacheManager.checkUserTokenStatus(clientKey);
      
      // 2. 如果token有效且不需要刷新，直接返回
      if (tokenStatus.isValid && !tokenStatus.shouldRefresh) {
        const token = this.tokenCacheManager.getUserToken(clientKey);
        if (token) {
          Logger.debug(`[TokenProvider] 使用缓存的用户token: ${reqKey.substring(0, 8)}***`);
          return { success: true, token };
        }
      }
      
      // 3. 如果token即将过期但可以刷新，执行刷新
      if (tokenStatus.shouldRefresh && tokenStatus.canRefresh) {
        Logger.info(`[TokenProvider] 刷新即将过期的用户token: ${reqKey.substring(0, 8)}***`);
        const refreshResult = await this.refreshUserToken(clientKey);
        if (refreshResult.success) {
          return refreshResult;
        }
        // 刷新失败，继续尝试获取新token
        Logger.warn(`[TokenProvider] Token刷新失败，尝试获取新token`);
      }
      
      // 4. 获取新的token
      return {success:false,error:"需要重新授权"}
    } catch (error) {
      Logger.error(`[TokenProvider] 获取用户token失败:`, error);
      return { success: false, error: '获取用户token时发生错误' };
    }
  }

  /**
   * 获取租户访问令牌
   * @returns Token结果
   */
  public async getTenantToken(): Promise<TokenResult> {
    try {
      const { appId, appSecret } = this.config.feishu;
      const clientKey = TokenCacheManager.generateClientKey(appId, appSecret);
      
      // 1. 检查缓存中的token状态
      const tokenStatus = this.tokenCacheManager.checkTenantTokenStatus(clientKey);
      
      // 2. 如果token有效且不需要刷新，直接返回
      if (tokenStatus.isValid && !tokenStatus.shouldRefresh) {
        const token = this.tokenCacheManager.getTenantToken(clientKey);
        if (token) {
          Logger.debug(`[TokenProvider] 使用缓存的租户token`);
          return { success: true, token };
        }
      }
      
      // 3. 获取新的租户token
      if (tokenStatus.shouldRefresh || tokenStatus.isExpired) {
        Logger.info(`[TokenProvider] 获取新的租户token`);
        return await this.fetchNewTenantToken();
      }
      
      return { success: false, error: '无法获取租户token' };
      
    } catch (error) {
      Logger.error(`[TokenProvider] 获取租户token失败:`, error);
      return { success: false, error: '获取租户token时发生错误' };
    }
  }

  /**
   * 刷新用户访问令牌
   * @param clientKey 客户端键
   * @returns 刷新结果
   */
  private async refreshUserToken(clientKey: string): Promise<TokenResult> {
    try {
      const tokenInfo = this.tokenCacheManager.getUserTokenInfo(clientKey);
      if (!tokenInfo || !tokenInfo.refresh_token) {
        return { success: false, error: '没有可用的refresh_token,请重新授权' };
      }

      // 调用飞书API刷新token
      const { appId, appSecret } = this.config.feishu;
      const refreshResult = await this.authService.refreshUserToken(
        tokenInfo.refresh_token, 
        clientKey, 
        appId, 
        appSecret
      );
      
      if (refreshResult.success && refreshResult.data) {
        const newTokenData = refreshResult.data;
        
        // 更新token信息
        const now = Math.floor(Date.now() / 1000);
        const updatedTokenInfo: UserTokenInfo = {
          ...tokenInfo,
          access_token: newTokenData.access_token,
          expires_at: newTokenData.expires_in ? now + newTokenData.expires_in : now + 7200, // 默认2小时
          refresh_token: newTokenData.refresh_token || tokenInfo.refresh_token,
          refresh_token_expires_at: newTokenData.refresh_token_expires_in 
            ? now + newTokenData.refresh_token_expires_in
            : tokenInfo.refresh_token_expires_at
        };

        // 缓存更新后的token
        this.tokenCacheManager.cacheUserToken(clientKey, updatedTokenInfo);
        
        Logger.info('[TokenProvider] 用户访问令牌刷新成功');
        return { success: true, token: newTokenData.access_token };
      } else {
        Logger.warn('[TokenProvider] 刷新token失败:', refreshResult.error);
        return { success: false, error: refreshResult.error || '刷新token API调用失败' };
      }
    } catch (error) {
      Logger.error('[TokenProvider] 刷新用户访问令牌失败:', error);
      return { success: false, error: '刷新token请求失败' };
    }
  }

  /**
   * 获取新的用户token
   * @param userKey 用户标识
   * @returns Token结果
   */
  // private async fetchNewUserToken(userKey: string): Promise<TokenResult> {
  //   try {
  //     const { appId, appSecret, authType } = this.config.feishu;
  //
  //     // 调用认证服务获取新token
  //     const authResult = await this.authService.getUserInfo({
  //       client_id: appId,
  //       client_secret: appSecret,
  //       token: userKey,
  //       authType: authType
  //     });
  //
  //     if (authResult.success && authResult.data && authResult.data.access_token) {
  //       // 缓存新的token信息
  //       const clientKey = TokenCacheManager.generateClientKey(appId, appSecret, userKey);
  //       this.tokenCacheManager.cacheUserToken(clientKey, authResult.data);
  //
  //       Logger.info(`[TokenProvider] 获取新的用户token成功: ${userKey.substring(0, 8)}***`);
  //       return { success: true, token: authResult.data.access_token };
  //     }
  //
  //     if (authResult.needAuth && authResult.authUrl) {
  //       return {
  //         success: false,
  //         error: '需要重新授权',
  //         needAuth: true,
  //         authUrl: authResult.authUrl
  //       };
  //     }
  //
  //     return { success: false, error: authResult.error || '无法获取有效的access_token' };
  //
  //   } catch (error) {
  //     Logger.error('[TokenProvider] 获取新用户token失败:', error);
  //     return { success: false, error: '网络请求失败' };
  //   }
  // }

  /**
   * 获取新的租户token
   * @returns Token结果
   */
  private async fetchNewTenantToken(): Promise<TokenResult> {
    try {
      const { appId, appSecret } = this.config.feishu;

      // 调用认证服务获取租户token
      const clientKey = TokenCacheManager.generateClientKey(appId, appSecret);
      const authResult = await this.authService.getTenantToken( appId, appSecret,clientKey);

      if (authResult) {
        // 缓存新的token信息
        return { success: true, token: authResult };
      }
      
      return { success: false, error: '无法获取有效的tenant_access_token' };
      
    } catch (error) {
      Logger.error('[TokenProvider] 获取新租户token失败:', error);
      return { success: false, error: '网络请求失败' };
    }
  }

  /**
   * 清除用户token缓存
   * @param userKey 用户标识
   */
  public clearUserToken(userKey: string): void {
    const { appId, appSecret } = this.config.feishu;
    const clientKey = TokenCacheManager.generateClientKey(appId, appSecret, userKey);
    this.tokenCacheManager.removeUserToken(clientKey);
    Logger.info(`[TokenProvider] 清除用户token缓存: ${userKey.substring(0, 8)}***`);
  }

  /**
   * 清除租户token缓存
   */
  public clearTenantToken(): void {
    const { appId, appSecret } = this.config.feishu;
    const clientKey = TokenCacheManager.generateClientKey(appId, appSecret);
    this.tokenCacheManager.removeTenantToken(clientKey);
    Logger.info('[TokenProvider] 清除租户token缓存');
  }
}
