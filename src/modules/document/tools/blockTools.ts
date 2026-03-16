import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { formatErrorMessage } from '../../../utils/error.js';
import { FeishuApiService } from '../../../services/feishuApiService.js';
import { Logger } from '../../../utils/logger.js';
import { detectMimeType } from '../../../utils/document.js';
import {
  batchUpdateBlockText,
  batchCreateBlocks,
  deleteDocumentBlocks,
  getImageResource,
  uploadAndBindImageToBlock,
  createTable,
  getWhiteboardContent,
  fillWhiteboardWithPlantuml,
} from '../toolApi/blockToolApi.js';
import {
  DocumentIdSchema,
  ParentBlockIdSchema,
  IndexSchema,
  StartIndexSchema,
  EndIndexSchema,
  BlockTextUpdatesArraySchema,
  BlockConfigSchema,
  MediaIdSchema,
  MediaExtraSchema,
  ImagesArraySchema,
  TableCreateSchema,
  WhiteboardFillArraySchema,
  WhiteboardIdSchema,
} from '../../../types/documentSchema.js';
import { WIKI_NOTE, errorResponse } from './toolHelpers.js';

/**
 * 注册飞书块相关的MCP工具
 */
export function registerBlockTools(server: McpServer, feishuService: FeishuApiService): void {
  server.tool(
    'batch_update_feishu_block_text',
    'Updates text content and styling of multiple document blocks. ' + WIKI_NOTE,
    {
      documentId: DocumentIdSchema,
      updates: BlockTextUpdatesArraySchema,
    },
    async ({ documentId, updates }) => {
      try {
        const result = await batchUpdateBlockText({ documentId, updates }, feishuService);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        Logger.error(`批量更新飞书块文本内容失败:`, error);
        return errorResponse(`批量更新飞书块文本内容失败: ${formatErrorMessage(error)}`);
      }
    }
  );

  server.tool(
    'batch_create_feishu_blocks',
    'Creates one or more blocks at a specified position within a Feishu document. Supports text, code, heading, list, image, mermaid, and whiteboard block types. Accepts any number of blocks. ' + WIKI_NOTE,
    {
      documentId: DocumentIdSchema,
      parentBlockId: ParentBlockIdSchema,
      index: IndexSchema,
      blocks: z.array(BlockConfigSchema).describe(
        'Array of block configurations to create. Pass as a JSON array, not a serialized string.\n' +
          'Example: [{blockType:"text",options:{text:{textStyles:[{text:"Hello",style:{bold:true}}]}}},{blockType:"heading",options:{heading:{level:1,content:"My Title"}}}]'
      ),
    },
    async ({ documentId, parentBlockId, index = 0, blocks }) => {
      try {
        const result = await batchCreateBlocks({ documentId, parentBlockId, index, blocks }, feishuService);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        Logger.error(`批量创建飞书块失败:`, error);
        return errorResponse(
          `批量创建飞书块失败: ${formatErrorMessage(error)}\n\n` +
            `建议使用 get_feishu_document_blocks 工具获取文档当前状态，确认是否有部分内容已创建成功。`
        );
      }
    }
  );

  server.tool(
    'delete_feishu_document_blocks',
    'Deletes a consecutive range of blocks from a Feishu document identified by startIndex (inclusive) and endIndex (exclusive). ' + WIKI_NOTE,
    {
      documentId: DocumentIdSchema,
      parentBlockId: ParentBlockIdSchema,
      startIndex: StartIndexSchema,
      endIndex: EndIndexSchema,
    },
    async ({ documentId, parentBlockId, startIndex, endIndex }) => {
      try {
        const result = await deleteDocumentBlocks(
          { documentId, parentBlockId, startIndex, endIndex },
          feishuService
        );
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        Logger.error(`删除飞书文档块失败:`, error);
        return errorResponse(`删除飞书文档块失败: ${formatErrorMessage(error)}`);
      }
    }
  );

  server.tool(
    'get_feishu_image_resource',
    'Downloads an image resource from Feishu by its media ID and returns binary image data. To get the mediaId, extract block.image.token from an image block (block_type=27) returned by get_feishu_document_blocks.',
    {
      mediaId: MediaIdSchema,
      extra: MediaExtraSchema,
    },
    async ({ mediaId, extra = '' }) => {
      try {
        const imageBuffer = await getImageResource(mediaId, extra, feishuService);
        const base64Image = imageBuffer.toString('base64');
        const mimeType = detectMimeType(imageBuffer);
        return { content: [{ type: 'image', mimeType, data: base64Image }] };
      } catch (error) {
        Logger.error(`获取飞书图片资源失败:`, error);
        return errorResponse(`获取飞书图片资源失败: ${formatErrorMessage(error)}`);
      }
    }
  );

  server.tool(
    'upload_and_bind_image_to_block',
    'Uploads images from local paths or URLs and binds them to existing empty image blocks. This tool is used after creating image blocks with batch_create_feishu_blocks tool. It handles uploading the image media and setting the image content to the specified block IDs. Supports local file paths and HTTP/HTTPS URLs. Each image upload and binding is processed independently, and all results are returned in order.',
    {
      documentId: DocumentIdSchema,
      images: ImagesArraySchema,
    },
    async ({ documentId, images }) => {
      try {
        const results = await uploadAndBindImageToBlock({ documentId, images }, feishuService);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      } catch (error) {
        Logger.error(`批量上传图片并绑定到块失败:`, error);
        return errorResponse(`批量上传图片并绑定到块失败: ${formatErrorMessage(error)}`);
      }
    }
  );

  server.tool(
    'create_feishu_table',
    'Creates a table block with specified rows and columns in a Feishu document. Each cell can contain text, list, code, or other block types. ' + WIKI_NOTE,
    {
      documentId: DocumentIdSchema,
      parentBlockId: ParentBlockIdSchema,
      index: IndexSchema,
      tableConfig: TableCreateSchema,
    },
    async ({ documentId, parentBlockId, index = 0, tableConfig }) => {
      try {
        const result = await createTable(
          { documentId, parentBlockId, index, tableConfig },
          feishuService
        );
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        Logger.error(`创建飞书表格失败:`, error);
        return errorResponse(`创建飞书表格失败: ${formatErrorMessage(error)}`);
      }
    }
  );

  server.tool(
    'get_feishu_whiteboard_content',
    'Retrieves the content and structure of a Feishu whiteboard. Use this to analyze whiteboard content, extract information, or understand the structure of collaborative diagrams. The whiteboard ID can be obtained from the board.token field when getting document blocks with block_type: 43.',
    {
      whiteboardId: WhiteboardIdSchema,
    },
    async ({ whiteboardId }) => {
      try {
        const result = await getWhiteboardContent(whiteboardId, feishuService);
        if (result.type === 'thumbnail') {
          return {
            content: [
              { type: 'image', data: result.buffer.toString('base64'), mimeType: 'image/png' },
            ],
          };
        }
        return { content: [{ type: 'text', text: JSON.stringify(result.content, null, 2) }] };
      } catch (error) {
        Logger.error(`获取飞书画板内容失败:`, error);
        return errorResponse(`获取飞书画板内容失败: ${formatErrorMessage(error)}`);
      }
    }
  );

  server.tool(
    'fill_whiteboard_with_plantuml',
    'Fills whiteboard blocks with PlantUML or Mermaid diagram code. Accepts any number of whiteboards. Returns per-item success/failure details.',
    {
      whiteboards: WhiteboardFillArraySchema,
    },
    async ({ whiteboards }) => {
      try {
        const result = await fillWhiteboardWithPlantuml({ whiteboards }, feishuService);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { total: result.total, success: result.success, failed: result.failed, results: result.results },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        Logger.error(`批量填充画板内容失败:`, error);
        return errorResponse(
          `批量填充画板内容失败: ${formatErrorMessage(error)}\n\n错误详情: ${JSON.stringify(error, null, 2)}`
        );
      }
    }
  );
}
