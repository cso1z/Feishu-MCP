import { BaseApiService } from '../baseService.js';
import { Config } from '../../utils/config.js';
import { Logger } from '../../utils/logger.js';
import {
  AuthUtils,
  UserContextManager,
  assertExplicitUserKey,
  resolveServiceUserKeyContext,
  shouldWarnFallbackUserKeyOnce,
} from '../../utils/auth/index.js';
import { AuthService } from '../feishuAuthService.js';
import { FeishuScopeValidator } from './FeishuScopeValidator.js';

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
    const { appId, appSecret, authType, enableScopeValidation, requireUserKey } = Config.getInstance().feishu;

    if (authType === 'user') {
      const userContextManager = UserContextManager.getInstance();
      const userKeyContext = resolveServiceUserKeyContext({
        hasAsyncContext: userContextManager.hasContext(),
        contextIsUserKeyProvided: userContextManager.isUserKeyProvided(),
        contextMode: userContextManager.getUserKeyMode(),
        userKey,
      });
      assertExplicitUserKey(authType, requireUserKey, userKeyContext.isUserKeyProvided, userKeyContext.mode);
      if (!userKeyContext.isUserKeyProvided) {
        if (shouldWarnFallbackUserKeyOnce(userKeyContext.mode, userKey)) {
          Logger.warnOnce('[FeishuBaseApiService] user 认证模式下 userKey 未由客户端明确提供，继续使用兼容模式。多用户 HTTP 场景建议设置 FEISHU_REQUIRE_USER_KEY=true');
        }
      }
    }

    const clientKey = AuthUtils.generateClientKey(userKey);

    if (enableScopeValidation) {
      await this.scopeValidator.validateScopeWithVersion(appId, appSecret, authType, clientKey);
    }

    if (authType === 'tenant') {
      return this.authService.getTenantAccessToken(appId, appSecret, clientKey);
    } else {
      return this.authService.getUserAccessToken(clientKey, appId, appSecret);
    }
  }
}
