import { Request } from 'express';
import { TokenCacheManager } from '../utils/tokenCacheManager.js';
import { Config } from '../utils/config.js';
import { Logger } from '../utils/logger.js';
import {
  getRequestKey,
  isAuthForTenant,
  isUserAuthSupported,
  generateAuthErrorResponse, getBaseUrl
} from '../utils/auth.js';

/**
 * Token验证结果接口
 */
export interface ValidationResult {
  isValid: boolean;
  error?: string;
  errorDescription?: string;
  statusCode?: number;
  userKey?: string;
  needAuth?: boolean;
  authUrl?: string;
}

/**
 * Token验证器 - 专门负责token验证
 * 职责：
 * 1. 验证用户token的有效性
 * 2. 检查token的过期状态
 * 3. 判断是否需要重新授权
 * 4. 生成标准的验证结果
 */
export class TokenValidator {
  private static instance: TokenValidator;
  private readonly tokenCacheManager: TokenCacheManager;
  private readonly config: Config;

  private constructor() {
    this.tokenCacheManager = TokenCacheManager.getInstance();
    this.config = Config.getInstance();
  }

  public static getInstance(): TokenValidator {
    if (!TokenValidator.instance) {
      TokenValidator.instance = new TokenValidator();
    }
    return TokenValidator.instance;
  }

  /**
   * 验证用户访问令牌
   * @param req Express请求对象
   * @returns 验证结果
   */
  public validateUserToken(req: Request): ValidationResult {
    try {
      // 1. 检查是否需要验证（企业模式或不支持用户授权的客户端跳过验证）
      if (isAuthForTenant()) {
        Logger.debug('[TokenValidator] 企业授权模式，跳过用户token验证');
        return { isValid: true };
      }

      if (!isUserAuthSupported(req)) {
        Logger.debug('[TokenValidator] 客户端不支持用户授权，跳过token验证');
        return { isValid: true };
      }

      // 2. 获取请求中的用户标识
      const requestKey = getRequestKey(req);
      if (!requestKey) {
        Logger.warn('[TokenValidator] 未获取到用户请求标识(requestKey)');
        const { error, error_description, statusCode } = generateAuthErrorResponse(isUserAuthSupported(req),getBaseUrl(req), '');
        return {
          isValid: false,
          error,
          errorDescription: error_description,
          statusCode,
          needAuth: true
        };
      }

      // 3. 生成客户端键并检查token状态
      const userKey = TokenCacheManager.generateClientKey(
        this.config.feishu.appId,
        this.config.feishu.appSecret,
        requestKey
      );

      const tokenStatus = this.tokenCacheManager.checkUserTokenStatus(userKey);
      
      Logger.debug(`[TokenValidator] Token状态检查: key=${requestKey.substring(0, 8)}***, isValid=${tokenStatus.isValid}, canRefresh=${tokenStatus.canRefresh}, shouldRefresh=${tokenStatus.shouldRefresh}`);

        // 4. 判断token状态
        if (tokenStatus.isValid) {
          // Token有效，可以继续
          if (tokenStatus.shouldRefresh) {
            Logger.info(`[TokenValidator] Token即将过期，将在使用时自动刷新: ${requestKey.substring(0, 8)}***`);
          }
          return { 
            isValid: true, 
            userKey: requestKey
          };
        }

        // 5. Token已过期的情况
        if (tokenStatus.isExpired) {
          if (tokenStatus.canRefresh) {
            // Token已过期但可以刷新，允许通过认证，在实际使用时进行刷新
            Logger.info(`[TokenValidator] Token已过期但可以刷新，允许通过认证: ${requestKey.substring(0, 8)}***`);
            return { 
              isValid: true, 
              userKey: requestKey,
              needAuth: false  // 可以通过刷新恢复，不需要重新授权
            };
          } else {
            // Token已过期且无法刷新，需要重新授权
            Logger.warn(`[TokenValidator] Token已过期且无法刷新，需要重新授权: ${requestKey.substring(0, 8)}***`);
            const { error, error_description, statusCode } = generateAuthErrorResponse(isUserAuthSupported(req),getBaseUrl(req), requestKey);
            return {
              isValid: false,
              error,
              errorDescription: error_description,
              statusCode,
              userKey: requestKey,
              needAuth: true
            };
          }
        }

      // 6. 其他情况（例如首次使用，缓存中没有token）
      Logger.info(`[TokenValidator] 缓存中没有找到有效token: ${requestKey.substring(0, 8)}***`);
      const { error, error_description, statusCode } = generateAuthErrorResponse(isUserAuthSupported(req),getBaseUrl(req), requestKey);
      return {
        isValid: false,
        error,
        errorDescription: error_description,
        statusCode,
        userKey: requestKey,
        needAuth: true
      };

    } catch (error) {
      Logger.error('[TokenValidator] Token验证过程中发生错误:', error);
      return {
        isValid: false,
        error: 'server_error',
        errorDescription: 'Token validation failed due to internal error',
        statusCode: 500
      };
    }
  }

  /**
   * 验证租户访问令牌
   * @returns 验证结果
   */
  public validateTenantToken(): ValidationResult {
    try {
      const clientKey = TokenCacheManager.generateClientKey(
        this.config.feishu.appId,
        this.config.feishu.appSecret
      );

      const tokenStatus = this.tokenCacheManager.checkTenantTokenStatus(clientKey);
      
      Logger.debug(`[TokenValidator] 租户Token状态检查: isValid=${tokenStatus.isValid}, shouldRefresh=${tokenStatus.shouldRefresh}`);

      if (tokenStatus.isValid && !tokenStatus.shouldRefresh) {
        return { isValid: true };
      }

      if (tokenStatus.shouldRefresh || tokenStatus.isExpired) {
        Logger.info('[TokenValidator] 租户Token需要刷新');
        // 租户token过期但可以重新获取
        return { 
          isValid: false,
          error: 'tenant_token_expired',
          errorDescription: 'Tenant access token has expired and needs to be refreshed'
        };
      }

      return { isValid: true };

    } catch (error) {
      Logger.error('[TokenValidator] 租户Token验证过程中发生错误:', error);
      return {
        isValid: false,
        error: 'server_error',
        errorDescription: 'Tenant token validation failed due to internal error',
        statusCode: 500
      };
    }
  }

  /**
   * 检查特定用户key的token状态
   * @param userKey 用户标识
   * @returns 验证结果
   */
  public checkUserTokenStatus(userKey: string): ValidationResult {
    try {
      const clientKey = TokenCacheManager.generateClientKey(
        this.config.feishu.appId,
        this.config.feishu.appSecret,
        userKey
      );

      const tokenStatus = this.tokenCacheManager.checkUserTokenStatus(clientKey);
      
      if (tokenStatus.isValid) {
        return { isValid: true, userKey };
      }

      if (tokenStatus.isExpired && tokenStatus.canRefresh) {
        return { 
          isValid: false, 
          userKey,
          error: 'token_needs_refresh',
          errorDescription: 'Token is expired but can be refreshed'
        };
      }

      return { 
        isValid: false, 
        userKey,
        error: 'token_invalid',
        errorDescription: 'Token is invalid or expired and cannot be refreshed',
        needAuth: true
      };

    } catch (error) {
      Logger.error('[TokenValidator] 检查用户token状态时发生错误:', error);
      return {
        isValid: false,
        userKey,
        error: 'server_error',
        errorDescription: 'Token status check failed due to internal error'
      };
    }
  }

  /**
   * 批量验证多个用户token状态
   * @param userKeys 用户标识数组
   * @returns 验证结果数组
   */
  public batchValidateUserTokens(userKeys: string[]): Record<string, ValidationResult> {
    const results: Record<string, ValidationResult> = {};
    
    for (const userKey of userKeys) {
      results[userKey] = this.checkUserTokenStatus(userKey);
    }
    
    return results;
  }

  /**
   * 获取所有需要刷新的token
   * @returns 需要刷新的用户key列表
   */
  public getTokensNeedingRefresh(): string[] {
    const validUserKeys = this.tokenCacheManager.getValidUserTokenKeys();
    const needRefreshKeys: string[] = [];
    
    for (const userKey of validUserKeys) {
      const validation = this.checkUserTokenStatus(userKey);
      if (!validation.isValid && validation.error === 'token_needs_refresh') {
        needRefreshKeys.push(userKey);
      }
    }
    
    Logger.info(`[TokenValidator] 发现 ${needRefreshKeys.length} 个token需要刷新`);
    return needRefreshKeys;
  }
}
