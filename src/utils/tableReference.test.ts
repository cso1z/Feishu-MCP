import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTableToken } from './tableReference.js';

test('table references accept tokens and URLs without fetching the supplied host', async () => {
  const unexpectedWiki = async () => {
    throw new Error('Unexpected Wiki request');
  };
  assert.equal(await resolveTableToken('shtcnExample', 'sheet', unexpectedWiki), 'shtcnExample');
  assert.equal(
    await resolveTableToken(
      'https://example.feishu.cn/sheets/shtcnExample?sheet=abc123',
      'sheet',
      unexpectedWiki,
    ),
    'shtcnExample',
  );
  assert.equal(
    await resolveTableToken(
      'https://example.larksuite.com/base/bascnExample?table=tbl123',
      'bitable',
      unexpectedWiki,
    ),
    'bascnExample',
  );
  await assert.rejects(
    resolveTableToken('https://example.feishu.cn/base/bascnExample', 'sheet', unexpectedWiki),
    /sheets/,
  );
});

test('Wiki table references resolve the underlying token and check its resource type', async () => {
  const getNode = async (token: string) => {
    assert.equal(token, 'wikcnExample');
    return { node: { obj_token: 'shtcnExample', obj_type: 'sheet' } };
  };
  assert.equal(
    await resolveTableToken('https://example.feishu.cn/wiki/wikcnExample', 'sheet', getNode),
    'shtcnExample',
  );
  await assert.rejects(
    resolveTableToken('https://example.feishu.cn/wiki/wikcnExample', 'bitable', getNode),
    /contains sheet/,
  );
});
