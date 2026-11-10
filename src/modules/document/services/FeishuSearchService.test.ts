import test from 'node:test';
import assert from 'node:assert/strict';
import '../../../services/feishuApiService.js';
import { FeishuSearchService } from './FeishuSearchService.js';
import type { AuthService } from '../../../services/feishuAuthService.js';
import { Config } from '../../../utils/config.js';

test('document and Wiki searches honor their result limits and encode opaque cursors', async () => {
  const service = new FeishuSearchService({} as AuthService);
  Object.assign(service, {
    request: async (endpoint: string, _method: string, body: { count?: number }) => {
      if (endpoint.includes('docs-api')) {
        assert.equal(body.count, 3);
        return { docs_entities: [1, 2, 3], has_more: true };
      }
      const query = new URL(endpoint, 'https://fixture.invalid').searchParams;
      assert.equal(query.get('page_size'), '3');
      assert.equal(query.get('page_token'), 'cursor+/=&');
      return { items: [1, 2, 3], has_more: true, page_token: 'next' };
    },
  });
  assert.deepEqual(await service.searchDocuments('fixture', 3), {
    items: [1, 2, 3],
    hasMore: true,
    nextOffset: 3,
  });
  assert.deepEqual(await service.searchWikiNodes('fixture', 3, 'cursor+/=&'), {
    items: [1, 2, 3],
    hasMore: true,
    pageToken: 'next',
    count: 3,
  });
});

test('combined search preserves deferred Wiki progress across full document pages', async () => {
  const config = Config.getInstance();
  const authType = config.feishu.authType;
  config.feishu.authType = 'user';
  const service = new FeishuSearchService({} as AuthService);
  let documentHasMore = true;
  Object.assign(service, {
    searchDocuments: async () => ({
      items: Array.from({ length: 100 }, (_, i) => i),
      nextOffset: 100,
      hasMore: documentHasMore,
    }),
    searchWikiNodes: async () => {
      throw new Error('Wiki page should be deferred');
    },
  });
  try {
    const next = await service.search('fixture', 'both', 0, 'wikiCursor');
    assert.deepEqual(next.paginationGuide.nextPageParams, {
      searchType: 'both',
      offset: 100,
      pageToken: 'wikiCursor',
    });
    documentHasMore = false;
    const last = await service.search('fixture', 'both');
    assert.deepEqual(last.paginationGuide.nextPageParams, { searchType: 'wiki' });
  } finally {
    config.feishu.authType = authType;
  }
});
