import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { FeishuApiService } from '../../../services/feishuApiService.js';
import { Logger } from '../../../utils/logger.js';
import { formatErrorMessage } from '../../../utils/error.js';
import { UserContextManager } from '../../../utils/auth/index.js';
import {
  MARKDOWN_IMPORT_MAX_RETRIES,
  getMarkdownImportRetryDelayMs,
} from '../services/markdownImportConfig.js';
import { extractSpecialBlocks, appendSpecialBlockTextHints } from '../tools/toolHelpers.js';

export interface CreateDocumentParams {
  title: string;
  folderToken?: string;
  wikiContext?: { spaceId: string; parentNodeToken?: string };
}

/**
 * 创建飞书文档（文件夹模式或知识库节点模式）
 */
export async function createDocument(params: CreateDocumentParams, api: FeishuApiService): Promise<any> {
  const { title, folderToken, wikiContext } = params;
  const wikiSpaceId = wikiContext?.spaceId?.trim();
  const hasWikiMode = !!wikiSpaceId;

  if (folderToken && hasWikiMode) {
    throw new Error(
      '错误：不能同时提供 folderToken 和 wikiContext 参数，请选择其中一种模式。\n' +
        '- 使用 folderToken 在飞书文档目录中操作\n' +
        '- 使用 wikiContext 在知识库中操作'
    );
  }
  if (!folderToken && !hasWikiMode) {
    throw new Error('错误：必须提供 folderToken（飞书文档目录模式）或 wikiContext（知识库节点模式）参数之一。');
  }

  if (folderToken) {
    Logger.info(`createDocument invoked: folder mode, title=${title}`);
    const newDoc = await api.createDocument(title, folderToken);
    if (!newDoc) throw new Error('创建文档失败，未返回文档信息');
    return newDoc;
  }

  if (!wikiContext || !wikiSpaceId) {
    throw new Error('错误：使用 wikiContext 模式时，必须提供 spaceId。');
  }
  const { parentNodeToken } = wikiContext;

  Logger.info(`createDocument invoked: wiki mode, title=${title}, spaceId=${wikiSpaceId}`);
  const node = await api.createWikiSpaceNode(wikiSpaceId, title, parentNodeToken);
  if (!node) throw new Error('创建知识库节点失败，未返回节点信息');

  return {
    ...node,
    _note: '知识库节点既是节点又是文档：node_token 可作为父节点使用，obj_token 可用于文档编辑操作',
  };
}

export interface ImportMarkdownToFeishuDocumentParams {
  title?: string;
  markdown?: string;
  localPath?: string;
  folderToken?: string;
  wikiContext?: { spaceId: string; parentNodeToken?: string };
  fileName?: string;
}

export interface WikiMoveRecoveryInfo {
  stage: 'wiki_move';
  document: {
    token: string;
    url?: string;
  };
  wikiContext: {
    spaceId: string;
    parentNodeToken?: string;
  };
  taskId?: string;
  status?: number | string;
  statusMessage?: string;
}

export class WikiMovePartialFailureError extends Error {
  public readonly recovery: WikiMoveRecoveryInfo;

  constructor(message: string, recovery: WikiMoveRecoveryInfo) {
    super(message);
    this.name = 'WikiMovePartialFailureError';
    this.recovery = recovery;
  }
}

export type MarkdownImportRuntimeMode = 'cli' | 'stdio' | 'http';

export interface ImportMarkdownToolOptions {
  runtimeMode?: MarkdownImportRuntimeMode;
}

export async function importMarkdownToFeishuDocument(
  params: ImportMarkdownToFeishuDocumentParams,
  api: FeishuApiService,
  options: ImportMarkdownToolOptions = {},
): Promise<any> {
  const runtimeMode = resolveMarkdownImportRuntimeMode(options.runtimeMode);
  const hasMarkdown =
    typeof params.markdown === 'string' && params.markdown.length > 0;
  const hasLocalPath =
    typeof params.localPath === 'string' && params.localPath.trim().length > 0;

  if (hasMarkdown === hasLocalPath) {
    throw new Error(
      'Invalid parameters: provide exactly one of markdown or localPath.',
    );
  }
  if (runtimeMode === 'http' && hasLocalPath) {
    throw new Error(
      'Invalid parameters: HTTP mode does not support localPath; provide markdown content directly.',
    );
  }

  const wikiSpaceId = params.wikiContext?.spaceId?.trim();
  const hasWikiMode = Boolean(wikiSpaceId);
  if (params.folderToken && hasWikiMode) {
    throw new Error(
      '错误：不能同时提供 folderToken 和 wikiContext 参数，请选择其中一种模式。\n' +
        '- 使用 folderToken 在飞书文档目录中导入\n' +
        '- 使用 wikiContext 将文档导入知识库',
    );
  }

  const source = hasLocalPath
    ? await loadMarkdownFromLocalPath(
        params.localPath as string,
        params.title,
        params.fileName,
      )
    : buildMarkdownSource(
        params.markdown as string,
        params.title,
        params.fileName,
      );

  Logger.info(
    `importMarkdownToFeishuDocument invoked: runtime=${runtimeMode}, title=${source.title}`,
  );

  const importedDocument = await api.importMarkdownToDocument({
    title: source.title,
    markdown: source.markdown,
    folderToken: hasWikiMode ? '' : params.folderToken ?? '',
    fileName: source.fileName,
  });

  if (!wikiSpaceId) return importedDocument;
  if (!importedDocument?.token) {
    throw new Error('Markdown 导入完成但未返回文档 token，无法移动到知识库');
  }

  const wikiContext = {
    spaceId: wikiSpaceId,
    parentNodeToken: params.wikiContext?.parentNodeToken,
  };

  let moveResponse: any;
  try {
    moveResponse = await api.moveDocumentToWiki(
      wikiSpaceId,
      importedDocument.token,
      params.wikiContext?.parentNodeToken,
    );
  } catch (error) {
    throw createWikiMovePartialFailureError(
      `移动文档到知识库请求失败：${getErrorMessage(error)}`,
      importedDocument,
      wikiContext,
    );
  }

  return completeWikiMove(
    importedDocument,
    moveResponse,
    api,
    wikiContext,
  );
}

async function completeWikiMove(
  importedDocument: any,
  moveResponse: any,
  api: FeishuApiService,
  wikiContext: WikiMoveRecoveryInfo['wikiContext'],
): Promise<any> {
  const immediateWikiToken = moveResponse?.wiki_token;
  if (immediateWikiToken) {
    return {
      ...importedDocument,
      wikiToken: immediateWikiToken,
    };
  }

  const taskId = moveResponse?.task_id;
  if (!taskId) {
    throw createWikiMovePartialFailureError(
      '移动文档到知识库失败，未返回 wiki_token 或 task_id',
      importedDocument,
      wikiContext,
    );
  }

  let lastStatusMessage: string | undefined;
  let lastStatus: number | string | undefined;
  for (
    let attempt = 0;
    attempt < MARKDOWN_IMPORT_MAX_RETRIES;
    attempt++
  ) {
    let taskResponse: any;
    try {
      taskResponse = await api.getWikiTaskResult(taskId);
    } catch (error) {
      throw createWikiMovePartialFailureError(
        `查询知识库移动任务失败：${getErrorMessage(error)}`,
        importedDocument,
        wikiContext,
        { taskId, status: lastStatus, statusMessage: getErrorMessage(error) },
      );
    }
    const task = taskResponse?.task ?? taskResponse;
    const moveResult = task?.move_result?.[0];
    const status = moveResult?.status ?? task?.status;
    const statusMessage = moveResult?.status_msg ?? task?.status_msg;
    lastStatus = status;
    lastStatusMessage = statusMessage;

    if (status === 0) {
      const wikiToken = extractWikiToken(task);
      if (!wikiToken) {
        throw createWikiMovePartialFailureError(
          '知识库移动任务完成但未返回 wiki token',
          importedDocument,
          wikiContext,
          { taskId, status, statusMessage },
        );
      }
      return {
        ...importedDocument,
        wikiToken,
        wikiTaskId: taskId,
        wikiMoveResult: task,
      };
    }

    if (status !== undefined && status !== null && status !== 1) {
      throw createWikiMovePartialFailureError(
        `移动文档到知识库失败，status=${status}，错误：${statusMessage || '未知错误'}`,
        importedDocument,
        wikiContext,
        { taskId, status, statusMessage },
      );
    }

    if (attempt < MARKDOWN_IMPORT_MAX_RETRIES - 1) {
      await sleep(getMarkdownImportRetryDelayMs(attempt));
    }
  }

  throw createWikiMovePartialFailureError(
    `移动文档到知识库超时：${MARKDOWN_IMPORT_MAX_RETRIES} 次轮询后仍未完成${
      lastStatusMessage ? `，当前状态：${lastStatusMessage}` : ''
    }`,
    importedDocument,
    wikiContext,
    {
      taskId,
      status: lastStatus,
      statusMessage: lastStatusMessage,
    },
  );
}

function createWikiMovePartialFailureError(
  message: string,
  importedDocument: { token: string; url?: string },
  wikiContext: WikiMoveRecoveryInfo['wikiContext'],
  details: Pick<WikiMoveRecoveryInfo, 'taskId' | 'status' | 'statusMessage'> = {},
): WikiMovePartialFailureError {
  return new WikiMovePartialFailureError(message, {
    stage: 'wiki_move',
    document: {
      token: importedDocument.token,
      url: importedDocument.url,
    },
    wikiContext,
    ...details,
  });
}

function getErrorMessage(error: unknown): string {
  return formatErrorMessage(error);
}

function extractWikiToken(task: any): string | undefined {
  return (
    task?.wiki_token ||
    task?.move_result?.[0]?.node?.node_token ||
    task?.move_result?.[0]?.wiki_token
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveMarkdownImportRuntimeMode(
  runtimeMode?: MarkdownImportRuntimeMode,
): MarkdownImportRuntimeMode {
  if (runtimeMode) return runtimeMode;

  const userContextManager = UserContextManager.getInstance();
  if (userContextManager.hasContext()) {
    return userContextManager.getUserKeyMode() === 'http' ? 'http' : 'stdio';
  }

  if (process.env.NODE_ENV === 'cli') return 'cli';
  if (process.argv.includes('--stdio')) return 'stdio';
  return 'http';
}

async function loadMarkdownFromLocalPath(
  localPath: string,
  title?: string,
  fileName?: string,
): Promise<{ markdown: string; title: string; fileName: string }> {
  const fileStats = await stat(localPath);
  const limitBytes = 20 * 1024 * 1024;
  if (fileStats.size > limitBytes) {
    throw new Error(
      `File exceeds 20 MB upload limit (${(fileStats.size / 1024 / 1024).toFixed(1)} MB): ${localPath}`,
    );
  }
  const markdown = await readFile(localPath, 'utf8');
  const rawFileName = fileName || basename(localPath);
  const derivedTitle =
    title || basename(rawFileName, extname(rawFileName));
  return {
    markdown,
    title: ensureRequiredTitle(derivedTitle),
    fileName: ensureMarkdownFileName(sanitizeFileNameBase(rawFileName) || 'Imported Markdown'),
  };
}

function buildMarkdownSource(
  markdown: string,
  title?: string,
  fileName?: string,
): { markdown: string; title: string; fileName: string } {
  const finalTitle = ensureRequiredTitle(
    title || deriveTitleFromMarkdown(markdown),
  );
  return {
    markdown,
    title: finalTitle,
    fileName: fileName
      ? ensureMarkdownFileName(sanitizeFileNameBase(fileName) || 'Imported Markdown')
      : buildDefaultMarkdownFileName(finalTitle),
  };
}

function ensureRequiredTitle(title?: string): string {
  const trimmed = title?.trim();
  if (!trimmed) {
    throw new Error(
      'Unable to derive a document title; provide title explicitly or add a Markdown heading.',
    );
  }
  return trimmed;
}

function deriveTitleFromMarkdown(markdown: string): string {
  const headingMatch = markdown.match(/^#{1,6}\s+(.+?)\s*#*\s*$/m);
  return headingMatch?.[1]?.trim() || 'Imported Markdown';
}

function sanitizeFileNameBase(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/^[.\s-]+|[.\s-]+$/g, '')
    .trim();
}

function buildDefaultMarkdownFileName(title: string): string {
  return ensureMarkdownFileName(sanitizeFileNameBase(title) || 'Imported Markdown');
}

function ensureMarkdownFileName(fileName: string): string {
  return extname(fileName).toLowerCase() === '.md'
    ? fileName
    : `${fileName}.md`;
}

export interface GetDocumentInfoParams {
  documentId: string;
  documentType?: 'document' | 'wiki';
}

/**
 * 获取飞书文档信息（支持普通文档和 Wiki 文档）
 */
export async function getDocumentInfo(params: GetDocumentInfoParams, api: FeishuApiService): Promise<any> {
  const { documentId, documentType } = params;

  Logger.info(`getDocumentInfo invoked: documentId=${documentId}, type=${documentType ?? 'auto'}`);

  const docInfo = await api.getDocumentInfo(documentId, documentType);
  if (!docInfo) throw new Error('获取文档信息失败，未返回数据');

  return docInfo;
}

/**
 * 获取飞书文档块结构
 */
export async function getDocumentBlocks(documentId: string, api: FeishuApiService): Promise<string> {
  Logger.info(`getDocumentBlocks invoked: documentId=${documentId}`);

  const blocks = await api.getDocumentBlocks(documentId);
  const { imageBlocks, whiteboardBlocks } = extractSpecialBlocks(blocks);
  return appendSpecialBlockTextHints(JSON.stringify(blocks, null, 2), imageBlocks, whiteboardBlocks);
}

export interface SearchDocumentsParams {
  searchKey: string;
  searchType?: 'document' | 'wiki' | 'both';
  offset?: number;
  pageToken?: string;
}

/**
 * 搜索飞书文档和/或知识库节点
 */
export async function searchDocuments(params: SearchDocumentsParams, api: FeishuApiService): Promise<any> {
  const { searchKey, searchType = 'both', offset, pageToken } = params;

  Logger.info(`searchDocuments invoked: searchKey=${searchKey}, type=${searchType}`);

  return api.search(searchKey, searchType, offset, pageToken);
}
