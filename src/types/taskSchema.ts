/**
 * 任务模块 Schema 定义（task/v2 API）
 *
 * ## Schema 描述规范
 *
 * 明确必填/可选、格式与示例，表述简洁。
 */

import { z } from 'zod';

/** 任务 GUID（必填）。任务全局唯一标识，最大 100 字符。 */
export const TaskGuidSchema = z
  .string()
  .min(1)
  .max(100)
  .describe('Task GUID (required). Global unique ID of the task. Max 100 characters.');

/** 父任务 GUID（可选）。填写则在父任务下创建子任务，需具备父任务编辑权限。 */
export const TaskParentTaskGuidSchema = TaskGuidSchema.optional().describe(
  'Parent task GUID (optional). When set, creates a subtask under this task; requires edit permission on the parent.',
);

/** 批量删除时的任务 GUID 列表。最少 1 个，最多 50 个。 */
export const TaskDeleteBatchSchema = z
  .array(TaskGuidSchema)
  .min(1)
  .max(50)
  .describe('Task GUIDs to delete (required). Min 1, max 50 per call. Requires edit permission on each task.');

/** 任务标题（必填）。最大 3000 UTF-8 字符。 */
export const TaskSummarySchema = z
  .string()
  .min(1)
  .max(3000)
  .describe('Task title (required). Max 3000 UTF-8 characters.');

/** 任务描述（可选）。最大 3000 UTF-8 字符。 */
export const TaskDescriptionSchema = z
  .string()
  .max(3000)
  .optional()
  .describe('Task description (optional). Max 3000 UTF-8 characters.');

/** 时间戳，毫秒，自 1970-01-01 00:00:00 UTC 起。 */
export const TaskTimestampSchema = z
  .string()
  .optional()
  .describe('Timestamp in milliseconds since 1970-01-01 00:00:00 UTC. Example: "1675454764000".');

/** 是否全天（仅日期）。 */
export const TaskIsAllDaySchema = z
  .boolean()
  .optional()
  .default(false)
  .describe('Whether the time is all-day. If true, only the date part of timestamp is used.');

/** 任务截止时间。 */
export const TaskDueSchema = z
  .object({
    timestamp: TaskTimestampSchema,
    is_all_day: TaskIsAllDaySchema,
  })
  .optional()
  .describe('Task due time (optional). Set timestamp and is_all_day.');

/** 任务开始时间。若与 due 同时设置，start 须 <= due 且 is_all_day 一致。 */
export const TaskStartSchema = z
  .object({
    timestamp: TaskTimestampSchema,
    is_all_day: TaskIsAllDaySchema,
  })
  .optional()
  .describe('Task start time (optional). If set with due, start must be <= due and is_all_day must match.');

/** 成员角色：assignee（负责人）或 follower（关注者）。 */
export const TaskMemberRoleSchema = z
  .enum(['assignee', 'follower'])
  .describe('Member role: "assignee" for owner, "follower" for watcher.');

/** 任务成员（负责人或关注者）。id 为 get_feishu_users 返回的 open_id。 */
export const TaskMemberSchema = z.object({
  id: z.string().min(1).describe('User open_id (required). Use open_id from get_feishu_users.'),
  type: z.literal('user').optional().default('user'),
  role: TaskMemberRoleSchema,
  name: z.string().optional().describe('Member display name (optional).'),
});

/** 任务成员列表，最多 50 人（去重）。 */
export const TaskMembersSchema = z
  .array(TaskMemberSchema)
  .max(50)
  .optional()
  .describe('Task members: assignees and followers (optional). Max 50. Use open_id from get_feishu_users.');

/** 负责人 open_id 列表（可选）。来自 search_feishu_users，最多 50。 */
export const TaskAssigneeIdsSchema = z
  .array(z.string().min(1))
  .max(50)
  .optional()
  .describe('Assignee open_ids (optional). Use open_id from get_feishu_users. Max 50.');

/** 关注者 open_id 列表（可选）。来自 search_feishu_users，最多 50。 */
export const TaskFollowerIdsSchema = z
  .array(z.string().min(1))
  .max(50)
  .optional()
  .describe('Follower open_ids (optional). Use open_id from get_feishu_users. Max 50.');

/** 提醒相对截止时间的分钟数（可选）。0=截止时提醒，30=截止前30分钟。非负整数。任务需先有 due；当前每任务仅支持 1 个提醒，已有提醒时需先移除再添加。 */
export const TaskReminderRelativeMinutesSchema = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe('Reminder: minutes before due (0 = at due time, 30 = 30 min before). Task must have due; only one reminder per task—remove existing first if needed.');

/** 要移除的提醒 id 列表（可选）。id 来自任务详情的 reminders[].id。 */
export const TaskReminderIdsSchema = z
  .array(z.string().min(1))
  .optional()
  .describe('Reminder ids to remove (from task.reminders[].id).');

/** 列取任务列表的分页标记（可选）。首次不传，后续用上响应的 page_token。 */
export const TaskListPageTokenSchema = z
  .string()
  .optional()
  .describe('Page token for list tasks (omit on first request; use page_token from previous response for next page).');

/** 列取任务时按完成状态过滤（可选）。true=仅已完成，false=仅未完成，不传=不过滤。 */
export const TaskListCompletedSchema = z
  .boolean()
  .optional()
  .describe('Filter by completion: true = only completed, false = only todo, omit = no filter.');

/** 重复规则。如 "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR"。 */
export const TaskRepeatRuleSchema = z
  .string()
  .max(1000)
  .optional()
  .describe('Recurrence rule (optional). Example: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR".');

/** 完成时间戳（毫秒）。不填或 "0" 表示未完成。 */
export const TaskCompletedAtSchema = z
  .string()
  .optional()
  .describe('Completion timestamp in ms (optional). Omit or "0" = unfinished; set to create a completed task.');

/** 任务模式：1 = 会签（均需完成），2 = 或签（任一人完成即可）。默认 2。 */
export const TaskModeSchema = z
  .union([z.literal(1), z.literal(2)])
  .optional()
  .default(2)
  .describe('Task mode (optional): 1 = all assignees must complete, 2 = any assignee can complete. Default 2.');

/** 是否为里程碑任务。 */
export const TaskIsMilestoneSchema = z
  .boolean()
  .optional()
  .default(false)
  .describe('Whether the task is a milestone (optional). Default false.');

/** 单条创建任务入参的类型（含递归 subTasks）。 */
export type TaskCreateItem = {
  parentTaskGuid?: string;
  summary: string;
  description?: string;
  dueTimestamp?: string;
  isDueAllDay?: boolean;
  completedAt?: string;
  assigneeIds?: string[];
  followerIds?: string[];
  repeatRule?: string;
  startTimestamp?: string;
  isStartAllDay?: boolean;
  mode?: 1 | 2;
  isMilestone?: boolean;
  subTasks?: TaskCreateItem[];
};

/** 批量创建时的单条任务入参。可设 parentTaskGuid 在已有任务下建子任务，或设 subTasks 建嵌套子任务。 */
export const TaskCreateItemSchema: z.ZodType<TaskCreateItem> = z
  .object({
    parentTaskGuid: TaskParentTaskGuidSchema,
    summary: TaskSummarySchema,
    description: TaskDescriptionSchema,
    dueTimestamp: TaskTimestampSchema,
    isDueAllDay: TaskIsAllDaySchema,
    completedAt: TaskCompletedAtSchema,
    assigneeIds: TaskAssigneeIdsSchema,
    followerIds: TaskFollowerIdsSchema,
    repeatRule: TaskRepeatRuleSchema,
    startTimestamp: TaskTimestampSchema,
    isStartAllDay: TaskIsAllDaySchema,
    mode: TaskModeSchema,
    isMilestone: TaskIsMilestoneSchema,
    subTasks: z.lazy(() => TaskSubTasksSchema),
  })
  .describe('Task item: summary (required), optional description/due/members/subTasks etc. Use subTasks for nested subtasks.');

/** 嵌套子任务数组（可选）。与父任务同结构，支持多层，每层最多 50 个。 */
export const TaskSubTasksSchema = z
  .array(z.lazy(() => TaskCreateItemSchema))
  .max(50)
  .optional()
  .describe('Nested subtasks (optional). Same shape as parent; supports multi-level nesting. Max 50 per level.');

/** 待创建任务列表。顶层 1～50 条，每条可有 subTasks 做嵌套创建。 */
export const TaskCreateBatchSchema = z
  .array(TaskCreateItemSchema)
  .min(1)
  .max(50)
  .describe(
    'Array of tasks to create (required). Each item has summary, description?, parentTaskGuid? (for subtask under existing task), subTasks? (nested subtasks). Min 1, max 50 top-level.',
  );
