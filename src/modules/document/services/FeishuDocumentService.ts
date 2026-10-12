import FormData from 'form-data';
import { Logger } from '../../../utils/logger.js';
import { ParamUtils } from '../../../utils/paramUtils.js';
import { AuthService } from '../../../services/feishuAuthService.js';
import { FeishuBaseApiService } from '../../../services/feishu/FeishuBaseApiService.js';
import {
  MARKDOWN_IMPORT_MAX_RETRIES,
  getMarkdownImportRetryDelayMs,
} from './markdownImportConfig.js';

export interface ImportMarkdownToDocumentParams {
  title: string;
  markdown: string;
  folderToken: string;
  fileName: string;
}

export interface ImportMarkdownToDocumentResult {
  ticket: string;
  token: string;
  url: string;
  jobStatus: number;
}

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
   * 将 Markdown 内容导入为飞书新版文档（docx）
   * @param params Markdown 导入参数，folderToken 为空字符串时导入到个人空间根目录
   * @returns 导入完成后的文档 token、URL 与任务 ticket
   */
  public async importMarkdownToDocument(
    params: ImportMarkdownToDocumentParams,
  ): Promise<ImportMarkdownToDocumentResult> {
    try {
      const {
        title,
        markdown,
        folderToken,
        fileName,
      } = params;
      const markdownBuffer = Buffer.from(markdown, 'utf8');

      if (markdownBuffer.length > 20 * 1024 * 1024) {
        throw new Error('Markdown 文件超过 20MB 上传限制');
      }

      Logger.info(
        `开始上传 Markdown 素材，title=${title}, fileName=${fileName}, size=${markdownBuffer.length}`,
      );
      // Build FormData inside a factory so BaseApiService can recreate the stream
      // when a token-expiry retry is needed.
      const buildUploadFormData = () => {
        const fd = new FormData();
        fd.append('file', markdownBuffer, {
          filename: fileName,
          contentType: 'text/markdown; charset=utf-8',
          knownLength: markdownBuffer.length,
        });
        fd.append('file_name', fileName);
        fd.append('parent_type', 'ccm_import_open');
        fd.append('parent_node', folderToken || '/');
        fd.append('size', markdownBuffer.length.toString());
        fd.append(
          'extra',
          JSON.stringify({ obj_type: 'docx', file_extension: 'md' }),
        );
        return fd;
      };

      const uploadResponse = await this.post<{ file_token?: string }>(
        '/drive/v1/medias/upload_all',
        buildUploadFormData,
      );
      const fileToken = uploadResponse?.file_token;
      if (!fileToken)
        throw new Error('上传 Markdown 素材失败，未返回 file_token');

      Logger.info(`Markdown 素材上传成功，file_token=${fileToken}`);
      try {
        const importResponse = await this.post<{ ticket?: string }>(
          '/drive/v1/import_tasks',
          {
            file_extension: 'md',
            file_token: fileToken,
            type: 'docx',
            file_name: title,
            point: {
              mount_type: 1,
              mount_key: folderToken,
            },
          },
        );
        const ticket = importResponse?.ticket;
        if (!ticket) throw new Error('创建 Markdown 导入任务失败，未返回 ticket');

        Logger.info(`Markdown 导入任务已创建，ticket=${ticket}`);
        for (let attempt = 0; attempt < MARKDOWN_IMPORT_MAX_RETRIES; attempt++) {
          const taskResponse = await this.get<{
            result?: {
              job_status?: number;
              job_error_msg?: string;
              token?: string;
              url?: string;
            };
          }>(`/drive/v1/import_tasks/${ticket}`);
          const result = taskResponse?.result;
          const jobStatus = result?.job_status;

          if (jobStatus === 0) {
            if (!result?.token || !result?.url) {
              throw new Error('Markdown 导入完成但未返回文档 token 或 url');
            }
            return { ticket, token: result.token, url: result.url, jobStatus };
          }

          // Treat a missing job_status as a transient in-progress state rather than an error
          if (jobStatus === undefined || jobStatus === null) {
            if (attempt < MARKDOWN_IMPORT_MAX_RETRIES - 1) {
              await this.sleep(getMarkdownImportRetryDelayMs(attempt));
            }
            continue;
          }

          if (jobStatus !== 1 && jobStatus !== 2) {
            throw new Error(
              `Markdown 导入失败，job_status=${jobStatus}，错误：${result?.job_error_msg || '未知错误'}`,
            );
          }

          if (attempt < MARKDOWN_IMPORT_MAX_RETRIES - 1) {
            await this.sleep(getMarkdownImportRetryDelayMs(attempt));
          }
        }

        throw new Error(`Markdown 导入超时：${MARKDOWN_IMPORT_MAX_RETRIES} 次轮询后仍未完成`);
      } catch (importError) {
        // Best-effort cleanup: delete the staging media file to avoid orphaned files in Drive
        try {
          await this.delete(`/drive/v1/files/${fileToken}?type=file`);
          Logger.info(`已清理暂存素材文件 file_token=${fileToken}`);
        } catch {
          Logger.warn(`无法清理暂存素材文件 file_token=${fileToken}，请手动删除`);
        }
        throw importError;
      }
    } catch (error) {
      this.handleApiError(error, 'Markdown 导入飞书文档失败');
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

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
