import test from 'node:test';
import assert from 'node:assert/strict';
import { FeishuApiService } from '../services/feishuApiService.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ModuleRegistry } from './ModuleRegistry.js';
import { dispatch, listTools } from '../cli/dispatcher.js';
import { Config } from '../utils/config.js';
import { Logger } from '../utils/logger.js';
import { batchCreateBlocks, uploadAndBindImageToBlock } from './document/toolApi/blockToolApi.js';
import { FeishuDocumentService } from './document/services/FeishuDocumentService.js';
import type { AuthService } from '../services/feishuAuthService.js';

Logger.setEnabled(false);

async function withTools(api: Partial<FeishuApiService>, run: (client: Client) => Promise<void>) {
  const server = new McpServer({ name: 'tool-audit', version: '1.0.0' });
  for (const module of ModuleRegistry.getEnabledModules(['all'], 'user')) {
    module.registerTools(server, api as FeishuApiService);
  }
  const client = new Client({ name: 'tool-audit-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

test('all MCP tools are also registered in the CLI', async () => {
  await withTools({}, async (client) => {
    const { tools } = await client.listTools();
    assert.equal(new Set(tools.map(tool => tool.name)).size, tools.length);
    assert.deepEqual(new Set(tools.map((tool) => tool.name)), new Set(listTools('user')));
  });
});

test('CLI rejects user-only tools in tenant mode before attempting API authentication', async () => {
  const config = Config.getInstance();
  const original = config.feishu.authType;
  config.feishu.authType = 'tenant';
  try {
    await assert.rejects(dispatch('list_feishu_tasks', {}), /FEISHU_AUTH_TYPE=user/);
  } finally {
    config.feishu.authType = original;
  }
});

test('existing MCP tools report failures and reject mutually exclusive member queries', async () => {
  let memberCalls = 0;
  await withTools(
    {
      getDocumentInfo: async () => {
        throw new Error('fixture failure');
      },
      getUsersBatch: async () => {
        memberCalls++;
        return { items: [] };
      },
      searchUsers: async () => {
        memberCalls++;
        return { users: [] };
      },
    },
    async (client) => {
      const failed = await client.callTool({
        name: 'get_feishu_document_info',
        arguments: { documentId: 'fixtureDoc' },
      });
      assert.equal(failed.isError, true);
      assert.match(JSON.stringify(failed.content), /fixture failure/);
      const conflicting = await client.callTool({
        name: 'get_feishu_users',
        arguments: {
          queries: [{ query: 'fixture' }],
          userIdsParam: [{ id: 'ou_fixture' }],
        },
      });
      assert.equal(conflicting.isError, true);
      assert.equal(memberCalls, 0);
    },
  );
});

test('MCP folder pagination reaches the API and preserves the continuation token', async () => {
  await withTools(
    {
      getFolderFileList: async (...args) => {
        assert.deepEqual(args, ['folderFixture', 'EditedTime', 'DESC', 'cursor+/=', 1]);
        return { files: [{ token: 'fileFixture' }], has_more: true, next_page_token: 'next' };
      },
    },
    async (client) => {
      const result = await client.callTool({
        name: 'get_feishu_folder_files',
        arguments: {
          folderToken: 'folderFixture',
          pageToken: 'cursor+/=',
          pageSize: 1,
        },
      });
      assert.notEqual(result.isError, true);
      assert.match(JSON.stringify(result.content), /next_page_token/);
    },
  );
});

test('partial batch failures retain successful results and set the MCP error flag', async () => {
  await withTools(
    {
      deleteTasks: async () => ({
        deleted: ['success'],
        errors: [{ taskGuid: 'failed', error: 'denied' }],
      }),
      getImageBase64FromPathOrUrl: async () => {
        throw { status: 403, err: 'image denied' };
      },
      createDiagramNode: async () => {
        throw { status: 403, err: 'board denied' };
      },
    },
    async (client) => {
      const tasks = await client.callTool({
        name: 'delete_feishu_task',
        arguments: { taskGuids: ['fixtureGuid'] },
      });
      assert.equal(tasks.isError, true);
      assert.match(JSON.stringify(tasks.content), /success/);
      const images = await client.callTool({
        name: 'upload_and_bind_image_to_block',
        arguments: {
          documentId: 'fixtureDoc',
          images: [
            { blockId: 'fixtureBlock', imagePathOrUrl: 'https://fixture.invalid/image.png' },
          ],
        },
      });
      assert.equal(images.isError, true);
      assert.match(JSON.stringify(images.content), /image denied/);
      const board = await client.callTool({
        name: 'fill_whiteboard_with_plantuml',
        arguments: {
          whiteboards: [
            { whiteboardId: 'fixtureBoard', code: 'graph TD; A-->B', syntax_type: 'mermaid' },
          ],
        },
      });
      assert.equal(board.isError, true);
      assert.match(JSON.stringify(board.content), /board denied/);
    },
  );
});

test('image batch errors preserve structured Feishu API messages', async () => {
  const result = await uploadAndBindImageToBlock(
    {
      documentId: 'fixtureDoc',
      images: [{ blockId: 'fixtureBlock', imagePathOrUrl: 'https://fixture.invalid/image.png' }],
    },
    {
      getImageBase64FromPathOrUrl: async () => {
        throw { apiError: { code: 99991672, msg: 'Access denied' } };
      },
    } as unknown as FeishuApiService,
  );
  assert.deepEqual(result, [{ blockId: 'fixtureBlock', error: 'Access denied' }]);
});

test('all document blocks are prepared before the first batch is written', async () => {
  let writes = 0;
  const blocks = Array.from({ length: 51 }, () => ({
    blockType: 'text' as const,
    options: { text: { textStyles: [{ text: 'fixture' }], align: 1 } },
  }));
  let prepared = 0;
  const api = {
    createBlockContent: () => {
      if (++prepared === 51) throw new Error('invalid last block');
      return { block_type: 2 };
    },
    createDocumentBlocks: async () => {
      writes++;
      return { children: [] };
    },
  } as unknown as FeishuApiService;
  await assert.rejects(
    batchCreateBlocks({ documentId: 'fixtureDoc', parentBlockId: 'fixtureDoc', blocks }, api),
    /invalid last block/,
  );
  assert.equal(writes, 0);
  const mismatched = [{ blockType: 'text', options: { code: { code: 'wrong options' } } }];
  await assert.rejects(
    batchCreateBlocks(
      { documentId: 'fixtureDoc', parentBlockId: 'fixtureDoc', blocks: mismatched as never },
      api,
    ),
    /matching blockType/,
  );
  assert.equal(writes, 0);
});

test('prepared blocks keep the correct batch sizes and insertion indices', async () => {
  const calls: [number, number][] = [];
  const blocks = Array.from({ length: 51 }, () => ({
    blockType: 'text' as const,
    options: { text: { textStyles: [{ text: 'fixture' }], align: 1 } },
  }));
  const result = await batchCreateBlocks(
    { documentId: 'fixtureDoc', parentBlockId: 'fixtureDoc', index: 3, blocks },
    {
      createBlockContent: () => ({ block_type: 2 }),
      createDocumentBlocks: async (
        _doc: string,
        _parent: string,
        children: unknown[],
        index: number,
      ) => {
        calls.push([children.length, index]);
        return { children: [] };
      },
    } as unknown as FeishuApiService,
  );
  assert.deepEqual(calls, [
    [50, 3],
    [1, 53],
  ]);
  assert.equal(result.totalBlocksCreated, 51);
  assert.equal(result.nextIndex, 54);
});

test('document pagination stops on has_more even when the last page contains a token', async () => {
  const service = new FeishuDocumentService({} as AuthService);
  let calls = 0;
  Object.assign(service, {
    request: async () => {
      assert.ok(++calls <= 2);
      return {
        items: [{ block_id: 'block' + calls }],
        has_more: calls === 1,
        page_token: 'cursor' + calls,
      };
    },
  });
  assert.deepEqual(await service.getDocumentBlocks('fixtureDoc'), [
    { block_id: 'block1' },
    { block_id: 'block2' },
  ]);
  assert.equal(calls, 2);
});
