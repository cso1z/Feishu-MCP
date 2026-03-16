import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { formatErrorMessage } from '../../../utils/error.js';
import { FeishuApiService } from '../../../services/feishuApiService.js';
import { Logger } from '../../../utils/logger.js';
import { errorResponse } from '../../document/tools/toolHelpers.js';
import { getUsers } from '../toolApi/index.js';
import {
  UserSearchQueriesSchema,
  GetFeishuUsersUserIdsParamSchema,
} from '../../../types/memberSchema.js';

/**
 * 注册飞书成员 MCP 工具
 * get_feishu_users：统一按「名称搜索」或「ID 批量获取」两种方式查询用户
 */
export function registerMemberTools(server: McpServer, feishuService: FeishuApiService): void {
  server.tool(
    'get_feishu_users',
    'Get Feishu users by either (1) name search or (2) user IDs. Provide exactly one: queries [{ query, pageToken? }, ...] (1–20 items; pageToken per query for pagination), OR userIdsParam [{ id, idType }, ...] (1–50 items) to batch get by ID. Returns user list with basic info: open_id, user_id, name, department_ids, email, mobile, status, avatar, etc.',
    {
      queries: UserSearchQueriesSchema.optional(),
      userIdsParam: GetFeishuUsersUserIdsParamSchema.optional(),
    },
    async ({ queries, userIdsParam }) => {
      try {
        const params = queries != null && queries.length > 0 ? { queries } : { userIdsParam: userIdsParam! };
        const result = await getUsers(params, feishuService);
        const text = Array.isArray(result) ? JSON.stringify(result, null, 2) : JSON.stringify(result, null, 2);
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        Logger.error('get_feishu_users 失败:', error);
        return errorResponse(`get_feishu_users 失败: ${formatErrorMessage(error)}`);
      }
    }
  );
}
