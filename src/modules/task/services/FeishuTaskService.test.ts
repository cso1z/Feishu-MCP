import test from 'node:test';
import assert from 'node:assert/strict';
import '../../../services/feishuApiService.js';
import { FeishuTaskService } from './FeishuTaskService.js';
import type { AuthService } from '../../../services/feishuAuthService.js';

test('nested task failures preserve API messages and report skipped descendants', async () => {
  const service = new FeishuTaskService({} as AuthService);
  Object.assign(service, {
    createTask: async () => {
      throw { apiError: { code: 99991672, msg: 'Access denied' } };
    },
  });
  const failed = await service.createTasksNested([{ summary: 'fixture' }]);
  assert.match(failed.errors[0].error, /Access denied/);
  assert.doesNotMatch(failed.errors[0].error, /\[object Object\]/);

  Object.assign(service, { createTask: async () => ({ task: { guid: 'fixtureGuid' } }) });
  const limited = await service.createTasksNested(
    [{ summary: 'fixture', subTasks: [{ summary: 'child' }] }],
    { maxDepth: 0 },
  );
  assert.equal(limited.results.length, 1);
  assert.equal(limited.errors[0].path, '[0].subTasks');
  assert.match(limited.errors[0].error, /depth/);
});
