import test from 'node:test';
import assert from 'node:assert/strict';
import { FEISHU_SCOPE_VERSION } from './FeishuScopeValidator.js';

test('scope version remains unchanged when the required permissions do not change', () => {
  assert.equal(FEISHU_SCOPE_VERSION, '3.0.0');
});
