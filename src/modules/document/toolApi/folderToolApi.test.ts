import test from 'node:test';
import assert from 'node:assert/strict';
import { getFolderFiles } from './folderToolApi.js';
import type { FeishuApiService } from '../../../services/feishuApiService.js';

test('getFolderFiles ignores wikiContext with empty spaceId when folderToken is provided', async () => {
  const api = {
    getFolderFileList: async (folderToken: string) => ({ files: [{ token: folderToken }] }),
  } as unknown as FeishuApiService;

  const result = await getFolderFiles(
    { folderToken: 'folder-123', wikiContext: { spaceId: '' } },
    api
  );

  assert.deepEqual(result, { files: [{ token: 'folder-123' }] });
});

test('getFolderFiles still rejects when both folderToken and a valid wikiContext are provided', async () => {
  const api = {} as FeishuApiService;

  await assert.rejects(
    getFolderFiles(
      { folderToken: 'folder-123', wikiContext: { spaceId: 'space-123' } },
      api
    ),
    /不能同时提供 folderToken 和 wikiContext/
  );
});
