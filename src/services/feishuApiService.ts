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
   * @param userKey 用户标识（可选）
   * @returns 访问令牌
   * @throws 如果获取令牌失败则抛出错误
   */
  protected async getAccessToken(userKey?: string): Promise<string> {
    const tokenServiceUrl = this.config.feishu.tokenServiceUrl;
    const hasAppIdSecret = !!(this.config.feishu.appId && this.config.feishu.appSecret);
    const onlyTokenServiceMode = !!tokenServiceUrl && !hasAppIdSecret;

    if (onlyTokenServiceMode && !userKey) {
      Logger.debug(`getAccessToken 当前为自定义token服务模式，必须传递userKey参数`);
      throw new Error('当前为自定义token服务模式，必须传递userKey参数');
    }
    if (tokenServiceUrl && userKey) {
      // 可选：缓存userKey-token
      const cached = this.cacheManager.getToken(userKey);
      if (cached) {
        Logger.debug(`getAccessToken 使用缓存的userKey访问令牌: ${userKey}`);
        return cached;
      }
      try {
        Logger.info(`getAccessToken 通过自定义token服务获取token, userKey=${userKey}, url=${tokenServiceUrl}`);
        const resp = await axios.post(tokenServiceUrl, { userKey });
        if (!resp.data || !resp.data.data || !resp.data.data.token){
          Logger.debug(`getAccessToken 自定义token服务响应无token:${JSON.stringify(resp.data, null, 2)}`);
          throw new Error(`自定义token服务响应无token:${JSON.stringify(resp.data, null, 2)}`);
        }
        const token = resp.data.data.token;
        const expire = resp.data.data.expire || 3600;
        this.cacheManager.cacheToken(token, expire, userKey);
        return token;
      } catch (e) {
        Logger.error('getAccessToken 自定义token服务获取失败', e);
        if (onlyTokenServiceMode) {
          // 只有tokenServiceUrl模式下，获取失败直接报错
          Logger.debug(`getAccessToken 自定义token服务获取失败，请检查userKey是否正确，或联系管理员`);
          throw new Error('自定义token服务获取失败，请检查userKey是否正确，或联系管理员');
        }
        // 否则降级为默认appId/appSecret
      }
    }
    // 兼容原有逻辑
    const cachedToken = this.cacheManager.getToken();
    if (cachedToken) {
      Logger.debug('使用缓存的访问令牌');
      return cachedToken;
    }
    if (!hasAppIdSecret) {
      throw new Error('缺少appId或appSecret，无法获取飞书访问令牌');
    }
    try {
      const requestData = {
        app_id: this.config.feishu.appId,
        app_secret: this.config.feishu.appSecret,
      };
      Logger.info('开始获取新的飞书访问令牌...');
      Logger.debug('认证请求参数:', requestData);
      const url = `${this.getBaseUrl()}${this.getAuthEndpoint()}`;
      const headers = { 'Content-Type': 'application/json' };
      Logger.debug(`发送认证请求到: ${url}`);
      const response = await axios.post(url, requestData, { headers });
      Logger.debug('认证响应:', response.data);
      if (!response.data || typeof response.data !== 'object') {
        throw new Error('获取飞书访问令牌失败：响应格式无效');
      }
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
   * @param userKey 用户标识（可选）
   * @returns 创建的文档信息
   */
  public async createDocument(title: string, folderToken: string, userKey?: string): Promise<any> {
    try {
      const endpoint = '/docx/v1/documents';

      const payload = {
        title,
        folder_token: folderToken
      };

      const response = await this.post(endpoint, payload, undefined, userKey);
      return response;
    } catch (error) {
      this.handleApiError(error, '创建飞书文档失败');
    }
  }

  /**
   * 获取文档信息
   * @param documentId 文档ID或URL
   * @param userKey 用户标识（可选）
   * @returns 文档信息
   */
  public async getDocumentInfo(documentId: string, userKey?: string): Promise<any> {
    try {
      const normalizedDocId = ParamUtils.processDocumentId(documentId);
      const endpoint = `/docx/v1/documents/${normalizedDocId}`;
      const response = await this.get(endpoint, undefined, true, userKey);
      return response;
    } catch (error) {
      this.handleApiError(error, '获取文档信息失败');
    }
  }

  /**
   * 获取文档内容
   * @param documentId 文档ID或URL
   * @param lang 语言代码，0为中文，1为英文
   * @param userKey 用户标识（可选）
   * @returns 文档内容
   */
  public async getDocumentContent(documentId: string, lang: number = 0, userKey?: string): Promise<string> {
    try {
      const normalizedDocId = ParamUtils.processDocumentId(documentId);
      const endpoint = `/docx/v1/documents/${normalizedDocId}/raw_content`;
      const params = { lang };
      const response = await this.get(endpoint, params, true, userKey);
      return response.content;
    } catch (error) {
      this.handleApiError(error, '获取文档内容失败');
    }
  }

  /**
   * 获取文档块结构
   * @param documentId 文档ID或URL
   * @param pageSize 每页块数量
   * @param userKey 用户标识（可选）
   * @returns 文档块数组
   */
  public async getDocumentBlocks(documentId: string, pageSize: number = 500, userKey?: string): Promise<any[]> {
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

        const response = await this.get(endpoint, params, true, userKey);
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
   * @param userKey 用户标识（可选）
   * @returns 块内容
   */
  public async getBlockContent(documentId: string, blockId: string, userKey?: string): Promise<any> {
    try {
      const normalizedDocId = ParamUtils.processDocumentId(documentId);
      const safeBlockId = ParamUtils.processBlockId(blockId);

      const endpoint = `/docx/v1/documents/${normalizedDocId}/blocks/${safeBlockId}`;
      const params = { document_revision_id: -1 };
      
      const response = await this.get(endpoint, params, true, userKey);

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
   * @param userKey 用户标识（可选）
   * @returns 更新结果
   */
  public async updateBlockTextContent(documentId: string, blockId: string, textElements: Array<{text: string, style?: any}>, userKey?: string): Promise<any> {
    try {
      const docId = ParamUtils.processDocumentId(documentId);
      const endpoint = `/docx/v1/documents/${docId}/blocks/${blockId}?document_revision_id=-1`;
      Logger.debug(`准备请求API端点: ${endpoint}`);

      const elements = textElements.map(item => ({
        text_run: {
          content: item.text,
          text_element_style: BlockFactory.applyDefaultTextStyle(item.style)
        }
      }));

      const data = {
        update_text_elements: {
          elements: elements
        }
      };

      Logger.debug(`请求数据: ${JSON.stringify(data, null, 2)}`);
      const response = await this.patch(endpoint, data, true, userKey);
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
   * @param userKey 用户标识（可选）
   * @returns 创建结果
   */
  public async createDocumentBlock(documentId: string, parentBlockId: string, blockContent: any, index: number = 0, userKey?: string): Promise<any> {
    try {
      const normalizedDocId = ParamUtils.processDocumentId(documentId);
      const endpoint = `/docx/v1/documents/${normalizedDocId}/blocks/${parentBlockId}/children?document_revision_id=-1`;
      Logger.debug(`准备请求API端点: ${endpoint}`);

      const payload = {
        children: [blockContent],
        index
      };

      Logger.debug(`请求数据: ${JSON.stringify(payload, null, 2)}`);
      const response = await this.post(endpoint, payload, true, userKey);
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
   * @param userKey 用户标识（可选）
   * @returns 创建结果
   */
  public async createDocumentBlocks(documentId: string, parentBlockId: string, blockContents: any[], index: number = 0, userKey?: string): Promise<any> {
    try {
      const normalizedDocId = ParamUtils.processDocumentId(documentId);
      const endpoint = `/docx/v1/documents/${normalizedDocId}/blocks/${parentBlockId}/children?document_revision_id=-1`;
      Logger.debug(`准备请求API端点: ${endpoint}`);

      const payload = {
        children: blockContents,
        index
      };

      Logger.debug(`请求数据: ${JSON.stringify(payload, null, 2)}`);
      const response = await this.post(endpoint, payload, true, userKey);
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
   * @param userKey 用户标识（可选）
   * @returns 创建结果
   */
  public async createTextBlock(documentId: string, parentBlockId: string, textContents: Array<{text: string, style?: any}>, align: number = 1, index: number = 0, userKey?: string): Promise<any> {
    // 处理文本内容样式
    const processedTextContents = textContents.map(item => ({
      text: item.text,
      style: BlockFactory.applyDefaultTextStyle(item.style)
    }));
    
    const blockContent = this.blockFactory.createTextBlock({
      textContents: processedTextContents,
      align
    });
    return this.createDocumentBlock(documentId, parentBlockId, blockContent, index, userKey);
  }

  /**
   * 创建代码块
   * @param documentId 文档ID或URL
   * @param parentBlockId 父块ID
   * @param code 代码内容
   * @param language 语言代码
   * @param wrap 是否自动换行
   * @param index 插入位置索引
   * @param userKey 用户标识（可选）
   * @returns 创建结果
   */
  public async createCodeBlock(documentId: string, parentBlockId: string, code: string, language: number = 0, wrap: boolean = false, index: number = 0, userKey?: string): Promise<any> {
    const blockContent = this.blockFactory.createCodeBlock({
      code,
      language,
      wrap
    });
    return this.createDocumentBlock(documentId, parentBlockId, blockContent, index, userKey);
  }

  /**
   * 创建标题块
   * @param documentId 文档ID或URL
   * @param parentBlockId 父块ID
   * @param text 标题文本
   * @param level 标题级别，1-9
   * @param index 插入位置索引
   * @param align 对齐方式，1为左对齐，2为居中，3为右对齐
   * @param userKey 用户标识（可选）
   * @returns 创建结果
   */
  public async createHeadingBlock(documentId: string, parentBlockId: string, text: string, level: number = 1, index: number = 0, align: number = 1, userKey?: string): Promise<any> {
    const blockContent = this.blockFactory.createHeadingBlock({
      text,
      level,
      align
    });
    return this.createDocumentBlock(documentId, parentBlockId, blockContent, index, userKey);
  }

  /**
   * 创建列表块
   * @param documentId 文档ID或URL
   * @param parentBlockId 父块ID
   * @param text 列表项文本
   * @param isOrdered 是否是有序列表
   * @param index 插入位置索引
   * @param align 对齐方式，1为左对齐，2为居中，3为右对齐
   * @param userKey 用户标识（可选）
   * @returns 创建结果
   */
  public async createListBlock(documentId: string, parentBlockId: string, text: string, isOrdered: boolean = false, index: number = 0, align: number = 1, userKey?: string): Promise<any> {
    const blockContent = this.blockFactory.createListBlock({
      text,
      isOrdered,
      align
    });
    return this.createDocumentBlock(documentId, parentBlockId, blockContent, index, userKey);
  }

  /**
   * 创建混合块
   * @param documentId 文档ID或URL
   * @param parentBlockId 父块ID
   * @param blocks 块配置数组
   * @param index 插入位置索引
   * @param userKey 用户标识（可选）
   * @returns 创建结果
   */
  public async createMixedBlocks(documentId: string, parentBlockId: string, blocks: Array<{type: BlockType, options: any}>, index: number = 0, userKey?: string): Promise<any> {
    const blockContents = blocks.map(block => this.blockFactory.createBlock(block.type, block.options));
    return this.createDocumentBlocks(documentId, parentBlockId, blockContents, index, userKey);
  }

  /**
   * 删除文档中的块，支持批量删除
   * @param documentId 文档ID或URL
   * @param parentBlockId 父块ID（通常是文档ID）
   * @param startIndex 起始索引
   * @param endIndex 结束索引
   * @param userKey 用户标识（可选）
   * @returns 操作结果
   */
  public async deleteDocumentBlocks(documentId: string, parentBlockId: string, startIndex: number, endIndex: number, userKey?: string): Promise<any> {
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
      const response = await this.delete(endpoint, payload, true, userKey);
      
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
   * @param userKey 用户标识（可选）
   * @returns 操作结果
   */
  public async deleteDocumentBlock(documentId: string, parentBlockId: string, blockIndex: number, userKey?: string): Promise<any> {
    return this.deleteDocumentBlocks(documentId, parentBlockId, blockIndex, blockIndex + 1, userKey);
  }

  /**
   * 将飞书Wiki链接转换为文档ID
   * @param wikiUrl Wiki链接或Token
   * @param userKey 用户标识（可选）
   * @returns 文档ID
   */
  public async convertWikiToDocumentId(wikiUrl: string, userKey?: string): Promise<string> {
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
      const response = await this.get(endpoint, params, true, userKey);

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
      let blockConfig = {
        type: blockTypeEnum,
        options: {}
      };

      // 根据块类型处理不同的选项
      switch (blockTypeEnum) {
        case BlockType.TEXT:
          if ('text' in options && options.text) {
            const textOptions = options.text;
            // 处理文本样式，应用默认样式
            const textStyles = textOptions.textStyles || [];
            const processedTextStyles = textStyles.map((item: any) => ({
              text: item.text,
              style: BlockFactory.applyDefaultTextStyle(item.style)
            }));
            
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
          
        default:
          Logger.warn(`未知的块类型: ${blockType}，尝试作为标准类型处理`);
          if ('text' in options) {
            blockConfig.type = BlockType.TEXT;
            const textOptions = options.text;
            
            // 处理文本样式，应用默认样式
            const textStyles = textOptions.textStyles || [];
            const processedTextStyles = textStyles.map((item: any) => ({
              text: item.text,
              style: BlockFactory.applyDefaultTextStyle(item.style)
            }));
            
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
   * @param userKey 用户标识（可选）
   * @returns 图片二进制数据
   */
  public async getImageResource(mediaId: string, extra: string = '', userKey?: string): Promise<Buffer> {
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
      
      // 这里需要特殊处理，因为返回的是二进制数据，不是JSON
      const token = await this.getAccessToken(userKey);
      const url = `${this.getBaseUrl()}${endpoint}`;
      const headers = {
        'Authorization': `Bearer ${token}`
      };
      
      Logger.debug(`请求图片资源URL: ${url}`);
      
      // 使用axios直接获取二进制响应
      const response = await axios.get(url, {
        params,
        headers,
        responseType: 'arraybuffer'
      });
      
      // 检查响应状态
      if (response.status !== 200) {
        throw new Error(`获取图片资源失败，状态码: ${response.status}`);
      }
      
      const imageBuffer = Buffer.from(response.data);
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
   * @param userKey 用户标识（可选）
   * @returns 根文件夹信息
   */
  public async getRootFolderInfo(userKey?: string): Promise<any> {
    try {
      const endpoint = '/drive/explorer/v2/root_folder/meta';
      const response = await this.get(endpoint, undefined, true, userKey);
      Logger.debug('获取根文件夹信息成功:', response);
      return response;
    } catch (error) {
      this.handleApiError(error, '获取飞书根文件夹信息失败');
    }
  }

  /**
   * 获取文件夹中的文件清单
   * @param folderToken 文件夹Token
   * @param orderBy 排序方式，默认按修改时间排序
   * @param direction 排序方向，默认降序
   * @param userKey 用户标识（可选）
   * @returns 文件清单信息
   */
  public async getFolderFileList(
    folderToken: string, 
    orderBy: string = 'EditedTime', 
    direction: string = 'DESC',
    userKey?: string
  ): Promise<any> {
    try {
      const endpoint = '/drive/v1/files';
      const params = {
        folder_token: folderToken,
        order_by: orderBy,
        direction: direction
      };
      
      const response = await this.get(endpoint, params, true, userKey);
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
   * @param userKey 用户标识（可选）
   * @returns 创建的文件夹信息
   */
  public async createFolder(folderToken: string, name: string, userKey?: string): Promise<any> {
    try {
      const endpoint = '/drive/v1/files/create_folder';
      const payload = {
        folder_token: folderToken,
        name: name
      };
      
      const response = await this.post(endpoint, payload, true, userKey);
      Logger.debug(`文件夹创建成功, token: ${response.token}, url: ${response.url}`);
      return response;
    } catch (error) {
      this.handleApiError(error, '创建文件夹失败');
    }
  }

  /**
   * 搜索飞书文档
   * @param searchKey 搜索关键字
   * @param count 每页数量，默认50
   * @param userKey 用户标识（可选）
   * @returns 搜索结果，包含所有页的数据
   */
  public async searchDocuments(searchKey: string, count: number = 50, userKey?: string): Promise<any> {
    try {
      Logger.info(`开始搜索文档，关键字: ${searchKey}`);

      const endpoint = `//suite/docs-api/search/object`;
      let offset = 0;
      let allResults: any[] = [];
      let hasMore = true;

      // 循环获取所有页的数据
      while (hasMore && offset + count < 200) {
        const payload = {
          search_key: searchKey,
          docs_types: ["doc"],
          count: count,
          offset: offset
        };

        Logger.debug(`请求搜索，offset: ${offset}, count: ${count}`);
        const response = await this.post(endpoint, payload, true, userKey);
        
        Logger.debug('搜索响应:', JSON.stringify(response, null, 2));

        if (response && response.docs_entities) {
          const newDocs = response.docs_entities;
          allResults = [...allResults, ...newDocs];
          hasMore = response.has_more || false;
          offset += count;
          
          Logger.debug(`当前页获取到 ${newDocs.length} 条数据，累计 ${allResults.length} 条，总计 ${response.total} 条，hasMore: ${hasMore}`);
        } else {
          hasMore = false;
          Logger.warn('搜索响应格式异常:', JSON.stringify(response, null, 2));
        }
      }

      const resultCount = allResults.length;
      Logger.info(`文档搜索完成，找到 ${resultCount} 个结果`);
      return {
        data: allResults
      };
    } catch (error) {
      this.handleApiError(error, '搜索文档失败');
    }
  }
} 