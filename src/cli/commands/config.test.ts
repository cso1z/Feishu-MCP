import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleConfigSet } from './config.js';

function captureConfigSet(key: string, value: string, envPath: string): {
  code?: number;
  output: string;
} {
  const originalWrite = process.stdout.write;
  const originalExit = process.exit;
  let output = '';
  let code: number | undefined;

  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  process.exit = ((exitCode?: string | number | null) => {
    code = typeof exitCode === 'number' ? exitCode : 0;
    throw new Error('process.exit');
  }) as typeof process.exit;

  try {
    handleConfigSet(key, value, envPath);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'process.exit') {
      throw error;
    }
  } finally {
    process.stdout.write = originalWrite;
    process.exit = originalExit;
  }

  return { code, output };
}

test('config set supports FEISHU_USER_KEY', () => {
  const envPath = join(mkdtempSync(join(tmpdir(), 'feishu-mcp-config-')), '.env');
  const result = captureConfigSet('FEISHU_USER_KEY', 'local-user', envPath);

  assert.equal(result.code, undefined);
  assert.match(result.output, /"ok":true/);
  assert.equal(readFileSync(envPath, 'utf-8'), 'FEISHU_USER_KEY=local-user\n');
});

test('config set does not expose FEISHU_REQUIRE_USER_KEY', () => {
  const envPath = join(mkdtempSync(join(tmpdir(), 'feishu-mcp-config-')), '.env');
  const result = captureConfigSet('FEISHU_REQUIRE_USER_KEY', 'true', envPath);

  assert.equal(result.code, 1);
  const body = JSON.parse(result.output) as {
    error: string;
    availableKeys: Record<string, string>;
  };

  assert.match(body.error, /未知配置项/);
  assert.equal(body.error, '未知配置项: FEISHU_REQUIRE_USER_KEY');
  assert.equal('FEISHU_USER_KEY' in body.availableKeys, true);
  assert.equal('FEISHU_REQUIRE_USER_KEY' in body.availableKeys, false);
});
