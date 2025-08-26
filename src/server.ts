import express, { Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Logger } from './utils/logger.js';
import { SSEConnectionManager } from './manager/sseConnectionManager.js';
import { FeishuMcp } from './mcp/feishuMcp.js';
import { callback,getTokenByParams } from './services/callbackService.js';
import { Config } from './utils/config.js';
import { verifyUserToken, AuthenticatedRequest } from './middleware/authMiddleware.js';
import { UserContextManager } from './utils/userContext.js';

export class FeishuMcpServer {
  private connectionManager: SSEConnectionManager;

  constructor() {
    this.connectionManager = new SSEConnectionManager();
  }

  /**
   * 获取正确的协议
   * @param req Express请求对象
   * @returns 协议字符串 (http 或 https)
   */
  private getProtocol(req: Request): string {
    const config = Config.getInstance();
    
    // 如果是生产环境，强制使用HTTPS
    if (config.server.env === 'prod') {
      return 'https';
    }
    
    // 否则检查X-Forwarded-Proto头，如果没有则使用req.protocol
    return req.get('X-Forwarded-Proto') || req.protocol;
  }

  async connect(transport: Transport): Promise<void> {
    Logger.info('connect');
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
    
    // 配置请求体解析中间件
    // app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.get('/sse', verifyUserToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      let sseTransport: SSEServerTransport | null = null;
      try {
        
        sseTransport = new SSEServerTransport('/messages', res);
        const sessionId = sseTransport.sessionId;
        Logger.log(`[SSE Connection] New SSE connection established for sessionId ${sessionId} by user ${req.userInfo?.name}`, req.userInfo);
        
        // 添加错误监听器
        res.on('error', (error: any) => {
          Logger.error(`[SSE Connection] Response stream error for ${sessionId}:`, error);
          this.connectionManager.removeConnection(sessionId);
        });
        
        res.on('close', () => {
          Logger.info(`[SSE Connection] Response stream closed for ${sessionId}`);
          this.connectionManager.removeConnection(sessionId);
        });
        
        this.connectionManager.addConnection(sessionId, sseTransport, req, res);
        
        const tempServer = new FeishuMcp();
        // 直接连接MCP服务器到SSE传输层，不使用包装的connect方法
        await tempServer.connect(sseTransport);

        Logger.info(`[SSE Connection] Successfully connected transport for: ${sessionId}`);
      } catch (error: any) {
        Logger.error(`[SSE Connection] Error in SSE endpoint:`, error);
        if (sseTransport) {
          this.connectionManager.removeConnection(sseTransport.sessionId);
        }
        if (!res.writableEnded) {
          res.status(500).json({ error: 'Failed to establish SSE connection', details: error?.message || 'Unknown error' });
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

      // 从请求头中提取用户访问令牌
      const authorization = req.headers.authorization;
      let userAccessToken: string | undefined;
      
      if (authorization && authorization.startsWith('Bearer ')) {
        userAccessToken = authorization.substring(7); // 移除 "Bearer " 前缀
        Logger.debug(`[SSE messages] 提取到用户访问令牌: ${userAccessToken.substring(0, 20)}...`);
      } else {
        Logger.debug('[SSE messages] 未找到用户访问令牌');
      }

      // 使用 UserContextManager 在异步上下文中传递用户令牌
      const userContextManager = UserContextManager.getInstance();
      
      try {
        await userContextManager.run(
          { 
            accessToken: userAccessToken,
            userInfo: null // 可以在需要时扩展用户信息
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
          if (!res.writableEnded) {
            res.status(401).json({
              error: 'invalid_token',
              error_description: 'User access token is invalid or expired. Please refresh your token.',
              details: error.err || 'Token validation failed'
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


    app.get('/sse-trae', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      let sseTransport: SSEServerTransport | null = null;
      try {
        // 提取 open_id 参数
        const openId = req.query.open_id as string;
        Logger.info(`[SSE Connection] Received /sse-trae request with open_id: ${openId}`);

        sseTransport = new SSEServerTransport('/messages-trae', res);
        const sessionId = sseTransport.sessionId;
        Logger.log(`[SSE Connection] New SSE connection established for sessionId ${sessionId} by user ${req.userInfo?.name}`, req.userInfo);

        // 添加错误监听器
        res.on('error', (error: any) => {
          Logger.error(`[SSE Connection] Response stream error for ${sessionId}:`, error);
          this.connectionManager.removeConnection(sessionId);
        });

        res.on('close', () => {
          Logger.info(`[SSE Connection] Response stream closed for ${sessionId}`);
          this.connectionManager.removeConnection(sessionId);
        });

        // 传递 open_id 参数给连接管理器
        this.connectionManager.addConnection(sessionId, sseTransport, req, res, openId);

        const tempServer = new FeishuMcp();
        // 直接连接MCP服务器到SSE传输层，不使用包装的connect方法
        await tempServer.connect(sseTransport);

        Logger.info(`[SSE Connection] Successfully connected transport for: ${sessionId} with open_id: ${openId}`);
      } catch (error: any) {
        Logger.error(`[SSE Connection] Error in SSE endpoint:`, error);
        if (sseTransport) {
          this.connectionManager.removeConnection(sseTransport.sessionId);
        }
        if (!res.writableEnded) {
          res.status(500).json({ error: 'Failed to establish SSE connection', details: error?.message || 'Unknown error' });
        }
        return;
      }
    });

    app.post('/messages-trae', async (req: Request, res: Response) => {
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

      // 获取存储的 open_id 参数
      const openId = this.connectionManager.getOpenId(sessionId);
      if (openId) {
        Logger.info(`[SSE messages] Retrieved open_id ${openId} for sessionId ${sessionId}`);
        // 将 open_id 添加到请求对象中，以便后续处理使用
        (req as any).openId = openId;
      } else {
        Logger.debug(`[SSE messages] No open_id found for sessionId ${sessionId}`);
      }

      // 从请求头中提取用户访问令牌
      const authorization = req.headers.authorization;
      let userAccessToken: string | undefined;

      if (authorization && authorization.startsWith('Bearer ')) {
        userAccessToken = authorization.substring(7); // 移除 "Bearer " 前缀
        Logger.debug(`[SSE messages] 提取到用户访问令牌: ${userAccessToken.substring(0, 20)}...`);
      } else {
        Logger.debug('[SSE messages] 未找到用户访问令牌');
      }

      // 使用 UserContextManager 在异步上下文中传递用户令牌和 open_id
      const userContextManager = UserContextManager.getInstance();

      try {
        await userContextManager.run(
            {
              accessToken: userAccessToken,
              userInfo: null, // 可以在需要时扩展用户信息
              openId: openId // 传递 open_id 参数
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
          if (!res.writableEnded) {
            res.status(401).json({
              error: 'invalid_token',
              error_description: 'User access token is invalid or expired. Please refresh your token.',
              details: error.err || 'Token validation failed'
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

    app.get('/callback', callback);

    // OAuth 2.0 Dynamic Client Registration - RFC 7591
    app.post('/register', (req: Request, res: Response) => {
      Logger.log(`[OAuth Registration] Received dynamic client registration request`);
      
      const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const clientSecret = `secret_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
      
             const protocol = this.getProtocol(req);
       const host = req.get('X-Forwarded-Host') || req.get('host');
       const baseUrl = `${protocol}://${host}`;

      const registrationResponse = {
        client_id: clientId,
        client_secret: clientSecret,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_secret_expires_at: 0,
        redirect_uris: [`${baseUrl}/oauth/feishu/callback`],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "client_secret_basic",
        application_type: "web"
      };
      
      Logger.info(`[OAuth Registration] Created new client: ${clientId}`);
      res.status(201).json(registrationResponse);
    });

    // OAuth 2.0 Authorization Endpoint - 飞书授权
    app.get('/authorize', (req: Request, res: Response) => {
      Logger.log(`[Feishu OAuth Authorization] Received authorization request: ${JSON.stringify(req.query)}`);
      
      const { 
        response_type = 'code',
        client_id, 
        redirect_uri, 
        scope = 'docs:document.content:read docx:document docx:document.block:convert docx:document:create docx:document:readonly' +
            ' drive:drive drive:file:upload wiki:space:read wiki:space:retrieve wiki:wiki wiki:wiki:readonly ' +
        'offline_access drive:drive drive:drive.metadata:readonly drive:drive drive:drive:readonly space:document:retrieve board:whiteboard:node:read',
        state 
      } = req.query;
      
      // 验证必需参数
      if (!redirect_uri) {
         res.status(400).json({
          error: 'invalid_request', 
          error_description: 'Missing redirect_uri parameter' 
        });
        return;
      }
      
      // 获取飞书配置
      const config = Config.getInstance();
      const feishuAppId = config.feishu.appId;
      
      if (!feishuAppId) {
         res.status(500).json({
          error: 'server_error', 
          error_description: 'Feishu app_id not configured' 
        });
        return;

      }
      
             // 构造本服务器的回调地址 (飞书将回调到这里)
       const protocol = this.getProtocol(req);
       const host = req.get('X-Forwarded-Host') || req.get('host');
       const baseUrl = `${protocol}://${host}`;
       const ourCallbackUrl = `${baseUrl}/oauth/feishu/callback`;
      
      // 将原始的redirect_uri和其他参数编码到state中
      const stateData = {
        original_redirect_uri: redirect_uri,
        original_state: state,
        client_id: client_id
      };
      const encodedState = Buffer.from(JSON.stringify(stateData)).toString('base64');
      
      // 构造飞书授权URL
      const feishuAuthUrl = new URL('https://open.feishu.cn/open-apis/authen/v1/authorize');
      feishuAuthUrl.searchParams.set('app_id', feishuAppId);
      feishuAuthUrl.searchParams.set('redirect_uri', ourCallbackUrl);
      feishuAuthUrl.searchParams.set('response_type', response_type as string);
      feishuAuthUrl.searchParams.set('scope', scope as string);
      feishuAuthUrl.searchParams.set('state', encodedState);
      
      Logger.info(`[Feishu OAuth Authorization] Redirecting to Feishu authorization page: ${feishuAuthUrl.toString()}`);
      Logger.info(`[Feishu OAuth Authorization] Original redirect_uri: ${redirect_uri}, will callback to: ${ourCallbackUrl}`);
      return res.redirect(feishuAuthUrl.toString());
    });

    // 飞书OAuth回调端点 - 接收飞书的授权码并重定向到原始地址
    app.get('/oauth/feishu/callback', (req: Request, res: Response) => {
      Logger.log(`[Feishu OAuth Callback] Received callback from Feishu: ${JSON.stringify(req.query)}`);
      
      const { code, state, error } = req.query;
      
      // 处理授权错误
      if (error) {
        Logger.error(`[Feishu OAuth Callback] Authorization error: ${error}`);
        res.status(400).send(`授权失败: ${error}`);
        return;
      }
      
      // 验证必需参数
      if (!code || !state) {
        Logger.error(`[Feishu OAuth Callback] Missing required parameters: code=${code}, state=${state}`);
        res.status(400).send('缺少必需参数');
        return;
      }
      
      try {
        // 解码state获取原始参数
        const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
        const { original_redirect_uri, original_state } = stateData;
        
        Logger.info(`[Feishu OAuth Callback] Decoded state - original_redirect_uri: ${original_redirect_uri}`);
        
        // 构造重定向到原始地址的URL
        const finalRedirectUrl = new URL(original_redirect_uri);
        finalRedirectUrl.searchParams.set('code', code as string);
        
        if (original_state) {
          finalRedirectUrl.searchParams.set('state', original_state);
        }
        
        Logger.info(`[Feishu OAuth Callback] Final redirect to: ${finalRedirectUrl.toString()}`);
        res.redirect(finalRedirectUrl.toString());
        return;
        
      } catch (error) {
        Logger.error(`[Feishu OAuth Callback] Error decoding state:`, error);
        res.status(400).send('状态参数解码失败');
        return;
      }
    });

    // OAuth 2.0 Token Endpoint - 飞书令牌交换
    app.post('/token', async (req: Request, res: Response) => {
      Logger.log(`[Feishu OAuth Token] Received token request headers: ${JSON.stringify(req.headers)}`);
      Logger.log(`[Feishu OAuth Token] Received token request body: ${JSON.stringify(req.body)}`);
      Logger.log(`[Feishu OAuth Token] Content-Type: ${req.get('Content-Type')}`);
      
      const { grant_type, code, refresh_token } = req.body;
      
      // 验证grant_type
      if (!grant_type) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing grant_type parameter'
        });
        return;
      }
      
      if (grant_type !== 'authorization_code' && grant_type !== 'refresh_token') {
        res.status(400).json({
          error: 'unsupported_grant_type',
          error_description: 'Only authorization_code and refresh_token grant types are supported'
        });
        return;
      }
      
      // 根据grant_type验证必需参数
      if (grant_type === 'authorization_code' && !code) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing authorization code for authorization_code grant'
        });
        return;
      }
      
      if (grant_type === 'refresh_token' && !refresh_token) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing refresh_token for refresh_token grant'
        });
        return;
      }
      
      try {
        // 获取飞书配置
        const config = Config.getInstance();
        const feishuAppId = config.feishu.appId;
        const feishuAppSecret = config.feishu.appSecret;
        
        if (!feishuAppId || !feishuAppSecret) {
          res.status(500).json({
            error: 'server_error',
            error_description: 'Feishu configuration incomplete'
          });
          return;
        }
        
        let tokenRequestBody: any;
        let feishuApiUrl: string;
        
                 if (grant_type === 'authorization_code') {
           // 使用授权码换取飞书用户访问令牌
           const protocol = this.getProtocol(req);
           const host = req.get('X-Forwarded-Host') || req.get('host');
           const baseUrl = `${protocol}://${host}`;
           const ourCallbackUrl = `${baseUrl}/oauth/feishu/callback`;
          
          tokenRequestBody = {
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: ourCallbackUrl
          };
          feishuApiUrl = 'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token';
          
        } else {
          // grant_type === 'refresh_token'
          // 使用refresh_token刷新访问令牌
          tokenRequestBody = {
            grant_type: 'refresh_token',
            refresh_token: refresh_token
          };
          feishuApiUrl = 'https://open.feishu.cn/open-apis/authen/v1/oidc/refresh_access_token';
        }
        
        Logger.info(`[Feishu OAuth Token] Making ${grant_type} request to Feishu API`);
        
        const tokenResponse = await fetch(feishuApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await getTenantAccessToken(feishuAppId, feishuAppSecret)}`
          },
          body: JSON.stringify(tokenRequestBody)
        });
        
        const tokenData = await tokenResponse.json();
        
        if (tokenData.code === 0) {
          // 成功获取飞书用户令牌
          Logger.info(`[Feishu OAuth Token] Successfully obtained user access token via ${grant_type}`);
          
          const response = {
            access_token: tokenData.data.access_token,
            token_type: 'Bearer',
            expires_in: tokenData.data.expires_in,
            refresh_token: tokenData.data.refresh_token,
            scope: tokenData.data.scope || 'email:readonly'
          };
          res.json(response);
          return;
         } else {
           Logger.error(`[Feishu OAuth Token] Failed to obtain access token via ${grant_type}: ${JSON.stringify(tokenData)}`);
           
           // 根据不同的错误类型返回相应的OAuth错误
           let oauthError = 'invalid_grant';
           if (grant_type === 'refresh_token') {
             // refresh_token相关的常见错误
             if (tokenData.msg && tokenData.msg.includes('expired')) {
               oauthError = 'invalid_grant'; // refresh_token已过期
             } else if (tokenData.msg && tokenData.msg.includes('invalid')) {
               oauthError = 'invalid_grant'; // refresh_token无效
             }
           }
           
           res.status(400).json({
             error: oauthError,
             error_description: `Feishu API error: ${tokenData.msg || 'Unknown error'}`
           });
          return;
         }
       } catch (error) {
         Logger.error(`[Feishu OAuth Token] Error during ${grant_type} token exchange:`, error);
         res.status(500).json({
           error: 'server_error',
           error_description: `Failed to ${grant_type === 'refresh_token' ? 'refresh access token' : 'exchange authorization code for access token'}`
         });
        return;
       }
    });

    // 获取飞书租户访问令牌的辅助函数
    async function getTenantAccessToken(appId: string, appSecret: string): Promise<string> {
      const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          app_id: appId,
          app_secret: appSecret
        })
      });
      
      const data = await response.json();
      if (data.code === 0) {
        return data.tenant_access_token;
      } else {
        throw new Error(`Failed to get tenant access token: ${data.msg}`);
      }
    }

    app.get('/getToken', async (_req: Request, res: Response) => {
      // const { client_id, client_secret, token_type } = req.query;
      // if (!client_id) {
      //   res.status(400).json({ code: 400, msg: '缺少 client_id 或 client_secret' });
      //   return;
      // }
      let client_id = "";
      let client_secret = "";
      let token_type = "";
      try {
        const tokenResult = await getTokenByParams({
          client_id: client_id as string,
          client_secret: client_secret as string,
          token_type: token_type as string
        });
        if (tokenResult.needAuth === true) {
          // 跳转到授权页面
          res.redirect(tokenResult.url);
          return;
        }
        // res.json({ code: 0, msg: 'success', data: tokenResult });
      } catch (e: any) {
        res.status(500).json({ code: 500, msg: e.message || '获取token失败' });
      }
    });

         // OAuth 2.0 Authorization Server Metadata - RFC 8414
     app.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
       Logger.log(`[OAuth Discovery] Received request for authorization server metadata`);
       // 检查X-Forwarded-Proto头来正确获取协议
       const protocol = this.getProtocol(req);
       const host = req.get('X-Forwarded-Host') || req.get('host');
       const baseUrl = `${protocol}://${host}`;
      
      const metadata = {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/authorize`,
        token_endpoint: `${baseUrl}/token`,
        userinfo_endpoint: `${baseUrl}/userinfo`,
        revocation_endpoint: `${baseUrl}/revoke`,
        introspection_endpoint: `${baseUrl}/introspect`,
        response_types_supported: [
          "code"
        ],
        response_modes_supported:[
          "query"
        ],
        grant_types_supported: [
          "authorization_code",
          "refresh_token"
        ],
        token_endpoint_auth_methods_supported: [
          "client_secret_basic",
          "client_secret_post",
          "none"
        ],
        code_challenge_methods_supported: [
          "plain",
          "S256"
        ],
        registration_endpoint: `${baseUrl}/register`
      };

      res.json(metadata);
    });

         // OAuth 2.0 Protected Resource Metadata - RFC 8707
     app.get('/.well-known/oauth-protected-resource', (req: Request, res: Response) => {
       Logger.log(`[OAuth Discovery] Received request for protected resource metadata`);
       // 检查X-Forwarded-Proto头来正确获取协议
       const protocol = this.getProtocol(req);
       const host = req.get('X-Forwarded-Host') || req.get('host');
       const baseUrl = `${protocol}://${host}`;
      
      const metadata = {
        resource: baseUrl,
        authorization_servers: [`${baseUrl}`],
        bearer_methods_supported: [
          "header"
        ],
        resource_documentation: `${baseUrl}/docs`,
        // revocation_endpoint: `${baseUrl}/revoke`,
        // introspection_endpoint: `${baseUrl}/introspect`
      };

      res.json(metadata);
    });

    app.listen(port, () => {
      Logger.info(`HTTP server listening on port ${port}`);
      Logger.info(`SSE endpoint available at http://localhost:${port}/sse`);
      Logger.info(`Message endpoint available at http://localhost:${port}/messages`);
      Logger.info(`OAuth Authorization endpoint available at http://localhost:${port}/authorize`);
      Logger.info(`OAuth Token endpoint available at http://localhost:${port}/token`);
      Logger.info(`OAuth Registration endpoint available at http://localhost:${port}/register`);
      Logger.info(`OAuth Discovery endpoint available at http://localhost:${port}/.well-known/oauth-authorization-server`);
    });
  }
}
