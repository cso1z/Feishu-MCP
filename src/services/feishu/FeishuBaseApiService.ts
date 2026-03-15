import { BaseApiService } from '../baseService.js';
import { Config } from '../../utils/config.js';
import { Logger } from '../../utils/logger.js';
import { AuthUtils } from '../../utils/auth/index.js';
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
    const { appId, appSecret, authType, enableScopeValidation } = Config.getInstance().feishu;
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
