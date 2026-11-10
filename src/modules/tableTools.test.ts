import test from 'node:test';
import assert from 'node:assert/strict';
import '../services/feishuApiService.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { FeishuSheetsService } from './sheets/FeishuSheetsService.js';
import { FeishuBitableService } from './bitable/FeishuBitableService.js';
import { sheetsTools } from './sheets/tools.js';
import { bitableTools } from './bitable/tools.js';
import { registerTableTools } from './tableTools.js';
import { ModuleRegistry } from './ModuleRegistry.js';
import { getRequiredScopes } from '../services/constants/feishuScopes.js';
import type { FeishuApiService } from '../services/feishuApiService.js';
import type { AuthService } from '../services/feishuAuthService.js';
import { listTools } from '../cli/dispatcher.js';

test('Sheets uses the v2 value APIs and preserves formulas and empty cells', async () => {
  const calls: unknown[] = [];
  const service = new FeishuSheetsService({} as AuthService);
  Object.assign(service, {
    request: async (endpoint: string, method: string, data: unknown) => {
      calls.push({ endpoint, method, data });
      return { valueRange: { values: [['=SUM(B1:B2)', '', 0, 'FALSE', null]] } };
    },
  });
  const ranges = [
    {
      range: 'abc123!A1:E1',
      values: [[{ type: 'formula' as const, text: '=SUM(B1:B2)' }, '', 0, 'FALSE', null]],
    },
  ];
  await service.writeCells('shtcnExample', ranges);
  await service.readCells('shtcnExample', 'abc123!A1:E1', 'Formula', 'SerialNumber');
  await service.appendRows('shtcnExample', ranges[0]);
  assert.deepEqual(calls, [
    {
      endpoint: '/sheets/v2/spreadsheets/shtcnExample/values_batch_update',
      method: 'POST',
      data: { valueRanges: ranges },
    },
    {
      endpoint: '/sheets/v2/spreadsheets/shtcnExample/values/abc123!A1%3AE1',
      method: 'GET',
      data: { valueRenderOption: 'Formula', dateTimeRenderOption: undefined },
    },
    {
      endpoint: '/sheets/v2/spreadsheets/shtcnExample/values_append',
      method: 'POST',
      data: { valueRange: ranges[0] },
    },
  ]);
});

test('Base search keeps pagination in the query and filtering in the body', async () => {
  const service = new FeishuBitableService({} as AuthService);
  const filter = {
    conjunction: 'and' as const,
    conditions: [{ field_name: 'Status', operator: 'is' as const, value: ['Done'] }],
  };
  Object.assign(service, {
    request: async (endpoint: string, method: string, body: unknown) => {
      const url = new URL(endpoint, 'https://open.feishu.cn');
      assert.equal(method, 'POST');
      assert.equal(url.pathname, '/bitable/v1/apps/bascnExample/tables/tbl123/records/search');
      assert.equal(url.searchParams.get('page_token'), 'cursor+/=');
      assert.equal(url.searchParams.get('page_size'), '2');
      assert.equal(url.searchParams.get('user_id_type'), 'open_id');
      assert.deepEqual(body, {
        view_id: undefined,
        field_names: ['Status'],
        filter,
        sort: undefined,
        automatic_fields: false,
      });
      return { items: [], has_more: true, page_token: 'next' };
    },
  });
  assert.deepEqual(
    await service.searchRecords('bascnExample', 'tbl123', {
      pageSize: 2,
      pageToken: 'cursor+/=',
      automaticFields: false,
      fieldNames: ['Status'],
      filter,
    }),
    { items: [], has_more: true, page_token: 'next' },
  );
});

test('Base record updates preserve rich field values and record IDs', async () => {
  const service = new FeishuBitableService({} as AuthService);
  const records = [
    {
      record_id: 'rec123',
      fields: { Date: 1794278400000, Assignee: [{ id: 'ou_example' }], Number: 0, Text: null },
    },
  ];
  Object.assign(service, {
    request: async (endpoint: string, method: string, data: unknown) => {
      assert.equal(
        endpoint,
        '/bitable/v1/apps/bascnExample/tables/tbl123/records/batch_update?user_id_type=open_id',
      );
      assert.equal(method, 'POST');
      assert.deepEqual(data, { records });
      return { records };
    },
  });
  assert.deepEqual(await service.updateRecords('bascnExample', 'tbl123', records), { records });
});

test('new modules load for both identities and expose the same CLI tools', () => {
  for (const identity of ['user', 'tenant'] as const) {
    assert.deepEqual(
      ModuleRegistry.getEnabledModules(['sheets', 'bitable'], identity).map((m) => m.id),
      ['sheets', 'bitable'],
    );
    for (const tool of [...sheetsTools, ...bitableTools])
      assert.ok(listTools(identity).includes(tool.name));
  }
  assert.deepEqual(
    ModuleRegistry.getEnabledModules(['document']).map((m) => m.id),
    ['document'],
  );
  assert.deepEqual(
    new Set(getRequiredScopes(['sheets', 'bitable'], 'user')),
    new Set(['sheets:spreadsheet', 'bitable:app', 'wiki:wiki:readonly', 'offline_access']),
  );
});

test('CLI validation rejects malformed writes before calling the API', async () => {
  const tool = bitableTools.find((t) => t.name === 'update_feishu_bitable_records')!;
  assert.throws(() =>
    tool.execute(
      { base: 'bascnExample', tableId: 'tbl123', records: [{ record_id: 'rec123', fields: {} }] },
      {} as FeishuApiService,
    ),
  );
  const write = sheetsTools.find((t) => t.name === 'write_feishu_sheet_cells')!;
  assert.throws(() =>
    write.execute(
      { spreadsheet: 'shtcnExample', valueRanges: [{ range: '../invalid', values: [[1]] }] },
      {} as FeishuApiService,
    ),
  );
  assert.throws(() =>
    write.execute(
      { spreadsheet: 'shtcnExample', valueRanges: [{ range: 'abc123!A1:A1', values: [[false]] }] },
      {} as FeishuApiService,
    ),
  );
});

test('formula objects and literal strings retain their cell types', async () => {
  const write = sheetsTools.find((t) => t.name === 'write_feishu_sheet_cells')!;
  const valueRanges = [
    { range: 'abc123!A1:B1', values: [[{ type: 'formula', text: '=1+1' }, '=literal']] },
  ];
  await write.execute({ spreadsheet: 'shtcnExample', valueRanges }, {
    writeSheetCells: async (_spreadsheet: string, actual: unknown) => {
      assert.deepEqual(actual, valueRanges);
    },
  } as unknown as FeishuApiService);
});

test('MCP tools advertise schemas, use defaults, and return API failures as tool errors', async () => {
  const server = new McpServer({ name: 'table-test', version: '1.0.0' });
  const api = {
    readSheetCells: async (...args: unknown[]) => {
      assert.deepEqual(args, ['shtcnExample', 'abc123!A1:B2', 'ToString', 'FormattedString']);
      return {
        valueRange: {
          values: [
            ['Name', 'Value'],
            ['Example', 42],
          ],
        },
      };
    },
    updateBitableRecords: async () => {
      throw new Error('Permission denied');
    },
  } as unknown as FeishuApiService;
  registerTableTools(server, api, [...sheetsTools, ...bitableTools]);
  const client = new Client({ name: 'test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, sheetsTools.length + bitableTools.length);
    assert.equal(
      tools.find((t) => t.name === 'read_feishu_sheet_cells')?.annotations?.readOnlyHint,
      true,
    );
    assert.equal(
      tools.find((t) => t.name === 'write_feishu_sheet_cells')?.annotations?.readOnlyHint,
      false,
    );
    const read = await client.callTool({
      name: 'read_feishu_sheet_cells',
      arguments: { spreadsheet: 'shtcnExample', range: 'abc123!A1:B2' },
    });
    assert.notEqual(read.isError, true);
    assert.match(JSON.stringify(read.content), /Example/);
    const failed = await client.callTool({
      name: 'update_feishu_bitable_records',
      arguments: {
        base: 'bascnExample',
        tableId: 'tbl123',
        records: [{ record_id: 'rec123', fields: { Name: 'Example' } }],
      },
    });
    assert.equal(failed.isError, true);
    assert.match(JSON.stringify(failed.content), /Permission denied/);
  } finally {
    await client.close();
    await server.close();
  }
});
