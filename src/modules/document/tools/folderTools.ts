import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { formatErrorMessage } from '../../../utils/error.js';
import { FeishuApiService } from '../../../services/feishuApiService.js';
import { Logger } from '../../../utils/logger.js';
import {
  getRootFolderInfo,
  getFolderFiles,
  createFolder,
} from '../toolApi/folderToolApi.js';
import {
  FolderTokenSchema,
  FolderTokenOptionalSchema,
  FolderNameSchema,
  WikiSpaceNodeContextSchema,
} from '../../../types/documentSchema.js';
import { errorResponse } from './toolHelpers.js';

/**
 * 注册飞书文件夹相关的MCP工具
 */
export function registerFolderTools(server: McpServer, feishuService: FeishuApiService): void {
  server.tool(
    'get_feishu_root_folder_info',
    'Retrieves the root folder in Feishu Drive, wiki spaces list, and "My Library". Use this when you need to browse folders or wiki spaces from the root. If you know the wiki node name, you can also use search_feishu_documents to directly locate specific wiki nodes instead of traversing from root. Returns root folder token, all wiki spaces, and personal library information.',
    {},
    async () => {
      try {
        const result = await getRootFolderInfo(feishuService);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        Logger.error(`获取飞书信息失败:`, error);
        return errorResponse(formatErrorMessage(error, '获取飞书信息失败'));
      }
    }
  );

  server.tool(
    'get_feishu_folder_files',
    'Retrieves a list of files and subfolders in a specified folder or wiki space node. Supports two modes: (1) Feishu Drive folder mode: use folderToken to get files in a Feishu Drive folder. (2) Wiki space node mode: use wikiContext with spaceId (and optional parentNodeToken) to get documents under a wiki space node. If parentNodeToken is not provided, retrieves nodes from the root of the wiki space. Only one mode can be used at a time - provide either folderToken OR wikiContext.',
    {
      folderToken: FolderTokenOptionalSchema,
      wikiContext: WikiSpaceNodeContextSchema,
    },
    async ({ folderToken, wikiContext }) => {
      try {
        const result = await getFolderFiles({ folderToken, wikiContext }, feishuService);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        Logger.error(`获取文件列表失败:`, error);
        return errorResponse(`获取文件列表失败: ${formatErrorMessage(error)}`);
      }
    }
  );

  server.tool(
    'create_feishu_folder',
    'Creates a new folder in a specified parent folder. Use this to organize documents and files within your Feishu Drive structure. Returns the token and URL of the newly created folder.',
    {
      folderToken: FolderTokenSchema,
      folderName: FolderNameSchema,
    },
    async ({ folderToken, folderName }) => {
      try {
        const result = await createFolder({ folderToken, folderName }, feishuService);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        Logger.error(`创建飞书文件夹失败:`, error);
        return errorResponse(`创建飞书文件夹失败: ${formatErrorMessage(error)}`);
      }
    }
  );
}
