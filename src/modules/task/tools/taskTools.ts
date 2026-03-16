import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { formatErrorMessage } from '../../../utils/error.js';
import { FeishuApiService } from '../../../services/feishuApiService.js';
import { Logger } from '../../../utils/logger.js';
import { errorResponse } from '../../document/tools/toolHelpers.js';
import { createTasks, listTasks, updateTask, deleteTasks } from '../toolApi/index.js';
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
        const result = await listTasks({ pageToken, completed }, feishuService);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        Logger.error('列取任务失败:', error);
        return errorResponse(`列取任务失败: ${formatErrorMessage(error)}`);
      }
    }
  );

  server.tool(
    'create_feishu_task',
    'Batch creates Feishu tasks or nested subtasks. Pass an array of task items; each item has summary (required), optional description/due/members/repeat_rule/start/mode/is_milestone, optional parentTaskGuid (create under existing task), and optional subTasks (nested subtasks, multi-level). Use open_id from get_feishu_users for assignees. Min 1, max 50 top-level items; max 50 subTasks per level. Returns nested results and path-indexed errors.',
    {
      tasks: TaskCreateBatchSchema,
    },
    async ({ tasks: taskItems }) => {
      try {
        const result = await createTasks(taskItems, feishuService);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        Logger.error('批量创建任务失败:', error);
        return errorResponse(`批量创建任务失败: ${formatErrorMessage(error)}`);
      }
    }
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
        const result = await updateTask(
          {
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
          },
          feishuService
        );
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        Logger.error('更新任务失败:', error);
        return errorResponse(`更新任务失败: ${formatErrorMessage(error)}`);
      }
    }
  );

  server.tool(
    'delete_feishu_task',
    'Deletes one or more Feishu tasks by task_guid. Pass an array of task GUIDs (min 1, max 50). Requires edit permission on each task. Returns deleted guids and per-item errors. Deleted tasks cannot be retrieved.',
    {
      taskGuids: TaskDeleteBatchSchema,
    },
    async ({ taskGuids }) => {
      try {
        const result = await deleteTasks(taskGuids, feishuService);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        Logger.error('删除任务失败:', error);
        return errorResponse(`删除任务失败: ${formatErrorMessage(error)}`);
      }
    }
  );
}
