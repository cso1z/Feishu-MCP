import test from 'node:test';
import assert from 'node:assert/strict';
import '../services/feishuApiService.js';
import { FeishuSheetsService } from './sheets/FeishuSheetsService.js';
import { FeishuBitableService } from './bitable/FeishuBitableService.js';
import type { AuthService } from '../services/feishuAuthService.js';

test('first-row dimension edits and font sizes use the live-verified v2 contracts', async () => {
  const service = new FeishuSheetsService({} as AuthService);
  const calls: { method: string; data: any }[] = [];
  Object.assign(service, {
    request: async (_endpoint: string, method: string, data: unknown) => {
      calls.push({ method, data });
      return {};
    },
  });
  const dimension = {
    sheetId: 'abc',
    majorDimension: 'ROWS' as const,
    startIndex: 0,
    endIndex: 1,
  };
  await service.editDimensions('shtcnTest', dimension, {
    action: 'insert',
    inheritStyle: 'AFTER',
  });
  await service.editDimensions('shtcnTest', dimension, { action: 'delete' });
  await service.editDimensions('shtcnTest', dimension, {
    action: 'resize',
    pixelSize: 40,
  });
  assert.deepEqual(
    calls.map((call) => call.data.dimension),
    [
      dimension,
      { ...dimension, startIndex: 1 },
      { ...dimension, startIndex: 1 },
    ],
  );
  assert.deepEqual(calls[2].data.dimensionProperties, { fixedSize: 40 });
  await service.styleCells('shtcnTest', ['abc!A1:C1'], {
    font: { fontSize: 12, bold: true },
  });
  assert.deepEqual(calls[3].data.data[0].style.font, {
    fontSize: '12pt/1.5',
    bold: true,
  });
});

test('sheet upsert batches large changes and reports partial progress', async () => {
  const service = new FeishuSheetsService({} as AuthService);
  const batches: number[] = [];
  Object.assign(service, {
    readCells: async () => ({ valueRange: { values: [['Key', 'Value']] } }),
    writeCells: async (_sheet: string, ranges: unknown[]) => {
      batches.push(ranges.length);
      if (batches.length === 2) throw new Error('test outage');
    },
  });
  const records = Array.from({ length: 60 }, (_, i) => ({
    Key: String(i),
    Value: i,
  }));
  const plan = (await service.upsertRows(
    'shtcnTest',
    'abc!A1:B80',
    'Key',
    records,
    false,
  )) as { previewToken: string };
  assert.deepEqual(batches, []);
  await assert.rejects(
    service.upsertRows(
      'shtcnTest',
      'abc!A1:B80',
      'Key',
      records,
      true,
      plan.previewToken,
    ),
    /100 confirmed cells.*test outage/,
  );
  assert.deepEqual(batches, [100, 20]);
});

test('sheet upsert writes only supplied columns and appends inside the bounded range', async () => {
  const service = new FeishuSheetsService({} as AuthService);
  const writes: unknown[] = [];
  Object.assign(service, {
    request: async (_endpoint: string, method: string, data: unknown) => {
      if (method === 'GET')
        return {
          valueRange: {
            values: [
              ['Order', 'Count', 'Keep'],
              ['001', 2, 'retain'],
            ],
          },
        };
      writes.push(data);
      return {};
    },
  });
  const input = [
    { Order: '001', Count: 3 },
    { Order: '002', Count: 4 },
  ];
  const plan = (await service.upsertRows(
    'shtcnTest',
    'abc!B2:D8',
    'Order',
    input,
    false,
  )) as { previewToken: string };
  assert.equal(writes.length, 0);
  await assert.rejects(
    service.upsertRows('shtcnTest', 'abc!B2:D8', 'Order', input, true, 'stale'),
    /previewToken/,
  );
  assert.equal(writes.length, 0);
  await service.upsertRows(
    'shtcnTest',
    'abc!B2:D8',
    'Order',
    input,
    true,
    plan.previewToken,
  );
  assert.deepEqual(writes, [
    {
      valueRanges: [
        { range: 'abc!C3:C3', values: [[3]] },
        { range: 'abc!B4:B4', values: [['002']] },
        { range: 'abc!C4:C4', values: [[4]] },
      ],
    },
  ]);
  await assert.rejects(
    service.upsertRows('shtcnTest', 'abc!B2:D3', 'Order', input, false),
    /Not enough/,
  );
});
test('Base upsert reads every page before writes and reports completed batches on failure', async () => {
  const service = new FeishuBitableService({} as AuthService);
  let reads = 0,
    mutations = 0;
  Object.assign(service, {
    searchRecords: async (
      _b: string,
      _t: string,
      p: { pageToken?: string },
    ) => {
      reads++;
      return p.pageToken
        ? {
            items: [{ record_id: 'rec2', fields: { Key: '2', Count: 2 } }],
            has_more: false,
          }
        : {
            items: [{ record_id: 'rec1', fields: { Key: '1', Count: 1 } }],
            has_more: true,
            page_token: 'next',
          };
    },
    updateRecords: async () => {
      mutations++;
    },
    createRecords: async () => {
      throw new Error('test outage');
    },
  });
  const input = [
    { Key: '2', Count: 3 },
    { Key: '3', Count: 4 },
  ];
  const plan = (await service.upsertRecords(
    'baseTest',
    'tbl123',
    'Key',
    input,
    false,
  )) as { previewToken: string };
  assert.equal(reads, 2);
  assert.equal(mutations, 0);
  await assert.rejects(
    service.upsertRecords(
      'baseTest',
      'tbl123',
      'Key',
      input,
      true,
      plan.previewToken,
    ),
    /"created":0,"updated":1.*test outage/,
  );
});
