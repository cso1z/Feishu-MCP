import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Logger, LogLevel } from './logger.js';

function resetLogger(): void {
  Logger.configure({
    enabled: true,
    minLevel: LogLevel.DEBUG,
    showTimestamp: true,
    showLevel: true,
    logToFile: false,
  });
  Logger.clearDedupeCache();
}

// ─── 原有测试（确保向后兼容） ──────────────────────────────

test('Logger masks secret fields before writing console logs', () => {
  Logger.configure({
    enabled: true,
    minLevel: LogLevel.DEBUG,
    showTimestamp: false,
    showLevel: false,
    logToFile: false,
  });

  const secret = 'super-secret-value';
  const nestedSecret = 'another-secret-value';
  const payload = {
    client_secret: secret,
    nested: { appSecret: nestedSecret },
    requestBody: JSON.stringify({ app_secret: secret }),
    quotedText: `client_secret='${secret}'`,
    plainText: `app_secret=${nestedSecret}`,
  };
  const calls: unknown[][] = [];
  const originalDebug = console.debug;
  console.debug = (...args: unknown[]) => calls.push(args);

  try {
    Logger.debug('request', payload);
  } finally {
    console.debug = originalDebug;
    resetLogger();
  }

  assert.equal(calls.length, 1);
  const output = JSON.stringify(calls[0]);
  assert.doesNotMatch(output, new RegExp(secret));
  assert.doesNotMatch(output, new RegExp(nestedSecret));
  assert.match(output, /su\*\*\*\*ue/);
  assert.match(output, /an\*\*\*\*ue/);
  assert.match(output, /client_secret='su\*\*\*\*ue'/);
  assert.match(output, /app_secret=an\*\*\*\*ue/);
  // 原始数据不被修改
  assert.equal(payload.client_secret, secret);
  assert.equal(payload.nested.appSecret, nestedSecret);
});

test('Logger masks secret fields in file logs', () => {
  const logFilePath = join(tmpdir(), `feishu-mcp-logger-${Date.now()}.log`);
  Logger.configure({
    enabled: true,
    minLevel: LogLevel.DEBUG,
    showTimestamp: false,
    showLevel: false,
    logToFile: true,
    logFilePath,
  });

  const secret = 'file-secret-value';
  const originalDebug = console.debug;
  console.debug = () => {};

  try {
    Logger.debug('axios error', {
      config: {
        data: JSON.stringify({ client_secret: secret }),
      },
    });

    const output = readFileSync(logFilePath, 'utf-8');
    assert.doesNotMatch(output, new RegExp(secret));
    assert.match(output, /fi\*\*\*\*ue/);
  } finally {
    console.debug = originalDebug;
    resetLogger();
    rmSync(logFilePath, { force: true });
  }
});

test('Logger masks secret fields nested in errors', () => {
  Logger.configure({
    enabled: true,
    minLevel: LogLevel.DEBUG,
    showTimestamp: false,
    showLevel: false,
    logToFile: false,
  });

  const secret = 'axios-secret-value';
  const error = new Error('request failed') as Error & {
    config: { data: string };
  };
  error.config = {
    data: JSON.stringify({ client_secret: secret }),
  };
  const calls: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => calls.push(args);

  try {
    Logger.error('axios error', error);
  } finally {
    console.error = originalError;
    resetLogger();
  }

  const output = JSON.stringify(calls);
  assert.doesNotMatch(output, new RegExp(secret));
  assert.match(output, /ax\*\*\*\*ue/);
});

// ─── 新增：扩展脱敏覆盖测试 ──────────────────────────────

test('Logger masks token fields (access_token, refresh_token)', () => {
  Logger.configure({
    enabled: true,
    minLevel: LogLevel.DEBUG,
    showTimestamp: false,
    showLevel: false,
    logToFile: false,
  });

  const tokenValue = 'u-xAbCdEfGhIjKlMnOpQrStUvWxYz123456';
  const refreshValue = 'ur-RefreshTokenLong1234567890ABCDEF';
  const payload = {
    access_token: tokenValue,
    refresh_token: refreshValue,
  };
  const calls: unknown[][] = [];
  const originalDebug = console.debug;
  console.debug = (...args: unknown[]) => calls.push(args);

  try {
    Logger.debug('token info', payload);
  } finally {
    console.debug = originalDebug;
    resetLogger();
  }

  const output = JSON.stringify(calls[0]);
  assert.doesNotMatch(output, new RegExp(tokenValue));
  assert.doesNotMatch(output, new RegExp(refreshValue));
  // Should be masked: first 2 + **** + last 2
  assert.match(output, /u-\*\*\*\*56/);
  assert.match(output, /ur\*\*\*\*EF/);
});

test('Logger masks clientKey, userKey, tenant_key fields', () => {
  Logger.configure({
    enabled: true,
    minLevel: LogLevel.DEBUG,
    showTimestamp: false,
    showLevel: false,
    logToFile: false,
  });

  const clientKey = 'sha256hashvalue1234567890abcdef';
  const userKey = 'my-unique-user-key-uuid-value';
  const tenantKey = 'tenant-key-value-12345678';
  const payload = {
    clientKey,
    userKey,
    tenant_key: tenantKey,
  };
  const calls: unknown[][] = [];
  const originalDebug = console.debug;
  console.debug = (...args: unknown[]) => calls.push(args);

  try {
    Logger.debug('auth data', payload);
  } finally {
    console.debug = originalDebug;
    resetLogger();
  }

  const output = JSON.stringify(calls[0]);
  assert.doesNotMatch(output, new RegExp(clientKey));
  assert.doesNotMatch(output, new RegExp(userKey));
  assert.doesNotMatch(output, new RegExp(tenantKey));
});

test('Logger masks password and credential fields', () => {
  Logger.configure({
    enabled: true,
    minLevel: LogLevel.DEBUG,
    showTimestamp: false,
    showLevel: false,
    logToFile: false,
  });

  const password = 'SuperSecretPassword123!';
  const credential = 'CredentialValueForAccess';
  const payload = {
    password,
    user_credential: credential,
  };
  const calls: unknown[][] = [];
  const originalDebug = console.debug;
  console.debug = (...args: unknown[]) => calls.push(args);

  try {
    Logger.debug('credentials', payload);
  } finally {
    console.debug = originalDebug;
    resetLogger();
  }

  const output = JSON.stringify(calls[0]);
  assert.doesNotMatch(output, new RegExp(password));
  assert.doesNotMatch(output, new RegExp(credential));
});

test('Logger masks authorization header values in strings', () => {
  Logger.configure({
    enabled: true,
    minLevel: LogLevel.DEBUG,
    showTimestamp: false,
    showLevel: false,
    logToFile: false,
  });

  const bearerToken = 'Bearer eyJhbGciOiJSUzI1NiJ9.verylong.token';
  const payload = {
    authorization: bearerToken,
  };
  const calls: unknown[][] = [];
  const originalDebug = console.debug;
  console.debug = (...args: unknown[]) => calls.push(args);

  try {
    Logger.debug('headers', payload);
  } finally {
    console.debug = originalDebug;
    resetLogger();
  }

  const output = JSON.stringify(calls[0]);
  assert.doesNotMatch(output, new RegExp('eyJhbGciOiJSUzI1NiJ9'));
});

test('Logger masks sensitive fields in key=value string format', () => {
  Logger.configure({
    enabled: true,
    minLevel: LogLevel.DEBUG,
    showTimestamp: false,
    showLevel: false,
    logToFile: false,
  });

  const logLine = 'access_token=u-xAbCdEfGhIjKlMnOpQrStUvWxYz123456&refresh_token=long-refresh-token-value-here&client_key=my-client-key-value';
  const calls: unknown[][] = [];
  const originalDebug = console.debug;
  console.debug = (...args: unknown[]) => calls.push(args);

  try {
    Logger.debug(logLine);
  } finally {
    console.debug = originalDebug;
    resetLogger();
  }

  const output = JSON.stringify(calls[0]);
  assert.doesNotMatch(output, /xAbCdEfGhIjKlMnOpQrStUvWxYz/);
  assert.doesNotMatch(output, /long-refresh-token-value/);
  assert.doesNotMatch(output, /my-client-key-value/);
});

test('Logger masks sensitive fields in key: "value" JSON-like strings', () => {
  Logger.configure({
    enabled: true,
    minLevel: LogLevel.DEBUG,
    showTimestamp: false,
    showLevel: false,
    logToFile: false,
  });

  const jsonStr = '{"access_token": "token-to-hide-12345", "user_key": "userkey-to-hide"}';
  const calls: unknown[][] = [];
  const originalDebug = console.debug;
  console.debug = (...args: unknown[]) => calls.push(args);

  try {
    Logger.debug('response:', jsonStr);
  } finally {
    console.debug = originalDebug;
    resetLogger();
  }

  const output = JSON.stringify(calls[0]);
  assert.doesNotMatch(output, /token-to-hide-12345/);
  assert.doesNotMatch(output, /userkey-to-hide/);
});

// ─── 新增：去重功能测试 ──────────────────────────────────

test('Logger.infoOnce deduplicates identical messages', () => {
  Logger.configure({
    enabled: true,
    minLevel: LogLevel.INFO,
    showTimestamp: false,
    showLevel: false,
    logToFile: false,
  });
  Logger.clearDedupeCache();

  const calls: unknown[][] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => calls.push(args);

  try {
    Logger.infoOnce('授权链接已生成');
    Logger.infoOnce('授权链接已生成');
    Logger.infoOnce('授权链接已生成');
    Logger.infoOnce('不同的消息');
  } finally {
    console.info = originalInfo;
    resetLogger();
  }

  // 相同消息只输出一次，不同消息正常输出
  assert.equal(calls.length, 2);
});

test('Logger.warnOnce deduplicates identical messages', () => {
  Logger.configure({
    enabled: true,
    minLevel: LogLevel.WARN,
    showTimestamp: false,
    showLevel: false,
    logToFile: false,
  });
  Logger.clearDedupeCache();

  const calls: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => calls.push(args);

  try {
    Logger.warnOnce('userKey 未提供');
    Logger.warnOnce('userKey 未提供');
    Logger.warnOnce('userKey 未提供');
  } finally {
    console.warn = originalWarn;
    resetLogger();
  }

  assert.equal(calls.length, 1);
});

// ─── 新增：maskSecret 和 isSecretKey 单元测试 ─────────────

test('Logger.maskSecret correctly masks values of different lengths', () => {
  // Short values (<=8) should be fully masked
  assert.equal(Logger.maskSecret('short'), '****');
  assert.equal(Logger.maskSecret('12345678'), '****');
  // Longer values show first 2 and last 2
  assert.equal(Logger.maskSecret('123456789'), '12****89');
  assert.equal(Logger.maskSecret('abcdefghijklmnop'), 'ab****op');
});

test('Logger.isSecretKey matches all expected sensitive field names', () => {
  // Should match
  const sensitiveKeys = [
    'client_secret', 'app_secret', 'appSecret', 'APP_SECRET',
    'access_token', 'accessToken', 'ACCESS_TOKEN',
    'refresh_token', 'refreshToken',
    'tenant_key', 'tenantKey',
    'user_key', 'userKey', 'USER_KEY',
    'client_key', 'clientKey',
    'password', 'Password', 'PASSWORD',
    'authorization', 'Authorization',
    'api_key', 'apiKey', 'API_KEY',
    'bearer_token', 'bearerToken',
    'encryption_key', 'encryptionKey',
    'private_key', 'privateKey',
    'credential', 'user_credential',
  ];

  for (const key of sensitiveKeys) {
    assert.ok(Logger.isSecretKey(key), `Expected "${key}" to be identified as secret`);
  }

  // Should NOT match
  const safeKeys = [
    'name', 'email', 'status', 'code', 'message', 'url',
    'method', 'endpoint', 'port', 'host', 'version',
  ];

  for (const key of safeKeys) {
    assert.ok(!Logger.isSecretKey(key), `Expected "${key}" to NOT be identified as secret`);
  }
});

test('Logger does not mutate original objects during sanitization', () => {
  Logger.configure({
    enabled: true,
    minLevel: LogLevel.DEBUG,
    showTimestamp: false,
    showLevel: false,
    logToFile: false,
  });

  const original = {
    access_token: 'original-token-value-12345',
    user: { name: 'test', password: 'original-pass' },
  };
  const originalDebug = console.debug;
  console.debug = () => {};

  try {
    Logger.debug('data:', original);
  } finally {
    console.debug = originalDebug;
    resetLogger();
  }

  // Original should be unmodified
  assert.equal(original.access_token, 'original-token-value-12345');
  assert.equal(original.user.password, 'original-pass');
});
