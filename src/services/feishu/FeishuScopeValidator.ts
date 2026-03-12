import axios from 'axios';
import { Logger } from '../../utils/logger.js';
import { TokenCacheManager } from '../../utils/auth/tokenCacheManager.js';
import { ScopeInsufficientError } from '../../utils/error.js';
import { getRequiredScopes, TENANT_SCOPES, USER_ONLY_SCOPES } from '../constants/feishuScopes.js';

/**
 * 飞书应用权限 Scope 校验器
 * 负责在获取 token 前校验应用权限是否满足要求
 */
export class FeishuScopeValidator {
  private async getApplicationScopes(accessToken: string, authType: 'tenant' | 'user'): Promise<string[]> {
    try {
      const baseUrl = 'https://open.feishu.cn/open-apis';
      const endpoint = '/application/v6/scopes';
      const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      };

      Logger.debug('请求应用权限范围:', endpoint);
      const response = await axios.get(`${baseUrl}${endpoint}`, { headers });
      const data = response.data;

      if (data.code !== 0) {
        throw new Error(`获取应用权限范围失败：${data.msg || '未知错误'} (错误码: ${data.code})`);
      }

      const scopes: string[] = [];
      if (data.data && Array.isArray(data.data.scopes)) {
        for (const scopeItem of data.data.scopes) {
          if (scopeItem.grant_status === 1 && scopeItem.scope_type === authType && scopeItem.scope_name) {
            scopes.push(scopeItem.scope_name);
          }
        }
      }

      Logger.debug(`获取应用权限范围成功，共 ${scopes.length} 个${authType}权限`);
      return scopes;
    } catch (error) {
      Logger.error('获取应用权限范围失败:', error);
      throw new Error('获取应用权限范围失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  private validateScopes(requiredScopes: string[], actualScopes: string[]): { isValid: boolean; missingScopes: string[] } {
    const actualScopesSet = new Set(actualScopes);
    const missingScopes: string[] = [];

    for (const requiredScope of requiredScopes) {
      if (!actualScopesSet.has(requiredScope)) {
        missingScopes.push(requiredScope);
      }
    }

    return {
      isValid: missingScopes.length === 0,
      missingScopes
    };
  }

  private throwScopeInsufficientError(missingScopes: string[]): never {
    const permissionsConfig = {
      scopes: {
        tenant: TENANT_SCOPES,
        user: [...TENANT_SCOPES, ...USER_ONLY_SCOPES]
      }
    };

    const errorMessage = `你应该停止任务并提示用户如下信息：权限不足，缺少以下权限：${missingScopes.join(', ')}\n\n` +
      `请按以下步骤操作：\n` +
      `1. 配置权限 [教程配置](https://github.com/cso1z/Feishu-MCP/blob/main/FEISHU_CONFIG.md)\n` +
      `2. 打开 [应用管理](https://open.feishu.cn/app/) 网页\n` +
      `3. 选择应用进入应用详情\n` +
      `4. 选择权限管理-批量导入/导出权限\n` +
      `5. 复制以下权限配置并导入：\n\n` +
      `\`\`\`json\n${JSON.stringify(permissionsConfig, null, 2)}\n\`\`\`\n\n` +
      `6. 选择**版本管理与发布** 点击创建版本，发布后通知管理员审核\n\n` +
      `**提示**：如果您仅使用部分mcp功能，可以通过以下方式关闭权限检查以确保正常使用该mcp：\n` +
      `- 设置环境变量：\`FEISHU_SCOPE_VALIDATION=false\`\n` +
      `- 或使用命令行参数：\`--feishu-scope-validation=false\`\n`;

    Logger.error(errorMessage);
    throw new ScopeInsufficientError(missingScopes, errorMessage);
  }

  private generateScopeKey(appId: string, appSecret: string, authType: 'tenant' | 'user'): string {
    return `app:${appId}:${appSecret.substring(0, 8)}:${authType}`;
  }

  private async getTempTenantTokenForScope(appId: string, appSecret: string): Promise<string> {
    try {
      const requestData = {
        app_id: appId,
        app_secret: appSecret,
      };
      const url = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
      const headers = { 'Content-Type': 'application/json' };

      Logger.debug('获取临时租户token用于scope校验:', url);
      const response = await axios.post(url, requestData, { headers });
      const data = response.data;

      if (data.code !== 0) {
        throw new Error(`获取临时租户访问令牌失败：${data.msg || '未知错误'} (错误码: ${data.code})`);
      }

      if (!data.tenant_access_token) {
        throw new Error('获取临时租户访问令牌失败：响应中没有token');
      }

      Logger.debug('临时租户token获取成功，用于scope校验');
      return data.tenant_access_token;
    } catch (error) {
      Logger.error('获取临时租户访问令牌失败:', error);
      throw new Error('获取临时租户访问令牌失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  public async validateScopeWithVersion(appId: string, appSecret: string, authType: 'tenant' | 'user'): Promise<void> {
    const tokenCacheManager = TokenCacheManager.getInstance();
    const scopeKey = this.generateScopeKey(appId, appSecret, authType);
    const scopeVersion = '2.0.0';

    if (!tokenCacheManager.shouldValidateScope(scopeKey, scopeVersion)) {
      Logger.debug(`Scope版本已校验过，跳过校验: ${scopeKey}`);
      return;
    }

    Logger.info(`开始校验scope权限，版本: ${scopeVersion}, scopeKey: ${scopeKey}`);

    try {
      const tempTenantToken = await this.getTempTenantTokenForScope(appId, appSecret);
      const actualScopes = await this.getApplicationScopes(tempTenantToken, authType);
      const requiredScopes = getRequiredScopes(authType);
      const validationResult = this.validateScopes(requiredScopes, actualScopes);

      if (!validationResult.isValid) {
        this.throwScopeInsufficientError(validationResult.missingScopes);
      }

      const scopeVersionInfo = {
        scopeVersion,
        scopeList: requiredScopes,
        validatedAt: Math.floor(Date.now() / 1000),
        validatedVersion: scopeVersion
      };

      tokenCacheManager.saveScopeVersionInfo(scopeKey, scopeVersionInfo);
      Logger.info(`Scope权限校验成功，版本: ${scopeVersion}`);
    } catch (error) {
      if (error instanceof ScopeInsufficientError) {
        throw error;
      }
      Logger.warn(`Scope权限校验失败，但继续使用token: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
