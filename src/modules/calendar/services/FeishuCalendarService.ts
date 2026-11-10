import { FeishuBaseApiService } from '../../../services/feishu/FeishuBaseApiService.js';
export class FeishuCalendarService extends FeishuBaseApiService {
  private events(calendarId: string): string {
    return `/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events`;
  }
  primary(): Promise<unknown> {
    return this.post('/calendar/v4/calendars/primary');
  }
  listCalendars(pageSize: number, pageToken?: string): Promise<unknown> {
    return this.get('/calendar/v4/calendars', {
      page_size: pageSize,
      page_token: pageToken,
    });
  }
  listEvents(
    calendarId: string,
    options: Record<string, unknown>,
  ): Promise<unknown> {
    return this.get(this.events(calendarId), options);
  }
  getEvent(calendarId: string, eventId: string): Promise<unknown> {
    return this.get(
      `${this.events(calendarId)}/${encodeURIComponent(eventId)}`,
    );
  }
  instances(
    calendarId: string,
    startTime: string,
    endTime: string,
  ): Promise<unknown> {
    return this.get(`${this.events(calendarId)}/instance_view`, {
      start_time: startTime,
      end_time: endTime,
    });
  }
  createEvent(
    calendarId: string,
    event: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<unknown> {
    return this.post(
      `${this.events(calendarId)}?idempotency_key=${encodeURIComponent(idempotencyKey)}`,
      event,
    );
  }
  updateEvent(
    calendarId: string,
    eventId: string,
    event: Record<string, unknown>,
  ): Promise<unknown> {
    return this.patch(
      `${this.events(calendarId)}/${encodeURIComponent(eventId)}`,
      event,
    );
  }
  deleteEvent(
    calendarId: string,
    eventId: string,
    notify: boolean,
  ): Promise<unknown> {
    return this.delete(
      `${this.events(calendarId)}/${encodeURIComponent(eventId)}?need_notification=${notify}`,
    );
  }
  freeBusy(userId: string, timeMin: string, timeMax: string): Promise<unknown> {
    return this.post('/calendar/v4/freebusy/list?user_id_type=open_id', {
      user_id: userId,
      time_min: timeMin,
      time_max: timeMax,
    });
  }
}
