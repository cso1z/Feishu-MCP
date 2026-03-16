import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { formatErrorMessage } from '../../../utils/error.js';
import { FeishuApiService } from '../../../services/feishuApiService.js';
import { Logger } from '../../../utils/logger.js';
import {
  createDocument,
  getDocumentInfo,
  getDocumentBlocks,
  searchDocuments,
} from '../toolApi/documentToolApi.js';
import {
  WIKI_NOTE,
  errorResponse,
} from './toolHelpers.js';
import {
  DocumentIdSchema,
  DocumentIdOrWikiIdSchema,
  DocumentTypeSchema,
  SearchKeySchema,
  SearchTypeSchema,
  PageTokenSchema,
  OffsetSchema,
  DocumentTitleSchema,
  FolderTokenOptionalSchema,
  WikiSpaceNodeContextSchema,
} from '../../../types/documentSchema.js';

/**
 * 注册飞书文档相关的MCP工具
 */
export function registerDocumentTools(server: McpServer, feishuService: FeishuApiService): void {
  server.tool(
    'create_feishu_document',
    'Creates a new Feishu document and returns its information. Supports two modes: (1) Feishu Drive folder mode: use folderToken to create a document in a folder. (2) Wiki space node mode: use wikiContext with spaceId (and optional parentNodeToken) to create a node (document) in a wiki space. IMPORTANT: In wiki spaces, documents are nodes themselves - they can act as parent nodes containing child documents, and can also be edited as regular documents. The created node returns both node_token (node ID, can be used as parentNodeToken for creating child nodes) and obj_token (document ID, can be used for document editing operations like get_feishu_document_blocks, batch_create_feishu_blocks, etc.). Only one mode can be used at a time - provide either folderToken OR wikiContext, not both.',
    {
      title: DocumentTitleSchema,
      folderToken: FolderTokenOptionalSchema,
      wikiContext: WikiSpaceNodeContextSchema,
    },
    async ({ title, folderToken, wikiContext }) => {
      try {
        const result = await createDocument({ title, folderToken, wikiContext }, feishuService);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        Logger.error(`创建文档失败:`, error);
        return errorResponse(`创建文档失败: ${formatErrorMessage(error)}`);
      }
    }
  );

  server.tool(
    'get_feishu_document_info',
    'Retrieves basic information about a Feishu document or Wiki node. Supports both regular documents (via document ID/URL) and Wiki documents (via Wiki URL/token). Use this to verify a document exists, check access permissions, or get metadata like title, type, and creation information. For Wiki documents, returns complete node information including documentId (obj_token) for document editing operations, and space_id and node_token for creating child nodes.',
    {
      documentId: DocumentIdOrWikiIdSchema,
      documentType: DocumentTypeSchema,
    },
    async ({ documentId, documentType }) => {
      try {
        const docInfo = await getDocumentInfo({ documentId, documentType }, feishuService);
        return { content: [{ type: 'text', text: JSON.stringify(docInfo, null, 2) }] };
      } catch (error) {
        Logger.error(`获取飞书文档信息失败:`, error);
        return errorResponse(formatErrorMessage(error, '获取飞书文档信息失败'));
      }
    }
  );

  server.tool(
    'get_feishu_document_blocks',
    'Retrieves the block hierarchy of a Feishu document, including block IDs, types, and content. ' + WIKI_NOTE,
    {
      documentId: DocumentIdSchema,
    },
    async ({ documentId }) => {
      try {
        const responseText = await getDocumentBlocks(documentId, feishuService);
        return { content: [{ type: 'text', text: responseText }] };
      } catch (error) {
        Logger.error(`获取飞书文档块失败:`, error);
        return errorResponse(`获取飞书文档块失败: ${formatErrorMessage(error)}`);
      }
    }
  );

  server.tool(
    'search_feishu_documents',
    'Searches for documents and/or Wiki knowledge base nodes in Feishu. Supports keyword-based search with type filtering (document, wiki, or both). Returns document and wiki information including title, type, and owner. Supports pagination: use offset for document search pagination and pageToken for wiki search pagination. Each type (document or wiki) can return up to 100 results maximum per search. Default page size is 20 items.',
    {
      searchKey: SearchKeySchema,
      searchType: SearchTypeSchema,
      offset: OffsetSchema,
      pageToken: PageTokenSchema,
    },
    async ({ searchKey, searchType, offset, pageToken }) => {
      try {
        const searchResult = await searchDocuments(
          { searchKey, searchType, offset, pageToken },
          feishuService
        );
        return { content: [{ type: 'text', text: JSON.stringify(searchResult, null, 2) }] };
      } catch (error) {
        Logger.error(`搜索失败:`, error);
        return errorResponse(`搜索失败: ${formatErrorMessage(error)}`);
      }
    }
  );
}
