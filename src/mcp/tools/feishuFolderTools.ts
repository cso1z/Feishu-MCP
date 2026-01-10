import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { formatErrorMessage } from '../../utils/error.js';
import { FeishuApiService } from '../../services/feishuApiService.js';
import { Logger } from '../../utils/logger.js';
import {
  FolderTokenSchema,
  FolderTokenOptionalSchema,
  FolderNameSchema,
  WikiSpaceNodeContextSchema,
} from '../../types/feishuSchema.js';

/**
 * 注册飞书文件夹相关的MCP工具
 * @param server MCP服务器实例
 * @param feishuService 飞书API服务实例
 */
export function registerFeishuFolderTools(server: McpServer, feishuService: FeishuApiService | null): void {

    // 添加获取根文件夹信息工具
    server.tool(
      'get_feishu_root_folder_info',
      'Retrieves the root folder in Feishu Drive, wiki spaces list, and "My Library". Use this when you need to browse folders or wiki spaces from the root. If you know the wiki node name, you can also use search_feishu_documents to directly locate specific wiki nodes instead of traversing from root. Returns root folder token, all wiki spaces, and personal library information.',
      {},
      async () => {
        try {
          if (!feishuService) {
            return {
              content: [{ type: 'text', text: '飞书服务未初始化，请检查配置' }],
            };
          }

          Logger.info(`开始获取飞书根文件夹信息、知识空间列表和我的知识库`);
          
          const result: any = {
            root_folder: null,
            wiki_spaces: null,
            my_library: null,
          };

          // 获取根文件夹信息
          try {
            const folderInfo = await feishuService.getRootFolderInfo();
            result.root_folder = folderInfo?.data || folderInfo;
            Logger.info(`飞书根文件夹信息获取成功，token: ${result.root_folder?.token}`);
          } catch (error) {
            Logger.error(`获取飞书根文件夹信息失败:`, error);
            result.root_folder = { error: formatErrorMessage(error, '获取根文件夹信息失败') };
          }

          // 获取知识空间列表（遍历所有分页）
          try {
            const wikiSpaces = await feishuService.getAllWikiSpacesList(20);
            result.wiki_spaces = wikiSpaces || [];
            Logger.info(`知识空间列表获取成功，共 ${Array.isArray(result.wiki_spaces) ? result.wiki_spaces.length : 0} 个空间`);
          } catch (error) {
            Logger.error(`获取知识空间列表失败:`, error);
            result.wiki_spaces = [];
          }

          // 获取"我的知识库"（通过传入 my_library 作为 space_id）
          try {
            const myLibrary = await feishuService.getWikiSpaceInfo('my_library', 'en');
            // 提取 space 对象的内容，去掉 space 这一层
            const libraryData = myLibrary?.data || myLibrary;
            result.my_library = libraryData?.space || libraryData;
            Logger.info(`我的知识库获取成功，space_id: ${result.my_library?.space_id}`);
          } catch (error) {
            Logger.error(`获取我的知识库失败:`, error);
            result.my_library = { error: formatErrorMessage(error, '获取我的知识库失败') };
          }

          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          Logger.error(`获取飞书信息失败:`, error);
          const errorMessage = formatErrorMessage(error, '获取飞书信息失败');
          return {
            content: [{ type: 'text', text: errorMessage }],
          };
        }
      },
    );

  // 添加获取文件夹中的文件清单工具
  server.tool(
    'get_feishu_folder_files',
    'Retrieves a list of files and subfolders in a specified folder or wiki space node. Supports two modes: (1) Feishu Drive folder mode: use folderToken to get files in a Feishu Drive folder. (2) Wiki space node mode: use wikiContext with spaceId (and optional parentNodeToken) to get documents under a wiki space node. If parentNodeToken is not provided, retrieves nodes from the root of the wiki space. Only one mode can be used at a time - provide either folderToken OR wikiContext.',
    {
      folderToken: FolderTokenOptionalSchema,
      wikiContext: WikiSpaceNodeContextSchema,
    },
    async ({ folderToken, wikiContext }) => {
      try {
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: '飞书服务未初始化，请检查配置' }],
          };
        }

        // 验证参数：必须提供 folderToken 或 wikiContext 之一，但不能同时提供
        if (folderToken && wikiContext) {
          return {
            content: [{ type: 'text', text: '错误：不能同时提供 folderToken 和 wikiContext 参数，请选择其中一种模式。' }],
          };
        }

        if (!folderToken && !wikiContext) {
          return {
            content: [{ type: 'text', text: '错误：必须提供 folderToken（飞书文档目录模式）或 wikiContext（知识库节点模式）参数之一。' }],
          };
        }

        // 模式一：飞书文档目录模式
        if (folderToken) {
          Logger.info(`开始获取飞书文件夹中的文件清单，文件夹Token: ${folderToken}`);
          const fileList = await feishuService.getFolderFileList(folderToken);
          Logger.info(`飞书文件夹中的文件清单获取成功，共 ${fileList.files?.length || 0} 个文件`);

          return {
            content: [{ type: 'text', text: JSON.stringify(fileList, null, 2) }],
          };
        }

        // 模式二：知识库节点模式
        if (wikiContext) {
          const { spaceId, parentNodeToken } = wikiContext;
          if (!spaceId) {
            return {
              content: [{ type: 'text', text: '错误：使用 wikiContext 模式时，必须提供 spaceId。' }],
            };
          }
          Logger.info(`开始获取知识空间子节点列表，知识空间ID: ${spaceId}, 父节点Token: ${parentNodeToken || 'null（根节点）'}`);
          const nodeList = await feishuService.getAllWikiSpaceNodes(spaceId, parentNodeToken);
          Logger.info(`知识空间子节点列表获取成功，共 ${Array.isArray(nodeList) ? nodeList.length : 0} 个节点`);

          return {
            content: [{ type: 'text', text: JSON.stringify({ nodes: nodeList || [] }, null, 2) }],
          };
        }

        // 理论上不会到达这里
        return {
          content: [{ type: 'text', text: '错误：未知错误' }],
        };
      } catch (error) {
        Logger.error(`获取文件列表失败:`, error);
        const errorMessage = formatErrorMessage(error);
        return {
          content: [{ type: 'text', text: `获取文件列表失败: ${errorMessage}` }],
        };
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
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: '飞书服务未初始化，请检查配置' }],
          };
        }

        Logger.info(`开始创建飞书文件夹，父文件夹Token: ${folderToken}，文件夹名称: ${folderName}`);
        const result = await feishuService.createFolder(folderToken, folderName);
        Logger.info(`飞书文件夹创建成功，token: ${result.token}，URL: ${result.url}`);

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        Logger.error(`创建飞书文件夹失败:`, error);
        const errorMessage = formatErrorMessage(error);
        return {
          content: [{ type: 'text', text: `创建飞书文件夹失败: ${errorMessage}` }],
        };
      }
    },
  );
} 