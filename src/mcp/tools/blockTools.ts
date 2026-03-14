import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { formatErrorMessage } from '../../utils/error.js';
import { FeishuApiService } from '../../services/feishuApiService.js';
import { Logger } from '../../utils/logger.js';
import { detectMimeType } from '../../utils/document.js';
import {
  DocumentIdSchema,
  ParentBlockIdSchema,
  BlockIdSchema,
  IndexSchema,
  StartIndexSchema,
  EndIndexSchema,
  TextElementsArraySchema,
  BlockConfigSchema,
  MediaIdSchema,
  MediaExtraSchema,
  ImagesArraySchema,
  TableCreateSchema,
  WhiteboardFillArraySchema,
  WhiteboardIdSchema,
} from '../../types/feishuSchema.js';
import {
  WHITEBOARD_NODE_THUMBNAIL_THRESHOLD,
  BATCH_SIZE,
  errorResponse,
  prepareBlockContents,
  extractSpecialBlocks,
  buildSpecialBlockHints,
  extractFeishuApiError,
} from './toolHelpers.js';

/**
 * 注册飞书块相关的MCP工具
 */
export function registerBlockTools(server: McpServer, feishuService: FeishuApiService): void {

  // 添加更新块文本内容工具
  server.tool(
    'update_feishu_block_text',
    'Updates the text content and styling of a specific block in a Feishu document. Can be used to modify content in existing text, code, or heading blocks while preserving the block type and other properties. Note: For Feishu wiki links (https://xxx.feishu.cn/wiki/xxx), use get_feishu_document_info to get document information, then use the returned documentId for editing operations.',
    {
      documentId: DocumentIdSchema,
      blockId: BlockIdSchema,
      textElements: TextElementsArraySchema,
    },
    async ({ documentId, blockId, textElements }) => {
      try {
        Logger.info(`开始更新飞书块文本内容，文档ID: ${documentId}，块ID: ${blockId}`);
        const result = await feishuService.updateBlockTextContent(documentId, blockId, textElements);
        Logger.info(`飞书块文本内容更新成功`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        Logger.error(`更新飞书块文本内容失败:`, error);
        return errorResponse(`更新飞书块文本内容失败: ${formatErrorMessage(error)}`);
      }
    },
  );

  // 添加通用飞书块创建工具（支持文本、代码、标题）
  server.tool(
    'batch_create_feishu_blocks',
    'PREFERRED: Efficiently creates multiple blocks (text, code, heading, list, image, mermaid, whiteboard) in a single API call. USE THIS TOOL when creating multiple consecutive blocks at the same position - reduces API calls by up to 90%. KEY FEATURES: (1) Handles any number of blocks by auto-batching large requests (>50 blocks), (2) Creates blocks at consecutive positions in a document, (3) Supports direct heading level format (e.g. "heading1", "heading2") or standard "heading" type with level in options. CORRECT FORMAT: mcp_feishu_batch_create_feishu_blocks({documentId:"doc123",parentBlockId:"para123",startIndex:0,blocks:[{blockType:"text",options:{...}},{blockType:"heading1",options:{heading:{content:"Title"}}}]}). For whiteboard blocks, use blockType:"whiteboard" with options:{whiteboard:{align:1}}. After creating a whiteboard block, you will receive a token in the response (board.token field) which can be used with fill_whiteboard_with_plantuml tool. The fill_whiteboard_with_plantuml tool supports both PlantUML (syntax_type: 1) and Mermaid (syntax_type: 2) formats. For separate positions, use individual block creation tools instead. For wiki links (https://xxx.feishu.cn/wiki/xxx), use get_feishu_document_info to get document information, then use the returned documentId for editing operations.',
    {
      documentId: DocumentIdSchema,
      parentBlockId: ParentBlockIdSchema,
      index: IndexSchema,
      blocks: z.array(BlockConfigSchema).describe('Array of block configurations. CRITICAL: Must be a JSON array object, NOT a string. CORRECT: blocks:[{...}] - WITHOUT quotes around array. INCORRECT: blocks:"[{...}]". Example: [{blockType:"text",options:{text:{textStyles:[{text:"Hello",style:{bold:true}}]}}},{blockType:"heading1",options:{heading:{content:"My Title"}}}]. Auto-batches requests when exceeding 50 blocks.'),
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
              `批量创建飞书块部分失败：第 ${batchNum + 1}/${totalBatches} 批处理时出错。\n\n` +
              `已成功创建 ${createdBlocksCount} 个块，还有 ${blocks.length - createdBlocksCount} 个块未能创建。\n\n` +
              `错误信息: ${formatErrorMessage(batchError)}\n\n` +
              `建议使用 get_feishu_document_blocks 工具获取文档最新状态，确认已创建的内容，然后从索引位置 ${currentStartIndex} 继续创建剩余块。`,
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
              totalBatches,
              totalBlocksCreated: createdBlocksCount,
              nextIndex: currentStartIndex,
              ...results[results.length - 1],
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
    'Deletes one or more consecutive blocks from a Feishu document. Use this tool to remove unwanted content, clean up document structure, or clear space before inserting new content. Supports batch deletion for efficiency. Note: For Feishu wiki links (https://xxx.feishu.cn/wiki/xxx), use get_feishu_document_info to get document information, then use the returned documentId for editing operations.',
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
        return { content: [{ type: 'text', text: `块删除成功，索引范围: ${startIndex} 至 ${endIndex - 1}` }] };
      } catch (error) {
        Logger.error(`删除飞书文档块失败:`, error);
        return errorResponse(`删除飞书文档块失败: ${formatErrorMessage(error)}`);
      }
    },
  );

  // 添加获取图片资源工具
  server.tool(
    'get_feishu_image_resource',
    'Downloads an image resource from Feishu by its media ID. Use this to retrieve images referenced in document blocks or other Feishu resources. Returns the binary image data that can be saved or processed further. For example, extract the media_id from an image block in a document, then use this tool to download the actual image.',
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

            results.push({
              blockId,
              fileToken: uploadResult.file_token,
              uploadResult,
              setContentResult,
              documentRevisionId: setContentResult.document_revision_id,
            });
          } catch (err) {
            Logger.error(`上传图片并绑定到块失败:`, err);
            results.push({ blockId, error: err instanceof Error ? err.message : String(err) });
          }
        }
        return { content: [{ type: 'text', text: `批量图片上传绑定结果：\n${JSON.stringify(results, null, 2)}` }] };
      } catch (error) {
        Logger.error(`批量上传图片并绑定到块失败:`, error);
        return errorResponse(`批量上传图片并绑定到块失败: ${formatErrorMessage(error)}`);
      }
    },
  );

  // 添加创建飞书表格工具
  server.tool(
    'create_feishu_table',
    'Creates a table block in a Feishu document with specified rows and columns. Each cell can contain different types of content blocks (text, lists, code, etc.). This tool creates the complete table structure including table cells and their content. Note: For Feishu wiki links (https://xxx.feishu.cn/wiki/xxx), use get_feishu_document_info to get document information, then use the returned documentId for editing operations.',
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

        let resultText = `表格创建成功！\n\n表格大小: ${tableConfig.rowSize}x${tableConfig.columnSize}\n`;
        if (result.imageTokens && result.imageTokens.length > 0) {
          resultText += `\n\n📸 发现 ${result.imageTokens.length} 个图片:\n`;
          result.imageTokens.forEach((imageToken: any, idx: number) => {
            resultText += `${idx + 1}. 坐标(${imageToken.row}, ${imageToken.column}) - blockId: ${imageToken.blockId}\n`;
          });
          resultText += '你需要使用 upload_and_bind_image_to_block 工具绑定图片';
        }
        resultText += `\n\n完整结果:\n${JSON.stringify(result, null, 2)}`;
        return { content: [{ type: 'text', text: resultText }] };
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
    'Batch fills multiple whiteboard blocks with diagram content (PlantUML or Mermaid). Use this tool after creating whiteboard blocks with batch_create_feishu_blocks tool. Each item in the array should contain whiteboardId (the token from board.token field), code and syntax_type. Supports both PlantUML (syntax_type: 1) and Mermaid (syntax_type: 2) formats. Returns detailed results including which whiteboards were filled successfully and which failed, along with failure reasons. The same whiteboard can be filled multiple times.',
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
          const syntaxTypeName = syntax_type === 1 ? 'PlantUML' : 'Mermaid';
          Logger.info(`处理第 ${i + 1}/${whiteboards.length} 个画板，画板ID: ${whiteboardId}，语法类型: ${syntaxTypeName}`);

          try {
            const result = await feishuService.createDiagramNode(whiteboardId, code, syntax_type);
            Logger.info(`画板填充成功，画板ID: ${whiteboardId}`);
            successCount++;
            results.push({ whiteboardId, syntaxType: syntaxTypeName, status: 'success', nodeId: result.node_id, result });
          } catch (err: unknown) {
            Logger.error(`画板填充失败，画板ID: ${whiteboardId}`, err);
            failCount++;
            const { message, code: errorCode, logId } = extractFeishuApiError(err);
            results.push({
              whiteboardId,
              syntaxType: syntaxTypeName,
              status: 'failed',
              error: { message, code: errorCode, logId, details: err },
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
