import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createDocument,
  importMarkdownToFeishuDocument,
} from './documentToolApi.js';
import type { FeishuApiService } from '../../../services/feishuApiService.js';

test('createDocument ignores wikiContext with empty spaceId when folderToken is provided', async () => {
  const api = {
    createDocument: async (title: string, folderToken: string) => ({ title, folderToken }),
  } as unknown as FeishuApiService;

  const result = await createDocument(
    { title: 'Drive Doc', folderToken: 'folder-123', wikiContext: { spaceId: '' } },
    api
  );

  assert.deepEqual(result, { title: 'Drive Doc', folderToken: 'folder-123' });
});

test('createDocument still rejects when both folderToken and a valid wikiContext are provided', async () => {
  const api = {} as FeishuApiService;

  await assert.rejects(
    createDocument(
      { title: 'Conflict Doc', folderToken: 'folder-123', wikiContext: { spaceId: 'space-123' } },
      api
    ),
    /不能同时提供 folderToken 和 wikiContext/
  );
});

test('importMarkdownToFeishuDocument imports direct markdown in http mode', async () => {
  const calls: any[] = [];
  const api = {
    importMarkdownToDocument: async (params: any) => {
      calls.push(params);
      return {
        token: 'doc-token',
        url: 'https://example.feishu.cn/docx/doc-token',
      };
    },
  } as unknown as FeishuApiService;

  const result = await importMarkdownToFeishuDocument(
    {
      title: 'HTTP Markdown',
      markdown: '# Hello',
      folderToken: '',
      fileName: 'http-markdown.md',
    },
    api,
    { runtimeMode: 'http' },
  );

  assert.deepEqual(result, {
    token: 'doc-token',
    url: 'https://example.feishu.cn/docx/doc-token',
  });
  assert.deepEqual(calls, [
    {
      title: 'HTTP Markdown',
      markdown: '# Hello',
      folderToken: '',
      fileName: 'http-markdown.md',
    },
  ]);
});

test('importMarkdownToFeishuDocument derives title from markdown heading', async () => {
  const calls: any[] = [];
  const api = {
    importMarkdownToDocument: async (params: any) => {
      calls.push(params);
      return {
        token: 'doc-token',
        url: 'https://example.feishu.cn/docx/doc-token',
      };
    },
  } as unknown as FeishuApiService;

  await importMarkdownToFeishuDocument(
    { markdown: '# Derived Title\n\nContent' },
    api,
    { runtimeMode: 'http' },
  );

  assert.equal(calls[0].title, 'Derived Title');
  assert.equal(calls[0].fileName, 'Derived Title.md');
});

test('importMarkdownToFeishuDocument sanitizes derived default fileName from markdown heading', async () => {
  const calls: any[] = [];
  const api = {
    importMarkdownToDocument: async (params: any) => {
      calls.push(params);
      return {
        token: 'doc-token',
        url: 'https://example.feishu.cn/docx/doc-token',
      };
    },
  } as unknown as FeishuApiService;

  await importMarkdownToFeishuDocument(
    { markdown: '# plan: v2/a?*\n\nContent' },
    api,
    { runtimeMode: 'http' },
  );

  assert.equal(calls[0].title, 'plan: v2/a?*');
  assert.equal(calls[0].fileName, 'plan- v2-a.md');
});

test('importMarkdownToFeishuDocument reads localPath in cli mode and derives names', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'feishu-md-import-'));
  const filePath = join(dir, 'release-notes.md');
  await writeFile(filePath, '# Release Notes\n\nDone.', 'utf8');

  try {
    const calls: any[] = [];
    const api = {
      importMarkdownToDocument: async (params: any) => {
        calls.push(params);
        return {
          token: 'doc-token',
          url: 'https://example.feishu.cn/docx/doc-token',
        };
      },
    } as unknown as FeishuApiService;

    await importMarkdownToFeishuDocument(
      { localPath: filePath, folderToken: 'folder-token' },
      api,
      { runtimeMode: 'cli' },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].markdown, '# Release Notes\n\nDone.');
    assert.equal(calls[0].title, 'release-notes');
    assert.equal(calls[0].fileName, 'release-notes.md');
    assert.equal(calls[0].folderToken, 'folder-token');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('importMarkdownToFeishuDocument derives localPath title from fileName when provided', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'feishu-md-import-'));
  const filePath = join(dir, 'original-name.md');
  await writeFile(filePath, '# Release Notes\n\nDone.', 'utf8');

  try {
    const calls: any[] = [];
    const api = {
      importMarkdownToDocument: async (params: any) => {
        calls.push(params);
        return {
          token: 'doc-token',
          url: 'https://example.feishu.cn/docx/doc-token',
        };
      },
    } as unknown as FeishuApiService;

    await importMarkdownToFeishuDocument(
      { localPath: filePath, fileName: 'renamed-upload.md' },
      api,
      { runtimeMode: 'cli' },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].title, 'renamed-upload');
    assert.equal(calls[0].fileName, 'renamed-upload.md');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('importMarkdownToFeishuDocument rejects localPath in http mode', async () => {
  const api = {} as FeishuApiService;

  await assert.rejects(
    importMarkdownToFeishuDocument(
      { title: 'HTTP File', localPath: 'D:\\docs\\file.md' },
      api,
      { runtimeMode: 'http' },
    ),
    /HTTP.*localPath/,
  );
});

test('importMarkdownToFeishuDocument imports Markdown and moves the docx into Wiki', async () => {
  const calls: Array<{ method: string; args: any[] }> = [];
  let taskPolls = 0;
  const api = {
    importMarkdownToDocument: async (params: any) => {
      calls.push({ method: 'import', args: [params] });
      return {
        token: 'doc-token',
        url: 'https://example.feishu.cn/docx/doc-token',
      };
    },
    moveDocumentToWiki: async (...args: any[]) => {
      calls.push({ method: 'move', args });
      return { task_id: 'wiki-task-1' };
    },
    getWikiTaskResult: async (...args: any[]) => {
      calls.push({ method: 'task', args });
      taskPolls += 1;
      if (taskPolls === 1) {
        return {
          task: {
            status: 1,
            status_msg: 'processing',
          },
        };
      }
      return {
        task: {
          status: 0,
          status_msg: 'success',
          move_result: [
            {
              node: {
                node_token: 'wiki-node-token',
                obj_token: 'doc-token',
              },
            },
          ],
        },
      };
    },
  } as unknown as FeishuApiService;

  const result = await importMarkdownToFeishuDocument(
    {
      title: 'Wiki Markdown',
      markdown: '# Hello',
      wikiContext: {
        spaceId: 'space-123',
        parentNodeToken: 'parent-node-123',
      },
    },
    api,
    { runtimeMode: 'http' },
  );

  assert.deepEqual(result, {
    token: 'doc-token',
    url: 'https://example.feishu.cn/docx/doc-token',
    wikiToken: 'wiki-node-token',
    wikiTaskId: 'wiki-task-1',
    wikiMoveResult: {
      status: 0,
      status_msg: 'success',
      move_result: [
        {
          node: {
            node_token: 'wiki-node-token',
            obj_token: 'doc-token',
          },
        },
      ],
    },
  });
  assert.deepEqual(calls[0], {
    method: 'import',
    args: [
      {
        title: 'Wiki Markdown',
        markdown: '# Hello',
        folderToken: '',
        fileName: 'Wiki Markdown.md',
      },
    ],
  });
  assert.deepEqual(calls[1], {
    method: 'move',
    args: ['space-123', 'doc-token', 'parent-node-123'],
  });
  assert.deepEqual(calls.slice(2), [
    { method: 'task', args: ['wiki-task-1'] },
    { method: 'task', args: ['wiki-task-1'] },
  ]);
});

test('importMarkdownToFeishuDocument uses stepped delays for Wiki polling', async () => {
  const delays: number[] = [];
  const originalSetTimeout = globalThis.setTimeout;
  let taskPolls = 0;
  globalThis.setTimeout = ((callback: (...args: any[]) => void, delay?: number) => {
    delays.push(delay ?? 0);
    callback();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;

  try {
    const api = {
      importMarkdownToDocument: async () => ({
        token: 'doc-token',
        url: 'https://example.feishu.cn/docx/doc-token',
      }),
      moveDocumentToWiki: async () => ({ task_id: 'wiki-task-1' }),
      getWikiTaskResult: async () => {
        taskPolls += 1;
        return taskPolls < 5
          ? { task: { status: 1, status_msg: 'processing' } }
          : {
              task: {
                status: 0,
                move_result: [{ node: { node_token: 'wiki-node-token' } }],
              },
            };
      },
    } as unknown as FeishuApiService;

    await importMarkdownToFeishuDocument(
      {
        title: 'Stepped Wiki Markdown',
        markdown: '# Hello',
        wikiContext: { spaceId: 'space-123' },
      },
      api,
      { runtimeMode: 'http' },
    );

    assert.deepEqual(delays, [1000, 2000, 3000, 5000]);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('importMarkdownToFeishuDocument returns immediately when Wiki move returns a token', async () => {
  const calls: any[] = [];
  const api = {
    importMarkdownToDocument: async () => ({
      token: 'doc-token',
      url: 'https://example.feishu.cn/docx/doc-token',
    }),
    moveDocumentToWiki: async (...args: any[]) => {
      calls.push(args);
      return { wiki_token: 'wiki-node-token' };
    },
    getWikiTaskResult: async () => {
      throw new Error('should not poll when wiki_token is returned');
    },
  } as unknown as FeishuApiService;

  const result = await importMarkdownToFeishuDocument(
    {
      title: 'Immediate Wiki Markdown',
      markdown: '# Hello',
      wikiContext: { spaceId: 'space-123' },
    },
    api,
    { runtimeMode: 'http' },
  );

  assert.equal(result.wikiToken, 'wiki-node-token');
  assert.equal(result.wikiTaskId, undefined);
  assert.deepEqual(calls, [['space-123', 'doc-token', undefined]]);
});

test('importMarkdownToFeishuDocument reads Wiki task status from move_result', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((callback: (...args: any[]) => void) => {
    callback();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;

  try {
    const api = {
      importMarkdownToDocument: async () => ({
        token: 'doc-token',
        url: 'https://example.feishu.cn/docx/doc-token',
      }),
      moveDocumentToWiki: async () => ({ task_id: 'wiki-task-1' }),
      getWikiTaskResult: async () => ({
        task: {
          move_result: [
            {
              status: 0,
              status_msg: 'success',
              node: { node_token: 'wiki-node-token' },
            },
          ],
        },
      }),
    } as unknown as FeishuApiService;

    const result = await importMarkdownToFeishuDocument(
      {
        title: 'Official Wiki Task Shape',
        markdown: '# Hello',
        wikiContext: { spaceId: 'space-123' },
      },
      api,
      { runtimeMode: 'http' },
    );

    assert.equal(result.wikiToken, 'wiki-node-token');
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('importMarkdownToFeishuDocument rejects a folderToken combined with Wiki mode', async () => {
  const api = {} as FeishuApiService;

  await assert.rejects(
    importMarkdownToFeishuDocument(
      {
        title: 'Conflicting targets',
        markdown: '# Hello',
        folderToken: 'folder-123',
        wikiContext: { spaceId: 'space-123' },
      },
      api,
      { runtimeMode: 'http' },
    ),
    /不能同时提供 folderToken 和 wikiContext/,
  );
});

test('importMarkdownToFeishuDocument preserves Drive document recovery info when Wiki move fails', async () => {
  const api = {
    importMarkdownToDocument: async () => ({
      token: 'doc-token',
      url: 'https://example.feishu.cn/docx/doc-token',
    }),
    moveDocumentToWiki: async () => ({ task_id: 'wiki-task-1' }),
    getWikiTaskResult: async () => ({
      task: {
        move_result: [
          {
            status: 2,
            status_msg: 'permission denied',
          },
        ],
      },
    }),
  } as unknown as FeishuApiService;

  await assert.rejects(
    importMarkdownToFeishuDocument(
      {
        title: 'Failed Wiki Markdown',
        markdown: '# Hello',
        wikiContext: {
          spaceId: 'space-123',
          parentNodeToken: 'parent-node-123',
        },
      },
      api,
      { runtimeMode: 'http' },
    ),
    (error: any) => {
      assert.equal(error.name, 'WikiMovePartialFailureError');
      assert.deepEqual(error.recovery, {
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
      });
      return true;
    },
  );
});

test('importMarkdownToFeishuDocument formats structured Wiki API errors', async () => {
  const api = {
    importMarkdownToDocument: async () => ({
      token: 'doc-token',
      url: 'https://example.feishu.cn/docx/doc-token',
    }),
    moveDocumentToWiki: async () => {
      throw {
        status: 403,
        err: 'API request failed',
        apiError: {
          code: 99991663,
          msg: 'permission denied',
        },
      };
    },
  } as unknown as FeishuApiService;

  await assert.rejects(
    importMarkdownToFeishuDocument(
      {
        title: 'Structured Wiki Error',
        markdown: '# Hello',
        wikiContext: { spaceId: 'space-123' },
      },
      api,
      { runtimeMode: 'http' },
    ),
    (error: any) => {
      assert.match(error.message, /permission denied/);
      assert.match(error.message, /99991663/);
      assert.doesNotMatch(error.message, /\[object Object\]/);
      return true;
    },
  );
});
