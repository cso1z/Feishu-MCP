import { FeishuApiService } from '../services/feishuApiService.js';
import { UserContextManager, TokenCacheManager, AuthUtils } from '../utils/auth/index.js';
import { Config } from '../utils/config.js';
import { handleAuthRequired } from './commands/auth.js';

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

type AuthType = 'tenant' | 'user';
type ToolHandler = (params: any, svc: FeishuApiService) => Promise<any>;

/** 将 getImageResource 返回的 Buffer 转为 base64 字符串输出 */
async function getImageResourceAsBase64(
  mediaId: string,
  extra: string,
  svc: FeishuApiService
): Promise<{ base64: string }> {
  const result = await getImageResource(mediaId, extra, svc);
  const buf = result instanceof Buffer ? result : Buffer.from((result as any).data);
  return { base64: buf.toString('base64') };
}

/** 将 getWhiteboardContent 返回的 Buffer 缩略图转为 base64 字符串输出 */
async function getWhiteboardContentSafe(
  whiteboardId: string,
  svc: FeishuApiService
): Promise<any> {
  const result = await getWhiteboardContent(whiteboardId, svc);
  if (result.type === 'thumbnail') {
    const buf = result.buffer instanceof Buffer ? result.buffer : Buffer.from((result.buffer as any).data);
    return { type: 'thumbnail', base64: buf.toString('base64') };
  }
  return result;
}

interface ModuleToolMap {
  /** 模块所需最低认证类型：tenant 表示两者均可，user 表示仅 user 模式可用 */
  authType: AuthType;
  tools: Record<string, ToolHandler>;
}

/**
 * 按模块组织的工具注册表，与 src/modules 目录划分保持一致
 */
const MODULE_REGISTRY: Record<string, ModuleToolMap> = {
  document: {
    authType: 'tenant',
    tools: {
      create_feishu_document:         (p, s) => createDocument(p, s),
      get_feishu_document_info:       (p, s) => getDocumentInfo(p, s),
      get_feishu_document_blocks:     (p, s) => getDocumentBlocks(p.documentId, s),
      search_feishu_documents:        (p, s) => searchDocuments(p, s),
      batch_update_feishu_block_text: (p, s) => batchUpdateBlockText(p, s),
      batch_create_feishu_blocks:     (p, s) => batchCreateBlocks(p, s),
      delete_feishu_document_blocks:  (p, s) => deleteDocumentBlocks(p, s),
      get_feishu_image_resource:      (p, s) => getImageResourceAsBase64(p.mediaId, p.extra ?? '', s),
      upload_and_bind_image_to_block: (p, s) => uploadAndBindImageToBlock(p, s),
      create_feishu_table:            (p, s) => createTable(p, s),
      get_feishu_whiteboard_content:  (p, s) => getWhiteboardContentSafe(p.whiteboardId, s),
      fill_whiteboard_with_plantuml:  (p, s) => fillWhiteboardWithPlantuml(p, s),
      get_feishu_root_folder_info:    (_p, s) => getRootFolderInfo(s),
      get_feishu_folder_files:        (p, s) => getFolderFiles(p, s),
      create_feishu_folder:           (p, s) => createFolder(p, s),
    },
  },

  task: {
    authType: 'user',
    tools: {
      list_feishu_tasks:  (p, s) => listTasks(p, s),
      create_feishu_task: (p, s) => createTasks(p.tasks, s),
      update_feishu_task: (p, s) => updateTask(p, s),
      delete_feishu_task: (p, s) => deleteTasks(p.taskGuids, s),
    },
  },

  member: {
    authType: 'user',
    tools: {
      get_feishu_users: (p, s) => getUsers(p, s),
    },
  },
};

/** 将 MODULE_REGISTRY 展平为 toolName → handler 的查找表 */
function buildFlatMap(): Record<string, ToolHandler> {
  const flat: Record<string, ToolHandler> = {};
  for (const mod of Object.values(MODULE_REGISTRY)) {
    Object.assign(flat, mod.tools);
  }
  return flat;
}

const FLAT_TOOL_MAP = buildFlatMap();

/**
 * 返回支持的工具名称列表，按认证类型过滤
 * tenant 模式下排除需要 user 认证的模块工具
 */
export function listTools(authType?: AuthType): string[] {
  const tools: string[] = [];
  for (const mod of Object.values(MODULE_REGISTRY)) {
    if (authType === 'tenant' && mod.authType === 'user') continue;
    tools.push(...Object.keys(mod.tools));
  }
  return tools;
}

/**
 * 调度指定工具，注入用户上下文，处理 AuthRequiredError 并自动重试一次
 */
export async function dispatch(toolName: string, params: unknown): Promise<unknown> {
  const handler = FLAT_TOOL_MAP[toolName];
  if (!handler) {
    throw new Error(`未知工具: "${toolName}"。可用工具：\n${listTools().join('\n')}`);
  }

  const config = Config.getInstance();
  const userKey = config.feishu.userKey;
  const userContextManager = UserContextManager.getInstance();
  const apiService = FeishuApiService.getInstance();
  const baseUrl = `http://localhost:${config.server.port}`;

  const invoke = (): Promise<unknown> =>
    userContextManager.run(
      { userKey, baseUrl },
      () => handler(params, apiService)
    );

  // 在 user 模式下，预先检查 token 是否有效，无效则触发授权流程
  if (config.feishu.authType === 'user') {
    const clientKey = AuthUtils.generateClientKey(userKey);
    const status = TokenCacheManager.getInstance().checkUserTokenStatus(clientKey);
    if (!status.isValid && !status.canRefresh) {
      await handleAuthRequired(userKey);
    }
  }

  return await invoke();
}