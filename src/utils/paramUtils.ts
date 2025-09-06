import { normalizeDocumentId, normalizeWikiToken } from './document.js';
import { Logger } from './logger.js';
import { formatErrorMessage } from './error.js';

/**
 * 参数验证错误
 */
export class ParamValidationError extends Error {
  public readonly param: string;
  
  constructor(param: string, message: string) {
    super(message);
    this.name = 'ParamValidationError';
    this.param = param;
  }
}

/**
 * 通用参数配置接口
 */
export interface CommonParams {
  documentId?: string;
  blockId?: string;
  parentBlockId?: string;
  index?: number;
  startIndex?: number;
  [key: string]: any;
}

/**
 * 参数处理工具类
 * 提供参数验证、转换和处理功能
 */
export class ParamUtils {
  /**
   * 处理文档ID参数
   * 验证并规范化文档ID
   * 
   * @param documentId 文档ID或URL
   * @returns 规范化的文档ID
   * @throws 如果文档ID无效则抛出错误
   */
  public static processDocumentId(documentId: string): string {
    if (!documentId) {
      throw new ParamValidationError('documentId', '文档ID不能为空');
    }
    
    try {
      return normalizeDocumentId(documentId);
    } catch (error) {
      throw new ParamValidationError('documentId', formatErrorMessage(error));
    }
  }
  
  /**
   * 处理Wiki Token参数
   * 验证并规范化Wiki Token
   * 
   * @param wikiUrl Wiki URL或Token
   * @returns 规范化的Wiki Token
   * @throws 如果Wiki Token无效则抛出错误
   */
  public static processWikiToken(wikiUrl: string): string {
    if (!wikiUrl) {
      throw new ParamValidationError('wikiUrl', 'Wiki URL不能为空');
    }
    
    try {
      return normalizeWikiToken(wikiUrl);
    } catch (error) {
      throw new ParamValidationError('wikiUrl', formatErrorMessage(error));
    }
  }
  
  /**
   * 处理块ID参数
   * 验证块ID是否有效
   * 
   * @param blockId 块ID
   * @returns 验证后的块ID
   * @throws 如果块ID无效则抛出错误
   */
  public static processBlockId(blockId: string): string {
    if (!blockId) {
      throw new ParamValidationError('blockId', '块ID不能为空');
    }
    
    if (!/^[a-zA-Z0-9_-]{5,}$/.test(blockId)) {
      throw new ParamValidationError('blockId', '块ID格式无效');
    }
    
    return blockId;
  }
  
  /**
   * 处理父块ID参数
   * 验证父块ID是否有效
   * 
   * @param parentBlockId 父块ID
   * @returns 验证后的父块ID
   * @throws 如果父块ID无效则抛出错误
   */
  public static processParentBlockId(parentBlockId: string): string {
    if (!parentBlockId) {
      throw new ParamValidationError('parentBlockId', '父块ID不能为空');
    }
    
    if (!/^[a-zA-Z0-9_-]{5,}$/.test(parentBlockId)) {
      throw new ParamValidationError('parentBlockId', '父块ID格式无效');
    }
    
    return parentBlockId;
  }
  
  /**
   * 处理插入位置索引参数
   * 验证并规范化索引值
   * 
   * @param index 插入位置索引
   * @returns 验证后的索引值
   * @throws 如果索引无效则抛出错误
   */
  public static processIndex(index: number): number {
    if (index === undefined || index === null) {
      return 0; // 默认值
    }
    
    if (!Number.isInteger(index) || index < 0) {
      throw new ParamValidationError('index', '索引必须是非负整数');
    }
    
    return index;
  }
  
  /**
   * 处理对齐方式参数
   * 验证并规范化对齐方式值
   * 
   * @param align 对齐方式
   * @returns 验证后的对齐方式值
   */
  public static processAlign(align: number): number {
    if (align === undefined || align === null) {
      return 1; // 默认左对齐
    }
    
    if (![1, 2, 3].includes(align)) {
      Logger.warn(`对齐方式值 ${align} 无效，使用默认值1（左对齐）`);
      return 1;
    }
    
    return align;
  }
  
  /**
   * 处理语言类型参数
   * 验证并规范化语言类型值
   * 
   * @param language 语言类型
   * @returns 验证后的语言类型值
   */
  public static processLanguage(language: number): number {
    if (language === undefined || language === null) {
      return 1; // 默认纯文本
    }
    
    if (!Number.isInteger(language) || language < 1 || language > 71) {
      Logger.warn(`语言类型值 ${language} 无效，使用默认值1（纯文本）`);
      return 1;
    }
    
    return language;
  }
  
  /**
   * 处理标题级别参数
   * 验证并规范化标题级别值
   * 
   * @param level 标题级别
   * @returns 验证后的标题级别值
   */
  public static processHeadingLevel(level: number): number {
    if (level === undefined || level === null) {
      return 1; // 默认一级标题
    }
    
    // 限制在1-9范围内
    return Math.max(1, Math.min(9, level));
  }
  
  /**
   * 批量处理通用参数
   * 验证并规范化常用参数集
   * 
   * @param params 通用参数对象
   * @returns 处理后的参数对象
   */
  public static processCommonParams(params: CommonParams): CommonParams {
    const result: CommonParams = { ...params };
    
    // 处理文档ID
    if (params.documentId) {
      result.documentId = ParamUtils.processDocumentId(params.documentId);
    }
    
    // 处理块ID
    if (params.blockId) {
      result.blockId = ParamUtils.processBlockId(params.blockId);
    }
    
    // 处理父块ID
    if (params.parentBlockId) {
      result.parentBlockId = ParamUtils.processParentBlockId(params.parentBlockId);
    }
    
    // 处理索引
    if (params.index !== undefined) {
      result.index = ParamUtils.processIndex(params.index);
    }
    
    // 处理起始索引
    if (params.startIndex !== undefined) {
      result.startIndex = ParamUtils.processIndex(params.startIndex);
    }
    
    return result;
  }
} 