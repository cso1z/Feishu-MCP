import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

test('main CLI prints package version without starting the server', () => {
  const result = spawnSync(process.execPath, ['dist/cli.js', '--version'], {
    encoding: 'utf-8',
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.trim(), packageJson.version);
});

test('main CLI help still prints yargs usage metadata', () => {
  const result = spawnSync(process.execPath, ['dist/cli.js', '--help'], {
    encoding: 'utf-8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /--version/);
  assert.match(result.stdout, /--feishu-app-id/);
});
