import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { formatErrorMessage } from '../../../utils/error';
import { FeishuApiService } from '../../../services/feishuApiService';
import { Logger } from '../../../utils/logger';
import { detectMimeType } from '../../../utils/document';
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
} from '../../../types/documentSchema';
import {
  WHITEBOARD_NODE_THUMBNAIL_THRESHOLD,
  BATCH_SIZE,
  WIKI_NOTE,
  errorResponse,
  prepareBlockContents,
  extractSpecialBlocks,
  buildSpecialBlockHints,
  extractFeishuApiError,
} from './toolHelpers';

/**
 * 注册飞书块相关的MCP工具
 */
export function registerBlockTools(server: McpServer, feishuService: FeishuApiService): void {

  // 批量更新块文本内容工具
  server.tool(
    'batch_update_feishu_block_text',
    'Updates text content and styling of multiple document blocks. ' + WIKI_NOTE,
    {
      documentId: DocumentIdSchema,
      updates: BlockTextUpdatesArraySchema,
    },
    async ({ documentId, updates }) => {
      try {
        Logger.info(`开始批量更新飞书块文本，文档ID: ${documentId}，块数量: ${updates.length}`);
        const result = await feishuService.batchUpdateBlocksTextContent(documentId, updates);
        Logger.info(`飞书块文本批量更新成功，共更新 ${updates.length} 个块`);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              updatedCount: updates.length,
              blockIds: updates.map(u => u.blockId),
              document_revision_id: (result as any)?.document_revision_id,
            }, null, 2),
          }],
        };
      } catch (error) {
        Logger.error(`批量更新飞书块文本内容失败:`, error);
        return errorResponse(`批量更新飞书块文本内容失败: ${formatErrorMessage(error)}`);
      }
    },
  );

  // 添加通用飞书块创建工具（支持文本、代码、标题）
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
        // 防御性检查：AI 客户端有时会错误地将数组序列化为字符串传入
        if (typeof blocks === 'string') {
          return errorResponse(
            '错误：blocks 参数传入了字符串而不是数组，请直接传入 JSON 数组。\n' +
            '正确：blocks:[{blockType:"text",options:{...}}]\n' +
            '错误：blocks:"[{blockType:\\"text\\"...}]"',
          );
        }

        const totalBatches = Math.ceil(blocks.length / BATCH_SIZE);
        const results: any[] = [];
        let currentStartIndex = index;
        let createdBlocksCount = 0;

        Logger.info(`开始批量创建飞书块，文档ID: ${documentId}，父块ID: ${parentBlockId}，块数量: ${blocks.length}，分批数: ${totalBatches}`);

        for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
          const currentBatch = blocks.slice(batchNum * BATCH_SIZE, (batchNum + 1) * BATCH_SIZE);
          Logger.info(`处理第 ${batchNum + 1}/${totalBatches} 批，起始位置: ${currentStartIndex}，块数量: ${currentBatch.length}`);

          const prepared = prepareBlockContents(currentBatch, feishuService);
          if (!prepared.ok) return prepared.error;

          try {
            const batchResult = await feishuService.createDocumentBlocks(
              documentId, parentBlockId, prepared.contents, currentStartIndex,
            );
            results.push(batchResult);
            createdBlocksCount += prepared.contents.length;
            currentStartIndex = index + createdBlocksCount;
            Logger.info(`第 ${batchNum + 1}/${totalBatches} 批创建成功，当前已创建 ${createdBlocksCount} 个块`);
          } catch (batchError) {
            Logger.error(`第 ${batchNum + 1}/${totalBatches} 批创建失败:`, batchError);
            return errorResponse(
              `批量创建飞书块失败：已成功创建 ${createdBlocksCount} 个块，还有 ${blocks.length - createdBlocksCount} 个块未能创建。\n\n` +
              `错误信息: ${formatErrorMessage(batchError)}\n\n` +
              `如需继续，请使用 get_feishu_document_blocks 确认当前状态后，从索引位置 ${currentStartIndex} 继续创建剩余块。`,
            );
          }
        }

        Logger.info(`所有批次创建成功，共创建 ${createdBlocksCount} 个块`);
        const allChildren = results.flatMap(r => r.children ?? []);
        const { imageBlocks, whiteboardBlocks } = extractSpecialBlocks(allChildren);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              totalBlocksCreated: createdBlocksCount,
              nextIndex: currentStartIndex,
              document_revision_id: results[results.length - 1]?.document_revision_id,
              ...buildSpecialBlockHints(imageBlocks, whiteboardBlocks),
            }, null, 2),
          }],
        };
      } catch (error) {
        Logger.error(`批量创建飞书块失败:`, error);
        return errorResponse(
          `批量创建飞书块失败: ${formatErrorMessage(error)}\n\n` +
          `建议使用 get_feishu_document_blocks 工具获取文档当前状态，确认是否有部分内容已创建成功。`,
        );
      }
    },
  );

  // 添加删除文档块工具
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
        Logger.info(`开始删除飞书文档块，文档ID: ${documentId}，父块ID: ${parentBlockId}，索引范围: ${startIndex}-${endIndex}`);
        const result = await feishuService.deleteDocumentBlocks(documentId, parentBlockId, startIndex, endIndex);
        Logger.info(`飞书文档块删除成功，文档修订ID: ${result.document_revision_id}`);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              deletedRange: { startIndex, endIndex },
              document_revision_id: result.document_revision_id,
            }, null, 2),
          }],
        };
      } catch (error) {
        Logger.error(`删除飞书文档块失败:`, error);
        return errorResponse(`删除飞书文档块失败: ${formatErrorMessage(error)}`);
      }
    },
  );

  // 添加获取图片资源工具
  server.tool(
    'get_feishu_image_resource',
    'Downloads an image resource from Feishu by its media ID and returns binary image data. To get the mediaId, extract block.image.token from an image block (block_type=27) returned by get_feishu_document_blocks.',
    {
      mediaId: MediaIdSchema,
      extra: MediaExtraSchema,
    },
    async ({ mediaId, extra = '' }) => {
      try {
        Logger.info(`开始获取飞书图片资源，媒体ID: ${mediaId}`);
        const imageBuffer = await feishuService.getImageResource(mediaId, extra);
        Logger.info(`飞书图片资源获取成功，大小: ${imageBuffer.length} 字节`);

        // 将图片数据转为Base64编码，以便在MCP协议中传输
        const base64Image = imageBuffer.toString('base64');
        const mimeType = detectMimeType(imageBuffer);
        return { content: [{ type: 'image', mimeType, data: base64Image }] };
      } catch (error) {
        Logger.error(`获取飞书图片资源失败:`, error);
        return errorResponse(`获取飞书图片资源失败: ${formatErrorMessage(error)}`);
      }
    },
  );

  // 添加图片上传绑定工具
  server.tool(
    'upload_and_bind_image_to_block',
    'Uploads images from local paths or URLs and binds them to existing empty image blocks. This tool is used after creating image blocks with batch_create_feishu_blocks tool. It handles uploading the image media and setting the image content to the specified block IDs. Supports local file paths and HTTP/HTTPS URLs. Each image upload and binding is processed independently, and all results are returned in order.',
    {
      documentId: DocumentIdSchema,
      images: ImagesArraySchema,
    },
    async ({ documentId, images }) => {
      try {
        const results = [];
        for (const { blockId, imagePathOrUrl, fileName } of images) {
          Logger.info(`开始上传图片并绑定到块，文档ID: ${documentId}，块ID: ${blockId}，图片源: ${imagePathOrUrl}`);
          try {
            const { base64: imageBase64, fileName: detectedFileName } = await feishuService.getImageBase64FromPathOrUrl(imagePathOrUrl);
            const finalFileName = fileName || detectedFileName;

            Logger.info('第1步：上传图片素材');
            const uploadResult = await feishuService.uploadImageMedia(imageBase64, finalFileName, blockId);
            if (!uploadResult?.file_token) {
              throw new Error('上传图片素材失败：无法获取file_token');
            }
            Logger.info(`图片素材上传成功，file_token: ${uploadResult.file_token}`);

            Logger.info('第2步：设置图片块内容');
            const setContentResult = await feishuService.setImageBlockContent(documentId, blockId, uploadResult.file_token);
            Logger.info('图片上传并绑定完成');

            const { client_token: _ct, ...blockResult } = (setContentResult as any)?.block ?? {};
            results.push({
              blockId,
              fileToken: uploadResult.file_token,
              block: blockResult,
              document_revision_id: setContentResult.document_revision_id,
            });
          } catch (err) {
            Logger.error(`上传图片并绑定到块失败:`, err);
            results.push({ blockId, error: formatErrorMessage(err) });
          }
        }
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      } catch (error) {
        Logger.error(`批量上传图片并绑定到块失败:`, error);
        return errorResponse(`批量上传图片并绑定到块失败: ${formatErrorMessage(error)}`);
      }
    },
  );

  // 添加创建飞书表格工具
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
        Logger.info(`开始创建飞书表格，文档ID: ${documentId}，父块ID: ${parentBlockId}，表格大小: ${tableConfig.rowSize}x${tableConfig.columnSize}，插入位置: ${index}`);
        const result = await feishuService.createTableBlock(documentId, parentBlockId, tableConfig, index);

        // 从 block_id_relations 中提取坐标 → cellBlockId 的映射（排除子块和表格本身）
        const relations: Array<{ block_id: string; temporary_block_id: string }> = result.block_id_relations ?? [];
        const cellMap: Array<{ row: number; column: number; cellBlockId: string }> = [];
        const tableBlockId = relations.find((r: any) => /^table_\d/.test(r.temporary_block_id))?.block_id;
        for (const rel of relations) {
          const m = rel.temporary_block_id.match(/^table_cell(\d+)_(\d+)$/);
          if (m) cellMap.push({ row: Number(m[1]), column: Number(m[2]), cellBlockId: rel.block_id });
        }

        const response: Record<string, unknown> = {
          document_revision_id: result.document_revision_id,
          tableBlockId,
          cells: cellMap,
        };
        if (result.imageTokens?.length > 0) {
          response.imageBlocks = result.imageTokens.map((t: any) => ({
            row: t.row, column: t.column, blockId: t.blockId,
          }));
          response.imageReminder = 'Use upload_and_bind_image_to_block to bind images to the listed blockIds.';
        }
        return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
      } catch (error) {
        Logger.error(`创建飞书表格失败:`, error);
        return errorResponse(`创建飞书表格失败: ${formatErrorMessage(error)}`);
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
        Logger.info(`开始获取飞书画板内容，画板ID: ${whiteboardId}`);
        const whiteboardContent = await feishuService.getWhiteboardContent(whiteboardId);
        const nodeCount = whiteboardContent.nodes?.length ?? 0;
        Logger.info(`飞书画板内容获取成功，节点数量: ${nodeCount}`);

        if (nodeCount > WHITEBOARD_NODE_THUMBNAIL_THRESHOLD) {
          Logger.info(`画板节点数量过多 (${nodeCount} > ${WHITEBOARD_NODE_THUMBNAIL_THRESHOLD})，返回缩略图`);
          try {
            const thumbnailBuffer = await feishuService.getWhiteboardThumbnail(whiteboardId);
            return {
              content: [{ type: 'image', data: thumbnailBuffer.toString('base64'), mimeType: 'image/png' }],
            };
          } catch (thumbnailError) {
            Logger.warn(`获取画板缩略图失败，返回基本信息: ${thumbnailError}`);
          }
        }

        return { content: [{ type: 'text', text: JSON.stringify(whiteboardContent, null, 2) }] };
      } catch (error) {
        Logger.error(`获取飞书画板内容失败:`, error);
        return errorResponse(`获取飞书画板内容失败: ${formatErrorMessage(error)}`);
      }
    },
  );

  // 添加批量填充画板工具（支持 PlantUML 和 Mermaid）
  server.tool(
    'fill_whiteboard_with_plantuml',
    'Fills whiteboard blocks with PlantUML or Mermaid diagram code. Accepts any number of whiteboards. Returns per-item success/failure details.',
    {
      whiteboards: WhiteboardFillArraySchema,
    },
    async ({ whiteboards }) => {
      try {
        if (whiteboards.length === 0) {
          return errorResponse('错误：画板数组不能为空');
        }

        Logger.info(`开始批量填充画板内容，共 ${whiteboards.length} 个画板`);
        const results = [];
        let successCount = 0;
        let failCount = 0;

        for (const [i, { whiteboardId, code, syntax_type }] of whiteboards.entries()) {
          const syntaxTypeNumber = syntax_type === 'plantuml' ? 1 : 2;
          const syntaxTypeName = syntax_type === 'plantuml' ? 'PlantUML' : 'Mermaid';
          Logger.info(`处理第 ${i + 1}/${whiteboards.length} 个画板，画板ID: ${whiteboardId}，语法类型: ${syntaxTypeName}`);

          try {
            const result = await feishuService.createDiagramNode(whiteboardId, code, syntaxTypeNumber);
            Logger.info(`画板填充成功，画板ID: ${whiteboardId}`);
            successCount++;
            results.push({ whiteboardId, syntaxType: syntaxTypeName, status: 'success', nodeId: result.node_id });
          } catch (err: unknown) {
            Logger.error(`画板填充失败，画板ID: ${whiteboardId}`, err);
            failCount++;
            const { message, code: errorCode, logId } = extractFeishuApiError(err);
            results.push({
              whiteboardId,
              syntaxType: syntaxTypeName,
              status: 'failed',
              error: { message, code: errorCode, logId },
            });
          }
        }

        Logger.info(`批量填充画板完成，成功: ${successCount}，失败: ${failCount}`);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ total: whiteboards.length, success: successCount, failed: failCount, results }, null, 2),
          }],
        };
      } catch (error: unknown) {
        Logger.error(`批量填充画板内容失败:`, error);
        return errorResponse(`批量填充画板内容失败: ${formatErrorMessage(error)}\n\n错误详情: ${JSON.stringify(error, null, 2)}`);
      }
    },
  );
}
