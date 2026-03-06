import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { formatErrorMessage } from '../../utils/error.js';
import { FeishuApiService } from '../../services/feishuApiService.js';
import { Logger } from '../../utils/logger.js';
import {
  TaskSummarySchema,
  TaskDescriptionSchema,
  TaskDueSchema,
  TaskStartSchema,
  TaskMembersSchema,
  TaskOriginSchema,
  TaskExtraSchema,
  TaskRepeatRuleSchema,
  TaskCustomCompleteSchema,
  TaskModeSchema,
} from '../../types/feishuSchema.js';

/**
 * 注册飞书任务相关的MCP工具
 * @param server MCP服务器实例
 * @param feishuService 飞书API服务实例
 */
export function registerFeishuTaskTools(server: McpServer, feishuService: FeishuApiService | null): void {

  // 添加创建飞书任务工具
  server.tool(
    'create_feishu_task',
    'Creates a new task in Feishu. Supports setting summary (title), description, due date, start date, members (assignees/followers), repeat rules, and more. Returns the created task information including task ID. Members can be assigned using their open_id, user_id, or union_id. If no members are specified, the task will be automatically assigned to the creator. If members are explicitly provided, the task will be assigned to the specified members.',
    {
      summary: TaskSummarySchema,
      description: TaskDescriptionSchema,
      due: TaskDueSchema,
      start: TaskStartSchema,
      members: TaskMembersSchema,
      origin: TaskOriginSchema,
      extra: TaskExtraSchema,
      repeatRule: TaskRepeatRuleSchema,
      customComplete: TaskCustomCompleteSchema,
      mode: TaskModeSchema,
    },
    async ({ summary, description, due, start, members, origin, extra, repeatRule, customComplete, mode }) => {
      try {
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: '飞书服务未初始化，请检查配置' }],
          };
        }

        Logger.info(`开始创建飞书任务，标题: ${summary}`);

        const result = await feishuService.createTask(
          summary,
          description,
          due,
          start,
          members,
          origin,
          extra,
          repeatRule,
          customComplete,
          mode
        );

        if (!result) {
          throw new Error('创建任务失败，未返回任务信息');
        }

        Logger.info(`飞书任务创建成功，任务ID: ${result.task?.guid || 'unknown'}`);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        Logger.error(`创建飞书任务失败:`, error);
        const errorMessage = formatErrorMessage(error, '创建飞书任务失败');
        return {
          content: [{ type: 'text', text: errorMessage }],
        };
      }
    },
  );
}
