import { FeishuApiService } from '../../../services/feishuApiService.js';
import { Logger } from '../../../utils/logger.js';
import {
  UserSearchQueriesSchema,
  GetFeishuUsersUserIdsParamSchema,
} from '../../../types/memberSchema.js';

export interface GetUsersByQueryParams {
  queries: Array<{ query: string; pageToken?: string }>;
}

export interface GetUsersByIdParams {
  userIdsParam: Array<{ id: string; idType?: 'open_id' | 'union_id' | 'user_id' }>;
}

export type GetUsersParams = GetUsersByQueryParams | GetUsersByIdParams;

/**
 * 按名称搜索或按 ID 批量获取飞书用户
 */
export async function getUsers(params: GetUsersParams, api: FeishuApiService): Promise<any> {
  const byQuery = 'queries' in params && params.queries != null && params.queries.length > 0;
  const byId = 'userIdsParam' in params && params.userIdsParam != null && params.userIdsParam.length > 0;

  if (!byQuery && !byId) {
    throw new Error('Provide exactly one of: queries (search by name) or userIdsParam (get by ID list).');
  }
  if (byQuery && byId) {
    throw new Error('Provide exactly one of: queries or userIdsParam, not both.');
  }

  if (byQuery) {
    const queries = params.queries;
    const parsed = UserSearchQueriesSchema.safeParse(queries);
    if (!parsed.success) {
      throw new Error(`参数校验失败: ${parsed.error.message}`);
    }

    Logger.info(`getUsers invoked: by query, ${parsed.data.length} queries`);

    const results: Array<{ query: string; users: any[]; pageToken?: string }> = [];
    for (const { query, pageToken } of parsed.data) {
      const q = query.trim();
      const result = await api.searchUsers(q, pageToken);
      const users = Array.isArray(result) ? result : result?.users ?? result?.data?.users ?? [];
      const nextToken = result?.page_token ?? result?.pageToken;
      results.push({ query: q, users, ...(nextToken && { pageToken: nextToken }) });
    }
    return results;
  }

  if (byId) {
    const userIdsParam = params.userIdsParam;
    const parsed = GetFeishuUsersUserIdsParamSchema.safeParse(userIdsParam);
    if (!parsed.success) {
      throw new Error(`参数校验失败: ${parsed.error.message}`);
    }

    Logger.info(`getUsers invoked: by id, ${parsed.data.length} items`);

    const byType = new Map<string, string[]>();
    for (const { id, idType } of parsed.data) {
      const t = idType ?? 'open_id';
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t)!.push(id);
    }
    const allItems: any[] = [];
    for (const [idType, ids] of byType) {
      const res = await api.getUsersBatch(ids, idType as 'open_id' | 'union_id' | 'user_id');
      allItems.push(...(res.items ?? []));
    }
    return { items: allItems };
  }

  throw new Error('Unexpected state.');
}
