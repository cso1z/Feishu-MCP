import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { formatErrorMessage } from '../../../utils/error';
import { FeishuApiService } from '../../../services/feishuApiService';
import { Logger } from '../../../utils/logger';
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
} from '../../../types/documentSchema';
import {
  WIKI_NOTE,
  errorResponse,
  validateFolderOrWikiContext,
  extractSpecialBlocks,
  appendSpecialBlockTextHints,
} from './toolHelpers';

/**
 * 注册飞书文档相关的MCP工具
 */
export function registerDocumentTools(server: McpServer, feishuService: FeishuApiService): void {

  // 添加创建飞书文档工具
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
        const validationError = validateFolderOrWikiContext(folderToken, wikiContext);
        if (validationError) return validationError;

        // 模式一：飞书文档目录模式
        if (folderToken) {
          Logger.info(`开始创建飞书文档（文件夹模式），标题: ${title}，文件夹Token: ${folderToken}`);
          const newDoc = await feishuService.createDocument(title, folderToken);
          if (!newDoc) throw new Error('创建文档失败，未返回文档信息');
          Logger.info(`飞书文档创建成功，文档ID: ${newDoc.objToken || newDoc.document_id}`);
          return { content: [{ type: 'text', text: JSON.stringify(newDoc, null, 2) }] };
        }

        // 模式二：知识库节点模式
        if (!wikiContext) return errorResponse('错误：内部参数状态异常。');
        const { spaceId, parentNodeToken } = wikiContext;
        if (!spaceId) {
          return errorResponse('错误：使用 wikiContext 模式时，必须提供 spaceId。');
        }
        Logger.info(`开始创建知识库节点，标题: ${title}，知识空间ID: ${spaceId}，父节点Token: ${parentNodeToken ?? 'null（根节点）'}`);
        const node = await feishuService.createWikiSpaceNode(spaceId, title, parentNodeToken);
        if (!node) throw new Error('创建知识库节点失败，未返回节点信息');

        const result = {
          ...node,
          _note: '知识库节点既是节点又是文档：node_token 可作为父节点使用，obj_token 可用于文档编辑操作',
        };
        Logger.info(`知识库节点创建成功，node_token: ${node.node_token}, obj_token: ${node.obj_token}`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        Logger.error(`创建文档失败:`, error);
        return errorResponse(`创建文档失败: ${formatErrorMessage(error)}`);
      }
    },
  );

  // 添加获取飞书文档信息工具（支持普通文档和Wiki文档）
  server.tool(
    'get_feishu_document_info',
    'Retrieves basic information about a Feishu document or Wiki node. Supports both regular documents (via document ID/URL) and Wiki documents (via Wiki URL/token). Use this to verify a document exists, check access permissions, or get metadata like title, type, and creation information. For Wiki documents, returns complete node information including documentId (obj_token) for document editing operations, and space_id and node_token for creating child nodes.',
    {
      documentId: DocumentIdOrWikiIdSchema,
      documentType: DocumentTypeSchema,
    },
    async ({ documentId, documentType }) => {
      try {
        Logger.info(`开始获取飞书文档信息，文档ID: ${documentId}, 类型: ${documentType ?? 'auto'}`);
        const docInfo = await feishuService.getDocumentInfo(documentId, documentType);
        if (!docInfo) throw new Error('获取文档信息失败，未返回数据');

        const title = docInfo.title || docInfo.document?.title || '未知标题';
        Logger.info(`飞书文档信息获取成功，标题: ${title}, 类型: ${docInfo._type ?? 'document'}`);
        return { content: [{ type: 'text', text: JSON.stringify(docInfo, null, 2) }] };
      } catch (error) {
        Logger.error(`获取飞书文档信息失败:`, error);
        return errorResponse(formatErrorMessage(error, '获取飞书文档信息失败'));
      }
    },
  );

  // 添加获取飞书文档块工具
  server.tool(
    'get_feishu_document_blocks',
    'Retrieves the block hierarchy of a Feishu document, including block IDs, types, and content. ' + WIKI_NOTE,
    {
      documentId: DocumentIdSchema,
    },
    async ({ documentId }) => {
      try {
        Logger.info(`开始获取飞书文档块，文档ID: ${documentId}`);
        const blocks = await feishuService.getDocumentBlocks(documentId);
        Logger.info(`飞书文档块获取成功，共 ${blocks.length} 个块`);

        const { imageBlocks, whiteboardBlocks } = extractSpecialBlocks(blocks);
        const responseText = appendSpecialBlockTextHints(
          JSON.stringify(blocks, null, 2),
          imageBlocks,
          whiteboardBlocks,
        );
        return { content: [{ type: 'text', text: responseText }] };
      } catch (error) {
        Logger.error(`获取飞书文档块失败:`, error);
        return errorResponse(`获取飞书文档块失败: ${formatErrorMessage(error)}`);
      }
    },
  );

  // 添加搜索文档工具（支持文档和知识库搜索）
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
        Logger.info(`开始搜索，关键字: ${searchKey}, 类型: ${searchType ?? 'both'}, offset: ${offset ?? 0}, pageToken: ${pageToken ?? '无'}`);
        const searchResult = await feishuService.search(searchKey, searchType ?? 'both', offset, pageToken);
        Logger.info(`搜索完成，文档: ${searchResult.documents?.length ?? 0} 条，知识库: ${searchResult.wikis?.length ?? 0} 条`);
        return { content: [{ type: 'text', text: JSON.stringify(searchResult, null, 2) }] };
      } catch (error) {
        Logger.error(`搜索失败:`, error);
        return errorResponse(`搜索失败: ${formatErrorMessage(error)}`);
      }
    },
  );
}
