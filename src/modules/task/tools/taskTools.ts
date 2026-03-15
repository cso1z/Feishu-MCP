import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { formatErrorMessage } from '../../../utils/error.js';
import { FeishuApiService } from '../../../services/feishuApiService.js';
import { Logger } from '../../../utils/logger.js';
import { errorResponse } from '../../document/tools/toolHelpers.js';
import type { RootNestedCreateItem } from '../services/FeishuTaskService.js';
import {
  TaskGuidSchema,
  TaskSummarySchema,
  TaskDescriptionSchema,
  TaskTimestampSchema,
  TaskIsAllDaySchema,
  TaskRepeatRuleSchema,
  TaskCompletedAtSchema,
  TaskModeSchema,
  TaskIsMilestoneSchema,
  TaskCreateBatchSchema,
  TaskAssigneeIdsSchema,
  TaskFollowerIdsSchema,
  TaskReminderRelativeMinutesSchema,
  TaskReminderIdsSchema,
  TaskListPageTokenSchema,
  TaskListCompletedSchema,
  TaskDeleteBatchSchema,
} from '../../../types/taskSchema.js';

/**
 * Registers Feishu task MCP tools.
 */
export function registerTaskTools(server: McpServer, feishuService: FeishuApiService): void {
  server.tool(
    'list_feishu_tasks',
    'Lists tasks assigned to the current user ("我负责的"). Returns up to 100 items per call (2 pages of 50). Optional pageToken for next page, optional completed (true=done only, false=todo only). Response includes slimmed task fields: guid, summary, description, due, reminders, creator, members, status, task_id, url, etc. Requires user_access_token.',
    {
      pageToken: TaskListPageTokenSchema,
      completed: TaskListCompletedSchema,
    },
    async ({ pageToken, completed }) => {
      try {
        Logger.info(`列取飞书任务: completed=${completed ?? 'all'}, pageToken=${pageToken ? 'yes' : 'no'}`);
        const result = await feishuService.listTasks(pageToken, completed);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        Logger.error('列取任务失败:', error);
        return errorResponse(`列取任务失败: ${formatErrorMessage(error)}`);
      }
    },
  );

  server.tool(
    'create_feishu_task',
    'Batch creates Feishu tasks or nested subtasks. Pass an array of task items; each item has summary (required), optional description/due/members/repeat_rule/start/mode/is_milestone, optional parentTaskGuid (create under existing task), and optional subTasks (nested subtasks, multi-level). Use open_id from get_feishu_users for assignees. Min 1, max 50 top-level items; max 50 subTasks per level. Returns nested results and path-indexed errors.',
    {
      tasks: TaskCreateBatchSchema,
    },
    async ({ tasks: taskItems }) => {
      try {
        Logger.info(`批量创建飞书任务(含嵌套): ${taskItems.length} 个顶层`);
        const toNested = (item: (typeof taskItems)[number]): RootNestedCreateItem => {
          const members: Array<{ id: string; type: 'user'; role: 'assignee' | 'follower' }> = [];
          if (item.assigneeIds?.length) members.push(...item.assigneeIds.map((id: string) => ({ id, type: 'user' as const, role: 'assignee' as const })));
          if (item.followerIds?.length) members.push(...item.followerIds.map((id: string) => ({ id, type: 'user' as const, role: 'follower' as const })));
          const node: RootNestedCreateItem = {
            summary: item.summary,
            ...(item.parentTaskGuid !== undefined && { parentTaskGuid: item.parentTaskGuid }),
            ...(item.description !== undefined && { description: item.description }),
            ...(item.dueTimestamp !== undefined && { due: { timestamp: item.dueTimestamp, is_all_day: item.isDueAllDay } }),
            ...(item.completedAt !== undefined && { completed_at: item.completedAt }),
            ...(members.length > 0 && { members }),
            ...(item.repeatRule !== undefined && { repeat_rule: item.repeatRule }),
            ...(item.startTimestamp !== undefined && { start: { timestamp: item.startTimestamp, is_all_day: item.isStartAllDay } }),
            ...(item.mode !== undefined && { mode: item.mode }),
            ...(item.isMilestone !== undefined && { is_milestone: item.isMilestone }),
            ...(item.subTasks?.length && { subTasks: item.subTasks.map(toNested) }),
          };
          return node;
        };
        const rootItems = taskItems.map(toNested);
        const result = await feishuService.createTasksNested(rootItems);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        Logger.error('批量创建任务失败:', error);
        return errorResponse(`批量创建任务失败: ${formatErrorMessage(error)}`);
      }
    },
  );

  server.tool(
    'update_feishu_task',
    'Updates an existing Feishu task. Provide task_guid and the fields to change. Supports summary, description, due, completed_at (use "0" to restore to unfinished), repeat_rule, start, mode, is_milestone. Also supports addAssigneeIds/addFollowerIds and removeAssigneeIds/removeFollowerIds for members; addReminderRelativeMinutes to add a reminder (task must have due; only one per task—remove first if needed) and removeReminderIds (from task.reminders[].id) to remove reminders. At least one update is required.',
    {
      taskGuid: TaskGuidSchema,
      summary: TaskSummarySchema.optional(),
      description: TaskDescriptionSchema,
      dueTimestamp: TaskTimestampSchema,
      isDueAllDay: TaskIsAllDaySchema,
      completedAt: TaskCompletedAtSchema,
      repeatRule: TaskRepeatRuleSchema,
      startTimestamp: TaskTimestampSchema,
      isStartAllDay: TaskIsAllDaySchema,
      mode: TaskModeSchema,
      isMilestone: TaskIsMilestoneSchema,
      addAssigneeIds: TaskAssigneeIdsSchema,
      addFollowerIds: TaskFollowerIdsSchema,
      removeAssigneeIds: TaskAssigneeIdsSchema,
      removeFollowerIds: TaskFollowerIdsSchema,
      addReminderRelativeMinutes: TaskReminderRelativeMinutesSchema,
      removeReminderIds: TaskReminderIdsSchema,
    },
    async ({
      taskGuid,
      summary,
      description,
      dueTimestamp,
      isDueAllDay,
      completedAt,
      repeatRule,
      startTimestamp,
      isStartAllDay,
      mode,
      isMilestone,
      addAssigneeIds,
      addFollowerIds,
      removeAssigneeIds,
      removeFollowerIds,
      addReminderRelativeMinutes,
      removeReminderIds,
    }) => {
      try {
        Logger.info(`更新飞书任务: ${taskGuid}`);
        const hasFieldUpdate =
          summary !== undefined ||
          description !== undefined ||
          dueTimestamp !== undefined ||
          completedAt !== undefined ||
          repeatRule !== undefined ||
          startTimestamp !== undefined ||
          mode !== undefined ||
          isMilestone !== undefined;
        const hasAdd = (addAssigneeIds?.length ?? 0) + (addFollowerIds?.length ?? 0) > 0;
        const hasRemove = (removeAssigneeIds?.length ?? 0) + (removeFollowerIds?.length ?? 0) > 0;
        const hasAddReminder = addReminderRelativeMinutes !== undefined;
        const hasRemoveReminder = (removeReminderIds?.length ?? 0) > 0;
        if (!hasFieldUpdate && !hasAdd && !hasRemove && !hasAddReminder && !hasRemoveReminder) {
          return errorResponse('至少需要一项更新：summary/description/due/completed_at/repeat_rule/start/mode/is_milestone、成员 add/remove、或提醒 addReminderRelativeMinutes/removeReminderIds');
        }

        let result: any;
        if (hasFieldUpdate) {
          const params: any = {};
          if (summary !== undefined) params.summary = summary;
          if (description !== undefined) params.description = description;
          if (dueTimestamp !== undefined) params.due = { timestamp: dueTimestamp, is_all_day: isDueAllDay };
          if (completedAt !== undefined) params.completed_at = completedAt;
          if (repeatRule !== undefined) params.repeat_rule = repeatRule;
          if (startTimestamp !== undefined) params.start = { timestamp: startTimestamp, is_all_day: isStartAllDay };
          if (mode !== undefined) params.mode = mode;
          if (isMilestone !== undefined) params.is_milestone = isMilestone;
          result = await feishuService.updateTask(taskGuid, params);
        }
        if (hasAdd) {
          const members: Array<{ id: string; type: 'user'; role: 'assignee' | 'follower' }> = [];
          if (addAssigneeIds?.length) members.push(...addAssigneeIds.map((id: string) => ({ id, type: 'user' as const, role: 'assignee' as const })));
          if (addFollowerIds?.length) members.push(...addFollowerIds.map((id: string) => ({ id, type: 'user' as const, role: 'follower' as const })));
          result = await feishuService.addTaskMembers(taskGuid, members);
        }
        if (hasRemove) {
          const members: Array<{ id: string; type: 'user'; role: 'assignee' | 'follower' }> = [];
          if (removeAssigneeIds?.length) members.push(...removeAssigneeIds.map((id: string) => ({ id, type: 'user' as const, role: 'assignee' as const })));
          if (removeFollowerIds?.length) members.push(...removeFollowerIds.map((id: string) => ({ id, type: 'user' as const, role: 'follower' as const })));
          result = await feishuService.removeTaskMembers(taskGuid, members);
        }
        if (hasRemoveReminder) {
          result = await feishuService.removeTaskReminders(taskGuid, removeReminderIds!);
        }
        if (hasAddReminder) {
          result = await feishuService.addTaskReminder(taskGuid, addReminderRelativeMinutes!);
        }
        const taskEntity = result != null && typeof result === 'object' && 'task' in result && result.task != null ? result.task : result;
        return { content: [{ type: 'text', text: JSON.stringify(taskEntity, null, 2) }] };
      } catch (error) {
        Logger.error('更新任务失败:', error);
        return errorResponse(`更新任务失败: ${formatErrorMessage(error)}`);
      }
    },
  );

  server.tool(
    'delete_feishu_task',
    'Deletes one or more Feishu tasks by task_guid. Pass an array of task GUIDs (min 1, max 50). Requires edit permission on each task. Returns deleted guids and per-item errors. Deleted tasks cannot be retrieved.',
    {
      taskGuids: TaskDeleteBatchSchema,
    },
    async ({ taskGuids }) => {
      try {
        Logger.info(`批量删除飞书任务: ${taskGuids.length} 个`);
        const result = await feishuService.deleteTasks(taskGuids);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        Logger.error('删除任务失败:', error);
        return errorResponse(`删除任务失败: ${formatErrorMessage(error)}`);
      }
    },
  );
}
