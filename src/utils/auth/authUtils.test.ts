import test from 'node:test';
import assert from 'node:assert/strict';
import '../../services/feishuApiService.js';
import { Config } from '../config.js';
import { AuthUtils } from './authUtils.js';

test('OAuth state conceals credentials and rejects tampering, wrong keys, and expired states', (t) => {
  const config = Config.getInstance();
  const original = { ...config.feishu };
  Object.assign(config.feishu, { appId: 'fixture-app', appSecret: 'fixture-secret' });
  let now = 10000;
  t.mock.method(AuthUtils, 'timestamp', () => now);
  try {
    const state = AuthUtils.encodeState(
      'fixture-app',
      'fixture-secret',
      'fixture-client',
      'http://localhost:3333/callback',
    );
    assert.ok(state.startsWith('v2.'));
    assert.doesNotMatch(
      Buffer.from(state.slice(3), 'base64url').toString('utf8'),
      /fixture-secret|fixture-client/,
    );
    assert.equal(AuthUtils.decodeState(state)?.clientKey, 'fixture-client');
    assert.notEqual(
      state,
      AuthUtils.encodeState('fixture-app', 'fixture-secret', 'fixture-client'),
    );
    const changed = Buffer.from(state.slice(3), 'base64url');
    changed[changed.length - 1] ^= 1;
    assert.equal(AuthUtils.decodeState('v2.' + changed.toString('base64url')), null);
    config.feishu.appSecret = 'different-fixture-secret';
    assert.equal(AuthUtils.decodeState(state), null);
    config.feishu.appSecret = 'fixture-secret';
    now += 901;
    assert.equal(AuthUtils.decodeState(state), null);
  } finally {
    Object.assign(config.feishu, original);
  }
});

test('recent legacy OAuth links remain readable and malformed states are rejected', (t) => {
  const config = Config.getInstance();
  const original = { ...config.feishu };
  Object.assign(config.feishu, { appId: 'fixture-app', appSecret: 'fixture-secret' });
  t.mock.method(AuthUtils, 'timestamp', () => 10000);
  try {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64');
    const legacy = {
      appId: 'fixture-app',
      appSecret: 'fixture-secret',
      clientKey: 'fixture-client',
      timestamp: 9990,
    };
    assert.equal(AuthUtils.decodeState(encode(legacy))?.clientKey, 'fixture-client');
    assert.equal(AuthUtils.decodeState(encode({ ...legacy, timestamp: 0 })), null);
    assert.equal(AuthUtils.decodeState(encode({ ...legacy, appSecret: 'wrong' })), null);
    assert.equal(AuthUtils.decodeState(encode({ ...legacy, timestamp: 'invalid' })), null);
    assert.equal(AuthUtils.decodeState('v2.invalid'), null);
    assert.equal(AuthUtils.decodeState('invalid'), null);
  } finally {
    Object.assign(config.feishu, original);
  }
});
