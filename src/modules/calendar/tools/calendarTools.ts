import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FeishuApiService } from '../../../services/feishuApiService.js';
import { tableTool, registerTableTools } from '../../tableTools.js';

const timestamp = z
  .string()
  .regex(/^\d+$/)
  .describe('Unix timestamp in seconds, as a string.');
const time = z.union([
  z
    .object({ timestamp, timezone: z.string().default('Asia/Shanghai') })
    .strict(),
  z.object({ date: z.string().date() }).strict(),
]);
const eventShape = {
  summary: z.string().min(1).optional(),
  description: z.string().optional(),
  start_time: time.optional(),
  end_time: time.optional(),
  need_notification: z.boolean().optional(),
  visibility: z.enum(['default', 'public', 'private']).optional(),
  free_busy_status: z.enum(['busy', 'free']).optional(),
  location: z
    .object({ name: z.string().optional(), address: z.string().optional() })
    .optional(),
  reminders: z.array(z.object({ minutes: z.number().int().min(0) })).optional(),
  recurrence: z.string().optional(),
};
function validTimes(event: {
  start_time?: z.infer<typeof time>;
  end_time?: z.infer<typeof time>;
}): boolean {
  if (!event.start_time || !event.end_time) return true;
  const start = event.start_time,
    end = event.end_time;
  if ('timestamp' in start && 'timestamp' in end)
    return Number(end.timestamp) > Number(start.timestamp);
  if ('date' in start && 'date' in end) return end.date > start.date;
  return false;
}
const calendar = { calendarId: z.string().min(1) };
const event = { ...calendar, eventId: z.string().min(1) };
export const calendarTools = [
  tableTool(
    'get_feishu_primary_calendar',
    'Get the current user primary calendar and user open_id.',
    {},
    true,
    (_p, a) => a.getPrimaryCalendar(),
  ),
  tableTool(
    'list_feishu_calendars',
    'List subscribed calendars and access roles; follow page_token.',
    {
      pageSize: z.number().int().min(1).max(1000).default(100),
      pageToken: z.string().optional(),
    },
    true,
    (p, a) => a.listCalendars(p.pageSize, p.pageToken),
  ),
  tableTool(
    'list_feishu_calendar_events',
    'List event definitions, including recurring series. Use instances for expanded occurrences. Follow page_token; sync_token cannot be combined with time restrictions.',
    {
      ...calendar,
      options: z
        .object({
          page_size: z.number().int().min(1).max(1000).default(100),
          page_token: z.string().optional(),
          sync_token: z.string().optional(),
          anchor_time: timestamp.optional(),
          start_time: timestamp.optional(),
          end_time: timestamp.optional(),
        })
        .refine(
          (v) =>
            !(v.sync_token && (v.start_time || v.end_time || v.anchor_time)),
          'sync_token cannot be combined with time restrictions.',
        )
        .refine(
          (v) =>
            !v.start_time ||
            !v.end_time ||
            Number(v.end_time) > Number(v.start_time),
          'End must follow start.',
        )
        .default({}),
    },
    true,
    (p, a) => a.listCalendarEvents(p.calendarId, p.options),
  ),
  tableTool(
    'get_feishu_calendar_event',
    'Read an event before editing it.',
    event,
    true,
    (p, a) => a.getCalendarEvent(p.calendarId, p.eventId),
  ),
  tableTool(
    'get_feishu_calendar_instances',
    'Expand recurring events within a time window of at most 40 days. Unix seconds, end exclusive.',
    { ...calendar, startTime: timestamp, endTime: timestamp },
    true,
    (p, a) => {
      const duration = Number(p.endTime) - Number(p.startTime);
      if (duration <= 0 || duration > 40 * 86400)
        throw new Error(
          'Use a time window longer than zero and no longer than 40 days.',
        );
      return a.getCalendarInstances(p.calendarId, p.startTime, p.endTime);
    },
  ),
  tableTool(
    'create_feishu_calendar_event',
    'Create an event without inviting attendees. Use a stable UUID idempotencyKey for retries. All-day end date is exclusive. Only create requested events.',
    {
      ...calendar,
      idempotencyKey: z.string().uuid(),
      event: z
        .object({
          ...eventShape,
          summary: z.string().min(1),
          start_time: time,
          end_time: time,
        })
        .refine(
          validTimes,
          'End must follow start, using the same time format.',
        ),
    },
    false,
    (p, a) => a.createCalendarEvent(p.calendarId, p.event, p.idempotencyKey),
  ),
  tableTool(
    'update_feishu_calendar_event',
    'Patch selected event fields. Read the event first. Notifications use need_notification. Only edit requested events.',
    {
      ...event,
      event: z
        .object(eventShape)
        .refine((v) => Object.keys(v).length > 0, 'Supply an event change.')
        .refine(
          validTimes,
          'End must follow start, using the same time format.',
        ),
    },
    false,
    (p, a) => a.updateCalendarEvent(p.calendarId, p.eventId, p.event),
  ),
  tableTool(
    'delete_feishu_calendar_event',
    'Delete/cancel the selected event, only on explicit request. May notify participants.',
    { ...event, notify: z.boolean().default(false) },
    false,
    (p, a) => a.deleteCalendarEvent(p.calendarId, p.eventId, p.notify),
  ),
  tableTool(
    'get_feishu_calendar_free_busy',
    'Query primary-calendar availability by user open_id over an RFC3339 interval.',
    {
      userId: z.string().min(1),
      timeMin: z.string().datetime({ offset: true }),
      timeMax: z.string().datetime({ offset: true }),
    },
    true,
    (p, a) => {
      if (Date.parse(p.timeMax) <= Date.parse(p.timeMin))
        throw new Error('timeMax must follow timeMin.');
      return a.getCalendarFreeBusy(p.userId, p.timeMin, p.timeMax);
    },
  ),
];
export function registerCalendarTools(
  server: McpServer,
  api: FeishuApiService,
): void {
  registerTableTools(server, api, calendarTools);
}
