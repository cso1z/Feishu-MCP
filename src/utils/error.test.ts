import test from 'node:test';
import assert from 'node:assert/strict';
import { formatErrorMessage } from './error.js';

test('permission failures and rate limits give distinct guidance and retain log IDs', () => {
  const permission = formatErrorMessage({
    apiError: { code: 99991672, msg: 'Access denied', log_id: 'fixture-log-id' },
  });
  assert.match(permission, /缺少接口所需权限/);
  assert.doesNotMatch(permission, /请求频率超过限制/);
  assert.match(permission, /fixture-log-id/);
  assert.match(formatErrorMessage({ code: 99991400, msg: 'rate limited' }), /请求频率超过限制/);
});
