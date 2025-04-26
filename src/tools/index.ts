import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FeishuApiService } from '../services/feishuApiService.js';
import { Logger } from '../utils/logger.js';
import { registerFeishuTools } from './feishuTools';
import { registerFeishuBlockTools } from './feishuBlockTools';
import { registerFeishuFolderTools } from './feishuFolderTools';

/**
 * 初始化飞书API服务
 * @returns 飞书API服务实例或null
 */
export function initFeishuService(): FeishuApiService | null {
  try {
    // 使用单例模式获取飞书服务实例
    const feishuService = FeishuApiService.getInstance();
    Logger.info('飞书服务初始化成功');
    return feishuService;
  } catch (error) {
    Logger.error('飞书服务初始化失败:', error);
    return null;
  }
}

/**
 * 注册所有飞书MCP工具
 * @param server MCP服务器实例
 */
export function registerAllTools(server: McpServer): void {
  // 初始化飞书服务
  const feishuService = initFeishuService();
  if (!feishuService) {
    Logger.error('无法注册飞书工具: 飞书服务初始化失败');
    throw new Error('飞书服务初始化失败');
  }
  
  // 注册所有工具
  registerFeishuTools(server, feishuService);
  registerFeishuBlockTools(server, feishuService);
  registerFeishuFolderTools(server, feishuService);
}
