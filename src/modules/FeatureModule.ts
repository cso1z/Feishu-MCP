import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FeishuApiService } from '../services/feishuApiService.js';

/**
 * 功能模块接口
 * 每个模块封装一组相关的 MCP 工具和所需的飞书 API 权限
 */
export interface FeatureModule {
  /** 模块唯一标识符，用于环境变量配置，如 'document'、'task' */
  readonly id: string;
  /** 模块显示名称 */
  readonly name: string;
  /** 模块描述 */
  readonly description: string;
  /** 该模块所需的飞书 OAuth Scopes */
  readonly requiredScopes: {
    tenant: string[];
    userOnly: string[];
  };
  /** 将该模块的所有 MCP 工具注册到 server */
  registerTools(server: McpServer, apiService: FeishuApiService): void;
}
