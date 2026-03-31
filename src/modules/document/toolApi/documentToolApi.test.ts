import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from './documentToolApi.js';
import type { FeishuApiService } from '../../../services/feishuApiService.js';

test('createDocument ignores wikiContext with empty spaceId when folderToken is provided', async () => {
  const api = {
    createDocument: async (title: string, folderToken: string) => ({ title, folderToken }),
  } as unknown as FeishuApiService;

  const result = await createDocument(
    { title: 'Drive Doc', folderToken: 'folder-123', wikiContext: { spaceId: '' } },
    api
  );

  assert.deepEqual(result, { title: 'Drive Doc', folderToken: 'folder-123' });
});

test('createDocument still rejects when both folderToken and a valid wikiContext are provided', async () => {
  const api = {} as FeishuApiService;

  await assert.rejects(
    createDocument(
      { title: 'Conflict Doc', folderToken: 'folder-123', wikiContext: { spaceId: 'space-123' } },
      api
    ),
    /不能同时提供 folderToken 和 wikiContext/
  );
});
