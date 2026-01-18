import express, { Request, Response } from 'express';
import { Server } from 'http';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { randomUUID } from 'node:crypto'
import { Logger } from './utils/logger.js';
import { SSEConnectionManager } from './manager/sseConnectionManager.js';
import { FeishuMcp } from './mcp/feishuMcp.js';
import { callback} from './services/callbackService.js';
import { UserAuthManager, UserContextManager, getBaseUrl ,TokenCacheManager, TokenRefreshManager } from './utils/auth/index.js';

export class FeishuMcpServer {
  private connectionManager: SSEConnectionManager;
  private userAuthManager: UserAuthManager;
  private userContextManager: UserContextManager;
  private callbackServer: Server | null = null; // stdio 模式下的 callback 服务器实例

  constructor() {
    this.connectionManager = new SSEConnectionManager();
    this.userAuthManager = UserAuthManager.getInstance();
    this.userContextManager = UserContextManager.getInstance();
    
    // 初始化TokenCacheManager，确保在启动时从文件加载缓存
    TokenCacheManager.getInstance();
    
    // 启动Token自动刷新管理器
    const tokenRefreshManager = TokenRefreshManager.getInstance();
    tokenRefreshManager.start();
    Logger.info('Token自动刷新管理器已在服务器启动时初始化');
  }

  async connect(transport: Transport): Promise<void> {
    const server = new FeishuMcp();
    await server.connect(transport);

    // 监听 transport 关闭事件，清理 callback 服务器
    // 对于 stdio 模式，监听 stdin 关闭事件
    if (process.stdin && typeof process.stdin.on === 'function') {
      process.stdin.on('close', () => {
        this.stopCallbackServer();
      });
      process.stdin.on('end', () => {
        this.stopCallbackServer();
      });
    }

    // 监听进程退出事件，确保清理资源
    process.on('SIGINT', () => {
      this.stopCallbackServer();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      this.stopCallbackServer();
      process.exit(0);
    });

    // 注意：在 stdio 模式下，Logger 会自动禁用输出，避免污染 MCP 协议
    // 如果需要日志，可以通过 MCP 协议的 logging 消息传递
    Logger.info('Server connected and ready to process requests');
  }

  /**
   * 停止 callback 服务器
   */
  private stopCallbackServer(): void {
    if (this.callbackServer) {
      this.callbackServer.close(() => {
        Logger.info('Callback server stopped');
      });
      this.callbackServer = null;
    }
  }

  async startHttpServer(port: number): Promise<void> {
    const app = express();

    const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {}

    // Parse JSON requests for the Streamable HTTP endpoint only, will break SSE endpoint
    app.use("/mcp", express.json());

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
        Logger.error('Error handling MCP request:', error)
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
        Logger.error('Error handling GET request:', error)
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
        Logger.error('Error handling DELETE request:', error)
        if (!res.headersSent) {
          res.status(500).send('Internal server error')
        }
      }
    })

    app.get('/sse', async (req: Request, res: Response) => {
      // 获取 userKey 参数
      let userKey = req.query.userKey as string | undefined;
      
      const sseTransport = new SSEServerTransport('/messages', res);
      const sessionId = sseTransport.sessionId;
      
      // 如果 userKey 为空，使用 sessionId 替代
      if (!userKey) {
        userKey = sessionId;
      }
      
      Logger.log(`[SSE Connection] New SSE connection established for sessionId ${sessionId}, userKey: ${userKey}, params:${JSON.stringify(req.params)} headers:${JSON.stringify(req.headers)} `,);
      
      // 创建用户会话映射
      this.userAuthManager.createSession(sessionId, userKey);
      Logger.log(`[UserAuth] Created session mapping: sessionId=${sessionId}, userKey=${userKey}`);
      
      this.connectionManager.addConnection(sessionId, sseTransport, req, res);
      try {
        const tempServer = new FeishuMcp();
        await tempServer.connect(sseTransport);
        Logger.info(`[SSE Connection] Successfully connected transport for: ${sessionId}`,);
      } catch (error) {
        Logger.error(`[SSE Connection] Error connecting server to transport for ${sessionId}:`, error);
        this.connectionManager.removeConnection(sessionId);
        // 清理用户会话映射
        this.userAuthManager.removeSession(sessionId);
        if (!res.writableEnded) {
          res.status(500).end('Failed to connect MCP server to transport');
        }
        return;
      }
    });

    app.post('/messages', async (req: Request, res: Response) => {
      const sessionId = req.query.sessionId as string;
      
      // 通过 sessionId 获取 userKey
      const userKey = this.userAuthManager.getUserKeyBySessionId(sessionId);
      
      Logger.info(`[SSE messages] Received message with sessionId: ${sessionId}, userKey: ${userKey}, params: ${JSON.stringify(req.query)}, body: ${JSON.stringify(req.body)}`,);

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

      // 获取 baseUrl
      const baseUrl = getBaseUrl(req);
      
      // 在用户上下文中执行 transport.handlePostMessage
      this.userContextManager.run(
        {
          userKey: userKey || '',
          baseUrl: baseUrl
        },
        async () => {
          await transport.handlePostMessage(req, res);
        }
      );
    });

    app.get('/callback', callback);

    app.listen(port, '0.0.0.0', () => {
      Logger.info(`HTTP server listening on port ${port}`);
      Logger.info(`SSE endpoint available at http://localhost:${port}/sse`);
      Logger.info(`Message endpoint available at http://localhost:${port}/messages`);
      Logger.info(`StreamableHTTP endpoint available at http://localhost:${port}/mcp`);
    });
  }

  /**
   * 启动最小化的HTTP服务器（仅提供callback接口）
   * 用于stdio模式下提供OAuth回调功能
   * @param port 服务器端口
   */
  async startCallbackServer(port: number): Promise<void> {
    const app = express();
    // 只注册callback接口
    app.get('/callback', callback);

    return new Promise((resolve, reject) => {
      const server = app.listen(port, '0.0.0.0', () => {
        this.callbackServer = server;
        Logger.info(`Callback server listening on port ${port}`);
        Logger.info(`Callback endpoint available at http://localhost:${port}/callback`);
        resolve();
      });

      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          // 端口被占用，说明其他进程已经启动了 callback 服务器
          // 这是正常的，静默处理即可（多个 stdio 进程共享同一个 callback 服务器）
          Logger.debug(`Port ${port} is already in use, callback server may already be running`);
          resolve(); // 不抛出错误，因为 callback 服务器已经存在
        } else {
          reject(err);
        }
      });
    });
  }
}
