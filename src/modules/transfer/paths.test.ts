import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import '../../services/feishuApiService.js';
import { importPath } from './FeishuTransferService.js';

test('imports reject traversal and symlinks escaping the configured file root', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'feishu-paths-'));
  const previous = process.env.FEISHU_FILE_ROOT;
  try {
    const root = path.join(temporary, 'files');
    const outside = path.join(temporary, 'outside');
    await mkdir(root);
    await mkdir(outside);
    await writeFile(path.join(root, 'sample.csv'), 'a,b');
    await writeFile(path.join(outside, 'private.csv'), 'secret');
    await symlink(
      outside,
      path.join(root, 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    process.env.FEISHU_FILE_ROOT = root;
    assert.equal(await importPath('sample.csv'), path.join(root, 'sample.csv'));
    await assert.rejects(
      importPath('../outside/private.csv'),
      /inside FEISHU_FILE_ROOT/,
    );
    await assert.rejects(
      importPath('linked/private.csv'),
      /inside FEISHU_FILE_ROOT/,
    );
  } finally {
    if (previous === undefined) delete process.env.FEISHU_FILE_ROOT;
    else process.env.FEISHU_FILE_ROOT = previous;
    await rm(temporary, { recursive: true });
  }
});
