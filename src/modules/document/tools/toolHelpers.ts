import { z } from 'zod';
import { formatErrorMessage } from '../../../utils/error.js';
import { FeishuApiService } from '../../../services/feishuApiService.js';
import { Logger } from '../../../utils/logger.js';
import { BlockConfigSchema } from '../../../types/documentSchema.js';

export const WHITEBOARD_NODE_THUMBNAIL_THRESHOLD = 200;
export const BATCH_SIZE = 50;

/** wiki 链接转换提示，在所有需要 documentId 的编辑类工具中复用 */
export const WIKI_NOTE =
  'For Feishu wiki links (https://xxx.feishu.cn/wiki/xxx), ' +
  'use get_feishu_document_info first to obtain the documentId, then use that ID for editing operations.';

const BLOCK_TYPE_IMAGE = 27;
const BLOCK_TYPE_WHITEBOARD = 43;

// ---------------------------------------------------------------------------
// 响应类型
// ---------------------------------------------------------------------------

export type McpTextResponse = { content: [{ type: 'text'; text: string }] };

export function errorResponse(text: string): McpTextResponse {
  return { content: [{ type: 'text', text }] };
}

// ---------------------------------------------------------------------------
// 参数校验
// ---------------------------------------------------------------------------

/**
 * 校验 folderToken 与 wikiContext 的互斥关系（文件夹模式 vs 知识库模式）。
 * 返回 null 表示校验通过，否则返回可直接 return 的错误响应。
 */
export function validateFolderOrWikiContext(
  folderToken: string | undefined,
  wikiContext: unknown | undefined,
): McpTextResponse | null {
  if (folderToken && wikiContext) {
    return errorResponse(
      '错误：不能同时提供 folderToken 和 wikiContext 参数，请选择其中一种模式。\n' +
      '- 使用 folderToken 在飞书文档目录中操作\n' +
      '- 使用 wikiContext 在知识库中操作',
    );
  }
  if (!folderToken && !wikiContext) {
    return errorResponse(
      '错误：必须提供 folderToken（飞书文档目录模式）或 wikiContext（知识库节点模式）参数之一。',
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// 块内容准备
// ---------------------------------------------------------------------------

/** 与 BlockConfigSchema 保持同步的推断类型 */
export type BlockConfig = z.infer<typeof BlockConfigSchema>;

/** 块内容准备成功时的结果 */
type PrepareOk = { ok: true; contents: any[] };
/** 块内容准备失败时的结果（含可直接 return 的错误响应） */
type PrepareErr = { ok: false; error: McpTextResponse };
export type PrepareBlockResult = PrepareOk | PrepareErr;

/**
 * 将 BlockConfig 数组转换为飞书 API 所需的块内容数组。
 * 遇到单个块处理失败时立即终止。
 *
 * 注：contents 类型为 any[] 以匹配 FeishuApiService.createDocumentBlocks 的参数类型。
 */
export function prepareBlockContents(
  configs: BlockConfig[],
  feishuService: FeishuApiService,
): PrepareBlockResult {
  const contents: any[] = [];
  for (const { blockType, options = {} } of configs) {
    try {
      const blockContent = feishuService.createBlockContent(blockType, options);
      if (blockContent) {
        contents.push(blockContent);
        Logger.info(`已准备 ${blockType} 块，内容: ${JSON.stringify(blockContent).substring(0, 100)}...`);
      } else {
        Logger.warn(`创建 ${blockType} 块失败，跳过此块`);
      }
    } catch (err) {
      Logger.error(`处理块类型 ${blockType} 时出错: ${err}`);
      return {
        ok: false,
        error: errorResponse(`处理块类型"${blockType}"时出错: ${err}\n请检查该块类型的配置是否正确。`),
      };
    }
  }
  return { ok: true, contents };
}

// ---------------------------------------------------------------------------
// 特殊块提取与提示
// ---------------------------------------------------------------------------

/**
 * 从块列表中提取图片块（block_type=27）和画板块（block_type=43）。
 */
export function extractSpecialBlocks(blocks: any[]): { imageBlocks: any[]; whiteboardBlocks: any[] } {
  return {
    imageBlocks: blocks.filter(b => b.block_type === BLOCK_TYPE_IMAGE),
    whiteboardBlocks: blocks.filter(b => b.block_type === BLOCK_TYPE_WHITEBOARD),
  };
}

/**
 * 构建特殊块的 JSON 提示对象，用于展开合并到 JSON 响应中。
 */
export function buildSpecialBlockHints(
  imageBlocks: any[],
  whiteboardBlocks: any[],
): Record<string, unknown> {
  const hints: Record<string, unknown> = {};

  if (imageBlocks.length > 0) {
    hints.imageBlocksInfo = {
      count: imageBlocks.length,
      blockIds: imageBlocks.map(b => b.block_id),
      reminder: '检测到图片块已创建！请使用 upload_and_bind_image_to_block 工具上传图片并绑定到对应的块ID。',
    };
  }

  if (whiteboardBlocks.length > 0) {
    hints.whiteboardBlocksInfo = {
      count: whiteboardBlocks.length,
      blocks: whiteboardBlocks.map(b => ({
        blockId: b.block_id,
        token: b.board?.token,
        align: b.board?.align,
      })),
      reminder: '检测到画板块已创建！请使用 fill_whiteboard_with_plantuml 工具填充画板内容，使用返回的 token 作为 whiteboardId 参数。支持 PlantUML (syntax_type: "plantuml") 和 Mermaid (syntax_type: "mermaid") 两种格式。',
    };
  }

  return hints;
}

/**
 * 构建文本形式的特殊块提示，追加到现有响应文本后。
 */
export function appendSpecialBlockTextHints(
  base: string,
  imageBlocks: any[],
  whiteboardBlocks: any[],
): string {
  const sections: string[] = [base];

  if (imageBlocks.length > 0) {
    const lines = [
      `\n\n🖼️ 检测到 ${imageBlocks.length} 个图片块 (block_type: 27)！`,
      '💡 提示：如需查看图片内容，可使用 get_feishu_image_resource 工具下载图片。',
      '图片信息:',
      ...imageBlocks.map((b, idx) => {
        const parts = [`  ${idx + 1}. 块ID: ${b.block_id}`];
        if (b.image?.token) parts.push(`媒体ID: ${b.image.token}`);
        return parts.join('，');
      }),
      '📝 注意：只有在需要查看图片内容时才调用上述工具，仅了解文档结构时无需获取。',
    ];
    sections.push(lines.join('\n'));
  }

  if (whiteboardBlocks.length > 0) {
    const lines = [
      `\n\n⚠️ 检测到 ${whiteboardBlocks.length} 个画板块 (block_type: 43)！`,
      '💡 提示：如需获取画板具体内容，可使用 get_feishu_whiteboard_content 工具。',
      '画板信息:',
      ...whiteboardBlocks.map((b, idx) => {
        const parts = [`  ${idx + 1}. 块ID: ${b.block_id}`];
        if (b.board?.token) parts.push(`画板ID: ${b.board.token}`);
        return parts.join('，');
      }),
      '📝 注意：只有在需要分析画板内容时才调用上述工具，仅了解文档结构时无需获取。',
    ];
    sections.push(lines.join('\n'));
  }

  return sections.join('');
}

// ---------------------------------------------------------------------------
// 飞书 API 错误信息提取
// ---------------------------------------------------------------------------

export interface FeishuApiErrorInfo {
  message: string;
  code?: number;
  logId?: string;
}

/**
 * 从飞书 API 抛出的错误对象中提取结构化错误信息。
 * 飞书 API 错误可能包含 apiError.code / apiError.msg / apiError.log_id 等字段。
 */
export function extractFeishuApiError(err: unknown): FeishuApiErrorInfo {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const apiError = e.apiError as Record<string, unknown> | undefined;
    if (apiError && apiError.code !== undefined && apiError.msg) {
      return {
        message: String(apiError.msg),
        code: Number(apiError.code),
        logId: apiError.log_id != null ? String(apiError.log_id) : undefined,
      };
    }
    if (typeof e.err === 'string') return { message: e.err };
    if (typeof e.message === 'string') return { message: e.message };
  }
  return { message: formatErrorMessage(err) };
}
