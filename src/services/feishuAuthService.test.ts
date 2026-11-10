import test from 'node:test';
import assert from 'node:assert/strict';
import './feishuApiService.js';
import axios from 'axios';
import { AuthService } from './feishuAuthService.js';
import { TokenCacheManager } from '../utils/auth/tokenCacheManager.js';
import { Logger } from '../utils/logger.js';

Logger.setEnabled(false);

test('concurrent services share token refreshes and a failed refresh can be retried', async (t) => {
  let writes = 0;
  t.mock.method(
    TokenCacheManager,
    'getInstance',
    () =>
      ({
        getUserTokenInfo: () => ({
          refresh_token: 'fixture-refresh',
          client_id: 'fixture-app',
          client_secret: 'fixture-secret',
        }),
        cacheUserToken: () => {
          writes++;
        },
      }) as unknown as TokenCacheManager,
  );
  const originalAdapter = axios.defaults.adapter;
  let requests = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  axios.defaults.adapter = async (config) => {
    requests++;
    await gate;
    return {
      config,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: {
        access_token: 'fixture-access',
        refresh_token: 'fixture-next-refresh',
        expires_in: 7200,
      },
    };
  };
  try {
    const first = new AuthService();
    const second = new AuthService();
    const pending = [
      first.refreshUserToken('fixture-client'),
      second.refreshUserToken('fixture-client'),
    ];
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(requests, 1);
    release();
    const refreshed = await Promise.all(pending);
    assert.equal(refreshed[0], refreshed[1]);
    assert.equal(writes, 1);

    axios.defaults.adapter = async () => {
      requests++;
      throw new Error('fixture refresh failure');
    };
    const failed = await Promise.allSettled([
      first.refreshUserToken('fixture-client'),
      second.refreshUserToken('fixture-client'),
    ]);
    assert.equal(requests, 2);
    assert.ok(failed.every((result) => result.status === 'rejected'));
    await assert.rejects(first.refreshUserToken('fixture-client'), /fixture refresh failure/);
    assert.equal(requests, 3);
  } finally {
    release();
    axios.defaults.adapter = originalAdapter;
  }
});
