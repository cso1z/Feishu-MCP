import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { formatErrorMessage } from '../../utils/error.js';
import { FeishuApiService } from '../../services/feishuApiService.js';
import { Logger } from '../../utils/logger.js';
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
} from '../../types/feishuSchema.js';

/**
 * 注册飞书相关的MCP工具
 * @param server MCP服务器实例
 * @param feishuService 飞书API服务实例
 */
export function registerDocumentTools(server: McpServer, feishuService: FeishuApiService | null): void {
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
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: '飞书服务未初始化，请检查配置' }],
          };
        }

        // 参数验证：必须提供 folderToken 或 wikiContext 之一，但不能同时提供
        if (folderToken && wikiContext) {
          return {
            content: [{ type: 'text', text: '错误：不能同时提供 folderToken 和 wikiContext 参数，请选择其中一种模式。\n- 使用 folderToken 在飞书文档目录中创建文档\n- 使用 wikiContext 在知识库中创建节点（文档）' }],
          };
        }

        if (!folderToken && !wikiContext) {
          return {
            content: [{ type: 'text', text: '错误：必须提供 folderToken（飞书文档目录模式）或 wikiContext（知识库节点模式）参数之一。' }],
          };
        }

        // 模式一：飞书文档目录模式
        if (folderToken) {
          Logger.info(`开始创建飞书文档（文件夹模式），标题: ${title}，文件夹Token: ${folderToken}`);
          const newDoc = await feishuService.createDocument(title, folderToken);
          if (!newDoc) {
            throw new Error('创建文档失败，未返回文档信息');
          }
          Logger.info(`飞书文档创建成功，文档ID: ${newDoc.objToken || newDoc.document_id}`);
          return {
            content: [{ type: 'text', text: JSON.stringify(newDoc, null, 2) }],
          };
        }

        // 模式二：知识库节点模式
        if (wikiContext) {
          const { spaceId, parentNodeToken } = wikiContext;
          if (!spaceId) {
            return {
              content: [{ type: 'text', text: '错误：使用 wikiContext 模式时，必须提供 spaceId。' }],
            };
          }
          Logger.info(`开始创建知识库节点，标题: ${title}，知识空间ID: ${spaceId}，父节点Token: ${parentNodeToken || 'null（根节点）'}`);
          const node = await feishuService.createWikiSpaceNode(spaceId, title, parentNodeToken);
          if (!node) {
            throw new Error('创建知识库节点失败，未返回节点信息');
          }
          
          // 构建返回信息，说明知识库节点的特殊性质
          const result = {
            ...node,
            _note: '知识库节点既是节点又是文档：node_token 可作为父节点使用，obj_token 可用于文档编辑操作'
          };
          
          Logger.info(`知识库节点创建成功，node_token: ${node.node_token}, obj_token: ${node.obj_token}`);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        // 理论上不会到达这里
        return {
          content: [{ type: 'text', text: '错误：未知错误' }],
        };
      } catch (error) {
        Logger.error(`创建文档失败:`, error);
        const errorMessage = formatErrorMessage(error);
        return {
          content: [{ type: 'text', text: `创建文档失败: ${errorMessage}` }],
        };
      }
    },
  );

  // 添加获取飞书文档信息工具（支持普通文档和Wiki文档）
  server.tool(
    'get_feishu_document_info',
    'Retrieves basic information about a Feishu document or Wiki node. Supports both regular documents (via document ID/URL) and Wiki documents (via Wiki URL/token). Use this to verify a document exists, check access permissions, or get metadata like title, type, and creation information. For Wiki documents, returns complete node information including documentId (obj_token) for document editing operations, and space_id and node_token for creating child nodes. ',
    {
      documentId: DocumentIdOrWikiIdSchema,
      documentType: DocumentTypeSchema,
    },
    async ({ documentId, documentType }) => {
      try {
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: '飞书服务未初始化，请检查配置' }],
          };
        }

        Logger.info(`开始获取飞书文档信息，文档ID: ${documentId}, 类型: ${documentType || 'auto'}`);
        const docInfo = await feishuService.getDocumentInfo(documentId, documentType);
        
        if (!docInfo) {
          throw new Error('获取文档信息失败，未返回数据');
        }

        const title = docInfo.title || docInfo.document?.title || '未知标题';
        Logger.info(`飞书文档信息获取成功，标题: ${title}, 类型: ${docInfo._type || 'document'}`);

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

  // 添加获取飞书文档块工具
  server.tool(
    'get_feishu_document_blocks',
    'Retrieves the block structure information of a Feishu document. Essential to use before inserting content to understand document structure and determine correct insertion positions. Returns a detailed hierarchy of blocks with their IDs, types, and content. Note: For Feishu wiki links (https://xxx.feishu.cn/wiki/xxx), use get_feishu_document_info to get document information, then use the returned documentId for editing operations.',
    {
      documentId: DocumentIdSchema,
    },
    async ({ documentId }) => {
      try {
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: 'Feishu service is not initialized. Please check the configuration' }],
          };
        }

        Logger.info(`开始获取飞书文档块，文档ID: ${documentId}`);
        const blocks = await feishuService.getDocumentBlocks(documentId);
        Logger.info(`飞书文档块获取成功，共 ${blocks.length} 个块`);

        // 检查是否有 block_type 为 43 的块（画板块）
        const whiteboardBlocks = blocks.filter((block: any) => block.block_type === 43);
        const hasWhiteboardBlocks = whiteboardBlocks.length > 0;

        // 检查是否有 block_type 为 27 的块（图片块）
        const imageBlocks = blocks.filter((block: any) => block.block_type === 27);
        const hasImageBlocks = imageBlocks.length > 0;

        let responseText = JSON.stringify(blocks, null, 2);
        
        if (hasWhiteboardBlocks) {
          responseText += '\n\n⚠️ 检测到画板块 (block_type: 43)！\n';
          responseText += `发现 ${whiteboardBlocks.length} 个画板块。\n`;
          responseText += '💡 提示：如果您需要获取画板的具体内容（如流程图、思维导图等），可以使用 get_feishu_whiteboard_content 工具。\n';
          responseText += '画板信息:\n';
          whiteboardBlocks.forEach((block: any, index: number) => {
            responseText += `  ${index + 1}. 块ID: ${block.block_id}`;
            if (block.board && block.board.token) {
              responseText += `, 画板ID: ${block.board.token}`;
            }
            responseText += '\n';
          });
          responseText += '📝 注意：只有在需要分析画板内容时才调用上述工具，仅了解文档结构时无需获取。';
        }

        if (hasImageBlocks) {
          responseText += '\n\n🖼️ 检测到图片块 (block_type: 27)！\n';
          responseText += `发现 ${imageBlocks.length} 个图片块。\n`;
          responseText += '💡 提示：如果您需要查看图片的具体内容，可以使用 get_feishu_image_resource 工具下载图片。\n';
          responseText += '图片信息:\n';
          imageBlocks.forEach((block: any, index: number) => {
            responseText += `  ${index + 1}. 块ID: ${block.block_id}`;
            if (block.image && block.image.token) {
              responseText += `, 媒体ID: ${block.image.token}`;
            }
            responseText += '\n';
          });
          responseText += '📝 注意：只有在需要查看图片内容时才调用上述工具，仅了解文档结构时无需获取。';
        }

        return {
          content: [{ type: 'text', text: responseText }],
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
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: 'Feishu service is not initialized. Please check the configuration.' }],
          };
        }

        Logger.info(`开始搜索，关键字: ${searchKey}, 类型: ${searchType || 'both'}, offset: ${offset || 0}, pageToken: ${pageToken || '无'}`);
        
        const searchResult = await feishuService.search(
          searchKey,
          searchType || 'both',
          offset,
          pageToken
        );
        
        Logger.info(`搜索完成，文档: ${searchResult.documents?.length || 0} 条，知识库: ${searchResult.wikis?.length || 0} 条`);
        return {
          content: [
            { type: 'text', text: JSON.stringify(searchResult, null, 2) },
          ],
        };
      } catch (error) {
        Logger.error(`搜索失败:`, error);
        const errorMessage = formatErrorMessage(error);
        return {
          content: [
            { type: 'text', text: `搜索失败: ${errorMessage}` },
          ],
        };
      }
    },
  );


}