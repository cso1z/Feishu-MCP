import { FeishuApiService } from '../services/feishuApiService.js';
import { UserContextManager, TokenCacheManager, AuthUtils } from '../utils/auth/index.js';
import { Config } from '../utils/config.js';
import { handleAuthRequired } from './auth.js';

// Document toolApis
import {
  createDocument,
  getDocumentInfo,
  getDocumentBlocks,
  searchDocuments,
  batchUpdateBlockText,
  batchCreateBlocks,
  deleteDocumentBlocks,
  getImageResource,
  uploadAndBindImageToBlock,
  createTable,
  getWhiteboardContent,
  fillWhiteboardWithPlantuml,
  getRootFolderInfo,
  getFolderFiles,
  createFolder,
} from '../modules/document/toolApi/index.js';

// Task toolApis
import { createTasks, listTasks, updateTask, deleteTasks } from '../modules/task/toolApi/index.js';

// Member toolApis
import { getUsers } from '../modules/member/toolApi/index.js';

type ToolHandler = (params: any, svc: FeishuApiService) => Promise<any>;

const TOOL_MAP: Record<string, ToolHandler> = {
  // Document
  create_feishu_document:         (p, s) => createDocument(p, s),
  get_feishu_document_info:       (p, s) => getDocumentInfo(p, s),
  // getDocumentBlocks(documentId: string, api)
  get_feishu_document_blocks:     (p, s) => getDocumentBlocks(p.documentId, s),
  search_feishu_documents:        (p, s) => searchDocuments(p, s),
  // Block
  batch_update_feishu_block_text: (p, s) => batchUpdateBlockText(p, s),
  batch_create_feishu_blocks:     (p, s) => batchCreateBlocks(p, s),
  delete_feishu_document_blocks:  (p, s) => deleteDocumentBlocks(p, s),
  // getImageResource(mediaId, extra, api)
  get_feishu_image_resource:      (p, s) => getImageResource(p.mediaId, p.extra ?? '', s),
  upload_and_bind_image_to_block: (p, s) => uploadAndBindImageToBlock(p, s),
  create_feishu_table:            (p, s) => createTable(p, s),
  // Whiteboard — getWhiteboardContent(whiteboardId, api)
  get_feishu_whiteboard_content:  (p, s) => getWhiteboardContent(p.whiteboardId, s),
  fill_whiteboard_with_plantuml:  (p, s) => fillWhiteboardWithPlantuml(p, s),
  // Folder — getRootFolderInfo(api) takes no params
  get_feishu_root_folder_info:    (_p, s) => getRootFolderInfo(s),
  get_feishu_folder_files:        (p, s) => getFolderFiles(p, s),
  create_feishu_folder:           (p, s) => createFolder(p, s),
  // Task — createTasks(taskItems: TaskCreateItem[], api) / deleteTasks(taskGuids: string[], api)
  list_feishu_tasks:              (p, s) => listTasks(p, s),
  create_feishu_task:             (p, s) => createTasks(p.tasks, s),
  update_feishu_task:             (p, s) => updateTask(p, s),
  delete_feishu_task:             (p, s) => deleteTasks(p.taskGuids, s),
  // Member
  get_feishu_users:               (p, s) => getUsers(p, s),
};

/**
 * 返回所有支持的工具名称列表
 */
export function listTools(): string[] {
  return Object.keys(TOOL_MAP);
}

/**
 * 调度指定工具，注入用户上下文，处理 AuthRequiredError 并自动重试一次
 */
export async function dispatch(toolName: string, params: unknown): Promise<unknown> {
  const handler = TOOL_MAP[toolName];
  if (!handler) {
    throw new Error(`未知工具: "${toolName}"。可用工具：\n${listTools().join('\n')}`);
  }

  const config = Config.getInstance();
  const userKey = config.feishu.userKey;
  const userContextManager = UserContextManager.getInstance();
  const apiService = FeishuApiService.getInstance();
  // baseUrl 仅用于日志，CLI 模式下使用 localhost 占位
  const baseUrl = `http://localhost:${config.server.port}`;

  const invoke = (): Promise<unknown> =>
    userContextManager.run(
      { userKey, baseUrl },
      () => handler(params, apiService)
    );

  // 在 user 模式下，预先检查 token 是否有效，无效则触发授权流程
  // （AuthRequiredError 在 baseService 内部被转换为普通 Error，无法在此层捕获）
  if (config.feishu.authType === 'user') {
    const clientKey = AuthUtils.generateClientKey(userKey);
    const status = TokenCacheManager.getInstance().checkUserTokenStatus(clientKey);
    if (!status.isValid && !status.canRefresh) {
      await handleAuthRequired(userKey);
    }
  }

  return await invoke();
}
