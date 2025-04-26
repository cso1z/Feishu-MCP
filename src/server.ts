import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import express, { Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { IncomingMessage, ServerResponse } from 'http';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Logger } from './utils/logger.js';
import { registerAllTools } from './tools/index.js';

export class FeishuMcpServer {
  private readonly server: McpServer;
  private sseTransport: SSEServerTransport | null = null;

  constructor() {
    this.server = new McpServer(
      {
        name: 'Feishu MCP Server',
        version: '0.0.1',
      },
      {
        capabilities: {
          logging: {},
          tools: {},
        },
      },
    );

    this.registerTools();
  }

  private registerTools(): void {
    // 注册所有工具
    registerAllTools(this.server);
  }

  async connect(transport: Transport): Promise<void> {
    await this.server.connect(transport);

    Logger.info = (...args: any[]) => {
      this.server.server.sendLoggingMessage({ level: 'info', data: args });
    };
    Logger.error = (...args: any[]) => {
      this.server.server.sendLoggingMessage({ level: 'error', data: args });
    };

    Logger.info('Server connected and ready to process requests');
  }

  async startHttpServer(port: number): Promise<void> {
    const app = express();
    const transports: {[sessionId: string]: SSEServerTransport} = {};
    const sseConnections = new Map<string, { res: Response, intervalId: NodeJS.Timeout }>();
    const KEEP_ALIVE_INTERVAL_MS = 25000; // Send keep-alive every 25 seconds


    app.get('/sse', async (_req: Request, res: Response) => {
      console.log('New SSE connection established');
      this.sseTransport = new SSEServerTransport('/messages', res as unknown as ServerResponse<IncomingMessage>);

      const sessionId = this.sseTransport.sessionId; // Get session ID from transport
      transports[sessionId] = this.sseTransport;
      // Start keep-alive ping
      const intervalId = setInterval(() => {
	      if (sseConnections.has(sessionId) && !res.writableEnded) {
		      res.write(': keepalive\n\n');
	      } else {
		      // Should not happen if close handler is working, but clear just in case
		      clearInterval(intervalId);
		      sseConnections.delete(sessionId);
	      }
      }, KEEP_ALIVE_INTERVAL_MS);
        // Store connection details
      sseConnections.set(sessionId, { res, intervalId });
      console.log(`[SSE Connection] Client connected: ${sessionId}, starting keep-alive.`);
      res.on("close", () => {
	      console.log(`[SSE Connection] Client disconnected: ${sessionId}, stopping keep-alive.`);
	      // Clean up transport
	      delete transports[sessionId];
	      // Clean up keep-alive interval
	      const connection = sseConnections.get(sessionId);
	      if (connection) {
		      clearInterval(connection.intervalId);
		      sseConnections.delete(sessionId);
	      }
      });
      // Connect server to transport *after* setting up handlers
      try {
	      await this.server.connect(this.sseTransport)
      } catch (error) {
	      console.error(`[SSE Connection] Error connecting server to transport for ${sessionId}:`, error);
	      // Ensure cleanup happens even if connect fails
	      clearInterval(intervalId);
	      sseConnections.delete(sessionId);
	      delete transports[sessionId];
	      if (!res.writableEnded) {
		      res.status(500).end('Failed to connect MCP server to transport');
	      }
      }


      // await this.server.connect(this.sseTransport);
    });

    app.post('/messages', async (req: Request, res: Response) => {
      if (!this.sseTransport) {
        res.sendStatus(400);
        return;
      }
      await this.sseTransport.handlePostMessage(
        req as unknown as IncomingMessage,
        res as unknown as ServerResponse<IncomingMessage>
      );
    });

    Logger.info = console.log;
    Logger.error = console.error;

    app.listen(port, () => {
      Logger.info(`HTTP server listening on port ${port}`);
      Logger.info(`SSE endpoint available at http://localhost:${port}/sse`);
      Logger.info(`Message endpoint available at http://localhost:${port}/messages`);
    });
  }
}
