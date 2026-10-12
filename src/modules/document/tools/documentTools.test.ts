import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatMarkdownImportError,
  registerDocumentTools,
} from './documentTools.js';
import { WikiMovePartialFailureError } from '../toolApi/documentToolApi.js';
import {
  DocumentTitleOptionalSchema,
} from '../../../types/documentSchema.js';
import type { FeishuApiService } from '../../../services/feishuApiService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolSchemasDir = resolve(__dirname, '../../../../tool-schemas');

test('MCP Markdown import tool does not expose localPath', () => {
  const registrations: any[][] = [];
  const server = {
    tool: (...args: any[]) => {
      registrations.push(args);
    },
  } as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;

  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.NODE_ENV;
  try {
    registerDocumentTools(server, {} as FeishuApiService);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }

  const registration = registrations.find(
    ([name]) => name === 'import_markdown_to_feishu_document',
  );
  assert.ok(registration);
  assert.equal(registration[2].localPath, undefined);
  assert.doesNotMatch(registration[2].markdown.description ?? '', /localPath|stdio/i);
});

test('markdown import schema matches cli runtime constraints', () => {
  const schema = readJsonSchema('import_markdown_to_feishu_document.json');

  assert.match(
    schema.description,
    /folderToken and wikiContext are mutually exclusive/i,
  );
  assert.match(schema.description, /personal Drive root/i);
  assert.doesNotMatch(schema.description, /CLI mode|stdio/i);
  assert.doesNotMatch(schema.description, /creating an import task|polling until/i);
  assert.equal(schema.arguments.properties.markdown.minLength, 1);
  assert.doesNotMatch(schema.arguments.properties.markdown.description, /CLI mode|stdio/i);
  assert.equal(schema.arguments.properties.localPath.minLength, 1);
  assert.equal(schema.arguments.properties.localPath.pattern, '.*\\S.*');
  assert.doesNotMatch(
    schema.arguments.properties.localPath.description,
    /Supported only in CLI mode|stdio/i,
  );
  assert.equal(schema.arguments.properties.maxRetries, undefined);
  assert.equal(schema.arguments.properties.retryIntervalMs, undefined);
  assert.equal(schema.arguments.oneOf.length, 2);
  assert.match(
    schema.arguments.properties.title.description,
    /fileName if provided, otherwise the local file name/i,
  );
  assert.match(
    schema.arguments.properties.fileName.description,
    /\.md extension is enforced/i,
  );
  assert.equal(schema.arguments.properties.wikiContext.type, 'object');
  assert.equal(schema.arguments.properties.wikiContext.required[0], 'spaceId');
  assert.match(
    schema.arguments.properties.wikiContext.description,
    /folderToken/i,
  );
});

test('markdown import schema uses runtime-neutral descriptions', () => {
  assert.match(
    DocumentTitleOptionalSchema.description ?? '',
    /derived from the input source/i,
  );
});

test('formatMarkdownImportError includes Wiki move recovery information', () => {
  const error = new WikiMovePartialFailureError(
    '移动文档到知识库失败，status=2，错误：permission denied',
    {
      stage: 'wiki_move',
      document: {
        token: 'doc-token',
        url: 'https://example.feishu.cn/docx/doc-token',
      },
      wikiContext: {
        spaceId: 'space-123',
        parentNodeToken: 'parent-node-123',
      },
      taskId: 'wiki-task-1',
      status: 2,
      statusMessage: 'permission denied',
    },
  );

  const formatted = formatMarkdownImportError(error);

  assert.match(formatted, /Recovery information/);
  assert.match(formatted, /doc-token/);
  assert.match(formatted, /https:\/\/example\.feishu\.cn\/docx\/doc-token/);
  assert.match(formatted, /wiki-task-1/);
  assert.match(formatted, /permission denied/);
});

function readJsonSchema(fileName: string): any {
  const filePath = resolve(toolSchemasDir, fileName);
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}
