import express, { Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Logger } from './utils/logger.js';
import { SSEConnectionManager } from './manager/sseConnectionManager';
import { FeishuMcp } from './mcp/feishuMcp';

export class FeishuMcpServer {
  private connectionManager: SSEConnectionManager;

  constructor() {
    this.connectionManager = new SSEConnectionManager();
  }

  async connect(transport: Transport): Promise<void> {
    const server = new FeishuMcp();
    await server.connect(transport);

    Logger.info = (...args: any[]) => {
      server.server.sendLoggingMessage({ level: 'info', data: args });
    };
    Logger.error = (...args: any[]) => {
      server.server.sendLoggingMessage({ level: 'error', data: args });
    };

    Logger.info('Server connected and ready to process requests');
  }

  async startHttpServer(port: number): Promise<void> {
    const app = express();

    app.get('/sse', async (req: Request, res: Response) => {
      const sseTransport = new SSEServerTransport('/messages', res);
      const sessionId = sseTransport.sessionId;
      Logger.log(`[SSE Connection] New SSE connection established for sessionId ${sessionId}   params:${JSON.stringify(req.params)} headers:${JSON.stringify(req.headers)} `,);
      this.connectionManager.addConnection(sessionId, sseTransport, req, res);
      try {
        const tempServer = new FeishuMcp();
        await tempServer.connect(sseTransport);
        Logger.info(`[SSE Connection] Successfully connected transport for: ${sessionId}`,);
      } catch (error) {
        Logger.error(`[SSE Connection] Error connecting server to transport for ${sessionId}:`, error);
        this.connectionManager.removeConnection(sessionId);
        if (!res.writableEnded) {
          res.status(500).end('Failed to connect MCP server to transport');
        }
        return;
      }
    });

    app.post('/messages', async (req: Request, res: Response) => {
      const sessionId = req.query.sessionId as string;
      Logger.info(`[SSE messages] Received message with sessionId: ${sessionId}, params: ${JSON.stringify(req.query)}, body: ${JSON.stringify(req.body)}`,);

      if (!sessionId) {
        res.status(400).send('Missing sessionId query parameter');
        return;
      }

      const transport = this.connectionManager.getTransport(sessionId);
      Logger.log(`[SSE messages] Retrieved transport for sessionId ${sessionId}: ${transport ? transport.sessionId : 'Transport not found'}`,);

      if (!transport) {
        res
          .status(404)
          .send(`No active connection found for sessionId: ${sessionId}`);
        return;
      }
      await transport.handlePostMessage(req, res);
    });

    app.listen(port, () => {
      Logger.info(`HTTP server listening on port ${port}`);
      Logger.info(`SSE endpoint available at http://localhost:${port}/sse`);
      Logger.info(
        `Message endpoint available at http://localhost:${port}/messages`,
      );
    });
  }
}
