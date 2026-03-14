import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FeishuApiService } from '../services/feishuApiService.js';
import { Logger } from '../utils/logger.js';
import { registerDocumentTools } from './tools/documentTools.js';
import { registerBlockTools } from './tools/blockTools.js';
import { registerFolderTools } from './tools/folderTools.js';

export const serverInfo = {
  name: "Feishu MCP Server",
  version: "0.2.3",
};

const serverOptions = {
  capabilities: { logging: {}, tools: {} },
};

/**
 * 飞书MCP服务类
 * 继承自McpServer，提供飞书工具注册和初始化功能
 */
export class FeishuMcp extends McpServer {
  private feishuService: FeishuApiService | null = null;

  /**
   * 构造函数
   */
  constructor() {
    super(serverInfo, serverOptions);
    
    // 初始化飞书服务
    this.initFeishuService();
    
    // 注册所有工具（initFeishuService 失败时 feishuService 为 null，此处提前终止）
    if (!this.feishuService) {
      Logger.error('无法注册飞书工具: 飞书服务初始化失败');
      throw new Error('飞书服务初始化失败');
    }
    this.registerAllTools(this.feishuService);
  }

  /**
   * 初始化飞书API服务
   */
  private initFeishuService(): void {
    try {
      // 使用单例模式获取飞书服务实例
      this.feishuService = FeishuApiService.getInstance();
      Logger.info('飞书服务初始化成功');
    } catch (error) {
      Logger.error('飞书服务初始化失败:', error);
      this.feishuService = null;
    }
  }

  /**
   * 注册所有飞书MCP工具
   */
  private registerAllTools(service: FeishuApiService): void {
    registerDocumentTools(this, service);
    registerBlockTools(this, service);
    registerFolderTools(this, service);
  }
} 