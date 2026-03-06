import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { formatErrorMessage } from '../../utils/error.js';
import { FeishuApiService } from '../../services/feishuApiService.js';
import { Logger } from '../../utils/logger.js';
import {
  CalendarEventSummarySchema,
  CalendarEventDescriptionSchema,
  CalendarEventTimeSchema,
  CalendarEventAttendeesSchema,
  CalendarEventRemindersSchema,
  CalendarEventVisibilitySchema,
  CalendarEventFreeBusyStatusSchema,
  CalendarIdSchema,
  CalendarEventColorSchema,
  CalendarEventRecurrenceSchema,
  CalendarEventLocationSchema,
} from '../../types/feishuSchema.js';

/**
 * 注册飞书日历相关的MCP工具
 * @param server MCP服务器实例
 * @param feishuService 飞书API服务实例
 */
export function registerFeishuCalendarTools(server: McpServer, feishuService: FeishuApiService | null): void {

  // 添加创建日历事件工具
  server.tool(
    'create_feishu_calendar_event',
    'Creates a new calendar event in Feishu. Supports setting summary (title), start/end time, description, attendees (users/groups/meeting rooms), reminders, visibility, free/busy status, location, recurrence rules, and color. ' +
    'For timed events, use "timestamp" (Unix seconds string) in start_time/end_time. For all-day events, use "date" (YYYY-MM-DD format). ' +
    'If no calendarId is provided, the event will be created on the user\'s primary calendar. ' +
    'Attendees can be users (by open_id), group chats (by chat_id), meeting rooms (by room_id), or external users (by email).',
    {
      summary: CalendarEventSummarySchema,
      startTime: CalendarEventTimeSchema,
      endTime: CalendarEventTimeSchema,
      description: CalendarEventDescriptionSchema,
      calendarId: CalendarIdSchema,
      attendees: CalendarEventAttendeesSchema,
      reminders: CalendarEventRemindersSchema,
      visibility: CalendarEventVisibilitySchema,
      freeBusyStatus: CalendarEventFreeBusyStatusSchema,
      location: CalendarEventLocationSchema,
      recurrence: CalendarEventRecurrenceSchema,
      color: CalendarEventColorSchema,
    },
    async ({ summary, startTime, endTime, description, calendarId, attendees, reminders, visibility, freeBusyStatus, location, recurrence, color }) => {
      try {
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: '飞书服务未初始化，请检查配置' }],
          };
        }

        Logger.info(`开始创建飞书日历事件，标题: ${summary}`);

        const result = await feishuService.createCalendarEvent(
          calendarId,
          summary,
          startTime,
          endTime,
          description,
          attendees,
          reminders,
          visibility,
          freeBusyStatus,
          location,
          recurrence,
          color
        );

        if (!result) {
          throw new Error('创建日历事件失败，未返回事件信息');
        }

        Logger.info(`飞书日历事件创建成功，事件ID: ${result.event?.event_id || 'unknown'}`);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        Logger.error(`创建飞书日历事件失败:`, error);
        const errorMessage = formatErrorMessage(error, '创建飞书日历事件失败');
        return {
          content: [{ type: 'text', text: errorMessage }],
        };
      }
    },
  );
}
