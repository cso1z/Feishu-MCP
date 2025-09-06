import { BaseApiService } from './baseService.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../utils/config.js';
import { CacheManager } from '../utils/cache.js';
import { ParamUtils } from '../utils/paramUtils.js';
import { BlockFactory, BlockType } from './blockFactory.js';
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

    // 通过HTTP请求调用配置的tokenEndpoint接口
    const { appId, appSecret, authType, tokenEndpoint } = this.config.feishu;
    const params = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      token_type: authType
    });
    const url = `${tokenEndpoint}?${params.toString()}`;
    const response = await axios.get(url);
    const tokenResult = response.data?.data;
    if (tokenResult && tokenResult.access_token) {
      Logger.debug('使用Http的访问令牌');
      CacheManager.getInstance().cacheToken(tokenResult.access_token,tokenResult.expires_in)
      return tokenResult.access_token;
    }
    if (tokenResult && tokenResult.needAuth && tokenResult.url) {
      throw new Error(`请在浏览器打开以下链接进行授权：\n\n[点击授权](${tokenResult.url})`);
    }
    throw new Error('无法获取有效的access_token');
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
   * 搜索飞书文档
   * @param searchKey 搜索关键字
   * @param count 每页数量，默认50
   * @returns 搜索结果，包含所有页的数据
   */
  public async searchDocuments(searchKey: string, count: number = 50): Promise<any> {
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
        const response = await this.post(endpoint, payload);
        
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
      // 从URL中提取画板ID
      let normalizedWhiteboardId = whiteboardId;
      if (whiteboardId.includes('feishu.cn/board/')) {
        // 从URL中提取画板ID
        const matches = whiteboardId.match(/board\/([^\/\?]+)/);
        if (matches) {
          normalizedWhiteboardId = matches[1];
        }
      }

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