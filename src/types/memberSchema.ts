/**
 * Member module schema definitions (search/v1/user, contact/v3/users/batch).
 * All `.describe()` in English; concise, no duplication. JSDoc above exports = one-line summary only.
 */

import { z } from 'zod';



export const UserSearchQuerySchema = z.string().min(1).describe(`Search keyword (required).Matches display name and pinyin (full/partial/initials, case-insensitive). user_id is NOT matched—use userIdsParam.`);

export const UserSearchPageTokenSchema = z
  .string()
  .optional()
  .describe('Pagination token (optional). Omit on first call; use page_token from previous response.');

export const UserIdTypeSchema = z
  .enum(['open_id', 'union_id', 'user_id'])
  .optional()
  .default('open_id')
  .describe('ID type: open_id (per-app) | union_id (per-developer) | user_id (tenant). Default open_id.');

export const UserIdValueSchema = z.string().min(1).describe('User ID value (open_id, union_id, or user_id per idType).');

/** Single search request: one keyword + optional pageToken for that keyword (each query is a separate API call). */
export const UserSearchQueryItemSchema = z.object({
  query: UserSearchQuerySchema,
  pageToken: UserSearchPageTokenSchema,
});

export const UserSearchQueriesSchema = z
  .array(UserSearchQueryItemSchema)
  .min(1)
  .max(20)
  .describe('Search by name. Each item: query + optional pageToken for that query. Min 1, max 20.');

export const UserIdItemSchema = z.object({
  id: UserIdValueSchema,
  idType: UserIdTypeSchema,
});

export const GetFeishuUsersUserIdsParamSchema = z
  .array(UserIdItemSchema)
  .min(1)
  .max(50)
  .describe('Get by ID list. Each item: id + idType. IDs may mix types.');

