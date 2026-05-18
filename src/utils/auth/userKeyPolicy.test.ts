import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMissingUserKeyMessage,
  isConfiguredUserKeyProvided,
  resolveExistingStreamableSessionContext,
  resolveServiceUserKeyContext,
  shouldWarnFallbackUserKeyOnce,
  shouldRequireExplicitUserKey,
} from './userKeyPolicy.js';

test('strict user-key policy defaults to compatibility mode', () => {
  assert.equal(shouldRequireExplicitUserKey('user', false), false);
  assert.equal(shouldRequireExplicitUserKey('tenant', true), false);
});

test('strict user-key policy applies only to user auth when enabled', () => {
  assert.equal(shouldRequireExplicitUserKey('user', true), true);
});

test('stdio default userKey is not treated as explicit local identity', () => {
  assert.equal(isConfiguredUserKeyProvided('stdio'), false);
  assert.equal(isConfiguredUserKeyProvided('local-user'), true);
});

test('stdio missing user-key message only includes local configuration options', () => {
  const message = buildMissingUserKeyMessage('stdio', 'fixed-user-key');

  assert.match(message, /FEISHU_USER_KEY/);
  assert.match(message, /feishu-tool config set FEISHU_USER_KEY/);
  assert.match(message, /--user-key/);
  assert.match(message, /fixed-user-key/);
  assert.doesNotMatch(message, /Header/);
  assert.doesNotMatch(message, /\?userKey/);
});

test('http missing user-key message only includes request options', () => {
  const message = buildMissingUserKeyMessage('http', 'fixed-user-key');

  assert.match(message, /user-key/);
  assert.match(message, /\?userKey/);
  assert.match(message, /fixed-user-key/);
  assert.doesNotMatch(message, /FEISHU_USER_KEY/);
  assert.doesNotMatch(message, /--user-key/);
});

test('existing StreamableHTTP session keeps explicit userKey state when later requests omit userKey', () => {
  const context = resolveExistingStreamableSessionContext({
    sessionId: 'session-1',
    storedUserKey: 'user-a',
    storedIsUserKeyProvided: true,
  });

  assert.deepEqual(context, {
    userKey: 'user-a',
    isUserKeyProvided: true,
    shouldUpdateSession: false,
  });
});

test('StreamableHTTP request with userKey marks the session as explicit', () => {
  const context = resolveExistingStreamableSessionContext({
    sessionId: 'session-1',
    storedUserKey: 'session-1',
    storedIsUserKeyProvided: false,
    requestUserKey: 'user-b',
  });

  assert.deepEqual(context, {
    userKey: 'user-b',
    isUserKeyProvided: true,
    shouldUpdateSession: true,
  });
});

test('fallback userKey warning is emitted once per mode and key', () => {
  assert.equal(shouldWarnFallbackUserKeyOnce('http', 'fallback-a'), true);
  assert.equal(shouldWarnFallbackUserKeyOnce('http', 'fallback-a'), false);
  assert.equal(shouldWarnFallbackUserKeyOnce('stdio', 'fallback-a'), true);
  assert.equal(shouldWarnFallbackUserKeyOnce('http', 'fallback-b'), true);
});

test('service userKey context falls back to configured stdio key when async context is absent', () => {
  assert.deepEqual(
    resolveServiceUserKeyContext({
      hasAsyncContext: false,
      contextIsUserKeyProvided: false,
      contextMode: 'unknown',
      userKey: 'local-user',
    }),
    {
      isUserKeyProvided: true,
      mode: 'stdio',
    }
  );
});
