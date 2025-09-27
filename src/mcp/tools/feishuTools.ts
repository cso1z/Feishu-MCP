import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// import { z } from 'zod';
import { formatErrorMessage } from '../../utils/error.js';
import { FeishuApiService } from '../../services/feishuApiService.js';
import { Logger } from '../../utils/logger.js';
import {
  DocumentIdSchema,
  // BlockIdSchema,
  SearchKeySchema,
  WhiteboardIdSchema,
  DocumentTitleSchema,
  FolderTokenSchema,
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
      title: DocumentTitleSchema,
      folderToken: FolderTokenSchema,
    },
    async ({ title, folderToken }) => {
      try {
        Logger.info(`开始创建飞书文档，标题: ${title}${folderToken ? `，文件夹Token: ${folderToken}` : '，使用默认文件夹'}`);
        const newDoc = await feishuService?.createDocument(title, folderToken);
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
    },
    async ({ documentId }) => {
      try {
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: '飞书服务未初始化，请检查配置' }],
          };
        }

        Logger.info(`开始获取飞书文档信息，文档ID: ${documentId}`);
        const docInfo = await feishuService.getDocumentInfo(documentId);
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
  // server.tool(
  //   'get_feishu_document_content',
  //   'Retrieves the plain text content of a Feishu document. Ideal for content analysis, processing, or when you need to extract text without formatting. The content maintains the document structure but without styling. Note: For Feishu wiki links (https://xxx.feishu.cn/wiki/xxx) you must first use convert_feishu_wiki_to_document_id tool to obtain a compatible document ID.',
  //   {
  //     documentId: DocumentIdSchema,
  //     lang: z.number().optional().default(0).describe('Language code (optional). Default is 0 (Chinese). Use 1 for English if available.'),
  //   },
  //   async ({ documentId, lang }) => {
  //     try {
  //       if (!feishuService) {
  //         return {
  //           content: [{ type: 'text', text: 'Feishu service is not initialized. Please check the configuration' }],
  //         };
  //       }
  //
  //       Logger.info(`开始获取飞书文档内容，文档ID: ${documentId}，语言: ${lang}`);
  //       const content = await feishuService.getDocumentContent(documentId, lang);
  //       Logger.info(`飞书文档内容获取成功，内容长度: ${content.length}字符`);
  //
  //       return {
  //         content: [{ type: 'text', text: content }],
  //       };
  //     } catch (error) {
  //       Logger.error(`获取飞书文档内容失败:`, error);
  //       const errorMessage = formatErrorMessage(error);
  //       return {
  //         content: [{ type: 'text', text: `获取飞书文档内容失败: ${errorMessage}` }],
  //       };
  //     }
  //   },
  // );

  // 添加获取飞书文档块工具
  server.tool(
    'get_feishu_document_blocks',
    'Retrieves the block structure information of a Feishu document. Essential to use before inserting content to understand document structure and determine correct insertion positions. Returns a detailed hierarchy of blocks with their IDs, types, and content. Note: For Feishu wiki links (https://xxx.feishu.cn/wiki/xxx) you must first use convert_feishu_wiki_to_document_id tool to obtain a compatible document ID.',
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

  // 添加获取块内容工具
  // server.tool(
  //   'get_feishu_block_content',
  //   'Retrieves the detailed content and structure of a specific block in a Feishu document. Useful for inspecting block properties, formatting, and content, especially before making updates or for debugging purposes. Note: For Feishu wiki links (https://xxx.feishu.cn/wiki/xxx) you must first use convert_feishu_wiki_to_document_id tool to obtain a compatible document ID.',
  //   {
  //     documentId: DocumentIdSchema,
  //     blockId: BlockIdSchema,
  //   },
  //   async ({ documentId, blockId }) => {
  //     try {
  //       if (!feishuService) {
  //         return {
  //           content: [{ type: 'text', text: '飞书服务未初始化，请检查配置' }],
  //         };
  //       }
  //
  //       Logger.info(`开始获取飞书块内容，文档ID: ${documentId}，块ID: ${blockId}`);
  //       const blockContent = await feishuService.getBlockContent(documentId, blockId);
  //       Logger.info(`飞书块内容获取成功，块类型: ${blockContent.block_type}`);
  //
  //       return {
  //         content: [{ type: 'text', text: JSON.stringify(blockContent, null, 2) }],
  //       };
  //     } catch (error) {
  //       Logger.error(`获取飞书块内容失败:`, error);
  //       const errorMessage = formatErrorMessage(error);
  //       return {
  //         content: [{ type: 'text', text: `获取飞书块内容失败: ${errorMessage}` }],
  //       };
  //     }
  //   },
  // );

  // 添加搜索文档工具
  server.tool(
    'search_feishu_documents',
    'Searches for documents in Feishu. Supports keyword-based search and returns document information including title, type, and owner. Use this tool to find specific content or related documents in your document library.',
    {
      searchKey: SearchKeySchema,
    },
    async ({ searchKey }) => {
      try {
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: 'Feishu service is not initialized. Please check the configuration.' }],
          };
        }

        Logger.info(`开始搜索飞书文档，关键字: ${searchKey},`);
        const searchResult = await feishuService.searchDocuments(searchKey);
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

  // 添加获取画板内容工具
  server.tool(
    'get_feishu_whiteboard_content',
    'Retrieves the content and structure of a Feishu whiteboard. Use this to analyze whiteboard content, extract information, or understand the structure of collaborative diagrams. The whiteboard ID can be obtained from the board.token field when getting document blocks with block_type: 43.',
    {
      whiteboardId: WhiteboardIdSchema,
    },
    async ({ whiteboardId }) => {
      try {
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: 'Feishu service is not initialized. Please check the configuration' }],
          };
        }

        Logger.info(`开始获取飞书画板内容，画板ID: ${whiteboardId}`);
        const whiteboardContent = await feishuService.getWhiteboardContent(whiteboardId);
        const nodeCount = whiteboardContent.nodes?.length || 0;
        Logger.info(`飞书画板内容获取成功，节点数量: ${nodeCount}`);

        // 检查节点数量是否超过100
        if (nodeCount > 200) {
          Logger.info(`画板节点数量过多 (${nodeCount} > 200)，返回缩略图`);
          
          try {
            const thumbnailBuffer = await feishuService.getWhiteboardThumbnail(whiteboardId);
            const thumbnailBase64 = thumbnailBuffer.toString('base64');
            
            return {
              content: [
                { 
                  type: 'image', 
                  data: thumbnailBase64,
                  mimeType: 'image/png'
                }
              ],
            };
          } catch (thumbnailError) {
            Logger.warn(`获取画板缩略图失败，返回基本信息: ${thumbnailError}`);
          }
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(whiteboardContent, null, 2) }],
        };
      } catch (error) {
        Logger.error(`获取飞书画板内容失败:`, error);
        const errorMessage = formatErrorMessage(error);
        return {
          content: [{ type: 'text', text: `获取飞书画板内容失败: ${errorMessage}` }],
        };
      }
    },
  );
}