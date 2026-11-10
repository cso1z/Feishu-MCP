import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCliErrorResponse, hasPartialToolFailure } from './error.js';

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

test('CLI batch failures set a failing exit status while keeping partial results available', () => {
  assert.equal(hasPartialToolFailure('delete_feishu_task', { deleted: ['ok'], errors: [{ error: 'denied' }] }), true);
  assert.equal(hasPartialToolFailure('create_feishu_task', { results: [], errors: [] }), false);
  assert.equal(hasPartialToolFailure('fill_whiteboard_with_plantuml', { failed: 1 }), true);
  assert.equal(hasPartialToolFailure('upload_and_bind_image_to_block', [{ blockId: 'ok' }, { error: 'denied' }]), true);
  assert.equal(hasPartialToolFailure('read_feishu_sheet_cells', { errors: ['cell value'] }), false);
});
