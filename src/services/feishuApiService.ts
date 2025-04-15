import { BaseApiService } from './baseService.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../utils/config.js';
import { CacheManager } from '../utils/cache.js';
import { ParamUtils } from '../utils/paramUtils.js';
import { BlockFactory, BlockType } from './blockFactory.js';
import axios from 'axios';

/**
 * 飞书API服务类
 * 提供飞书API的所有基础操作，包括认证、请求和缓存管理
 */
export class FeishuApiService extends BaseApiService {
  private static instance: FeishuApiService;
  private readonly cacheManager: CacheManager;
  private readonly blockFactory: BlockFactory;
  private readonly config: Config;

  /**
   * 私有构造函数，用于单例模式
   */
  private constructor() {
    super();
    this.cacheManager = CacheManager.getInstance();
    this.blockFactory = BlockFactory.getInstance();
    this.config = Config.getInstance();
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
   * @returns 访问令牌
   * @throws 如果获取令牌失败则抛出错误
   */
  protected async getAccessToken(): Promise<string> {
    // 尝试从缓存获取
    const cachedToken = this.cacheManager.getToken();
    if (cachedToken) {
      Logger.debug('使用缓存的访问令牌');
      return cachedToken;
    }

    try {
      const requestData = {
        app_id: this.config.feishu.appId,
        app_secret: this.config.feishu.appSecret,
      };

      Logger.info('开始获取新的飞书访问令牌...');
      Logger.debug('认证请求参数:', requestData);

      // 不使用通用的request方法，因为这个请求不需要认证
      // 为了确保正确处理响应，我们直接使用axios
      const url = `${this.getBaseUrl()}${this.getAuthEndpoint()}`;
      const headers = { 'Content-Type': 'application/json' };
      
      Logger.debug(`发送认证请求到: ${url}`);
      const response = await axios.post(url, requestData, { headers });
      
      Logger.debug('认证响应:', response.data);
      
      if (!response.data || typeof response.data !== 'object') {
        throw new Error('获取飞书访问令牌失败：响应格式无效');
      }
      
      // 检查错误码
      if (response.data.code !== 0) {
        throw new Error(`获取飞书访问令牌失败：${response.data.msg || '未知错误'} (错误码: ${response.data.code})`);
      }

      if (!response.data.tenant_access_token) {
        throw new Error('获取飞书访问令牌失败：响应中没有token');
      }

      this.accessToken = response.data.tenant_access_token;
      this.tokenExpireTime = Date.now() + Math.min(
        response.data.expire * 1000,
        this.config.feishu.tokenLifetime
      );

      // 缓存令牌
      this.cacheManager.cacheToken(this.accessToken, response.data.expire);

      Logger.info(`成功获取新的飞书访问令牌，有效期: ${response.data.expire} 秒`);
      return this.accessToken;
    } catch (error) {
      Logger.error('获取访问令牌失败:', error);
      this.handleApiError(error, '获取飞书访问令牌失败');
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
   * 获取文档信息
   * @param documentId 文档ID或URL
   * @returns 文档信息
   */
  public async getDocumentInfo(documentId: string): Promise<any> {
    try {
      const normalizedDocId = ParamUtils.processDocumentId(documentId);
      const endpoint = `/docx/v1/documents/${normalizedDocId}`;
      const response = await this.get(endpoint);
      return response;
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
   * @param textElements 文本元素数组
   * @returns 更新结果
   */
  public async updateBlockTextContent(documentId: string, blockId: string, textElements: Array<{text: string, style?: any}>): Promise<any> {
    try {
      const docId = ParamUtils.processDocumentId(documentId);
      const endpoint = `/docx/v1/documents/${docId}/blocks/${blockId}?document_revision_id=-1`;
      Logger.debug(`准备请求API端点: ${endpoint}`);

      const elements = textElements.map(item => ({
        text_run: {
          content: item.text,
          text_element_style: item.style || {}
        }
      }));

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
   * @param textContents 文本内容数组
   * @param align 对齐方式，1为左对齐，2为居中，3为右对齐
   * @param index 插入位置索引
   * @returns 创建结果
   */
  public async createTextBlock(documentId: string, parentBlockId: string, textContents: Array<{text: string, style?: any}>, align: number = 1, index: number = 0): Promise<any> {
    const blockContent = this.blockFactory.createTextBlock({
      textContents,
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
   * 创建混合块
   * @param documentId 文档ID或URL
   * @param parentBlockId 父块ID
   * @param blocks 块配置数组
   * @param index 插入位置索引
   * @returns 创建结果
   */
  public async createMixedBlocks(documentId: string, parentBlockId: string, blocks: Array<{type: BlockType, options: any}>, index: number = 0): Promise<any> {
    const blockContents = this.blockFactory.createBatchBlocks(blocks);
    return this.createDocumentBlocks(documentId, parentBlockId, blockContents, index);
  }

  /**
   * 将飞书Wiki链接转换为文档ID
   * @param wikiUrl Wiki链接或Token
   * @returns 文档ID
   */
  public async convertWikiToDocumentId(wikiUrl: string): Promise<string> {
    try {
      const wikiToken = ParamUtils.processWikiToken(wikiUrl);

      // 尝试从缓存获取
      const cachedDocId = this.cacheManager.getWikiToDocId(wikiToken);
      if (cachedDocId) {
        Logger.debug(`使用缓存的Wiki转换结果: ${wikiToken} -> ${cachedDocId}`);
        return cachedDocId;
      }

      // 获取Wiki节点信息
      const endpoint = `/wiki/v2/spaces/get_node`;
      const params = { token: wikiToken, obj_type: 'wiki' };
      const response = await this.get(endpoint, params);

      if (!response.node || !response.node.obj_token) {
        throw new Error(`无法从Wiki节点获取文档ID: ${wikiToken}`);
      }

      const documentId = response.node.obj_token;

      // 缓存结果
      this.cacheManager.cacheWikiToDocId(wikiToken, documentId);

      Logger.debug(`Wiki转换为文档ID: ${wikiToken} -> ${documentId}`);
      return documentId;
    } catch (error) {
      this.handleApiError(error, 'Wiki转换为文档ID失败');
      return ''; // 永远不会执行到这里
    }
  }

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
      // 使用枚举类型来避免字符串错误
      const blockTypeEnum = blockType as BlockType;

      // 构建块配置
      let blockConfig = {
        type: blockTypeEnum,
        options: {}
      };

      switch (blockTypeEnum) {
        case BlockType.TEXT:
          if ('text' in options && options.text) {
            const textOptions = options.text;
            blockConfig.options = {
              textContents: textOptions.textStyles || [],
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
      }

      // 使用BlockFactory创建块
      return this.blockFactory.createBlock(blockConfig.type, blockConfig.options);
    } catch (error) {
      Logger.error(`创建块内容对象失败: ${error}`);
      return null;
    }
  }
} 