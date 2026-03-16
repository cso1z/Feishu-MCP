import { Logger } from '../../../utils/logger.js';
import { ParamUtils } from '../../../utils/paramUtils.js';
import { AuthService } from '../../../services/feishuAuthService.js';
import { FeishuBaseApiService } from '../../../services/feishu/FeishuBaseApiService.js';

/**
 * 飞书文档服务
 * 负责文档的创建与信息查询
 */
export class FeishuDocumentService extends FeishuBaseApiService {
  constructor(authService: AuthService) {
    super(authService);
  }

  /**
   * 创建飞书文档
   * @param title 文档标题
   * @param folderToken 目标文件夹的 Token，文档将创建在此文件夹下
   * @returns 创建的文档信息，包含 document_id、title 等字段
   */
  public async createDocument(title: string, folderToken: string): Promise<any> {
    try {
      const response = await this.post('/docx/v1/documents', { title, folder_token: folderToken });
      return response;
    } catch (error) {
      this.handleApiError(error, '创建飞书文档失败');
    }
  }

  /**
   * 获取文档信息，支持普通文档和 Wiki 文档
   * 当 documentType 未指定时，自动根据 documentId 是否包含 /wiki/ 路径判断类型
   * @param documentId 文档 ID、文档 URL 或 Wiki 节点 Token/URL
   * @param documentType 文档类型，'document' 为普通文档，'wiki' 为知识库文档；不传则自动检测
   * @returns 文档信息对象，额外附加 _type 字段标识来源（'document' | 'wiki'），
   *          Wiki 文档额外附加 documentId 字段作为 obj_token 的别名
   */
  public async getDocumentInfo(documentId: string, documentType?: 'document' | 'wiki'): Promise<any> {
    try {
      let isWikiLink: boolean;

      if (documentType === 'wiki') {
        isWikiLink = true;
      } else if (documentType === 'document') {
        isWikiLink = false;
      } else {
        isWikiLink = documentId.includes('/wiki/');
      }

      if (isWikiLink) {
        const wikiToken = ParamUtils.processWikiToken(documentId);
        const response = await this.get('/wiki/v2/spaces/get_node', { token: wikiToken, obj_type: 'wiki' });

        if (!response.node || !response.node.obj_token) {
          throw new Error(`无法从Wiki节点获取文档ID: ${wikiToken}`);
        }

        const node = response.node;
        Logger.debug(`获取Wiki文档信息: ${wikiToken} -> documentId: ${node.obj_token}`);
        return { ...node, documentId: node.obj_token, _type: 'wiki' };
      } else {
        const normalizedDocId = ParamUtils.processDocumentId(documentId);
        const response = await this.get(`/docx/v1/documents/${normalizedDocId}`);
        Logger.debug(`获取普通文档信息: ${normalizedDocId}`);
        return { ...response, _type: 'document' };
      }
    } catch (error) {
      this.handleApiError(error, '获取文档信息失败');
    }
  }

  /**
   * 获取文档的纯文本内容
   * @param documentId 文档 ID 或 URL
   * @param lang 语言，0 为中文，1 为英文，默认 0
   * @returns 文档的纯文本内容字符串
   */
  public async getDocumentContent(documentId: string, lang: number = 0): Promise<string> {
    try {
      const normalizedDocId = ParamUtils.processDocumentId(documentId);
      const response = await this.get(`/docx/v1/documents/${normalizedDocId}/raw_content`, { lang });
      return response.content;
    } catch (error) {
      this.handleApiError(error, '获取文档内容失败');
    }
  }

  /**
   * 获取文档的所有块结构，自动处理分页直到获取全部数据
   * @param documentId 文档 ID 或 URL
   * @param pageSize 每次分页请求的块数量，默认 500
   * @returns 文档的所有块对象数组
   */
  public async getDocumentBlocks(documentId: string, pageSize: number = 500): Promise<any[]> {
    try {
      const normalizedDocId = ParamUtils.processDocumentId(documentId);
      const endpoint = `/docx/v1/documents/${normalizedDocId}/blocks`;
      let pageToken = '';
      let allBlocks: any[] = [];

      do {
        const params: any = { page_size: pageSize, document_revision_id: -1 };
        if (pageToken) params.page_token = pageToken;

        const response = await this.get(endpoint, params);
        allBlocks = [...allBlocks, ...(response.items || [])];
        pageToken = response.page_token;
      } while (pageToken);

      return allBlocks;
    } catch (error) {
      this.handleApiError(error, '获取文档块结构失败');
    }
  }
}
