import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { formatErrorMessage } from '../../utils/error.js';
import { FeishuApiService } from '../../services/feishuApiService.js';
import { Logger } from '../../utils/logger.js';
import {
  DocumentIdSchema,
  BlockIdSchema,
  SearchKeySchema,
  UserKeySchema,
} from '../../types/feishuSchema.js';

/**
 * 注册飞书相关的MCP工具
 * @param server MCP服务器实例
 * @param feishuService 飞书API服务实例
 */
export function registerFeishuTools(server: McpServer, feishuService: FeishuApiService | null): void {
  // 添加创建飞书文档工具
  server.tool(
    'create_feishu_document',
    'Creates a new Feishu document and returns its information. Use this tool when you need to create a document from scratch with a specific title and folder location.',
    {
      title: z.string().describe('Document title (required). This will be displayed in the Feishu document list and document header.'),
      folderToken: z.string().describe('Folder token (required). Specifies where to create the document. Format is an alphanumeric string like "doxcnOu1ZKYH4RtX1Y5XwL5WGRh".'),
      userKey: UserKeySchema,
    },
    async ({ title, folderToken, userKey }) => {
      try {
        Logger.info(`开始创建飞书文档，标题: ${title}${folderToken ? `，文件夹Token: ${folderToken}` : '，使用默认文件夹'}`);
        const newDoc = await feishuService?.createDocument(title, folderToken, userKey);
        if (!newDoc) {
          throw new Error('创建文档失败，未返回文档信息');
        }
        Logger.info(`飞书文档创建成功，文档ID: ${newDoc.objToken || newDoc.document_id}`);
        return {
          content: [{ type: 'text', text: JSON.stringify(newDoc, null, 2) }],
        };
      } catch (error) {
        Logger.error(`创建飞书文档失败:`, error);
        const errorMessage = formatErrorMessage(error);
        return {
          content: [{ type: 'text', text: `创建飞书文档失败: ${errorMessage}` }],
        };
      }
    },
  );

  // 添加获取飞书文档信息工具
  server.tool(
    'get_feishu_document_info',
    'Retrieves basic information about a Feishu document. Use this to verify a document exists, check access permissions, or get metadata like title, type, and creation information.',
    {
      documentId: DocumentIdSchema,
      userKey: UserKeySchema,
    },
    async ({ documentId, userKey }) => {
      try {
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: '飞书服务未初始化，请检查配置' }],
          };
        }

        Logger.info(`开始获取飞书文档信息，文档ID: ${documentId}`);
        const docInfo = await feishuService.getDocumentInfo(documentId, userKey);
        Logger.info(`飞书文档信息获取成功，标题: ${docInfo.title}`);

        return {
          content: [{ type: 'text', text: JSON.stringify(docInfo, null, 2) }],
        };
      } catch (error) {
        Logger.error(`获取飞书文档信息失败:`, error);
        const errorMessage = formatErrorMessage(error, '获取飞书文档信息失败');
        return {
          content: [{ type: 'text', text: errorMessage }],
        };
      }
    },
  );

  // 添加获取飞书文档内容工具
  server.tool(
    'get_feishu_document_content',
    'Retrieves the plain text content of a Feishu document. Ideal for content analysis, processing, or when you need to extract text without formatting. The content maintains the document structure but without styling. Note: For Feishu wiki links (https://xxx.feishu.cn/wiki/xxx) you must first use convert_feishu_wiki_to_document_id tool to obtain a compatible document ID.',
    {
      documentId: DocumentIdSchema,
      lang: z.number().optional().default(0).describe('Language code (optional). Default is 0 (Chinese). Use 1 for English if available.'),
      userKey: UserKeySchema,
    },
    async ({ documentId, lang, userKey }) => {
      try {
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: 'Feishu service is not initialized. Please check the configuration' }],
          };
        }

        Logger.info(`开始获取飞书文档内容，文档ID: ${documentId}，语言: ${lang}`);
        const content = await feishuService.getDocumentContent(documentId, lang, userKey);
        Logger.info(`飞书文档内容获取成功，内容长度: ${content.length}字符`);

        return {
          content: [{ type: 'text', text: content }],
        };
      } catch (error) {
        Logger.error(`获取飞书文档内容失败:`, error);
        const errorMessage = formatErrorMessage(error);
        return {
          content: [{ type: 'text', text: `获取飞书文档内容失败: ${errorMessage}` }],
        };
      }
    },
  );

  // 添加获取飞书文档块工具
  server.tool(
    'get_feishu_document_blocks',
    'Retrieves the block structure information of a Feishu document. Essential to use before inserting content to understand document structure and determine correct insertion positions. Returns a detailed hierarchy of blocks with their IDs, types, and content. Note: For Feishu wiki links (https://xxx.feishu.cn/wiki/xxx) you must first use convert_feishu_wiki_to_document_id tool to obtain a compatible document ID.',
    {
      documentId: DocumentIdSchema,
      userKey: UserKeySchema,
    },
    async ({ documentId, userKey }) => {
      try {
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: 'Feishu service is not initialized. Please check the configuration' }],
          };
        }

        Logger.info(`开始获取飞书文档块，文档ID: ${documentId}`);
        const blocks = await feishuService.getDocumentBlocks(documentId, undefined, userKey);
        Logger.info(`飞书文档块获取成功，共 ${blocks.length} 个块`);

        return {
          content: [{ type: 'text', text: JSON.stringify(blocks, null, 2) }],
        };
      } catch (error) {
        Logger.error(`获取飞书文档块失败:`, error);
        const errorMessage = formatErrorMessage(error);
        return {
          content: [{ type: 'text', text: `获取飞书文档块失败: ${errorMessage}` }],
        };
      }
    },
  );

  // 添加获取块内容工具
  server.tool(
    'get_feishu_block_content',
    'Retrieves the detailed content and structure of a specific block in a Feishu document. Useful for inspecting block properties, formatting, and content, especially before making updates or for debugging purposes. Note: For Feishu wiki links (https://xxx.feishu.cn/wiki/xxx) you must first use convert_feishu_wiki_to_document_id tool to obtain a compatible document ID.',
    {
      documentId: DocumentIdSchema,
      blockId: BlockIdSchema,
      userKey: UserKeySchema,
    },
    async ({ documentId, blockId, userKey }) => {
      try {
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: '飞书服务未初始化，请检查配置' }],
          };
        }

        Logger.info(`开始获取飞书块内容，文档ID: ${documentId}，块ID: ${blockId}`);
        const blockContent = await feishuService.getBlockContent(documentId, blockId, userKey);
        Logger.info(`飞书块内容获取成功，块类型: ${blockContent.block_type}`);

        return {
          content: [{ type: 'text', text: JSON.stringify(blockContent, null, 2) }],
        };
      } catch (error) {
        Logger.error(`获取飞书块内容失败:`, error);
        const errorMessage = formatErrorMessage(error);
        return {
          content: [{ type: 'text', text: `获取飞书块内容失败: ${errorMessage}` }],
        };
      }
    },
  );

  // 添加搜索文档工具
  server.tool(
    'search_feishu_documents',
    'Searches for documents in Feishu. Supports keyword-based search and returns document information including title, type, and owner. Use this tool to find specific content or related documents in your document library.',
    {
      searchKey: SearchKeySchema,
      userKey: UserKeySchema,
    },
    async ({ searchKey, userKey }) => {
      try {
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: 'Feishu service is not initialized. Please check the configuration.' }],
          };
        }

        Logger.info(`开始搜索飞书文档，关键字: ${searchKey},`);
        const searchResult = await feishuService.searchDocuments(searchKey, undefined, userKey);
        Logger.info(`文档搜索完成，找到 ${searchResult.size} 个结果`);
        return {
          content: [
            { type: 'text', text: JSON.stringify(searchResult, null, 2) },
          ],
        };
      } catch (error) {
        Logger.error(`搜索飞书文档失败:`, error);
        const errorMessage = formatErrorMessage(error);
        return {
          content: [
            { type: 'text', text: `搜索飞书文档失败: ${errorMessage}` },
          ],
        };
      }
    },
  );
}