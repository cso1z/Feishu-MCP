import { BaseApiService } from './baseService.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../utils/config.js';
import { ParamUtils } from '../utils/paramUtils.js';
import { BlockFactory, BlockType } from './blockFactory.js';
import { AuthUtils,TokenCacheManager } from '../utils/auth/index.js';
import { AuthService } from './feishuAuthService.js';
import { ScopeInsufficientError } from '../utils/error.js';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

/**
 * 飞书API服务类
 * 提供飞书API的所有基础操作，包括认证、请求和缓存管理
 */
export class FeishuApiService extends BaseApiService {
  private static instance: FeishuApiService;
  private readonly blockFactory: BlockFactory;
  private readonly config: Config;
  private readonly authService: AuthService;

  /**
   * 私有构造函数，用于单例模式
   */
  private constructor() {
    super();
    this.blockFactory = BlockFactory.getInstance();
    this.config = Config.getInstance();
    this.authService = new AuthService();
  }

  /**
   * 获取飞书API服务实例
   * @returns 飞书API服务实例
   */
  public static getInstance(): FeishuApiService {
    if (!FeishuApiService.instance) {
      FeishuApiService.instance = new FeishuApiService();
    }
    return FeishuApiService.instance;
  }

  /**
   * 获取API基础URL
   * @returns API基础URL
   */
  protected getBaseUrl(): string {
    return this.config.feishu.baseUrl;
  }

  /**
   * 获取API认证端点
   * @returns 认证端点URL
   */
  protected getAuthEndpoint(): string {
    return '/auth/v3/tenant_access_token/internal';
  }

  /**
   * 获取访问令牌
   * @param userKey 用户标识（可选）
   * @returns 访问令牌
   * @throws 如果获取令牌失败则抛出错误
   */
  protected async getAccessToken(userKey?: string): Promise<string> {
    const { appId, appSecret, authType } = this.config.feishu;
    
    // 生成客户端缓存键
    const clientKey = AuthUtils.generateClientKey(userKey);
    Logger.debug(`[FeishuApiService] 获取访问令牌，userKey: ${userKey}, clientKey: ${clientKey}, authType: ${authType}`);
    
    // 在使用token之前先校验scope（使用appId+appSecret获取临时tenant token来调用scope接口）
    // 根据配置决定是否执行权限检查
    if (this.config.feishu.enableScopeValidation) {
      await this.validateScopeWithVersion(appId, appSecret, authType);
    } else {
      Logger.debug('权限检查已禁用，跳过scope校验');
    }
    
    // 校验通过后，获取实际的token
    if (authType === 'tenant') {
      // 租户模式：获取租户访问令牌
      return await this.getTenantAccessToken(appId, appSecret, clientKey);
    } else {
      // 用户模式：获取用户访问令牌
      return await this.authService.getUserAccessToken(clientKey, appId, appSecret);
    }
  }

  /**
   * 获取应用权限范围
   * @param accessToken 访问令牌
   * @param authType 认证类型（tenant或user）
   * @returns 应用权限范围列表
   */
  private async getApplicationScopes(accessToken: string, authType: 'tenant' | 'user'): Promise<string[]> {
    try {
      const endpoint = '/application/v6/scopes';
      const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      };
      
      Logger.debug('请求应用权限范围:', endpoint);
      const response = await axios.get(`${this.getBaseUrl()}${endpoint}`, { headers });
      const data = response.data;
      
      if (data.code !== 0) {
        throw new Error(`获取应用权限范围失败：${data.msg || '未知错误'} (错误码: ${data.code})`);
      }
      
      // 提取权限列表
      // API返回格式: { "data": { "scopes": [{ "grant_status": 1, "scope_name": "...", "scope_type": "tenant"|"user" }] } }
      const scopes: string[] = [];
      if (data.data && Array.isArray(data.data.scopes)) {
        // 根据authType过滤，只取已授权的scope（grant_status === 1）
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

  /**
   * 校验scope权限是否充足
   * @param requiredScopes 所需的权限列表
   * @param actualScopes 实际的权限列表
   * @returns 是否权限充足，以及缺失的权限列表
   */
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

  /**
   * 获取所需的scope列表（根据认证类型）
   * @param authType 认证类型
   * @returns 所需的scope列表
   */
  private getRequiredScopes(authType: 'tenant' | 'user'): string[] {
    // 根据FEISHU_CONFIG.md中定义的权限列表，与用户提供的配置保持一致
    const tenantScopes = [
      "docx:document.block:convert",
      "base:app:read",
      "bitable:app",
      "bitable:app:readonly",
      "board:whiteboard:node:create",
      "board:whiteboard:node:read",
      "contact:user.employee_id:readonly",
      "docs:document.content:read",
      "docx:document",
      "docx:document:create",
      "docx:document:readonly",
      "drive:drive",
      "drive:drive:readonly",
      "drive:file",
      "drive:file:upload",
      "sheets:spreadsheet",
      "sheets:spreadsheet:readonly",
      "space:document:retrieve",
      "space:folder:create",
      "task:task:write",
      "calendar:calendar",
      "wiki:space:read",
      "wiki:space:retrieve",
      "wiki:wiki",
      "wiki:wiki:readonly"
    ];

    // user认证特有授权
    const userOnlyScopes = [
      "search:docs:read",
      'offline_access',
    ];
    
    const userScopes = [...tenantScopes, ...userOnlyScopes];
    
    return authType === 'tenant' ? tenantScopes : userScopes;
  }

  /**
   * 校验并提示权限不足
   * @param missingScopes 缺失的权限列表
   */
  private throwScopeInsufficientError(missingScopes: string[]): never {
    // 获取完整的权限配置
    const tenantScopes = this.getRequiredScopes('tenant');
    const userScopes = this.getRequiredScopes('user');
    
    const permissionsConfig = {
      scopes: {
        tenant: tenantScopes,
        user: userScopes
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

  /**
   * 生成应用级别的scope校验key（基于appId、appSecret和authType）
   * @param appId 应用ID
   * @param appSecret 应用密钥
   * @param authType 认证类型（tenant或user）
   * @returns scope校验key
   */
  private generateScopeKey(appId: string, appSecret: string, authType: 'tenant' | 'user'): string {
    // 使用appId、appSecret和authType生成唯一的key，用于scope版本管理
    // 包含authType是因为tenant和user的权限列表不同，需要分开校验
    return `app:${appId}:${appSecret.substring(0, 8)}:${authType}`;
  }

  /**
   * 获取临时租户访问令牌（用于scope校验）
   * @param appId 应用ID
   * @param appSecret 应用密钥
   * @returns 租户访问令牌
   */
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

  /**
   * 校验scope权限（带版本管理）
   * @param appId 应用ID
   * @param appSecret 应用密钥
   * @param authType 认证类型
   */
   async validateScopeWithVersion(appId: string, appSecret: string, authType: 'tenant' | 'user'): Promise<void> {
    const tokenCacheManager = TokenCacheManager.getInstance();
    
    // 生成应用级别的scope校验key（包含authType，因为tenant和user权限不同）
    const scopeKey = this.generateScopeKey(appId, appSecret, authType);

    const scopeVersion = '2.1.0'; // 当前scope版本号，可以根据需要更新（2.1.0: 添加 calendar:calendar, task:task:write）
    
    // 检查是否需要校验
    if (!tokenCacheManager.shouldValidateScope(scopeKey, scopeVersion)) {
      Logger.debug(`Scope版本已校验过，跳过校验: ${scopeKey}`);
      return;
    }
    
    Logger.info(`开始校验scope权限，版本: ${scopeVersion}, scopeKey: ${scopeKey}`);
    
    try {
      // 使用appId和appSecret获取临时tenant token来调用scope接口
      const tempTenantToken = await this.getTempTenantTokenForScope(appId, appSecret);

      // 获取实际权限范围（使用tenant token，但根据authType过滤scope_type）
      const actualScopes = await this.getApplicationScopes(tempTenantToken, authType);

      // 获取当前版本所需的scope列表
      const requiredScopes = this.getRequiredScopes(authType);

      // 校验权限
      const validationResult = this.validateScopes(requiredScopes, actualScopes);
      
      if (!validationResult.isValid) {
        // 权限不足，抛出错误
        this.throwScopeInsufficientError(validationResult.missingScopes);
      }
      
      // 权限充足，保存版本信息
      const scopeVersionInfo = {
        scopeVersion,
        scopeList: requiredScopes,
        validatedAt: Math.floor(Date.now() / 1000),
        validatedVersion: scopeVersion
      };
      
      tokenCacheManager.saveScopeVersionInfo(scopeKey, scopeVersionInfo);
      Logger.info(`Scope权限校验成功，版本: ${scopeVersion}`);
    } catch (error) {
      // 如果是权限不足错误，需要重新抛出，中断流程
      if (error instanceof ScopeInsufficientError) {
        throw error;
      }
      // 如果获取权限范围失败（网络错误、API调用失败等），记录警告但不阻止token使用
      Logger.warn(`Scope权限校验失败，但继续使用token: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取租户访问令牌
   * @param appId 应用ID
   * @param appSecret 应用密钥
   * @param clientKey 客户端缓存键
   * @returns 租户访问令牌
   */
  private async getTenantAccessToken(appId: string, appSecret: string, clientKey: string): Promise<string> {
    const tokenCacheManager = TokenCacheManager.getInstance();
    
    // 尝试从缓存获取租户token
    const cachedToken = tokenCacheManager.getTenantToken(clientKey);
    if (cachedToken) {
      Logger.debug('使用缓存的租户访问令牌');
      return cachedToken;
    }

    // 缓存中没有token，请求新的租户token
    Logger.info('缓存中没有租户token，请求新的租户访问令牌');
    try {
      const requestData = {
        app_id: appId,
        app_secret: appSecret,
      };
      const url = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
      const headers = { 'Content-Type': 'application/json' };
      
      Logger.debug('请求租户访问令牌:', url, requestData);
      const response = await axios.post(url, requestData, { headers });
      const data = response.data;
      
      if (data.code !== 0) {
        throw new Error(`获取租户访问令牌失败：${data.msg || '未知错误'} (错误码: ${data.code})`);
      }
      
      if (!data.tenant_access_token) {
        throw new Error('获取租户访问令牌失败：响应中没有token');
      }
      
      // 计算绝对过期时间戳
      const expire_at = Math.floor(Date.now() / 1000) + (data.expire || 0);
      const tokenInfo = {
        app_access_token: data.tenant_access_token,
        expires_at: expire_at
      };
      
      // 缓存租户token
      tokenCacheManager.cacheTenantToken(clientKey, tokenInfo, data.expire);
      Logger.info('租户访问令牌获取并缓存成功');
      
      return data.tenant_access_token;
    } catch (error) {
      Logger.error('获取租户访问令牌失败:', error);
      throw new Error('获取租户访问令牌失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  }



  /**
   * 创建飞书文档
   * @param title 文档标题
   * @param folderToken 文件夹Token
   * @returns 创建的文档信息
   */
  public async createDocument(title: string, folderToken: string): Promise<any> {
    try {
      const endpoint = '/docx/v1/documents';

      const payload = {
        title,
        folder_token: folderToken
      };

      const response = await this.post(endpoint, payload);
      return response;
    } catch (error) {
      this.handleApiError(error, '创建飞书文档失败');
    }
  }

  /**
   * 获取文档信息（支持普通文档和Wiki文档）
   * @param documentId 文档ID或URL（支持Wiki链接）
   * @param documentType 文档类型（可选），'document' 或 'wiki'，如果不指定则自动检测
   * @returns 文档信息或Wiki节点信息
   */
  public async getDocumentInfo(documentId: string, documentType?: 'document' | 'wiki'): Promise<any> {
    try {
      let isWikiLink: boolean;
      
      // 如果明确指定了类型，使用指定的类型
      if (documentType === 'wiki') {
        isWikiLink = true;
      } else if (documentType === 'document') {
        isWikiLink = false;
      } else {
        // 自动检测：检查是否是Wiki链接（包含 /wiki/ 路径）
        isWikiLink = documentId.includes('/wiki/');
      }
      
      if (isWikiLink) {
        // 处理Wiki文档
        const wikiToken = ParamUtils.processWikiToken(documentId);
        const endpoint = `/wiki/v2/spaces/get_node`;
        const params = { token: wikiToken, obj_type: 'wiki' };
        const response = await this.get(endpoint, params);

        if (!response.node || !response.node.obj_token) {
          throw new Error(`无法从Wiki节点获取文档ID: ${wikiToken}`);
        }

        const node = response.node;
        const docId = node.obj_token;

        // 构建返回对象，包含完整节点信息和 documentId 字段
        const result = {
          ...node,
          documentId: docId, // 添加 documentId 字段作为 obj_token 的别名
          _type: 'wiki', // 标识这是Wiki文档
        };

        Logger.debug(`获取Wiki文档信息: ${wikiToken} -> documentId: ${docId}, space_id: ${node.space_id}, node_token: ${node.node_token}`);
        return result;
      } else {
        // 处理普通文档
        const normalizedDocId = ParamUtils.processDocumentId(documentId);
        const endpoint = `/docx/v1/documents/${normalizedDocId}`;
        const response = await this.get(endpoint);
        const result = {
          ...response,
          _type: 'document', // 标识这是普通文档
        };
        Logger.debug(`获取普通文档信息: ${normalizedDocId}`);
        return result;
      }
    } catch (error) {
      this.handleApiError(error, '获取文档信息失败');
    }
  }

  /**
   * 获取文档内容
   * @param documentId 文档ID或URL
   * @param lang 语言代码，0为中文，1为英文
   * @returns 文档内容
   */
  public async getDocumentContent(documentId: string, lang: number = 0): Promise<string> {
    try {
      const normalizedDocId = ParamUtils.processDocumentId(documentId);
      const endpoint = `/docx/v1/documents/${normalizedDocId}/raw_content`;
      const params = { lang };
      const response = await this.get(endpoint, params);
      return response.content;
    } catch (error) {
      this.handleApiError(error, '获取文档内容失败');
    }
  }

  /**
   * 获取文档块结构
   * @param documentId 文档ID或URL
   * @param pageSize 每页块数量
   * @returns 文档块数组
   */
  public async getDocumentBlocks(documentId: string, pageSize: number = 500): Promise<any[]> {
    try {
      const normalizedDocId = ParamUtils.processDocumentId(documentId);
      const endpoint = `/docx/v1/documents/${normalizedDocId}/blocks`;
      let pageToken = '';
      let allBlocks: any[] = [];

      // 分页获取所有块
      do {
        const params: any = { 
          page_size: pageSize,
          document_revision_id: -1 
        };
        if (pageToken) {
          params.page_token = pageToken;
        }

        const response = await this.get(endpoint, params);
        const blocks = response.items || [];

        allBlocks = [...allBlocks, ...blocks];
        pageToken = response.page_token;
      } while (pageToken);

      return allBlocks;
    } catch (error) {
      this.handleApiError(error, '获取文档块结构失败');
    }
  }

  /**
   * 获取块内容
   * @param documentId 文档ID或URL
   * @param blockId 块ID
   * @returns 块内容
   */
  public async getBlockContent(documentId: string, blockId: string): Promise<any> {
    try {
      const normalizedDocId = ParamUtils.processDocumentId(documentId);
      const safeBlockId = ParamUtils.processBlockId(blockId);

      const endpoint = `/docx/v1/documents/${normalizedDocId}/blocks/${safeBlockId}`;
      const params = { document_revision_id: -1 };
      
      const response = await this.get(endpoint, params);

      return response;
    } catch (error) {
      this.handleApiError(error, '获取块内容失败');
    }
  }

  /**
   * 更新块文本内容
   * @param documentId 文档ID或URL
   * @param blockId 块ID
   * @param textElements 文本元素数组，支持普通文本和公式元素
   * @returns 更新结果
   */
  public async updateBlockTextContent(documentId: string, blockId: string, textElements: Array<{text?: string, equation?: string, style?: any}>): Promise<any> {
    try {
      const docId = ParamUtils.processDocumentId(documentId);
      const endpoint = `/docx/v1/documents/${docId}/blocks/${blockId}?document_revision_id=-1`;
      Logger.debug(`准备请求API端点: ${endpoint}`);

      const elements = textElements.map(item => {
        if (item.equation !== undefined) {
          return {
            equation: {
              content: item.equation,
              text_element_style: BlockFactory.applyDefaultTextStyle(item.style)
            }
          };
        } else {
          return {
            text_run: {
              content: item.text || '',
              text_element_style: BlockFactory.applyDefaultTextStyle(item.style)
            }
          };
        }
      });

      const data = {
        update_text_elements: {
          elements: elements
        }
      };

      Logger.debug(`请求数据: ${JSON.stringify(data, null, 2)}`);
      const response = await this.patch(endpoint, data);
      return response;
    } catch (error) {
      this.handleApiError(error, '更新块文本内容失败');
      return null; // 永远不会执行到这里
    }
  }

  /**
   * 创建文档块
   * @param documentId 文档ID或URL
   * @param parentBlockId 父块ID
   * @param blockContent 块内容
   * @param index 插入位置索引
   * @returns 创建结果
   */
  public async createDocumentBlock(documentId: string, parentBlockId: string, blockContent: any, index: number = 0): Promise<any> {
    try {
      const normalizedDocId = ParamUtils.processDocumentId(documentId);
      const endpoint = `/docx/v1/documents/${normalizedDocId}/blocks/${parentBlockId}/children?document_revision_id=-1`;
      Logger.debug(`准备请求API端点: ${endpoint}`);

      const payload = {
        children: [blockContent],
        index
      };

      Logger.debug(`请求数据: ${JSON.stringify(payload, null, 2)}`);
      const response = await this.post(endpoint, payload);
      return response;
    } catch (error) {
      this.handleApiError(error, '创建文档块失败');
      return null; // 永远不会执行到这里
    }
  }

  /**
   * 批量创建文档块
   * @param documentId 文档ID或URL
   * @param parentBlockId 父块ID
   * @param blockContents 块内容数组
   * @param index 起始插入位置索引
   * @returns 创建结果
   */
  public async createDocumentBlocks(documentId: string, parentBlockId: string, blockContents: any[], index: number = 0): Promise<any> {
    try {
      const normalizedDocId = ParamUtils.processDocumentId(documentId);
      const endpoint = `/docx/v1/documents/${normalizedDocId}/blocks/${parentBlockId}/children?document_revision_id=-1`;
      Logger.debug(`准备请求API端点: ${endpoint}`);

      const payload = {
        children: blockContents,
        index
      };

      Logger.debug(`请求数据: ${JSON.stringify(payload, null, 2)}`);
      const response = await this.post(endpoint, payload);
      return response;
    } catch (error) {
      this.handleApiError(error, '批量创建文档块失败');
      return null; // 永远不会执行到这里
    }
  }

  /**
   * 创建文本块
   * @param documentId 文档ID或URL
   * @param parentBlockId 父块ID
   * @param textContents 文本内容数组，支持普通文本和公式元素
   * @param align 对齐方式，1为左对齐，2为居中，3为右对齐
   * @param index 插入位置索引
   * @returns 创建结果
   */
  public async createTextBlock(documentId: string, parentBlockId: string, textContents: Array<{text?: string, equation?: string, style?: any}>, align: number = 1, index: number = 0): Promise<any> {
    // 处理文本内容样式，支持普通文本和公式元素
    const processedTextContents = textContents.map(item => {
      if (item.equation !== undefined) {
        return {
          equation: item.equation,
          style: BlockFactory.applyDefaultTextStyle(item.style)
        };
      } else {
        return {
          text: item.text || '',
          style: BlockFactory.applyDefaultTextStyle(item.style)
        };
      }
    });
    
    const blockContent = this.blockFactory.createTextBlock({
      textContents: processedTextContents,
      align
    });
    return this.createDocumentBlock(documentId, parentBlockId, blockContent, index);
  }

  /**
   * 创建代码块
   * @param documentId 文档ID或URL
   * @param parentBlockId 父块ID
   * @param code 代码内容
   * @param language 语言代码
   * @param wrap 是否自动换行
   * @param index 插入位置索引
   * @returns 创建结果
   */
  public async createCodeBlock(documentId: string, parentBlockId: string, code: string, language: number = 0, wrap: boolean = false, index: number = 0): Promise<any> {
    const blockContent = this.blockFactory.createCodeBlock({
      code,
      language,
      wrap
    });
    return this.createDocumentBlock(documentId, parentBlockId, blockContent, index);
  }

  /**
   * 创建标题块
   * @param documentId 文档ID或URL
   * @param parentBlockId 父块ID
   * @param text 标题文本
   * @param level 标题级别，1-9
   * @param index 插入位置索引
   * @param align 对齐方式，1为左对齐，2为居中，3为右对齐
   * @returns 创建结果
   */
  public async createHeadingBlock(documentId: string, parentBlockId: string, text: string, level: number = 1, index: number = 0, align: number = 1): Promise<any> {
    const blockContent = this.blockFactory.createHeadingBlock({
      text,
      level,
      align
    });
    return this.createDocumentBlock(documentId, parentBlockId, blockContent, index);
  }

  /**
   * 创建列表块
   * @param documentId 文档ID或URL
   * @param parentBlockId 父块ID
   * @param text 列表项文本
   * @param isOrdered 是否是有序列表
   * @param index 插入位置索引
   * @param align 对齐方式，1为左对齐，2为居中，3为右对齐
   * @returns 创建结果
   */
  public async createListBlock(documentId: string, parentBlockId: string, text: string, isOrdered: boolean = false, index: number = 0, align: number = 1): Promise<any> {
    const blockContent = this.blockFactory.createListBlock({
      text,
      isOrdered,
      align
    });
    return this.createDocumentBlock(documentId, parentBlockId, blockContent, index);
  }

  /**
   * 创建Mermaid块
   * @param documentId 文档ID或URL
   * @param parentBlockId 父块ID
   * @param mermaidCode Mermaid代码
   * @param index 插入位置索引
   * @returns 创建结果
   */
  public async createMermaidBlock(
    documentId: string,
    parentBlockId: string,
    mermaidCode: string,
    index: number = 0
  ): Promise<any> {
    const normalizedDocId = ParamUtils.processDocumentId(documentId);
    const endpoint = `/docx/v1/documents/${normalizedDocId}/blocks/${parentBlockId}/children?document_revision_id=-1`;

    const blockContent = {
      block_type: 40,
      add_ons: {
        component_id: "",
        component_type_id: "blk_631fefbbae02400430b8f9f4",
        record: JSON.stringify({
          data: mermaidCode,
        })
      }
    };
    const payload = {
      children: [blockContent],
      index
    };
    Logger.info(`请求创建Mermaid块: ${JSON.stringify(payload).slice(0, 500)}...`);
    const response = await this.post(endpoint, payload);
    return response;
  }

  /**
   * 创建表格块
   * @param documentId 文档ID或URL
   * @param parentBlockId 父块ID
   * @param tableConfig 表格配置
   * @param index 插入位置索引
   * @returns 创建结果
   */
  public async createTableBlock(
    documentId: string,
    parentBlockId: string,
    tableConfig: {
      columnSize: number;
      rowSize: number;
      cells?: Array<{
        coordinate: { row: number; column: number };
        content: any;
      }>;
    },
    index: number = 0
  ): Promise<any> {
    const normalizedDocId = ParamUtils.processDocumentId(documentId);
    const endpoint = `/docx/v1/documents/${normalizedDocId}/blocks/${parentBlockId}/descendant?document_revision_id=-1`;

    // 处理表格配置，为每个单元格创建正确的内容块
    const processedTableConfig = {
      ...tableConfig,
      cells: tableConfig.cells?.map(cell => ({
        ...cell,
        content: this.createBlockContent(cell.content.blockType, cell.content.options)
      }))
    };

    // 使用 BlockFactory 创建表格块内容
    const tableStructure = this.blockFactory.createTableBlock(processedTableConfig);
    
    const payload = {
      children_id: tableStructure.children_id,
      descendants: tableStructure.descendants,
      index
    };

    Logger.info(`请求创建表格块: ${tableConfig.rowSize}x${tableConfig.columnSize}，单元格数量: ${tableConfig.cells?.length || 0}`);
    const response = await this.post(endpoint, payload);
    
    // 创建表格成功后，获取单元格中的图片token
    const imageTokens = await this.extractImageTokensFromTable(
      response,
      tableStructure.imageBlocks
    );
    
    return {
      ...response,
      imageTokens: imageTokens
    };
  }

  /**
   * 从表格中提取图片块信息（优化版本）
   * @param tableResponse 创建表格的响应数据
   * @param cells 表格配置，包含原始cells信息
   * @returns 图片块信息数组，包含坐标和块ID信息
   */
  private async extractImageTokensFromTable(
    tableResponse: any,
    cells?: Array<{
      coordinate: { row: number; column: number };
      localBlockId: string;
    }>
  ): Promise<Array<{row: number, column: number, blockId: string}>> {
    try {
      const imageTokens: Array<{row: number, column: number, blockId: string}> = [];

      Logger.info(`tableResponse: ${JSON.stringify(tableResponse)}`);

      // 判断 cells 是否为空
      if (!cells || cells.length === 0) {
        Logger.info('表格中没有图片单元格，跳过图片块信息提取');
        return imageTokens;
      }

      // 创建 localBlockId 到 block_id 的映射
      const blockIdMap = new Map<string, string>();
      if (tableResponse && tableResponse.block_id_relations) {
        for (const relation of tableResponse.block_id_relations) {
          blockIdMap.set(relation.temporary_block_id, relation.block_id);
        }
        Logger.debug(`创建了 ${blockIdMap.size} 个块ID映射关系`);
      }

      // 遍历所有图片单元格
      for (const cell of cells) {
        const { coordinate, localBlockId } = cell;
        const { row, column } = coordinate;

        // 根据 localBlockId 在创建表格的返回数据中找到 block_id
        const blockId = blockIdMap.get(localBlockId);
        if (!blockId) {
          Logger.warn(`未找到 localBlockId ${localBlockId} 对应的 block_id`);
          continue;
        }

        Logger.debug(`处理单元格 (${row}, ${column})，localBlockId: ${localBlockId}，blockId: ${blockId}`);

        // 直接添加块信息
        imageTokens.push({
          row,
          column,
          blockId
        });

        Logger.info(`提取到图片块信息: 位置(${row}, ${column})，blockId: ${blockId}`);
      }

      Logger.info(`成功提取 ${imageTokens.length} 个图片块信息`);
      return imageTokens;

    } catch (error) {
      Logger.error(`提取表格图片块信息失败: ${error}`);
      return [];
    }
  }

  /**
   * 删除文档中的块，支持批量删除
   * @param documentId 文档ID或URL
   * @param parentBlockId 父块ID（通常是文档ID）
   * @param startIndex 起始索引
   * @param endIndex 结束索引
   * @returns 操作结果
   */
  public async deleteDocumentBlocks(documentId: string, parentBlockId: string, startIndex: number, endIndex: number): Promise<any> {
    try {
      const normalizedDocId = ParamUtils.processDocumentId(documentId);
      const endpoint = `/docx/v1/documents/${normalizedDocId}/blocks/${parentBlockId}/children/batch_delete`;
      
      // 确保索引有效
      if (startIndex < 0 || endIndex < startIndex) {
        throw new Error('无效的索引范围：起始索引必须大于等于0，结束索引必须大于等于起始索引');
      }

      const payload = {
        start_index: startIndex,
        end_index: endIndex
      };

      Logger.info(`开始删除文档块，文档ID: ${normalizedDocId}，父块ID: ${parentBlockId}，索引范围: ${startIndex}-${endIndex}`);
      const response = await this.delete(endpoint, payload);
      
      Logger.info('文档块删除成功');
      return response;
    } catch (error) {
      this.handleApiError(error, '删除文档块失败');
    }
  }

  /**
   * 删除单个文档块（通过创建起始和结束索引相同的批量删除请求）
   * @param documentId 文档ID或URL
   * @param parentBlockId 父块ID
   * @param blockIndex 块索引
   * @returns 操作结果
   */
  public async deleteDocumentBlock(documentId: string, parentBlockId: string, blockIndex: number): Promise<any> {
    return this.deleteDocumentBlocks(documentId, parentBlockId, blockIndex, blockIndex + 1);
  }

  /**
   * 将飞书Wiki链接转换为文档ID
   * @param wikiUrl Wiki链接或Token
   * @returns 文档ID
   */
  // public async convertWikiToDocumentId(wikiUrl: string): Promise<string> {
  //   try {
  //     const wikiToken = ParamUtils.processWikiToken(wikiUrl);
  //
  //     // 获取Wiki节点信息
  //     const endpoint = `/wiki/v2/spaces/get_node`;
  //     const params = { token: wikiToken, obj_type: 'wiki' };
  //     const response = await this.get(endpoint, params);
  //
  //     if (!response.node || !response.node.obj_token) {
  //       throw new Error(`无法从Wiki节点获取文档ID: ${wikiToken}`);
  //     }
  //
  //     const documentId = response.node.obj_token;
  //
  //     Logger.debug(`Wiki转换为文档ID: ${wikiToken} -> ${documentId}`);
  //     return documentId;
  //   } catch (error) {
  //     this.handleApiError(error, 'Wiki转换为文档ID失败');
  //     return ''; // 永远不会执行到这里
  //   }
  // }

  /**
   * 获取BlockFactory实例
   * @returns BlockFactory实例
   */
  public getBlockFactory() {
    return this.blockFactory;
  }

  /**
   * 创建块内容对象
   * @param blockType 块类型
   * @param options 块选项
   * @returns 块内容对象
   */
  public createBlockContent(blockType: string, options: any): any {
    try {
      // 处理特殊的heading标题格式，如heading1, heading2等
      if (typeof blockType === 'string' && blockType.startsWith('heading')) {
        // 使用正则表达式匹配"heading"后跟1-9的数字格式
        const headingMatch = blockType.match(/^heading([1-9])$/);
        if (headingMatch) {
          // 提取数字部分，例如从"heading1"中提取"1"
          const level = parseInt(headingMatch[1], 10);
          
          // 额外的安全检查，确保level在1-9范围内
          if (level >= 1 && level <= 9) {
            // 使用level参数创建标题块
            if (!options || Object.keys(options).length === 0) {
              // 没有提供选项时创建默认选项
              options = { heading: { level, content: '', align: 1 } };
            } else if (!('heading' in options)) {
              // 提供了选项但没有heading字段
              options = { heading: { level, content: '', align: 1 } };
            } else if (options.heading && !('level' in options.heading)) {
              // 提供了heading但没有level字段
              options.heading.level = level;
            }
            blockType = BlockType.HEADING; // 将blockType转为标准的heading类型
            
            Logger.info(`转换特殊标题格式: ${blockType}${level} -> standard heading with level=${level}`);
          }
        }
      }

      // 使用枚举类型来避免字符串错误
      const blockTypeEnum = blockType as BlockType;

      // 构建块配置
      const blockConfig = {
        type: blockTypeEnum,
        options: {}
      };

      // 根据块类型处理不同的选项
      switch (blockTypeEnum) {
        case BlockType.TEXT:
          if ('text' in options && options.text) {
            const textOptions = options.text;
            // 处理文本样式，应用默认样式，支持普通文本和公式元素
            const textStyles = textOptions.textStyles || [];
            const processedTextStyles = textStyles.map((item: any) => {
              if (item.equation !== undefined) {
                return {
                  equation: item.equation,
                  style: BlockFactory.applyDefaultTextStyle(item.style)
                };
              } else {
                return {
                  text: item.text || '',
                  style: BlockFactory.applyDefaultTextStyle(item.style)
                };
              }
            });
            
            blockConfig.options = {
              textContents: processedTextStyles,
              align: textOptions.align || 1
            };
          }
          break;

        case BlockType.CODE:
          if ('code' in options && options.code) {
            const codeOptions = options.code;
            blockConfig.options = {
              code: codeOptions.code || '',
              language: codeOptions.language === 0 ? 0 : (codeOptions.language || 0),
              wrap: codeOptions.wrap || false
            };
          }
          break;

        case BlockType.HEADING:
          if ('heading' in options && options.heading) {
            const headingOptions = options.heading;
            blockConfig.options = {
              text: headingOptions.content || '',
              level: headingOptions.level || 1,
              align: (headingOptions.align === 1 || headingOptions.align === 2 || headingOptions.align === 3)
                ? headingOptions.align : 1
            };
          }
          break;

        case BlockType.LIST:
          if ('list' in options && options.list) {
            const listOptions = options.list;
            blockConfig.options = {
              text: listOptions.content || '',
              isOrdered: listOptions.isOrdered || false,
              align: (listOptions.align === 1 || listOptions.align === 2 || listOptions.align === 3)
                ? listOptions.align : 1
            };
          }
          break;

        case BlockType.IMAGE:
          if ('image' in options && options.image) {
            const imageOptions = options.image;
            blockConfig.options = {
              width: imageOptions.width || 100,
              height: imageOptions.height || 100
            };
          } else {
            // 默认图片块选项
            blockConfig.options = {
              width: 100,
              height: 100
            };
          }
          break;
        case BlockType.MERMAID:
          if ('mermaid' in options && options.mermaid) {
            const mermaidOptions = options.mermaid;
            blockConfig.options = {
              code: mermaidOptions.code,
            };
          }
          break;

        case BlockType.WHITEBOARD:
          if ('whiteboard' in options && options.whiteboard) {
            const whiteboardOptions = options.whiteboard;
            blockConfig.options = {
              align: (whiteboardOptions.align === 1 || whiteboardOptions.align === 2 || whiteboardOptions.align === 3)
                ? whiteboardOptions.align : 1
            };
          } else {
            // 默认画板块选项
            blockConfig.options = {
              align: 1
            };
          }
          break;
          
        default:
          Logger.warn(`未知的块类型: ${blockType}，尝试作为标准类型处理`);
          if ('text' in options) {
            blockConfig.type = BlockType.TEXT;
            const textOptions = options.text;
            
            // 处理文本样式，应用默认样式，支持普通文本和公式元素
            const textStyles = textOptions.textStyles || [];
            const processedTextStyles = textStyles.map((item: any) => {
              if (item.equation !== undefined) {
                return {
                  equation: item.equation,
                  style: BlockFactory.applyDefaultTextStyle(item.style)
                };
              } else {
                return {
                  text: item.text || '',
                  style: BlockFactory.applyDefaultTextStyle(item.style)
                };
              }
            });
            
            blockConfig.options = {
              textContents: processedTextStyles,
              align: textOptions.align || 1
            };
          } else if ('code' in options) {
            blockConfig.type = BlockType.CODE;
            const codeOptions = options.code;
            blockConfig.options = {
              code: codeOptions.code || '',
              language: codeOptions.language === 0 ? 0 : (codeOptions.language || 0),
              wrap: codeOptions.wrap || false
            };
          } else if ('heading' in options) {
            blockConfig.type = BlockType.HEADING;
            const headingOptions = options.heading;
            blockConfig.options = {
              text: headingOptions.content || '',
              level: headingOptions.level || 1,
              align: (headingOptions.align === 1 || headingOptions.align === 2 || headingOptions.align === 3)
                ? headingOptions.align : 1
            };
          } else if ('list' in options) {
            blockConfig.type = BlockType.LIST;
            const listOptions = options.list;
            blockConfig.options = {
              text: listOptions.content || '',
              isOrdered: listOptions.isOrdered || false,
              align: (listOptions.align === 1 || listOptions.align === 2 || listOptions.align === 3)
                ? listOptions.align : 1
            };
          } else if ('image' in options) {
            blockConfig.type = BlockType.IMAGE;
            const imageOptions = options.image;
            blockConfig.options = {
              width: imageOptions.width || 100,
              height: imageOptions.height || 100
            };
          } else if ("mermaid" in options){
            blockConfig.type = BlockType.MERMAID;
            const mermaidConfig = options.mermaid;
            blockConfig.options = {
              code: mermaidConfig.code,
            };
          } else if ("whiteboard" in options){
            blockConfig.type = BlockType.WHITEBOARD;
            const whiteboardConfig = options.whiteboard;
            blockConfig.options = {
              align: (whiteboardConfig.align === 1 || whiteboardConfig.align === 2 || whiteboardConfig.align === 3)
                ? whiteboardConfig.align : 1
            };
          }
          break;
      }

      // 记录调试信息
      Logger.debug(`创建块内容: 类型=${blockConfig.type}, 选项=${JSON.stringify(blockConfig.options)}`);

      // 使用BlockFactory创建块
      return this.blockFactory.createBlock(blockConfig.type, blockConfig.options);
    } catch (error) {
      Logger.error(`创建块内容对象失败: ${error}`);
      return null;
    }
  }

  /**
   * 获取飞书图片资源
   * @param mediaId 图片媒体ID
   * @param extra 额外参数，可选
   * @returns 图片二进制数据
   */
  public async getImageResource(mediaId: string, extra: string = ''): Promise<Buffer> {
    try {
      Logger.info(`开始获取图片资源，媒体ID: ${mediaId}`);
      
      if (!mediaId) {
        throw new Error('媒体ID不能为空');
      }
      
      const endpoint = `/drive/v1/medias/${mediaId}/download`;
      const params: any = {};
      
      if (extra) {
        params.extra = extra;
      }
      
      // 使用通用的request方法获取二进制响应
      const response = await this.request<ArrayBuffer>(endpoint, 'GET', params, true, {}, 'arraybuffer');
      
      const imageBuffer = Buffer.from(response);
      Logger.info(`图片资源获取成功，大小: ${imageBuffer.length} 字节`);
      
      return imageBuffer;
    } catch (error) {
      this.handleApiError(error, '获取图片资源失败');
      return Buffer.from([]); // 永远不会执行到这里
    }
  }

  /**
   * 获取飞书根文件夹信息
   * 获取用户的根文件夹的元数据信息，包括token、id和用户id
   * @returns 根文件夹信息
   */
  public async getRootFolderInfo(): Promise<any> {
    try {
      const endpoint = '/drive/explorer/v2/root_folder/meta';
      const response = await this.get(endpoint);
      Logger.debug('获取根文件夹信息成功:', response);
      return response;
    } catch (error) {
      this.handleApiError(error, '获取飞书根文件夹信息失败');
    }
  }

  /**
   * 获取所有知识空间列表（遍历所有分页）
   * @param pageSize 每页数量，默认20
   * @returns 所有知识空间列表（仅包含 items 数组，不包含 has_more 和 page_token）
   */
  public async getAllWikiSpacesList(pageSize: number = 20): Promise<any> {
    try {
      Logger.info(`开始获取所有知识空间列表，每页数量: ${pageSize}`);
      
      const endpoint = '/wiki/v2/spaces';
      let allItems: any[] = [];
      let pageToken: string | undefined = undefined;
      let hasMore = true;

      // 循环获取所有页的数据
      while (hasMore) {
        const params: any = { page_size: pageSize };
        if (pageToken) {
          params.page_token = pageToken;
        }

        Logger.debug(`请求知识空间列表，page_token: ${pageToken || 'null'}, page_size: ${pageSize}`);
        const response = await this.get(endpoint, params);
        
        if (response && response.items) {
          const newItems = response.items;
          allItems = [...allItems, ...newItems];
          hasMore = response.has_more || false;
          pageToken = response.page_token;
          
          Logger.debug(`当前页获取到 ${newItems.length} 个知识空间，累计 ${allItems.length} 个，hasMore: ${hasMore}`);
        } else {
          hasMore = false;
          Logger.warn('知识空间列表响应格式异常:', JSON.stringify(response, null, 2));
        }
      }

      Logger.info(`知识空间列表获取完成，共 ${allItems.length} 个空间`);
      return allItems; // 直接返回数组，不包装在 items 中
    } catch (error) {
      this.handleApiError(error, '获取知识空间列表失败');
    }
  }

  /**
   * 获取所有知识空间子节点列表（遍历所有分页）
   * @param spaceId 知识空间ID
   * @param parentNodeToken 父节点Token（可选，为空时获取根节点）
   * @param pageSize 每页数量，默认20
   * @returns 所有子节点列表（仅包含 items 数组，不包含 has_more 和 page_token）
   */
  public async getAllWikiSpaceNodes(spaceId: string, parentNodeToken?: string, pageSize: number = 20): Promise<any> {
    try {
      Logger.info(`开始获取知识空间子节点列表，space_id: ${spaceId}, parent_node_token: ${parentNodeToken || 'null'}, 每页数量: ${pageSize}`);
      
      const endpoint = `/wiki/v2/spaces/${spaceId}/nodes`;
      let allItems: any[] = [];
      let pageToken: string | undefined = undefined;
      let hasMore = true;

      // 循环获取所有页的数据
      while (hasMore) {
        const params: any = { page_size: pageSize };
        if (parentNodeToken) {
          params.parent_node_token = parentNodeToken;
        }
        if (pageToken) {
          params.page_token = pageToken;
        }

        Logger.debug(`请求知识空间子节点列表，page_token: ${pageToken || 'null'}, page_size: ${pageSize}`);
        const response = await this.get(endpoint, params);
        
        if (response && response.items) {
          const newItems = response.items;
          allItems = [...allItems, ...newItems];
          hasMore = response.has_more || false;
          pageToken = response.page_token;
          
          Logger.debug(`当前页获取到 ${newItems.length} 个子节点，累计 ${allItems.length} 个，hasMore: ${hasMore}`);
        } else {
          hasMore = false;
          Logger.warn('知识空间子节点列表响应格式异常:', JSON.stringify(response, null, 2));
        }
      }

      Logger.info(`知识空间子节点列表获取完成，共 ${allItems.length} 个节点`);
      return allItems; // 直接返回数组，不包装在 items 中
    } catch (error) {
      this.handleApiError(error, '获取知识空间子节点列表失败');
    }
  }

  /**
   * 获取知识空间信息
   * @param spaceId 知识空间ID，传入 'my_library' 时获取"我的知识库"
   * @param lang 语言（仅当 spaceId 为 'my_library' 时有效），默认'en'
   * @returns 知识空间信息
   */
  public async getWikiSpaceInfo(spaceId: string, lang: string = 'en'): Promise<any> {
    try {
      const endpoint = `/wiki/v2/spaces/${spaceId}`;
      const params: any = {};
      
      // 当 spaceId 为 'my_library' 时，添加 lang 参数
      if (spaceId === 'my_library') {
        params.lang = lang;
      }
      
      const response = await this.get(endpoint, params);
      Logger.debug(`获取知识空间信息成功 (space_id: ${spaceId}):`, response);
      
      // 如果响应中包含 space 字段，直接返回 space 对象；否则返回整个响应
      if (response && response.space) {
        return response.space;
      }
      return response;
    } catch (error) {
      this.handleApiError(error, `获取知识空间信息失败 (space_id: ${spaceId})`);
    }
  }

  /**
   * 创建知识空间节点（知识库节点）
   * @param spaceId 知识空间ID
   * @param title 节点标题
   * @param parentNodeToken 父节点Token（可选，为空时在根节点下创建）
   * @returns 创建的节点信息，包含 node_token（节点ID）和 obj_token（文档ID）
   */
  public async createWikiSpaceNode(
    spaceId: string,
    title: string,
    parentNodeToken?: string
  ): Promise<any> {
    try {
      Logger.info(`开始创建知识空间节点，space_id: ${spaceId}, title: ${title}, parent_node_token: ${parentNodeToken || 'null（根节点）'}`);
      
      const endpoint = `/wiki/v2/spaces/${spaceId}/nodes`;
      
      const payload: any = {
        title,
        obj_type: 'docx',
        node_type: 'origin',
      };
      
      if (parentNodeToken) {
        payload.parent_node_token = parentNodeToken;
      }
      
      const response = await this.post(endpoint, payload);
      
      // 提取 node 对象，统一返回格式
      if (response && response.data && response.data.node) {
        const node = response.data.node;
        Logger.info(`知识空间节点创建成功，node_token: ${node.node_token}, obj_token: ${node.obj_token}`);
        return node;
      }
      
      Logger.info(`知识空间节点创建成功`);
      return response;
    } catch (error) {
      this.handleApiError(error, '创建知识空间节点失败');
    }
  }

  /**
   * 获取文件夹中的文件清单
   * @param folderToken 文件夹Token
   * @param orderBy 排序方式，默认按修改时间排序
   * @param direction 排序方向，默认降序
   * @returns 文件清单信息
   */
  public async getFolderFileList(
    folderToken: string, 
    orderBy: string = 'EditedTime', 
    direction: string = 'DESC'
  ): Promise<any> {
    try {
      const endpoint = '/drive/v1/files';
      const params = {
        folder_token: folderToken,
        order_by: orderBy,
        direction: direction
      };
      
      const response = await this.get(endpoint, params);
      Logger.debug(`获取文件夹(${folderToken})中的文件清单成功，文件数量: ${response.files?.length || 0}`);
      return response;
    } catch (error) {
      this.handleApiError(error, '获取文件夹中的文件清单失败');
    }
  }

  /**
   * 创建文件夹
   * @param folderToken 父文件夹Token
   * @param name 文件夹名称
   * @returns 创建的文件夹信息
   */
  public async createFolder(folderToken: string, name: string): Promise<any> {
    try {
      const endpoint = '/drive/v1/files/create_folder';
      const payload = {
        folder_token: folderToken,
        name: name
      };
      
      const response = await this.post(endpoint, payload);
      Logger.debug(`文件夹创建成功, token: ${response.token}, url: ${response.url}`);
      return response;
    } catch (error) {
      this.handleApiError(error, '创建文件夹失败');
    }
  }

  /**
   * 搜索飞书文档（支持分页和轮询）
   * @param searchKey 搜索关键字
   * @param maxSize 最大返回数量，如果未指定则只返回一页
   * @param offset 偏移量，用于分页，默认0
   * @returns 搜索结果，包含数据和分页信息
   */
  public async searchDocuments(searchKey: string, maxSize?: number, offset: number = 0): Promise<any> {
    try {
      Logger.info(`开始搜索文档，关键字: ${searchKey}, maxSize: ${maxSize || '未指定'}, offset: ${offset}`);

      const endpoint = `/suite/docs-api/search/object`;
      const PAGE_SIZE = 50; // 文档API固定使用50
      const allResults: any[] = [];
      let currentOffset = offset;
      let hasMore = true;

      // 如果指定了maxSize，轮询获取直到满足maxSize或没有更多数据
      while (hasMore && (maxSize === undefined || allResults.length < maxSize)) {
        const payload = {
          search_key: searchKey,
          docs_types: ["doc"],
          count: PAGE_SIZE,
          offset: currentOffset
        };

        Logger.debug(`请求搜索文档，offset: ${currentOffset}, count: ${PAGE_SIZE}`);
        const response = await this.post(endpoint, payload);
        
        Logger.debug('搜索响应:', JSON.stringify(response, null, 2));

        if (response && response.docs_entities) {
          const resultCount = response.docs_entities.length;
          const apiHasMore = response.has_more || false;

          // 更新offset
          currentOffset += resultCount;

          if (resultCount > 0) {
            allResults.push(...response.docs_entities);
            hasMore = apiHasMore; // 保持API返回的hasMore
            // 如果指定了maxSize，只取需要的数量
            if (maxSize == undefined || allResults.length >= maxSize) {
              // 如果已经达到maxSize，停止轮询，但保持API返回的hasMore值
              Logger.debug(`已达到maxSize ${maxSize}，停止获取，但API还有更多: ${hasMore}`);
              break; // 停止轮询
            }
          } else {
            hasMore = false;
          }
          Logger.debug(`文档搜索进度: 已获取 ${allResults.length} 条，hasMore: ${hasMore}`);
        } else {
          Logger.warn('搜索响应格式异常:', JSON.stringify(response, null, 2));
          hasMore = false;
        }
      }

      const resultCount = allResults.length;
      Logger.info(`文档搜索完成，找到 ${resultCount} 个结果${maxSize ? `(maxSize: ${maxSize})` : ''}`);
      
      return {
        items: allResults,
        hasMore: hasMore,
        nextOffset: currentOffset
      };
    } catch (error) {
      this.handleApiError(error, '搜索文档失败');
      throw error;
    }
  }

  /**
   * 搜索Wiki知识库节点（支持分页和轮询）
   * @param query 搜索关键字
   * @param maxSize 最大返回数量，如果未指定则只返回一页
   * @param pageToken 分页token，用于获取下一页，可选
   * @returns 搜索结果，包含数据和分页信息
   */
  public async searchWikiNodes(query: string, maxSize?: number, pageToken?: string): Promise<any> {
    try {
      Logger.info(`开始搜索知识库，关键字: ${query}, maxSize: ${maxSize || '未指定'}, pageToken: ${pageToken || '无'}`);

      const endpoint = `/wiki/v1/nodes/search`;
      const PAGE_SIZE = 20; // Wiki API每页固定使用20
      const allResults: any[] = [];
      let currentPageToken = pageToken;
      let hasMore = true;

      // 如果指定了maxSize，轮询获取直到满足maxSize或没有更多数据
      while (hasMore && (maxSize === undefined || allResults.length < maxSize)) {
        const size = Math.min(PAGE_SIZE, 100); // Wiki API最大支持100
        let url = `${endpoint}?page_size=${size}`;
        if (currentPageToken) {
          url += `&page_token=${currentPageToken}`;
        }

        const payload = {
          query: query
        };

        Logger.debug(`请求搜索知识库，pageSize: ${size}, pageToken: ${currentPageToken || '无'}`);
        const response = await this.post(url, payload);
        
        Logger.debug('知识库搜索响应:', JSON.stringify(response, null, 2));

        // baseService的post方法已经提取了response.data.data，所以response直接就是data字段的内容
        if (response && response.items) {
          const resultCount = response.items?.length || 0;
          const apiHasMore = response.has_more || false;
          currentPageToken = response.page_token || null;

          if (resultCount > 0) {
            allResults.push(...response.items);
            hasMore = apiHasMore; // 保持API返回的hasMore，以便下次调用可以继续
            if (maxSize !== undefined) {
              // 如果已经达到maxSize，停止轮询，但保持API返回的hasMore值
              if (allResults.length >= maxSize) {
                Logger.debug(`已达到maxSize ${maxSize}，停止获取，但API还有更多: ${hasMore}`);
                break; // 停止轮询
              }
            } else {
              break; // 只返回一页
            }
          } else {
            hasMore = false;
          }
          
          Logger.debug(`知识库搜索进度: 已获取 ${allResults.length} 条，hasMore: ${hasMore}`);
        } else {
          Logger.warn('知识库搜索响应格式异常:', JSON.stringify(response, null, 2));
          hasMore = false;
        }
      }

      const resultCount = allResults.length;
      Logger.info(`知识库搜索完成，找到 ${resultCount} 个结果${maxSize ? `(maxSize: ${maxSize})` : ''}`);
      
      return {
        items: allResults,
        hasMore: hasMore,
        pageToken: currentPageToken,
        count: resultCount
      };
    } catch (error) {
      this.handleApiError(error, '搜索知识库失败');
      throw error;
    }
  }

  /**
   * 统一搜索方法，支持文档和知识库搜索
   * @param searchKey 搜索关键字
   * @param searchType 搜索类型：'document' | 'wiki' | 'both'，默认'both'
   * @param offset 文档搜索的偏移量，可选（用于分页）
   * @param pageToken 知识库搜索的分页token，可选（用于分页）
   * @returns 搜索结果，包含documents、wikis和分页信息
   */
  public async search(
    searchKey: string,
    searchType: 'document' | 'wiki' | 'both' = 'both',
    offset?: number,
    pageToken?: string
  ): Promise<any> {
    try {
      // wiki搜索不支持tenant认证，如果是tenant模式则强制使用document搜索
      if (this.config.feishu.authType === 'tenant' && (searchType === 'wiki' || searchType === 'both')) {
        Logger.info(`租户认证模式下wiki搜索不支持，强制将searchType从 ${searchType} 修改为 document`);
        searchType = 'document';
      }

      const MAX_TOTAL_RESULTS = 100; // 总共最多200条（文档+wiki合计）
      const docOffset = offset ?? 0;

      Logger.info(`开始统一搜索，关键字: ${searchKey}, 类型: ${searchType}, offset: ${docOffset}, pageToken: ${pageToken || '无'}`);

      const documents: any[] = [];
      const wikis: any[] = [];
      
      // 用于生成分页指导的内部变量
      let documentOffset = docOffset;
      let wikiPageToken: string | null = null;
      let documentHasMore = false;
      let wikiHasMore = false;

      // 搜索文档
      if (searchType === 'document' || searchType === 'both') {
        // 计算文档的最大数量（不超过总限制）
        const maxDocCount = MAX_TOTAL_RESULTS;
        const docResult = await this.searchDocuments(searchKey, maxDocCount, docOffset);
        
        if (docResult.items && docResult.items.length > 0) {
          documents.push(...docResult.items);
          documentOffset = docResult.nextOffset;
          documentHasMore = docResult.hasMore;
          
          Logger.debug(`文档搜索: 获取 ${docResult.items.length} 条，新offset: ${documentOffset}, hasMore: ${documentHasMore}`);
        } else {
          documentHasMore = false;
          Logger.debug('文档搜索: 无结果');
        }
      }

      // 搜索知识库（仅在文档+wiki总数未达到100条时继续）
      if (searchType === 'wiki' || searchType === 'both') {
        const currentDocCount = documents.length;
        const remainingCount = MAX_TOTAL_RESULTS - currentDocCount;
        
        // 如果还有剩余空间，获取知识库
        if (remainingCount > 0) {
          const wikiResult = await this.searchWikiNodes(searchKey, remainingCount, pageToken);
          
          if (wikiResult.items && wikiResult.items.length > 0) {
            wikis.push(...wikiResult.items);
            wikiPageToken = wikiResult.pageToken;
            wikiHasMore = wikiResult.hasMore;
            
            Logger.debug(`知识库搜索: 获取 ${wikiResult.items.length} 条，pageToken: ${wikiPageToken || '无'}, hasMore: ${wikiHasMore}`);
          } else {
            wikiHasMore = false;
            Logger.debug('知识库搜索: 无结果');
          }
        } else {
          Logger.info(`已达到总限制 ${MAX_TOTAL_RESULTS} 条，不再获取知识库`);
          wikiHasMore = true;
        }
      }

      // 生成分页指导信息
      const paginationGuide = this.generatePaginationGuide(
        searchType,
        documentHasMore,
        wikiHasMore,
        documentOffset,
        wikiPageToken
      );
      
      const total = documents.length + wikis.length;
      const hasMore = documentHasMore || wikiHasMore;
      Logger.info(`统一搜索完成，文档: ${documents.length} 条, 知识库: ${wikis.length} 条, 总计: ${total} 条, hasMore: ${hasMore}`);
      
      // 只返回必要字段，根据搜索类型动态添加
      const result: any = {
        paginationGuide
      };
      if (searchType === 'document' || searchType === 'both') {
        result.documents = documents;
      }
      if (searchType === 'wiki' || searchType === 'both') {
        result.wikis = wikis;
      }
      return result;
    } catch (error) {
      this.handleApiError(error, '统一搜索失败');
      throw error;
    }
  }

  /**
   * 生成分页指导信息
   * @param searchType 搜索类型
   * @param documentHasMore 文档是否还有更多
   * @param wikiHasMore 知识库是否还有更多
   * @param documentOffset 文档的下一offset
   * @param wikiPageToken 知识库的下一页token
   * @returns 分页指导信息
   */
  private generatePaginationGuide(
    searchType: 'document' | 'wiki' | 'both',
    documentHasMore: boolean,
    wikiHasMore: boolean,
    documentOffset: number,
    wikiPageToken: string | null
  ): any {
    const guide: any = {
      hasMore: documentHasMore || wikiHasMore,
      description: ''
    };

    if (!guide.hasMore) {
      guide.description = '没有更多结果了';
      return guide;
    }

    // 根据搜索类型和hasMore状态生成指导
    if (searchType === 'document') {
      if (documentHasMore) {
        guide.nextPageParams = {
          searchType: 'document',
          offset: documentOffset
        };
        guide.description = `请使用 search_feishu_documents工具获取下一页,searchType = document offset=${documentOffset} 获取文档的下一页`;
      }
    } else if (searchType === 'wiki') {
      if (wikiHasMore && wikiPageToken) {
        guide.nextPageParams = {
          searchType: 'wiki',
          pageToken: wikiPageToken
        };
        guide.description = `请使用 search_feishu_documents工具获取下一页,searchType = wiki pageToken="${wikiPageToken}" 获取知识库的下一页`;
      }
    } else if (searchType === 'both') {
      // both类型：优先返回文档的下一页，如果文档没有更多了，再返回知识库的下一页
      if (documentHasMore) {
        guide.nextPageParams = {
          searchType: 'both',
          offset: documentOffset
        };
        guide.description = `请使用 search_feishu_documents工具获取下一页,searchType = both offset=${documentOffset} 获取文档的下一页`;
      } else if (wikiHasMore && wikiPageToken) {
        guide.nextPageParams = {
          searchType: 'wiki',
          pageToken: wikiPageToken
        };
        guide.description = `请使用 search_feishu_documents工具获取下一页,searchType = wiki pageToken="${wikiPageToken}" 获取知识库的下一页wiki结果`;
      }
    }

    return guide;
  }

  /**
   * 上传图片素材到飞书
   * @param imageBase64 图片的Base64编码
   * @param fileName 图片文件名，如果不提供则自动生成
   * @param parentBlockId 图片块ID
   * @returns 上传结果，包含file_token
   */
  public async uploadImageMedia(
    imageBase64: string,
    fileName: string,
    parentBlockId: string,
  ): Promise<any> {
    try {
      const endpoint = '/drive/v1/medias/upload_all';

      // 将Base64转换为Buffer
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      const imageSize = imageBuffer.length;

      // 如果没有提供文件名，根据Base64数据生成默认文件名
      if (!fileName) {
        // 简单检测图片格式
        if (imageBase64.startsWith('/9j/')) {
          fileName = `image_${Date.now()}.jpg`;
        } else if (imageBase64.startsWith('iVBORw0KGgo')) {
          fileName = `image_${Date.now()}.png`;
        } else if (imageBase64.startsWith('R0lGODlh')) {
          fileName = `image_${Date.now()}.gif`;
        } else {
          fileName = `image_${Date.now()}.png`; // 默认PNG格式
        }
      }

      Logger.info(
        `开始上传图片素材，文件名: ${fileName}，大小: ${imageSize} 字节，关联块ID: ${parentBlockId}`,
      );

      // 验证图片大小（可选的业务检查）
      if (imageSize > 20 * 1024 * 1024) {
        // 20MB限制
        Logger.warn(`图片文件过大: ${imageSize} 字节，建议小于20MB`);
      }

      // 使用FormData构建multipart/form-data请求
      const formData = new FormData();

      // file字段传递图片的二进制数据流
      // Buffer是Node.js中的二进制数据类型，form-data库会将其作为文件流处理
      formData.append('file', imageBuffer, {
        filename: fileName,
        contentType: this.getMimeTypeFromFileName(fileName),
        knownLength: imageSize, // 明确指定文件大小，避免流读取问题
      });

      // 飞书API要求的其他表单字段
      formData.append('file_name', fileName);
      formData.append('parent_type', 'docx_image'); // 固定值：文档图片类型
      formData.append('parent_node', parentBlockId); // 关联的图片块ID
      formData.append('size', imageSize.toString()); // 文件大小（字节，字符串格式）

      // 使用通用的post方法发送请求
      const response = await this.post(endpoint, formData);

      Logger.info(
        `图片素材上传成功，file_token: ${response.file_token}`,
      );
      return response;
    } catch (error) {
      this.handleApiError(error, '上传图片素材失败');
    }
  }

  /**
   * 设置图片块的素材内容
   * @param documentId 文档ID
   * @param imageBlockId 图片块ID
   * @param fileToken 图片素材的file_token
   * @returns 设置结果
   */
  public async setImageBlockContent(
    documentId: string,
    imageBlockId: string,
    fileToken: string,
  ): Promise<any> {
    try {
      const normalizedDocId = ParamUtils.processDocumentId(documentId);
      const endpoint = `/docx/v1/documents/${normalizedDocId}/blocks/${imageBlockId}`;

      const payload = {
        replace_image: {
          token: fileToken,
        },
      };

      Logger.info(
        `开始设置图片块内容，文档ID: ${normalizedDocId}，块ID: ${imageBlockId}，file_token: ${fileToken}`,
      );
      const response = await this.patch(endpoint, payload);

      Logger.info('图片块内容设置成功');
      return response;
    } catch (error) {
      this.handleApiError(error, '设置图片块内容失败');
    }
  }

  /**
   * 创建完整的图片块（包括创建空块、上传图片、设置内容的完整流程）
   * @param documentId 文档ID
   * @param parentBlockId 父块ID
   * @param imagePathOrUrl 图片路径或URL
   * @param options 图片选项
   * @returns 创建结果
   */
  public async createImageBlock(
    documentId: string,
    parentBlockId: string,
    imagePathOrUrl: string,
    options: {
      fileName?: string;
      width?: number;
      height?: number;
      index?: number;
    } = {},
  ): Promise<any> {
    try {
      const { fileName: providedFileName, width, height, index = 0 } = options;

      Logger.info(
        `开始创建图片块，文档ID: ${documentId}，父块ID: ${parentBlockId}，图片源: ${imagePathOrUrl}，插入位置: ${index}`,
      );

      // 从路径或URL获取图片的Base64编码
      const { base64: imageBase64, fileName: detectedFileName } = await this.getImageBase64FromPathOrUrl(imagePathOrUrl);
      
      // 使用提供的文件名或检测到的文件名
      const finalFileName = providedFileName || detectedFileName;

      // 第1步：创建空图片块
      Logger.info('第1步：创建空图片块');
      const imageBlockContent = this.blockFactory.createImageBlock({
        width,
        height,
      });
      const createBlockResult = await this.createDocumentBlock(
        documentId,
        parentBlockId,
        imageBlockContent,
        index,
      );

      if (!createBlockResult?.children?.[0]?.block_id) {
        throw new Error('创建空图片块失败：无法获取块ID');
      }

      const imageBlockId = createBlockResult.children[0].block_id;
      Logger.info(`空图片块创建成功，块ID: ${imageBlockId}`);

      // 第2步：上传图片素材
      Logger.info('第2步：上传图片素材');
      const uploadResult = await this.uploadImageMedia(
        imageBase64,
        finalFileName,
        imageBlockId,
      );

      if (!uploadResult?.file_token) {
        throw new Error('上传图片素材失败：无法获取file_token');
      }

      Logger.info(`图片素材上传成功，file_token: ${uploadResult.file_token}`);

      // 第3步：设置图片块内容
      Logger.info('第3步：设置图片块内容');
      const setContentResult = await this.setImageBlockContent(
        documentId,
        imageBlockId,
        uploadResult.file_token,
      );

      Logger.info('图片块创建完成');

      // 返回综合结果
      return {
        imageBlock: createBlockResult.children[0],
        imageBlockId: imageBlockId,
        fileToken: uploadResult.file_token,
        uploadResult: uploadResult,
        setContentResult: setContentResult,
        documentRevisionId:
          setContentResult.document_revision_id ||
          createBlockResult.document_revision_id,
      };
    } catch (error) {
      this.handleApiError(error, '创建图片块失败');
    }
  }

  /**
   * 根据文件名获取MIME类型
   * @param fileName 文件名
   * @returns MIME类型
   */
  private getMimeTypeFromFileName(fileName: string): string {
    const extension = fileName.toLowerCase().split('.').pop();
    switch (extension) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'bmp':
        return 'image/bmp';
      case 'svg':
        return 'image/svg+xml';
      default:
        return 'image/png'; // 默认PNG
    }
  }

  /**
   * 获取画板内容
   * @param whiteboardId 画板ID或URL
   * @returns 画板节点数据
   */
  public async getWhiteboardContent(whiteboardId: string): Promise<any> {
    try {
      const normalizedWhiteboardId = ParamUtils.processWhiteboardId(whiteboardId);
      const endpoint = `/board/v1/whiteboards/${normalizedWhiteboardId}/nodes`;
      
      Logger.info(`开始获取画板内容，画板ID: ${normalizedWhiteboardId}`);
      const response = await this.get(endpoint);
      
      Logger.info(`画板内容获取成功，节点数量: ${response.nodes?.length || 0}`);
      return response;
    } catch (error) {
      this.handleApiError(error, '获取画板内容失败');
    }
  }

  /**
   * 获取画板缩略图
   * @param whiteboardId 画板ID或URL
   * @returns 画板缩略图的二进制数据
   */
  public async getWhiteboardThumbnail(whiteboardId: string): Promise<Buffer> {
    try {
      const normalizedWhiteboardId = ParamUtils.processWhiteboardId(whiteboardId);
      const endpoint = `/board/v1/whiteboards/${normalizedWhiteboardId}/download_as_image`;
      
      Logger.info(`开始获取画板缩略图，画板ID: ${normalizedWhiteboardId}`);
      
      // 使用通用的request方法获取二进制响应
      const response = await this.request<ArrayBuffer>(endpoint, 'GET', {}, true, {}, 'arraybuffer');
      
      const thumbnailBuffer = Buffer.from(response);
      Logger.info(`画板缩略图获取成功，大小: ${thumbnailBuffer.length} 字节`);
      
      return thumbnailBuffer;
    } catch (error) {
      this.handleApiError(error, '获取画板缩略图失败');
      return Buffer.from([]); // 永远不会执行到这里
    }
  }

  /**
   * 在画板中创建图表节点（支持 PlantUML 和 Mermaid）
   * @param whiteboardId 画板ID（token）
   * @param code 图表代码（PlantUML 或 Mermaid）
   * @param syntaxType 语法类型：1=PlantUML, 2=Mermaid
   * @returns 创建结果
   */
  public async createDiagramNode(whiteboardId: string, code: string, syntaxType: number): Promise<any> {
    try {
      const normalizedWhiteboardId = ParamUtils.processWhiteboardId(whiteboardId);
      const endpoint = `/board/v1/whiteboards/${normalizedWhiteboardId}/nodes/plantuml`;
      
      const syntaxTypeName = syntaxType === 1 ? 'PlantUML' : 'Mermaid';
      Logger.info(`开始在画板中创建 ${syntaxTypeName} 节点，画板ID: ${normalizedWhiteboardId}`);
      Logger.debug(`${syntaxTypeName} 代码: ${code.substring(0, 200)}...`);
      
      const payload = {
        plant_uml_code: code,
        style_type:1, // 画板样式（默认为2 经典样式） 示例值：1 可选值有： 1：画板样式（解析之后为多个画板节点，粘贴到画板中，不可对语法进行二次编辑） 2：经典样式（解析之后为一张图片，粘贴到画板中，可对语法进行二次编辑）（只有PlantUml语法支持经典样式
        syntax_type: syntaxType
      };
      
      Logger.debug(`请求载荷: ${JSON.stringify(payload, null, 2)}`);
      const response = await this.post(endpoint, payload);
      
      Logger.info(`${syntaxTypeName} 节点创建成功`);
      return response;
    } catch (error) {
      const syntaxTypeName = syntaxType === 1 ? 'PlantUML' : 'Mermaid';
      Logger.error(`创建 ${syntaxTypeName} 节点失败，画板ID: ${whiteboardId}`, error);
      this.handleApiError(error, `创建 ${syntaxTypeName} 节点失败`);
    }
  }

  // ============ 飞书任务相关方法 ============

  /**
   * 获取当前用户的 open_id
   * 通过飞书 authen API 获取当前认证用户信息
   * @returns 当前用户的 open_id，获取失败返回 null
   */
  public async getCurrentUserOpenId(): Promise<string | null> {
    try {
      const endpoint = '/authen/v1/user_info';
      const response = await this.get(endpoint);
      const openId = response?.open_id || null;
      Logger.debug(`获取当前用户 open_id: ${openId}`);
      return openId;
    } catch (error) {
      Logger.warn('获取当前用户信息失败，无法自动分配任务给创建者:', error);
      return null;
    }
  }

  /**
   * 创建飞书任务
   * @param summary 任务标题
   * @param description 任务描述（可选）
   * @param due 截止时间（可选）
   * @param start 开始时间（可选）
   * @param members 任务成员（可选），不传则自动分配给创建者
   * @param origin 任务来源（可选）
   * @param extra 额外信息（可选）
   * @param repeatRule 重复规则（可选）
   * @param customComplete 自定义完成配置（可选）
   * @param mode 任务模式（可选）
   * @returns 创建的任务信息
   */
  public async createTask(
    summary: string,
    description?: string,
    due?: { timestamp: string; is_all_day?: boolean },
    start?: { timestamp: string; is_all_day?: boolean },
    members?: Array<{ id: string; type?: string; role?: string }>,
    origin?: { platform_i18n_name: string },
    extra?: string,
    repeatRule?: string,
    customComplete?: any,
    mode?: number
  ): Promise<any> {
    try {
      const endpoint = '/task/v2/tasks';

      const payload: any = {
        summary,
      };

      if (description) {
        payload.description = description;
      }

      if (due) {
        payload.due = due;
      }

      if (start) {
        payload.start = start;
      }

      if (members && members.length > 0) {
        // 指定了成员，使用指定的成员
        payload.members = members.map(m => ({
          id: m.id,
          type: m.type || 'user',
          role: m.role || 'assignee',
        }));
      } else {
        // 未指定成员，自动分配给创建者
        const creatorOpenId = await this.getCurrentUserOpenId();
        if (creatorOpenId) {
          payload.members = [{
            id: creatorOpenId,
            type: 'user',
            role: 'assignee',
          }];
          Logger.info(`未指定任务成员，自动分配给创建者: ${creatorOpenId}`);
        } else {
          Logger.warn('未指定任务成员，且无法获取创建者信息，任务将不分配成员');
        }
      }

      if (origin) {
        payload.origin = {
          platform_i18n_name: origin.platform_i18n_name,
        };
      }

      if (extra) {
        payload.extra = extra;
      }

      if (repeatRule) {
        payload.repeat_rule = repeatRule;
      }

      if (customComplete) {
        payload.custom_complete = customComplete;
      }

      if (mode !== undefined) {
        payload.mode = mode;
      }

      Logger.debug(`创建飞书任务请求载荷: ${JSON.stringify(payload, null, 2)}`);
      const response = await this.post(endpoint, payload);
      return response;
    } catch (error) {
      this.handleApiError(error, '创建飞书任务失败');
    }
  }

  // ============ 飞书日历相关方法 ============

  /**
   * 获取用户主日历ID
   * @returns 主日历ID
   */
  public async getPrimaryCalendarId(): Promise<string | null> {
    try {
      Logger.info('正在通过日历列表获取主日历ID...');
      const endpoint = '/calendar/v4/calendars';
      const response = await this.get(endpoint);
      Logger.info(`日历列表API响应: ${JSON.stringify(response)}`);

      const calendars = response?.calendar_list;
      if (!calendars || !Array.isArray(calendars) || calendars.length === 0) {
        Logger.warn(`未找到任何日历，响应结构: ${JSON.stringify(response)}`);
        return null;
      }

      Logger.info(`日历列表共 ${calendars.length} 个日历`);
      for (const cal of calendars) {
        Logger.info(`日历: id=${cal.calendar_id}, type=${cal.type}, role=${cal.role}, summary=${cal.summary}`);
      }

      // 优先查找 type 为 "primary" 且 role 为 "owner" 的日历
      const primaryCalendar = calendars.find((c: any) => c.type === 'primary' && c.role === 'owner');
      if (primaryCalendar?.calendar_id) {
        Logger.info(`找到主日历(owner): ${primaryCalendar.calendar_id}`);
        return primaryCalendar.calendar_id;
      }

      // 其次查找 type 为 "primary" 的日历（不限 role）
      const primaryAny = calendars.find((c: any) => c.type === 'primary');
      if (primaryAny?.calendar_id) {
        Logger.info(`找到主日历: ${primaryAny.calendar_id}, role=${primaryAny.role}`);
        return primaryAny.calendar_id;
      }

      // 再次查找 role 为 "owner" 的任何日历
      const ownedCalendar = calendars.find((c: any) => c.role === 'owner');
      if (ownedCalendar?.calendar_id) {
        Logger.info(`未找到主日历类型，使用拥有者日历: ${ownedCalendar.calendar_id}`);
        return ownedCalendar.calendar_id;
      }

      // 最后使用第一个可写日历
      const writableCalendar = calendars.find((c: any) => c.role === 'owner' || c.role === 'writer');
      if (writableCalendar?.calendar_id) {
        Logger.info(`使用可写日历: ${writableCalendar.calendar_id}`);
        return writableCalendar.calendar_id;
      }

      // 兜底：使用第一个日历
      const firstCalendar = calendars[0];
      if (firstCalendar?.calendar_id) {
        Logger.info(`未找到可写日历，使用第一个日历: ${firstCalendar.calendar_id}`);
        return firstCalendar.calendar_id;
      }

      Logger.warn(`日历列表中未找到有效的日历ID`);
      return null;
    } catch (error) {
      // 权限不足错误需要向上传播，不能默默吞掉
      if (error instanceof ScopeInsufficientError) {
        throw error;
      }
      Logger.error('获取主日历ID失败:', error);
      throw error;
    }
  }

  /**
   * 获取日历列表
   * @returns 日历列表
   */
  public async getCalendarList(): Promise<any> {
    try {
      const endpoint = '/calendar/v4/calendars';
      const response = await this.get(endpoint);
      return response;
    } catch (error) {
      this.handleApiError(error, '获取日历列表失败');
    }
  }

  /**
   * 创建日历事件
   * @param calendarId 日历ID（可选，不传则使用主日历）
   * @param summary 事件标题
   * @param startTime 开始时间
   * @param endTime 结束时间
   * @param description 事件描述（可选）
   * @param attendees 参与者（可选）
   * @param reminders 提醒配置（可选）
   * @param visibility 可见性（可选）
   * @param freeBusyStatus 忙闲状态（可选）
   * @param location 地点（可选）
   * @param recurrence 重复规则（可选）
   * @param color 颜色（可选）
   * @returns 创建的事件信息
   */
  public async createCalendarEvent(
    calendarId: string | undefined,
    summary: string,
    startTime: { timestamp?: string; date?: string; timezone?: string },
    endTime: { timestamp?: string; date?: string; timezone?: string },
    description?: string,
    attendees?: Array<{
      type?: string;
      user_id?: string;
      chat_id?: string;
      room_id?: string;
      third_party_email?: string;
      is_optional?: boolean;
    }>,
    reminders?: Array<{ minutes: number }>,
    visibility?: string,
    freeBusyStatus?: string,
    location?: { name?: string; address?: string; latitude?: number; longitude?: number },
    recurrence?: string,
    color?: number
  ): Promise<any> {
    try {
      // 如果未提供 calendarId，获取主日历ID
      let targetCalendarId = calendarId;
      if (!targetCalendarId) {
        targetCalendarId = await this.getPrimaryCalendarId() || undefined;
        if (!targetCalendarId) {
          throw new Error('未提供日历ID，且无法获取主日历ID。请指定 calendarId 参数。');
        }
        Logger.info(`未指定日历ID，使用主日历: ${targetCalendarId}`);
      }

      const endpoint = `/calendar/v4/calendars/${targetCalendarId}/events?user_id_type=open_id`;

      const payload: any = {
        summary,
        start_time: startTime,
        end_time: endTime,
      };

      if (description) {
        payload.description = description;
      }

      if (visibility && visibility !== 'default') {
        payload.visibility = visibility;
      }

      if (freeBusyStatus) {
        payload.free_busy_status = freeBusyStatus;
      }

      if (location) {
        payload.location = location;
      }

      if (recurrence) {
        payload.recurrence = recurrence;
      }

      if (color !== undefined) {
        payload.color = color;
      }

      if (reminders && reminders.length > 0) {
        payload.reminders = reminders;
      }

      Logger.debug(`创建日历事件请求载荷: ${JSON.stringify(payload, null, 2)}`);
      const response = await this.post(endpoint, payload);

      // 如果有参与者，需要单独添加
      if (attendees && attendees.length > 0 && response?.event?.event_id) {
        try {
          const eventId = response.event.event_id;
          await this.addCalendarEventAttendees(targetCalendarId, eventId, attendees);
          Logger.info(`日历事件参与者添加成功`);
        } catch (attendeeError) {
          Logger.warn('添加日历事件参与者失败（事件已创建）:', attendeeError);
          response._attendee_warning = '事件已创建成功，但添加参与者失败，请手动添加。';
        }
      }

      return response;
    } catch (error) {
      this.handleApiError(error, '创建日历事件失败');
    }
  }

  /**
   * 添加日历事件参与者
   * @param calendarId 日历ID
   * @param eventId 事件ID
   * @param attendees 参与者列表
   * @returns 添加结果
   */
  private async addCalendarEventAttendees(
    calendarId: string,
    eventId: string,
    attendees: Array<{
      type?: string;
      user_id?: string;
      chat_id?: string;
      room_id?: string;
      third_party_email?: string;
      is_optional?: boolean;
    }>
  ): Promise<any> {
    try {
      const endpoint = `/calendar/v4/calendars/${calendarId}/events/${eventId}/attendees`;

      const payload = {
        attendees: attendees.map(a => ({
          type: a.type || 'user',
          user_id: a.user_id,
          chat_id: a.chat_id,
          room_id: a.room_id,
          third_party_email: a.third_party_email,
          is_optional: a.is_optional || false,
        })),
      };

      const response = await this.post(endpoint, payload);
      return response;
    } catch (error) {
      this.handleApiError(error, '添加日历事件参与者失败');
    }
  }

  /**
   * 从路径或URL获取图片的Base64编码
   * @param imagePathOrUrl 图片路径或URL
   * @returns 图片的Base64编码和文件名
   */
  private async getImageBase64FromPathOrUrl(imagePathOrUrl: string): Promise<{ base64: string; fileName: string }> {
    try {
      let imageBuffer: Buffer;
      let fileName: string;

      // 判断是否为HTTP/HTTPS URL
      if (imagePathOrUrl.startsWith('http://') || imagePathOrUrl.startsWith('https://')) {
        Logger.info(`从URL获取图片: ${imagePathOrUrl}`);
        
        // 从URL下载图片
        const response = await axios.get(imagePathOrUrl, {
          responseType: 'arraybuffer',
          timeout: 30000, // 30秒超时
        });
        
        imageBuffer = Buffer.from(response.data);
        
        // 从URL中提取文件名
        const urlPath = new URL(imagePathOrUrl).pathname;
        fileName = path.basename(urlPath) || `image_${Date.now()}.png`;
        
        Logger.info(`从URL成功获取图片，大小: ${imageBuffer.length} 字节，文件名: ${fileName}`);
      } else {
        // 本地文件路径
        Logger.info(`从本地路径读取图片: ${imagePathOrUrl}`);
        
        // 检查文件是否存在
        if (!fs.existsSync(imagePathOrUrl)) {
          throw new Error(`图片文件不存在: ${imagePathOrUrl}`);
        }
        
        // 读取文件
        imageBuffer = fs.readFileSync(imagePathOrUrl);
        fileName = path.basename(imagePathOrUrl);
        
        Logger.info(`从本地路径成功读取图片，大小: ${imageBuffer.length} 字节，文件名: ${fileName}`);
      }

      // 转换为Base64
      const base64 = imageBuffer.toString('base64');
      
      return { base64, fileName };
    } catch (error) {
      Logger.error(`获取图片失败: ${error}`);
      throw new Error(`获取图片失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}