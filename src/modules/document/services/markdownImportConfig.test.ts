import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MARKDOWN_IMPORT_MAX_RETRIES,
  MARKDOWN_IMPORT_RETRY_INTERVALS_MS,
  getMarkdownImportRetryDelayMs,
} from './markdownImportConfig.js';

test('markdown import retry policy is internal and stepped', () => {
  assert.equal(MARKDOWN_IMPORT_MAX_RETRIES, 10);
  assert.deepEqual(MARKDOWN_IMPORT_RETRY_INTERVALS_MS, [
    1000, 2000, 3000, 5000, 5000, 5000, 5000, 5000, 5000,
  ]);
  assert.equal(getMarkdownImportRetryDelayMs(0), 1000);
  assert.equal(getMarkdownImportRetryDelayMs(3), 5000);
  assert.equal(getMarkdownImportRetryDelayMs(99), 5000);
});
