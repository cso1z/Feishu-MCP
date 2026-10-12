import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import FormData from 'form-data';

await import('../modules/ModuleRegistry.js');
const { BaseApiService } = await import('./baseService.js');
const { Config } = await import('../utils/config.js');

test('rebuilds FormData when retrying after token expiry', async () => {
  const config = Config.getInstance();
  const originalFeishuConfig = { ...config.feishu };
  const originalNodeEnv = process.env.NODE_ENV;
  const requests: { status: number; hasPayload: boolean }[] = [];
  let port = 0;

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      if (requests.length === 0) {
        requests.push({ status: 401, hasPayload: body.includes(Buffer.from('payload')) });
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ code: 99991663, msg: 'token expired' }));
        return;
      }

      requests.push({ status: 200, hasPayload: body.includes(Buffer.from('payload')) });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ code: 0, msg: 'ok', data: { accepted: true } }));
    });
  });

  class HarnessService extends BaseApiService {
    protected getBaseUrl(): string {
      return `http://127.0.0.1:${port}`;
    }

    protected async getAccessToken(): Promise<string> {
      return 'fixture-token';
    }

    public send(formFactory: () => FormData): Promise<{ accepted: boolean }> {
      return this.post('/upload', formFactory);
    }
  }

  Object.assign(config.feishu, {
    authType: 'tenant',
    enableScopeValidation: false,
    appId: 'fixture-app',
    appSecret: 'fixture-secret',
  });
  process.env.NODE_ENV = 'cli';

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as { port: number }).port;

  try {
    const service = new HarnessService();
    const buildFormData = () => {
      const form = new FormData();
      form.append('file', Buffer.from('payload'), {
        filename: 'probe.md',
        knownLength: Buffer.byteLength('payload'),
      });
      return form;
    };

    const result = await service.send(buildFormData);

    assert.deepEqual(result, { accepted: true });
    assert.deepEqual(requests, [
      { status: 401, hasPayload: true },
      { status: 200, hasPayload: true },
    ]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    Object.assign(config.feishu, originalFeishuConfig);
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});
