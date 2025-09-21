import express, { Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { randomUUID } from 'node:crypto'
import { Logger } from './utils/logger.js';
import { SSEConnectionManager } from './manager/sseConnectionManager.js';
import { FeishuMcp } from './mcp/feishuMcp.js';
import { callback } from './services/callbackService.js';
import { FeishuOAuthServer } from './auth/feishuOAuthServer.js';
import { AuthenticatedRequest, verifyAndGetUserToken, verifyUserToken } from './auth/authMiddleware.js';
import { UserContextManager } from './utils/userContext.js';
import {
  bindSessionUserKey,
  generateAuthErrorResponse,
  getBaseUrl,
  getRequestKey, isAuthForTenant,
  isUserAuthSupported
} from './utils/auth';

export class FeishuMcpServer {
  private connectionManager: SSEConnectionManager;
  private oauthServer: FeishuOAuthServer;

  constructor() {
    this.connectionManager = new SSEConnectionManager();
    this.oauthServer = new FeishuOAuthServer();
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

    const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {}

    // Parse JSON requests for the Streamable HTTP endpoint only, will break SSE endpoint
    app.use("/mcp", express.json());
    
    // Parse URL-encoded form data for OAuth endpoints
    app.use(express.urlencoded({ extended: true }));

    // app.use(express.json({
    //   limit: '4mb',           // 消息端点使用较小的限制
    //   type: 'application/json'
    // }));

    app.post('/mcp', async (req, res) => {
      try {
        Logger.log("Received StreamableHTTP request", {
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: req.body,
          query: req.query,
          params: req.params
        });
        // Check for existing session ID
        const sessionId = req.headers['mcp-session-id'] as string | undefined
        let transport: StreamableHTTPServerTransport

        if (sessionId && transports[sessionId]) {
          // Reuse existing transport
          Logger.log("Reusing existing StreamableHTTP transport for sessionId", sessionId);
          transport = transports[sessionId]
        } else if (!sessionId && isInitializeRequest(req.body)) {
          // New initialization request
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sessionId) => {
              // Store the transport by session ID
              Logger.log(`[StreamableHTTP connection] ${sessionId}`);
              transports[sessionId] = transport
            }
          })

          // Clean up transport and server when closed
          transport.onclose = () => {
            if (transport.sessionId) {
              Logger.log(`[StreamableHTTP delete] ${transports[transport.sessionId]}`);
              delete transports[transport.sessionId]
            }
          }

          // Create and connect server instance
          const server = new FeishuMcp();
          await server.connect(transport);
        } else {
          // Invalid request
          res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: No valid session ID provided',
            },
            id: null,
          })
          return
        }

        // Handle the request
        await transport.handleRequest(req, res, req.body)
      } catch (error) {
        console.error('Error handling MCP request:', error)
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          })
        }
      }
    })

    // Handle GET requests for server-to-client notifications via Streamable HTTP
    app.get('/mcp', async (req, res) => {
      try {
        Logger.log("Received StreamableHTTP request get" )
        const sessionId = req.headers['mcp-session-id'] as string | undefined
        if (!sessionId || !transports[sessionId]) {
          res.status(400).send('Invalid or missing session ID')
          return
        }

        const transport = transports[sessionId]
        await transport.handleRequest(req, res)
      } catch (error) {
        console.error('Error handling GET request:', error)
        if (!res.headersSent) {
          res.status(500).send('Internal server error')
        }
      }
    })

    // Handle DELETE requests for session termination
    app.delete('/mcp', async (req, res) => {
      try {
        const sessionId = req.headers['mcp-session-id'] as string | undefined
        if (!sessionId || !transports[sessionId]) {
          res.status(400).send('Invalid or missing session ID')
          return
        }

        const transport = transports[sessionId]
        await transport.handleRequest(req, res)

        // Clean up resources after session termination
        if (transport.sessionId) {
          delete transports[transport.sessionId]
        }
      } catch (error) {
        console.error('Error handling DELETE request:', error)
        if (!res.headersSent) {
          res.status(500).send('Internal server error')
        }
      }
    })

    app.get('/sse',verifyUserToken, async (req: Request, res: Response) => {
      Logger.log(`[SSE Connection] New SSE connection established params:${JSON.stringify(req.params)}  query:${JSON.stringify(req.query)} headers:${JSON.stringify(req.headers)} `,);
      const sseTransport = new SSEServerTransport('/messages', res);
      const sessionId = sseTransport.sessionId;
      this.connectionManager.addConnection(sessionId, sseTransport, req, res);
      if (!isAuthForTenant() && !isUserAuthSupported(req)) {
        const userKey = req.query.userKey;
        if (typeof userKey === 'string') {
          bindSessionUserKey(sessionId, userKey);
        }
      }
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


    app.post('/messages',verifyAndGetUserToken, async (req: AuthenticatedRequest, res: Response) => {
      const sessionId = req.query.sessionId as string;
      Logger.error(`[SSE messages] Received message with sessionId: ${sessionId}, params: ${JSON.stringify(req.query)}, header:${JSON.stringify(req.body)}, body: ${JSON.stringify(req.body)}`,);

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
      // 使用 UserContextManager 在异步上下文中传递用户令牌
      const userContextManager = UserContextManager.getInstance();
      try {
        await userContextManager.run(
          {
            feishuToken: req.feishuToken,
            reqKey: getRequestKey(req),
            isUserAuthSupported:isUserAuthSupported(req),
            baseUrl:getBaseUrl(req)
          },
          async () => {
            await transport.handlePostMessage(req, res);
          }
        );
      } catch (error: any) {
        Logger.error(`[SSE messages] Error handling message for sessionId ${sessionId}:`, error);
        // 检查是否是401错误（用户令牌过期）
        if (error && error.status === 401) {
          Logger.warn(`[SSE messages] User access token expired for sessionId ${sessionId}`);
         const {error, error_description, statusCode}=  generateAuthErrorResponse(isUserAuthSupported(req),getBaseUrl(req), getRequestKey(req)||"");
          if (!res.writableEnded) {
            res.status(statusCode).json({
              error: error,
              error_description: error_description,
            });
          }
          return;
        }

        // 处理其他错误
        if (!res.writableEnded) {
          res.status(500).json({
            error: 'server_error',
            error_description: 'Internal server error while processing message.',
            details: error.message || 'Unknown error'
          });
        }
      }
    });

    // 集成飞书 OAuth 服务器路由
    app.use('/', this.oauthServer.getRouter());

    // 保留原有的回调端点（用于兼容性）
    app.get('/callback', callback);

    app.listen(port, '0.0.0.0', () => {
      Logger.info(`HTTP server listening on port ${port}`);
      Logger.info(`SSE endpoint available at http://localhost:${port}/sse`);
      Logger.info(`Message endpoint available at http://localhost:${port}/messages`);
      Logger.info(`StreamableHTTP endpoint available at http://localhost:${port}/mcp`);
      Logger.info(`OAuth 2.0 Authorization endpoint available at http://localhost:${port}/authorize`);
      Logger.info(`OAuth 2.0 Token endpoint available at http://localhost:${port}/token`);
      Logger.info(`OAuth 2.0 Registration endpoint available at http://localhost:${port}/register`);
      Logger.info(`OAuth 2.0 Discovery endpoint available at http://localhost:${port}/.well-known/oauth-authorization-server`);
    });
  }
}
