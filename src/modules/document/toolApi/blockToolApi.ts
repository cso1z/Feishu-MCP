import { z } from 'zod';
import { FeishuApiService } from '../../../services/feishuApiService.js';
import { Logger } from '../../../utils/logger.js';
import {
  BlockConfigSchema,
  BlockTextUpdatesArraySchema,
  TableCreateSchema,
  WhiteboardFillArraySchema,
} from '../../../types/documentSchema.js';
import {
  WHITEBOARD_NODE_THUMBNAIL_THRESHOLD,
  BATCH_SIZE,
  prepareBlockContents,
  extractSpecialBlocks,
  buildSpecialBlockHints,
  extractFeishuApiError,
} from '../tools/toolHelpers.js';

export interface BatchUpdateBlockTextParams {
  documentId: string;
  updates: Array<{ blockId: string; textElements: any[] }>;
}

export async function batchUpdateBlockText(
  params: BatchUpdateBlockTextParams,
  api: FeishuApiService
): Promise<{ updatedCount: number; blockIds: string[]; document_revision_id?: string }> {
  const parsed = BlockTextUpdatesArraySchema.safeParse(params.updates);
  if (!parsed.success) throw new Error(`参数校验失败: ${parsed.error.message}`);

  Logger.info(`batchUpdateBlockText invoked: documentId=${params.documentId}, count=${parsed.data.length}`);

  const result = await api.batchUpdateBlocksTextContent(params.documentId, parsed.data);
  return {
    updatedCount: parsed.data.length,
    blockIds: parsed.data.map((u) => u.blockId),
    document_revision_id: (result as any)?.document_revision_id,
  };
}

export interface BatchCreateBlocksParams {
  documentId: string;
  parentBlockId: string;
  index?: number;
  blocks: z.infer<typeof BlockConfigSchema>[];
}

export async function batchCreateBlocks(
  params: BatchCreateBlocksParams,
  api: FeishuApiService
): Promise<{
  totalBlocksCreated: number;
  nextIndex: number;
  document_revision_id?: string;
  imageBlocksInfo?: any;
  whiteboardBlocksInfo?: any;
}> {
  if (typeof params.blocks === 'string') {
    throw new Error(
      '错误：blocks 参数传入了字符串而不是数组，请直接传入 JSON 数组。\n' +
        '正确：blocks:[{blockType:"text",options:{...}}]\n' +
        '错误：blocks:"[{blockType:\\"text\\"...}]"'
    );
  }

  const { documentId, parentBlockId, index = 0, blocks } = params;
  const totalBatches = Math.ceil(blocks.length / BATCH_SIZE);
  const results: any[] = [];
  let createdBlocksCount = 0;
  let currentStartIndex = index;

  Logger.info(`batchCreateBlocks invoked: documentId=${documentId}, blocks=${blocks.length}, batches=${totalBatches}`);

  for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
    const currentBatch = blocks.slice(batchNum * BATCH_SIZE, (batchNum + 1) * BATCH_SIZE);
    const prepared = prepareBlockContents(currentBatch, api);
    if (!prepared.ok) {
      const errText = prepared.error.content?.[0]?.text ?? 'prepareBlockContents failed';
      throw new Error(errText);
    }

    const batchResult = await api.createDocumentBlocks(
      documentId,
      parentBlockId,
      prepared.contents,
      currentStartIndex
    );
    results.push(batchResult);
    createdBlocksCount += prepared.contents.length;
    currentStartIndex = index + createdBlocksCount;
  }

  const allChildren = results.flatMap((r) => r.children ?? []);
  const { imageBlocks, whiteboardBlocks } = extractSpecialBlocks(allChildren);
  const hints = buildSpecialBlockHints(imageBlocks, whiteboardBlocks);

  return {
    totalBlocksCreated: createdBlocksCount,
    nextIndex: currentStartIndex,
    document_revision_id: results[results.length - 1]?.document_revision_id,
    ...hints,
  };
}

export interface DeleteDocumentBlocksParams {
  documentId: string;
  parentBlockId: string;
  startIndex: number;
  endIndex: number;
}

export async function deleteDocumentBlocks(
  params: DeleteDocumentBlocksParams,
  api: FeishuApiService
): Promise<{ deletedRange: { startIndex: number; endIndex: number }; document_revision_id?: string }> {
  Logger.info(
    `deleteDocumentBlocks invoked: documentId=${params.documentId}, range=${params.startIndex}-${params.endIndex}`
  );

  const result = await api.deleteDocumentBlocks(
    params.documentId,
    params.parentBlockId,
    params.startIndex,
    params.endIndex
  );
  return {
    deletedRange: { startIndex: params.startIndex, endIndex: params.endIndex },
    document_revision_id: result.document_revision_id,
  };
}

export async function getImageResource(
  mediaId: string,
  extra: string,
  api: FeishuApiService
): Promise<Buffer> {
  Logger.info(`getImageResource invoked: mediaId=${mediaId}`);

  return api.getImageResource(mediaId, extra);
}

export interface UploadAndBindImageParams {
  documentId: string;
  images: Array<{ blockId: string; imagePathOrUrl: string; fileName?: string }>;
}

export async function uploadAndBindImageToBlock(
  params: UploadAndBindImageParams,
  api: FeishuApiService
): Promise<any[]> {
  Logger.info(`uploadAndBindImageToBlock invoked: documentId=${params.documentId}, count=${params.images.length}`);

  const results: any[] = [];
  for (const { blockId, imagePathOrUrl, fileName } of params.images) {
    try {
      const { base64: imageBase64, fileName: detectedFileName } =
        await api.getImageBase64FromPathOrUrl(imagePathOrUrl);
      const finalFileName = fileName || detectedFileName;

      const uploadResult = await api.uploadImageMedia(imageBase64, finalFileName, blockId);
      if (!uploadResult?.file_token) throw new Error('上传图片素材失败：无法获取file_token');

      const setContentResult = await api.setImageBlockContent(
        params.documentId,
        blockId,
        uploadResult.file_token
      );

      const { client_token: _ct, ...blockResult } = (setContentResult as any)?.block ?? {};
      results.push({
        blockId,
        fileToken: uploadResult.file_token,
        block: blockResult,
        document_revision_id: setContentResult.document_revision_id,
      });
    } catch (err) {
      Logger.error(`上传图片并绑定到块失败 blockId=${blockId}:`, err);
      results.push({ blockId, error: (err as Error).message });
    }
  }
  return results;
}

export interface CreateTableParams {
  documentId: string;
  parentBlockId: string;
  index?: number;
  tableConfig: z.infer<typeof TableCreateSchema>;
}

export async function createTable(
  params: CreateTableParams,
  api: FeishuApiService
): Promise<{
  document_revision_id?: string;
  tableBlockId?: string;
  cells: Array<{ row: number; column: number; cellBlockId: string }>;
  imageBlocks?: any[];
  imageReminder?: string;
}> {
  Logger.info(
    `createTable invoked: documentId=${params.documentId}, size=${params.tableConfig.rowSize}x${params.tableConfig.columnSize}`
  );

  const result = await api.createTableBlock(
    params.documentId,
    params.parentBlockId,
    params.tableConfig,
    params.index ?? 0
  );

  const relations: Array<{ block_id: string; temporary_block_id: string }> =
    result.block_id_relations ?? [];
  const cellMap: Array<{ row: number; column: number; cellBlockId: string }> = [];
  const tableBlockId = relations.find((r: any) => /^table_\d/.test(r.temporary_block_id))?.block_id;
  for (const rel of relations) {
    const m = rel.temporary_block_id.match(/^table_cell(\d+)_(\d+)$/);
    if (m) cellMap.push({ row: Number(m[1]), column: Number(m[2]), cellBlockId: rel.block_id });
  }

  const response: any = {
    document_revision_id: result.document_revision_id,
    tableBlockId,
    cells: cellMap,
  };
  if (result.imageTokens?.length > 0) {
    response.imageBlocks = result.imageTokens.map((t: any) => ({
      row: t.row,
      column: t.column,
      blockId: t.blockId,
    }));
    response.imageReminder =
      'Use upload_and_bind_image_to_block to bind images to the listed blockIds.';
  }
  return response;
}

export type GetWhiteboardContentResult =
  | { type: 'content'; content: any }
  | { type: 'thumbnail'; buffer: Buffer };

export async function getWhiteboardContent(
  whiteboardId: string,
  api: FeishuApiService
): Promise<GetWhiteboardContentResult> {
  Logger.info(`getWhiteboardContent invoked: whiteboardId=${whiteboardId}`);

  const whiteboardContent = await api.getWhiteboardContent(whiteboardId);
  const nodeCount = whiteboardContent.nodes?.length ?? 0;

  if (nodeCount > WHITEBOARD_NODE_THUMBNAIL_THRESHOLD) {
    try {
      const thumbnailBuffer = await api.getWhiteboardThumbnail(whiteboardId);
      return { type: 'thumbnail', buffer: thumbnailBuffer };
    } catch {
      // fallback to content
    }
  }
  return { type: 'content', content: whiteboardContent };
}

export interface FillWhiteboardParams {
  whiteboards: Array<{ whiteboardId: string; code: string; syntax_type: 'plantuml' | 'mermaid' }>;
}

export async function fillWhiteboardWithPlantuml(
  params: FillWhiteboardParams,
  api: FeishuApiService
): Promise<{ total: number; success: number; failed: number; results: any[] }> {
  const parsed = WhiteboardFillArraySchema.safeParse(params.whiteboards);
  if (!parsed.success) throw new Error(`参数校验失败: ${parsed.error.message}`);
  if (parsed.data.length === 0) throw new Error('错误：画板数组不能为空');

  Logger.info(`fillWhiteboardWithPlantuml invoked: count=${parsed.data.length}`);

  const results: any[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const { whiteboardId, code, syntax_type } of parsed.data) {
    const syntaxTypeNumber = syntax_type === 'plantuml' ? 1 : 2;
    const syntaxTypeName = syntax_type === 'plantuml' ? 'PlantUML' : 'Mermaid';

    try {
      const result = await api.createDiagramNode(whiteboardId, code, syntaxTypeNumber);
      successCount++;
      results.push({ whiteboardId, syntaxType: syntaxTypeName, status: 'success', nodeId: result.node_id });
    } catch (err) {
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

  return { total: parsed.data.length, success: successCount, failed: failCount, results };
}
