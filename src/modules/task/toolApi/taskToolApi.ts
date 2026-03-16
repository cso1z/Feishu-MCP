import { FeishuApiService } from '../../../services/feishuApiService.js';
import { Logger } from '../../../utils/logger.js';
import type { RootNestedCreateItem } from '../services/FeishuTaskService.js';
import type { TaskCreateItem } from '../../../types/taskSchema.js';
import {
  TaskCreateBatchSchema,
  TaskDeleteBatchSchema,
} from '../../../types/taskSchema.js';

function toNested(item: TaskCreateItem): RootNestedCreateItem {
  const members: Array<{ id: string; type: 'user'; role: 'assignee' | 'follower' }> = [];
  if (item.assigneeIds?.length) {
    members.push(...item.assigneeIds.map((id) => ({ id, type: 'user' as const, role: 'assignee' as const })));
  }
  if (item.followerIds?.length) {
    members.push(...item.followerIds.map((id) => ({ id, type: 'user' as const, role: 'follower' as const })));
  }
  return {
    summary: item.summary,
    ...(item.parentTaskGuid !== undefined && { parentTaskGuid: item.parentTaskGuid }),
    ...(item.description !== undefined && { description: item.description }),
    ...(item.dueTimestamp !== undefined && { due: { timestamp: item.dueTimestamp, is_all_day: item.isDueAllDay } }),
    ...(item.completedAt !== undefined && { completed_at: item.completedAt }),
    ...(members.length > 0 && { members }),
    ...(item.repeatRule !== undefined && { repeat_rule: item.repeatRule }),
    ...(item.startTimestamp !== undefined && {
      start: { timestamp: item.startTimestamp, is_all_day: item.isStartAllDay },
    }),
    ...(item.mode !== undefined && { mode: item.mode }),
    ...(item.isMilestone !== undefined && { is_milestone: item.isMilestone }),
    ...(item.subTasks?.length && { subTasks: item.subTasks.map(toNested) }),
  };
}

/**
 * 批量创建飞书任务（含嵌套子任务）
 */
export async function createTasks(
  taskItems: TaskCreateItem[],
  api: FeishuApiService
): Promise<{ results: any[]; errors: { path: string; error: string }[] }> {
  const parsed = TaskCreateBatchSchema.safeParse(taskItems);
  if (!parsed.success) {
    throw new Error(`参数校验失败: ${parsed.error.message}`);
  }

  Logger.info(`createTasks invoked: ${parsed.data.length} top-level items`);

  const rootItems = parsed.data.map(toNested);
  const result = await api.createTasksNested(rootItems);

  return result;
}

/**
 * 列取飞书任务（我负责的）
 */
export async function listTasks(
  options: { pageToken?: string; completed?: boolean } | undefined,
  api: FeishuApiService
): Promise<{ items: any[]; page_token?: string; has_more: boolean }> {
  Logger.info(`listTasks invoked: pageToken=${options?.pageToken ? 'yes' : 'no'}, completed=${options?.completed ?? 'all'}`);

  return api.listTasks(options?.pageToken, options?.completed);
}

export interface UpdateTaskParams {
  taskGuid: string;
  summary?: string;
  description?: string;
  dueTimestamp?: string;
  isDueAllDay?: boolean;
  completedAt?: string;
  repeatRule?: string;
  startTimestamp?: string;
  isStartAllDay?: boolean;
  mode?: 1 | 2;
  isMilestone?: boolean;
  addAssigneeIds?: string[];
  addFollowerIds?: string[];
  removeAssigneeIds?: string[];
  removeFollowerIds?: string[];
  addReminderRelativeMinutes?: number;
  removeReminderIds?: string[];
}

/**
 * 更新飞书任务
 */
export async function updateTask(params: UpdateTaskParams, api: FeishuApiService): Promise<any> {
  const { taskGuid, ...rest } = params;

  const hasFieldUpdate =
    rest.summary !== undefined ||
    rest.description !== undefined ||
    rest.dueTimestamp !== undefined ||
    rest.completedAt !== undefined ||
    rest.repeatRule !== undefined ||
    rest.startTimestamp !== undefined ||
    rest.mode !== undefined ||
    rest.isMilestone !== undefined;
  const hasAdd = (rest.addAssigneeIds?.length ?? 0) + (rest.addFollowerIds?.length ?? 0) > 0;
  const hasRemove = (rest.removeAssigneeIds?.length ?? 0) + (rest.removeFollowerIds?.length ?? 0) > 0;
  const hasAddReminder = rest.addReminderRelativeMinutes !== undefined;
  const hasRemoveReminder = (rest.removeReminderIds?.length ?? 0) > 0;

  if (!hasFieldUpdate && !hasAdd && !hasRemove && !hasAddReminder && !hasRemoveReminder) {
    throw new Error(
      '至少需要一项更新：summary/description/due/completed_at/repeat_rule/start/mode/is_milestone、成员 add/remove、或提醒 addReminderRelativeMinutes/removeReminderIds'
    );
  }

  Logger.info(`updateTask invoked: taskGuid=${taskGuid}`);

  let result: any;

  if (hasFieldUpdate) {
    const updateParams: Record<string, unknown> = {};
    if (rest.summary !== undefined) updateParams.summary = rest.summary;
    if (rest.description !== undefined) updateParams.description = rest.description;
    if (rest.dueTimestamp !== undefined) updateParams.due = { timestamp: rest.dueTimestamp, is_all_day: rest.isDueAllDay };
    if (rest.completedAt !== undefined) updateParams.completed_at = rest.completedAt;
    if (rest.repeatRule !== undefined) updateParams.repeat_rule = rest.repeatRule;
    if (rest.startTimestamp !== undefined) updateParams.start = { timestamp: rest.startTimestamp, is_all_day: rest.isStartAllDay };
    if (rest.mode !== undefined) updateParams.mode = rest.mode;
    if (rest.isMilestone !== undefined) updateParams.is_milestone = rest.isMilestone;
    result = await api.updateTask(taskGuid, updateParams);
  }

  if (hasAdd) {
    const members: Array<{ id: string; type: 'user'; role: 'assignee' | 'follower' }> = [];
    if (rest.addAssigneeIds?.length) {
      members.push(...rest.addAssigneeIds.map((id) => ({ id, type: 'user' as const, role: 'assignee' as const })));
    }
    if (rest.addFollowerIds?.length) {
      members.push(...rest.addFollowerIds.map((id) => ({ id, type: 'user' as const, role: 'follower' as const })));
    }
    result = await api.addTaskMembers(taskGuid, members);
  }

  if (hasRemove) {
    const members: Array<{ id: string; type: 'user'; role: 'assignee' | 'follower' }> = [];
    if (rest.removeAssigneeIds?.length) {
      members.push(...rest.removeAssigneeIds.map((id) => ({ id, type: 'user' as const, role: 'assignee' as const })));
    }
    if (rest.removeFollowerIds?.length) {
      members.push(...rest.removeFollowerIds.map((id) => ({ id, type: 'user' as const, role: 'follower' as const })));
    }
    result = await api.removeTaskMembers(taskGuid, members);
  }

  if (hasRemoveReminder) {
    result = await api.removeTaskReminders(taskGuid, rest.removeReminderIds!);
  }
  if (hasAddReminder) {
    result = await api.addTaskReminder(taskGuid, rest.addReminderRelativeMinutes!);
  }

  const taskEntity =
    result != null && typeof result === 'object' && 'task' in result && result.task != null ? result.task : result;
  return taskEntity;
}

/**
 * 批量删除飞书任务
 */
export async function deleteTasks(
  taskGuids: string[],
  api: FeishuApiService
): Promise<{ deleted: string[]; errors: { taskGuid: string; error: string }[] }> {
  const parsed = TaskDeleteBatchSchema.safeParse(taskGuids);
  if (!parsed.success) {
    throw new Error(`参数校验失败: ${parsed.error.message}`);
  }

  Logger.info(`deleteTasks invoked: ${parsed.data.length} tasks`);

  return api.deleteTasks(parsed.data);
}
