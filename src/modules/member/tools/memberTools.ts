import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { formatErrorMessage } from '../../../utils/error.js';
import { FeishuApiService } from '../../../services/feishuApiService.js';
import { Logger } from '../../../utils/logger.js';
import { errorResponse } from '../../document/tools/toolHelpers.js';
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
        const byQuery = queries != null && queries.length > 0;
        const byId = userIdsParam != null && userIdsParam.length > 0;
        if (!byQuery && !byId) {
          return errorResponse('Provide exactly one of: queries (search by name) or userIdsParam (get by ID list).');
        }
        if (byQuery) {
          const results: Array<{ query: string; users: any[]; pageToken?: string }> = [];
          for (const { query, pageToken } of queries) {
            const q = query.trim();
            Logger.info(`get_feishu_users(by query): ${q}`);
            const result = await feishuService.searchUsers(q, pageToken);
            const users = Array.isArray(result) ? result : result?.users ?? result?.data?.users ?? [];
            const nextToken = result?.page_token ?? result?.pageToken;
            results.push({ query: q, users, ...(nextToken && { pageToken: nextToken }) });
          }
          return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
        }
        if (byId) {
          const byType = new Map<string, string[]>();
          for (const { id, idType } of userIdsParam) {
            const t = idType ?? 'open_id';
            if (!byType.has(t)) byType.set(t, []);
            byType.get(t)!.push(id);
          }
          const allItems: any[] = [];
          for (const [idType, ids] of byType) {
            const res = await feishuService.getUsersBatch(ids, idType as 'open_id' | 'union_id' | 'user_id');
            allItems.push(...(res.items ?? []));
          }
          Logger.info(`get_feishu_users(by id): ${userIdsParam.length} items, ${byType.size} type(s)`);
          return { content: [{ type: 'text', text: JSON.stringify({ items: allItems }, null, 2) }] };
        }
        return errorResponse('Unexpected state.');
      } catch (error) {
        Logger.error('get_feishu_users 失败:', error);
        return errorResponse(`get_feishu_users 失败: ${formatErrorMessage(error)}`);
      }
    },
  );
}
