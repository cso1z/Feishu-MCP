import { FeishuApiService } from '../../../services/feishuApiService.js';
import { Logger } from '../../../utils/logger.js';
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
