import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FeishuApiService } from '../services/feishuApiService.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../utils/config.js';
import { ModuleRegistry } from '../modules/ModuleRegistry.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

export const serverInfo = {
  name: "Feishu MCP Server",
  version,
};

const serverOptions = {
  capabilities: { logging: {}, tools: {} },
};

/**
 * 飞书MCP服务类
 * 继承自McpServer，根据 FEISHU_ENABLED_MODULES 配置动态注册工具
 */
export class FeishuMcp extends McpServer {
  private feishuService: FeishuApiService | null = null;

  constructor() {
    super(serverInfo, serverOptions);

    this.initFeishuService();

    if (!this.feishuService) {
      Logger.error('无法注册飞书工具: 飞书服务初始化失败');
      throw new Error('飞书服务初始化失败');
    }
    this.registerModuleTools(this.feishuService);
  }

  private initFeishuService(): void {
    try {
      this.feishuService = FeishuApiService.getInstance();
      Logger.info('飞书服务初始化成功');
    } catch (error) {
      Logger.error('飞书服务初始化失败:', error);
      this.feishuService = null;
    }
  }

  /**
   * 根据已启用模块动态注册 MCP 工具
   * task、calendar、member 仅 user 认证时加载
   */
  private registerModuleTools(service: FeishuApiService): void {
    const config = Config.getInstance();
    const enabledIds = config.features.enabledModules;
    const authType = config.feishu.authType;
    const enabledModules = ModuleRegistry.getEnabledModules(enabledIds, authType);

    if (authType === 'tenant' && (enabledIds.includes('task') || enabledIds.includes('calendar') || enabledIds.includes('all'))) {
      Logger.info('task、calendar、member 模块需 user 认证，当前为 tenant 模式，已跳过');
    }

    if (enabledModules.length === 0) {
      Logger.warn(`未找到有效的功能模块，请检查 FEISHU_ENABLED_MODULES 配置（当前值: ${enabledIds.join(', ')}）`);
      Logger.warn(`可用模块: ${ModuleRegistry.getAllModuleIds().join(', ')}`);
      return;
    }

    const toolCounts: string[] = [];
    for (const mod of enabledModules) {
      mod.registerTools(this, service);
      toolCounts.push(`${mod.name}(${mod.id})`);
    }

    Logger.info(`已加载 ${enabledModules.length} 个功能模块: ${toolCounts.join(', ')}`);
  }
}
