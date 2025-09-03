import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { formatErrorMessage } from '../../utils/error.js';
import { FeishuApiService } from '../../services/feishuApiService.js';
import { Logger } from '../../utils/logger.js';
import {
  FolderTokenSchema,
  FolderNameSchema,
} from '../../types/feishuSchema.js';
import { Config } from '../../utils/config.js';

/**
 * 注册飞书文件夹相关的MCP工具
 * @param server MCP服务器实例
 * @param feishuService 飞书API服务实例
 */
export function registerFeishuFolderTools(server: McpServer, feishuService: FeishuApiService | null): void {

  const config = Config.getInstance();

  // 添加获取根文件夹信息工具
  if (config.feishu.authType === 'user') {
    server.tool(
      'get_feishu_root_folder_info',
      'Retrieves basic information about the root folder in Feishu Drive. Returns the token, ID and user ID of the root folder, which can be used for subsequent folder operations.',
      {},
      async () => {
        try {
          if (!feishuService) {
            return {
              content: [{ type: 'text', text: '飞书服务未初始化，请检查配置' }],
            };
          }

          Logger.info(`开始获取飞书根文件夹信息`);
          const folderInfo = await feishuService.getRootFolderInfo();
          Logger.info(`飞书根文件夹信息获取成功，token: ${folderInfo.token}`);

          return {
            content: [{ type: 'text', text: JSON.stringify(folderInfo, null, 2) }],
          };
        } catch (error) {
          Logger.error(`获取飞书根文件夹信息失败:`, error);
          const errorMessage = formatErrorMessage(error, '获取飞书根文件夹信息失败');
          return {
            content: [{ type: 'text', text: errorMessage }],
          };
        }
      },
    );
  }


  // 添加获取文件夹中的文件清单工具
  server.tool(
    'get_feishu_folder_files',
    'Retrieves a list of files and subfolders in a specified folder. Use this to explore folder contents, view file metadata, and get URLs and tokens for further operations.',
    {
      folderToken: FolderTokenSchema,
    },
    async ({ folderToken, }) => {
      try {
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: '飞书服务未初始化，请检查配置' }],
          };
        }

        Logger.info(`开始获取飞书文件夹中的文件清单，文件夹Token: ${folderToken}`);
        const fileList = await feishuService.getFolderFileList(folderToken);
        Logger.info(`飞书文件夹中的文件清单获取成功，共 ${fileList.files?.length || 0} 个文件`);

        return {
          content: [{ type: 'text', text: JSON.stringify(fileList, null, 2) }],
        };
      } catch (error) {
        Logger.error(`获取飞书文件夹中的文件清单失败:`, error);
        const errorMessage = formatErrorMessage(error);
        return {
          content: [{ type: 'text', text: `获取飞书文件夹中的文件清单失败: ${errorMessage}` }],
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