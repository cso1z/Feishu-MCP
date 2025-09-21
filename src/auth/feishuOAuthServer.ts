import { Request, Response, Router } from 'express';
import { Logger } from '../utils/logger.js';
import { Config } from '../utils/config.js';
import { AuthService } from '../services/feishuAuthService.js';
import * as crypto from 'crypto';
import { CacheManager } from '../utils/cache.js';
import { getBaseUrl } from '../utils/auth.js';
import { TokenCacheManager } from '../utils/tokenCacheManager.js';

/**
 * 飞书 OAuth 2.0 服务器
 * 提供完整的 OAuth 2.0 授权流程，包括：
 * - 动态客户端注册
 * - 授权端点
 * - 令牌交换
 * - 服务发现
 */
export class FeishuOAuthServer {
  private config: Config;
  private authService: AuthService;
  private router: Router;

  constructor() {
    this.config = Config.getInstance();
    this.authService = new AuthService();
    this.router = Router();
    this.setupRoutes();
  }

  /**
   * 获取路由器实例
   */
  public getRouter(): Router {
    return this.router;
  }


  /**
   * 生成安全的客户端密钥
   */
  private generateClientSecret(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 18);
    const hash = crypto.createHash('sha256').update(`${timestamp}_${random}`).digest('hex');
    return `secret_${hash.substring(0, 32)}`;
  }

  /**
   * 生成客户端ID
   */
  private generateClientId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `client_${timestamp}_${random}`;
  }

  /**
   * 设置所有路由
   */
  private setupRoutes(): void {
    // 动态客户端注册端点
    this.router.post('/register', this.handleClientRegistration.bind(this));
    
    // OAuth 2.0 授权端点
    this.router.get('/authorize', this.handleAuthorization.bind(this));
    this.router.post('/authorize', this.handleAuthorization.bind(this));
    
    // 飞书回调端点
    this.router.get('/oauth/feishu/callback', this.handleFeishuCallback.bind(this));
    
    // 令牌端点
    this.router.post('/token', this.handleTokenExchange.bind(this));
    
    // 用户信息端点
    // this.router.get('/userinfo', this.handleUserInfo.bind(this));
    
    // 令牌撤销端点
    // this.router.post('/revoke', this.handleTokenRevocation.bind(this));
    
    // 令牌内省端点
    // this.router.post('/introspect', this.handleTokenIntrospection.bind(this));
    
    // OAuth 2.0 服务发现端点
    this.router.get('/.well-known/oauth-authorization-server', this.handleAuthorizationServerMetadata.bind(this));
    this.router.get('/.well-known/oauth-protected-resource', this.handleProtectedResourceMetadata.bind(this));
  }

  /**
   * 处理动态客户端注册
   */
  private async handleClientRegistration(req: Request, res: Response): Promise<void> {
    try {
      Logger.error('[OAuth Registration] Received dynamic client registration request');
      
      const clientId = this.generateClientId();
      const clientSecret = this.generateClientSecret();
      const baseUrl = getBaseUrl(req);

      const registrationResponse = {
        client_id: clientId,
        client_secret: clientSecret,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_secret_expires_at: 0, // 永不过期
        redirect_uris: [`${baseUrl}/oauth/feishu/callback`],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'client_secret_basic',
        application_type: 'web',
        scope: encodeURIComponent('base:app:read bitable:app bitable:app:readonly board:whiteboard:node:read contact:user.employee_id:readonly docs:document.content:read docx:document docx:document.block:convert docx:document:create docx:document:readonly drive:drive drive:drive:readonly drive:file drive:file:upload sheets:spreadsheet sheets:spreadsheet:readonly space:document:retrieve space:folder:create wiki:space:read wiki:space:retrieve wiki:wiki wiki:wiki:readonly offline_access')
      };
      
      Logger.info(`[OAuth Registration] Created new client: ${clientId}  ${JSON.stringify(registrationResponse)}`);
      res.status(201).json(registrationResponse);
    } catch (error) {
      Logger.error('[OAuth Registration] Error during client registration:', error);
      res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to register client'
      });
    }
  }

  /**
   * 处理 OAuth 授权请求
   */
  private async handleAuthorization(req: Request, res: Response): Promise<void> {
    try {
      Logger.error(`[Feishu OAuth Authorization] Received authorization request: ${JSON.stringify(req.query)}`);

      const {
        response_type = 'code',
        client_id,
        redirect_uri,
        scope = 'base:app:read bitable:app bitable:app:readonly board:whiteboard:node:read contact:user.employee_id:readonly docs:document.content:read docx:document docx:document.block:convert docx:document:create docx:document:readonly drive:drive drive:drive:readonly drive:file drive:file:upload sheets:spreadsheet sheets:spreadsheet:readonly space:document:retrieve space:folder:create wiki:space:read wiki:space:retrieve wiki:wiki wiki:wiki:readonly offline_access',
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
      const feishuAppId = this.config.feishu.appId;

      if (!feishuAppId) {
        res.status(500).json({
          error: 'server_error',
          error_description: 'Feishu app_id not configured'
        });
        return;
      }

      // 构造本服务器的回调地址
      const baseUrl = getBaseUrl(req);
      const ourCallbackUrl = `${baseUrl}/oauth/feishu/callback`;

      // 将原始参数编码到state中
      const stateData = {
        original_redirect_uri: redirect_uri,
        original_state: state,
        client_id: client_id,
        scope: scope,
        timestamp: Date.now() // 添加时间戳用于过期验证
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

      res.redirect(feishuAuthUrl.toString());
    } catch (error) {
      Logger.error('[Feishu OAuth Authorization] Error during authorization:', error);
      res.status(500).json({
        error: 'server_error',
        error_description: 'Authorization failed'
      });
    }
  }

  /**
   * 处理飞书 OAuth 回调
   */
  private async handleFeishuCallback(req: Request, res: Response): Promise<void> {
    try {
      Logger.error(`[Feishu OAuth Callback] Received callback from Feishu: ${JSON.stringify(req.query)}`);
      
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
        Logger.info(`Buffer.from(state as string, 'base64').toString():${Buffer.from(state as string, 'base64').toString()}`)
        // 解码state获取原始参数
        const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());

        const { original_redirect_uri, original_state, timestamp } = stateData;
        
        // 验证state是否过期（5分钟）
        const now = Date.now();
        if (now - timestamp > 5 * 60 * 1000) {
          Logger.error('[Feishu OAuth Callback] State expired');
          res.status(400).send('授权请求已过期，请重新授权');
          return;
        }
        
        Logger.info(`[Feishu OAuth Callback] Decoded state - original_redirect_uri: ${original_redirect_uri}`);
        
        // 构造重定向到原始地址的URL
        const finalRedirectUrl = new URL(original_redirect_uri);
        finalRedirectUrl.searchParams.set('code', code as string);
        
        if (original_state) {
          finalRedirectUrl.searchParams.set('state', original_state);
        }
        
        Logger.info(`[Feishu OAuth Callback] Final redirect to: ${finalRedirectUrl.toString()}`);
        res.redirect(finalRedirectUrl.toString());
      } catch (error) {
        Logger.error('[Feishu OAuth Callback] Error decoding state:', error);
        res.status(400).send('状态参数解码失败');
      }
    } catch (error) {
      Logger.error('[Feishu OAuth Callback] Unexpected error:', error);
      res.status(500).send('服务器内部错误');
    }
  }

  /**
   * 处理令牌交换
   */
  private async handleTokenExchange(req: Request, res: Response): Promise<void> {
    try {
      Logger.error(`[Feishu OAuth Token] Received token request headers: ${JSON.stringify(req.headers)}`);
      Logger.error(`[Feishu OAuth Token] Received token request body: ${JSON.stringify(req.body)}`);
      
      const { grant_type, code, refresh_token } = req.body;
      
      // 验证grant_type
      if (!grant_type) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing grant_type parameter'
        });
        return;
      }
      
      if (!['authorization_code', 'refresh_token'].includes(grant_type)) {
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
        let tokenData;
        
        if (grant_type === 'authorization_code') {
          // 使用授权码换取飞书用户访问令牌
          const baseUrl = getBaseUrl(req);
          const ourCallbackUrl = `${baseUrl}/oauth/feishu/callback`;
          
          tokenData = await this.authService.getUserTokenByCode({
            client_id: this.config.feishu.appId,
            client_secret: this.config.feishu.appSecret,
            code: code,
            redirect_uri: ourCallbackUrl
          });
        } else {
          // grant_type === 'refresh_token'
          const clientKey = TokenCacheManager.generateClientKey(this.config.feishu.appId, this.config.feishu.appSecret,refresh_token);

          const tempToken = CacheManager.getInstance().getUserToken(clientKey);
          Logger.info(`tempToken:${JSON.stringify(tempToken)}`)
          const now = Date.now() / 1000;
          if (tempToken && tempToken.refresh_token_expires_at < now) {
            const response = {
              token: CacheManager.generateRandomKey(),
              token_type: 'Bearer',
              expires_in: tempToken.expires_in || 7200,
            };
            res.json(response);
            return
          }
          tokenData = await this.authService.refreshUserToken(
            refresh_token,
            clientKey,
            this.config.feishu.appId,
            this.config.feishu.appSecret,
          );
        }
        
        if (tokenData && tokenData.access_token) {
          const token= CacheManager.generateRandomKey()
          const clientKey = TokenCacheManager.generateClientKey(
            this.config.feishu.appId,
            this.config.feishu.appSecret,
            token,
          );
          Logger.info(`[Feishu OAuth Token] Successfully obtained user access token via ${grant_type}`);
          
          // 将生成的token添加到tokenData中
          tokenData.generated_token = token;
          TokenCacheManager.getInstance().cacheUserToken(clientKey,tokenData);
          const response = {
            access_token: token,
            token_type: 'Bearer',
            expires_in: 1000 * 60 * 24 * 365,
          };
          Logger.error(`[Feishu OAuth Token] success to obtain access token via ${grant_type}: ${JSON.stringify(response)}`);
          res.json(response);
        } else {
          Logger.error(`[Feishu OAuth Token] Failed to obtain access token via ${grant_type}: ${JSON.stringify(tokenData)}`);
          
          res.status(400).json({
            error: 'invalid_grant',
            error_description: `Failed to ${grant_type === 'refresh_token' ? 'refresh access token' : 'exchange authorization code for access token'}`
          });
        }
      } catch (error) {
        Logger.error(`[Feishu OAuth Token] Error during ${grant_type} token exchange:`, error);
        res.status(500).json({
          error: 'server_error',
          error_description: `Failed to ${grant_type === 'refresh_token' ? 'refresh access token' : 'exchange authorization code for access token'}`
        });
      }
    } catch (error) {
      Logger.error('[Feishu OAuth Token] Unexpected error:', error);
      res.status(500).json({
        error: 'server_error',
        error_description: 'Token exchange failed'
      });
    }
  }
  //
  // /**
  //  * 处理用户信息请求
  //  */
  // private async handleUserInfo(req: Request, res: Response): Promise<void> {
  //   try {
  //     const authHeader = req.get('Authorization');
  //     if (!authHeader || !authHeader.startsWith('Bearer ')) {
  //       res.status(401).json({
  //         error: 'invalid_token',
  //         error_description: 'Missing or invalid authorization header'
  //       });
  //       return;
  //     }
  //
  //     const accessToken = authHeader.substring(7);
  //     const userInfo = await this.authService.getUserInfo(accessToken);
  //
  //     res.json(userInfo);
  //   } catch (error) {
  //     Logger.error('[Feishu OAuth UserInfo] Error:', error);
  //     res.status(500).json({
  //       error: 'server_error',
  //       error_description: 'Failed to get user info'
  //     });
  //   }
  // }
  //
  // /**
  //  * 处理令牌撤销
  //  */
  // private async handleTokenRevocation(req: Request, res: Response): Promise<void> {
  //   try {
  //     Logger.error(`[Token Revocation] Token Revocation request headers: ${JSON.stringify(req.headers)}`);
  //     Logger.error(`[Token Revocation] Token Revocation request body: ${JSON.stringify(req.body)}`);
  //     const { token, token_type_hint } = req.body;
  //
  //     if (!token) {
  //       res.status(400).json({
  //         error: 'invalid_request',
  //         error_description: 'Missing token parameter'
  //       });
  //       return;
  //     }
  //
  //     // 这里可以实现令牌撤销逻辑
  //     // 目前简单返回成功
  //     Logger.info(`[Feishu OAuth Revoke] Token revoked: ${token}`);
  //     res.status(200).json({ message: 'Token revoked successfully' });
  //   } catch (error) {
  //     Logger.error('[Feishu OAuth Revoke] Error:', error);
  //     res.status(500).json({
  //       error: 'server_error',
  //       error_description: 'Token revocation failed'
  //     });
  //   }
  // }
  //
  // /**
  //  * 处理令牌内省
  //  */
  // private async handleTokenIntrospection(req: Request, res: Response): Promise<void> {
  //   try {
  //     Logger.error(`[Token Introspection] Token Introspection request headers: ${JSON.stringify(req.headers)}`);
  //     const { token, token_type_hint } = req.body;
  //
  //     if (!token) {
  //       res.status(400).json({
  //         error: 'invalid_request',
  //         error_description: 'Missing token parameter'
  //       });
  //       return;
  //     }
  //
  //     // 这里可以实现令牌内省逻辑
  //     // 目前返回基本信息
  //     Logger.info(`[Feishu OAuth Introspect] Token introspection: ${token}`);
  //     res.json({
  //       active: true,
  //       scope: 'base:app:read bitable:app bitable:app:readonly board:whiteboard:node:read contact:user.employee_id:readonly docs:document.content:read docx:document docx:document.block:convert docx:document:create docx:document:readonly drive:drive drive:drive:readonly drive:file drive:file:upload sheets:spreadsheet sheets:spreadsheet:readonly space:document:retrieve space:folder:create wiki:space:read wiki:space:retrieve wiki:wiki wiki:wiki:readonly offline_access',
  //       token_type: 'Bearer'
  //     });
  //   } catch (error) {
  //     Logger.error('[Feishu OAuth Introspect] Error:', error);
  //     res.status(500).json({
  //       error: 'server_error',
  //       error_description: 'Token introspection failed'
  //     });
  //   }
  // }

  /**
   * 处理 OAuth 2.0 授权服务器元数据
   */
  private handleAuthorizationServerMetadata(req: Request, res: Response): void {
    try {
      Logger.error('[OAuth Discovery] Received request for authorization server metadata');
      const baseUrl = getBaseUrl(req);
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

      Logger.info(`metadata:${JSON.stringify(metadata, null, 2)}`)
      res.json(metadata);
    } catch (error) {
      Logger.error('[OAuth Discovery] Error:', error);
      res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to get authorization server metadata'
      });
    }
  }

  /**
   * 处理受保护资源元数据
   */
  private handleProtectedResourceMetadata(req: Request, res: Response): void {
    try {
      Logger.error(`[OAuth Discovery] Received request for Protected Resource Metadata`);
      const baseUrl = getBaseUrl(req)
      const metadata = {
        resource: baseUrl,
        authorization_servers: [`${baseUrl}`],
        bearer_methods_supported: [
          "header"
        ],
        // resource_documentation: `${baseUrl}/docs`,
        // revocation_endpoint: `${baseUrl}/revoke`,
        // introspection_endpoint: `${baseUrl}/introspect`
      };
      Logger.info(`metadata:${JSON.stringify(metadata, null, 2)}`)
      res.json(metadata);
    } catch (error) {
      Logger.error('[OAuth Discovery] Error:', error);
      res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to get protected resource metadata'
      });
    }
  }
}
