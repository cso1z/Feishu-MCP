import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Config } from '../../../utils/config.js';
import type { AuthService } from '../../../services/feishuAuthService.js';
import type { FeishuApiService } from '../../../services/feishuApiService.js';
import { FeishuFoldService } from './FeishuFoldService.js';
import { registerDocumentTools } from '../tools/documentTools.js';

test('create_feishu_document returns the created wiki node for subsequent tool calls', async () => {
  const config = Config.getInstance();
  const originalConfig = { ...config.feishu };
  const originalAdapter = axios.defaults.adapter;
  Object.assign(config.feishu, {
    appId: 'fixture-app',
    appSecret: 'fixture-secret',
    authType: 'tenant',
    enableScopeValidation: false,
    baseUrl: 'https://fixture.invalid/open-apis',
  });
  const node = {
    space_id: '12345',
    node_token: 'fixtureNode',
    obj_token: 'fixtureDoc',
    obj_type: 'docx',
    node_type: 'origin',
    title: 'Wiki document',
  };
  // Official wiki.v2.spaceNode.create response: { code, msg, data: { node } }.
  axios.defaults.adapter = async (request) => {
    assert.equal(request.method, 'post');
    assert.equal(
      request.url,
      'https://fixture.invalid/open-apis/wiki/v2/spaces/12345/nodes',
    );
    assert.deepEqual(JSON.parse(request.data), {
      title: 'Wiki document',
      obj_type: 'docx',
      node_type: 'origin',
      parent_node_token: 'parentNode',
    });
    return {
      data: { code: 0, msg: 'success', data: { node } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: request,
    };
  };
  const auth = {
    getTenantAccessToken: async () => 'fixture-token',
  } as unknown as AuthService;
  const service = new FeishuFoldService(auth);
  const api = {
    createWikiSpaceNode: service.createWikiSpaceNode.bind(service),
  } as unknown as FeishuApiService;
  const server = new McpServer({ name: 'wiki-test', version: '1.0.0' });
  registerDocumentTools(server, api);
  const client = new Client({ name: 'wiki-test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({
      name: 'create_feishu_document',
      arguments: {
        title: 'Wiki document',
        wikiContext: { spaceId: '12345', parentNodeToken: 'parentNode' },
      },
    });
    assert.notEqual(result.isError, true);
    const content = result.content as Array<{ type: string; text: string }>;
    const created = JSON.parse(content[0].text);
    assert.equal(created.node_token, node.node_token);
    assert.equal(created.obj_token, node.obj_token);
    assert.equal(created.space_id, node.space_id);
    assert.equal(created.title, node.title);
  } finally {
    await client.close();
    await server.close();
    axios.defaults.adapter = originalAdapter;
    Object.assign(config.feishu, originalConfig);
  }
});
