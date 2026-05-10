import { BaseApiService } from '../baseService.js';
import { Config } from '../../utils/config.js';
import { Logger } from '../../utils/logger.js';
import { AuthUtils, UserContextManager } from '../../utils/auth/index.js';
import { AuthService } from '../feishuAuthService.js';
import { FeishuScopeValidator } from './FeishuScopeValidator.js';
import { AuthRequiredError } from '../../utils/error.js';

/**
 * 飞书 API 服务基类
 * 封装 getBaseUrl 和 getAccessToken（委托给 AuthService），供各领域服务继承
 */
export abstract class FeishuBaseApiService extends BaseApiService {
  private readonly scopeValidator: FeishuScopeValidator;

  constructor(protected readonly authService: AuthService) {
    super();
    this.scopeValidator = new FeishuScopeValidator();
  }

  protected getBaseUrl(): string {
    return Config.getInstance().feishu.baseUrl;
  }

  protected async getAccessToken(userKey?: string): Promise<string> {
    const { appId, appSecret, authType, enableScopeValidation } = Config.getInstance().feishu;

    // 安全检查：user 认证模式下，userKey 未由客户端明确提供时拒绝使用缓存
    // 即使 userKey 有 fallback 值（如 sessionId 或 anon-xxx），也不应查找缓存 token
    // 因为 fallback 值不是用户身份标识，使用缓存可能访问到其他用户的 token
    // shouldClearCache=false：缓存本身有效，不应清除，否则会影响其他合法请求
    if (authType === 'user') {
      const userContextManager = UserContextManager.getInstance();
      if (!userContextManager.isUserKeyProvided()) {
        Logger.warn('[FeishuBaseApiService] user 认证模式下 userKey 未由客户端明确提供，拒绝使用缓存以防止安全隐患');
        throw new AuthRequiredError('user', '需要提供 user-key 请求头以标识用户身份。建议使用随机且相对复杂的字符串（如 UUID）作为 user-key，避免使用简单可预测的值。未提供 user-key 时无法安全获取用户访问令牌', undefined, false);
      }
    }

    const clientKey = AuthUtils.generateClientKey(userKey);

    Logger.debug(`[FeishuBaseApiService] 获取访问令牌，authType: ${authType}, clientKey: ${clientKey}`);

    if (enableScopeValidation) {
      await this.scopeValidator.validateScopeWithVersion(appId, appSecret, authType, clientKey);
    } else {
      Logger.debug('权限检查已禁用，跳过scope校验');
    }

    if (authType === 'tenant') {
      return this.authService.getTenantAccessToken(appId, appSecret, clientKey);
    } else {
      return this.authService.getUserAccessToken(clientKey, appId, appSecret);
    }
  }
}
