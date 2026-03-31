import { FeishuApiService } from '../../../services/feishuApiService.js';
import { Logger } from '../../../utils/logger.js';
import { formatErrorMessage } from '../../../utils/error.js';

/**
 * 获取飞书根文件夹信息、知识空间列表和我的知识库
 */
export async function getRootFolderInfo(api: FeishuApiService): Promise<{
  root_folder: any;
  wiki_spaces: any[];
  my_library: any;
}> {
  Logger.info('getRootFolderInfo invoked');

  const result: any = {
    root_folder: null,
    wiki_spaces: [],
    my_library: null,
  };

  try {
    const folderInfo = await api.getRootFolderInfo();
    result.root_folder = folderInfo?.data ?? folderInfo;
  } catch (error) {
    Logger.error(`获取飞书根文件夹信息失败:`, error);
    result.root_folder = { error: formatErrorMessage(error, '获取根文件夹信息失败') };
  }

  try {
    result.wiki_spaces = (await api.getAllWikiSpacesList(20)) ?? [];
  } catch (error) {
    Logger.error(`获取知识空间列表失败:`, error);
    result.wiki_spaces = [];
  }

  try {
    const myLibrary = await api.getWikiSpaceInfo('my_library', 'en');
    const libraryData = myLibrary?.data ?? myLibrary;
    result.my_library = libraryData?.space ?? libraryData;
  } catch (error) {
    Logger.error(`获取我的知识库失败:`, error);
    result.my_library = { error: formatErrorMessage(error, '获取我的知识库失败') };
  }

  return result;
}

export interface GetFolderFilesParams {
  folderToken?: string;
  wikiContext?: { spaceId: string; parentNodeToken?: string };
}

/**
 * 获取文件夹或知识空间节点下的文件列表
 */
export async function getFolderFiles(
  params: GetFolderFilesParams,
  api: FeishuApiService
): Promise<any> {
  const { folderToken, wikiContext } = params;
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
    Logger.info(`getFolderFiles invoked: folder mode, folderToken=${folderToken}`);
    return api.getFolderFileList(folderToken);
  }

  if (!wikiContext || !wikiSpaceId) {
    throw new Error('错误：使用 wikiContext 模式时，必须提供 spaceId。');
  }
  const { parentNodeToken } = wikiContext;

  Logger.info(`getFolderFiles invoked: wiki mode, spaceId=${wikiSpaceId}`);
  const nodeList = await api.getAllWikiSpaceNodes(wikiSpaceId, parentNodeToken);
  return { nodes: nodeList ?? [] };
}

export interface CreateFolderParams {
  folderToken: string;
  folderName: string;
}

/**
 * 在指定文件夹下创建子文件夹
 */
export async function createFolder(params: CreateFolderParams, api: FeishuApiService): Promise<any> {
  const { folderToken, folderName } = params;

  Logger.info(`createFolder invoked: folderToken=${folderToken}, folderName=${folderName}`);

  return api.createFolder(folderToken, folderName);
}
