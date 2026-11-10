import test from 'node:test';
import assert from 'node:assert/strict';
import './feishuApiService.js';
import type { Request, Response } from 'express';
import { AuthService } from './feishuAuthService.js';
import { callback } from './callbackService.js';
import { Config } from '../utils/config.js';
import { AuthUtils } from '../utils/auth/authUtils.js';
import { TokenCacheManager } from '../utils/auth/tokenCacheManager.js';
import { Logger } from '../utils/logger.js';

Logger.setEnabled(false);

test('OAuth callback accepts encrypted state and exchanges the code using server credentials', async (t) => {
  const config = Config.getInstance();
  const original = { ...config.feishu };
  Object.assign(config.feishu, { appId: 'fixture-app', appSecret: 'fixture-secret' });
  let exchanges = 0;
  let writes = 0;
  t.mock.method(
    AuthService.prototype,
    'getUserTokenByCode',
    async (params: Parameters<AuthService['getUserTokenByCode']>[0]) => {
      exchanges++;
      assert.equal(params.client_id, 'fixture-app');
      assert.equal(params.client_secret, 'fixture-secret');
      assert.equal(params.redirect_uri, 'http://localhost:3333/callback');
      return { access_token: 'fixture-access', expires_in: 7200 };
    },
  );
  t.mock.method(AuthService.prototype, 'getUserInfo', async () => ({ data: { name: 'Fixture' } }));
  t.mock.method(
    TokenCacheManager,
    'getInstance',
    () =>
      ({
        cacheUserToken: () => {
          writes++;
        },
      }) as unknown as TokenCacheManager,
  );
  const response = {
    setHeader: () => {},
    status: () => response,
    send: (html: string) => {
      assert.ok(html.length > 0);
      assert.doesNotMatch(html, /fixture-secret/);
    },
  } as unknown as Response;
  try {
    const state = AuthUtils.encodeState(
      'fixture-app',
      'fixture-secret',
      'fixture-client',
      'http://localhost:3333/callback',
    );
    await callback({ query: { code: 'fixture-code', state } } as unknown as Request, response);
    assert.equal(exchanges, 1);
    assert.equal(writes, 1);
    await callback(
      { query: { code: 'fixture-code', state: 'v2.invalid' } } as unknown as Request,
      response,
    );
    assert.equal(exchanges, 1);
    assert.equal(writes, 1);
  } finally {
    Object.assign(config.feishu, original);
  }
});
