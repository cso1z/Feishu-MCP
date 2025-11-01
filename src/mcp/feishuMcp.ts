import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FeishuApiService } from '../services/feishuApiService.js';
import { Logger } from '../utils/logger.js';
import { registerFeishuTools } from './tools/feishuTools.js';
import { registerFeishuBlockTools } from './tools/feishuBlockTools.js';
import { registerFeishuFolderTools } from './tools/feishuFolderTools.js';

const serverInfo = {
  name: "Feishu MCP Server",
  version: "0.1.6",
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
    super(serverInfo,serverOptions);
    
    // 初始化飞书服务
    this.initFeishuService();
    
    // 注册所有工具
    if (this.feishuService) {
      this.registerAllTools();
    } else {
      Logger.error('无法注册飞书工具: 飞书服务初始化失败');
      throw new Error('飞书服务初始化失败');
    }
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
  private registerAllTools(): void {
    if (!this.feishuService) {
      return;
    }
    
    // 注册所有工具
    registerFeishuTools(this, this.feishuService);
    registerFeishuBlockTools(this, this.feishuService);
    registerFeishuFolderTools(this, this.feishuService);
  }
} 