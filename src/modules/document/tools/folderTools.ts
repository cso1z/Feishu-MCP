import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { formatErrorMessage } from '../../../utils/error';
import { FeishuApiService } from '../../../services/feishuApiService';
import { Logger } from '../../../utils/logger';
import {
  FolderTokenSchema,
  FolderTokenOptionalSchema,
  FolderNameSchema,
  WikiSpaceNodeContextSchema,
} from '../../../types/documentSchema';
import { errorResponse, validateFolderOrWikiContext } from './toolHelpers';

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
        Logger.info(`开始获取飞书根文件夹信息、知识空间列表和我的知识库`);

        const result: any = {
          root_folder: null,
          wiki_spaces: [],
          my_library: null,
        };

        try {
          const folderInfo = await feishuService.getRootFolderInfo();
          result.root_folder = folderInfo?.data ?? folderInfo;
          Logger.info(`飞书根文件夹信息获取成功，token: ${result.root_folder?.token}`);
        } catch (error) {
          Logger.error(`获取飞书根文件夹信息失败:`, error);
          result.root_folder = { error: formatErrorMessage(error, '获取根文件夹信息失败') };
        }

        try {
          result.wiki_spaces = (await feishuService.getAllWikiSpacesList(20)) ?? [];
          Logger.info(`知识空间列表获取成功，共 ${result.wiki_spaces.length} 个空间`);
        } catch (error) {
          Logger.error(`获取知识空间列表失败:`, error);
          result.wiki_spaces = [];
        }

        try {
          const myLibrary = await feishuService.getWikiSpaceInfo('my_library', 'en');
          const libraryData = myLibrary?.data ?? myLibrary;
          result.my_library = libraryData?.space ?? libraryData;
          Logger.info(`我的知识库获取成功，space_id: ${result.my_library?.space_id}`);
        } catch (error) {
          Logger.error(`获取我的知识库失败:`, error);
          result.my_library = { error: formatErrorMessage(error, '获取我的知识库失败') };
        }

        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        Logger.error(`获取飞书信息失败:`, error);
        return errorResponse(formatErrorMessage(error, '获取飞书信息失败'));
      }
    },
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
        const validationError = validateFolderOrWikiContext(folderToken, wikiContext);
        if (validationError) return validationError;

        // 模式一：飞书文档目录模式
        if (folderToken) {
          Logger.info(`开始获取飞书文件夹中的文件清单，文件夹Token: ${folderToken}`);
          const fileList = await feishuService.getFolderFileList(folderToken);
          Logger.info(`飞书文件夹中的文件清单获取成功，共 ${fileList.files?.length ?? 0} 个文件`);
          return { content: [{ type: 'text', text: JSON.stringify(fileList, null, 2) }] };
        }

        // 模式二：知识库节点模式
        if (!wikiContext) return errorResponse('错误：内部参数状态异常。');
        const { spaceId, parentNodeToken } = wikiContext;
        if (!spaceId) {
          return errorResponse('错误：使用 wikiContext 模式时，必须提供 spaceId。');
        }
        Logger.info(`开始获取知识空间子节点列表，知识空间ID: ${spaceId}, 父节点Token: ${parentNodeToken ?? 'null（根节点）'}`);
        const nodeList = await feishuService.getAllWikiSpaceNodes(spaceId, parentNodeToken);
        Logger.info(`知识空间子节点列表获取成功，共 ${Array.isArray(nodeList) ? nodeList.length : 0} 个节点`);
        return { content: [{ type: 'text', text: JSON.stringify({ nodes: nodeList ?? [] }, null, 2) }] };
      } catch (error) {
        Logger.error(`获取文件列表失败:`, error);
        return errorResponse(`获取文件列表失败: ${formatErrorMessage(error)}`);
      }
    },
  );

  // 添加创建文件夹工具
  server.tool(
    'create_feishu_folder',
    'Creates a new folder in a specified parent folder. Use this to organize documents and files within your Feishu Drive structure. Returns the token and URL of the newly created folder.',
    {
      folderToken: FolderTokenSchema,
      folderName: FolderNameSchema,
    },
    async ({ folderToken, folderName }) => {
      try {
        Logger.info(`开始创建飞书文件夹，父文件夹Token: ${folderToken}，文件夹名称: ${folderName}`);
        const result = await feishuService.createFolder(folderToken, folderName);
        Logger.info(`飞书文件夹创建成功，token: ${result.token}，URL: ${result.url}`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        Logger.error(`创建飞书文件夹失败:`, error);
        return errorResponse(`创建飞书文件夹失败: ${formatErrorMessage(error)}`);
      }
    },
  );
}
