import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCliErrorResponse } from './error.js';

test('buildCliErrorResponse includes structured recovery information', () => {
  const error = Object.assign(new Error('Wiki move failed'), {
    name: 'WikiMovePartialFailureError',
    recovery: {
      stage: 'wiki_move',
      document: {
        token: 'doc-token',
        url: 'https://example.feishu.cn/docx/doc-token',
      },
      wikiContext: { spaceId: 'space-123' },
      taskId: 'wiki-task-1',
    },
  });

  const response = buildCliErrorResponse(error);

  assert.equal(response.error, 'Wiki move failed');
  assert.deepEqual(response.recovery, error.recovery);
});

test('buildCliErrorResponse preserves structured Feishu API details', () => {
  const response = buildCliErrorResponse({
    status: 403,
    err: 'API request failed',
    apiError: {
      code: 99991663,
      msg: 'permission denied',
    },
  });

  assert.match(response.error, /permission denied/);
  assert.match(response.error, /99991663/);
  assert.doesNotMatch(response.error, /\[object Object\]/);
  assert.equal(response.recovery, undefined);
});
