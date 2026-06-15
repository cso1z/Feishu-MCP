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
}

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
