import test from 'node:test';
import assert from 'node:assert/strict';
import '../services/feishuApiService.js';
import { calendarTools } from './calendar/tools/calendarTools.js';
import { dispatch, listTools } from '../cli/dispatcher.js';
import { ModuleRegistry } from './ModuleRegistry.js';
import { Config } from '../utils/config.js';
import { Logger } from '../utils/logger.js';
Logger.setEnabled(false);

test('calendar validates times and has matching MCP and CLI declarations', () => {
  const create = calendarTools.find(
    (t) => t.name === 'create_feishu_calendar_event',
  )!;
  assert.equal(
    create.schema.safeParse({
      calendarId: 'calendar',
      idempotencyKey: '10000000-0000-4000-8000-000000000000',
      event: {
        summary: 'test',
        start_time: { timestamp: '20' },
        end_time: { timestamp: '10' },
      },
    }).success,
    false,
  );
  for (const tool of calendarTools)
    assert.ok(listTools('user').includes(tool.name));
  assert.equal(
    listTools('tenant').includes('create_feishu_calendar_event'),
    false,
  );
  assert.deepEqual(
    ModuleRegistry.getEnabledModules(['calendar'], 'user').map((m) => m.id),
    ['calendar'],
  );
});

test('tenant CLI rejects calendar writes before requesting credentials', async () => {
  const config = Config.getInstance();
  const original = config.feishu.authType;
  config.feishu.authType = 'tenant';
  try {
    await assert.rejects(dispatch('create_feishu_calendar_event', {}), /FEISHU_AUTH_TYPE=user/);
  } finally {
    config.feishu.authType = original;
  }
});
