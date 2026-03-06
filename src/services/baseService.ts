import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import FormData from 'form-data';
import { Logger } from '../utils/logger.js';
import { formatErrorMessage, AuthRequiredError, ScopeInsufficientError } from '../utils/error.js';
import { Config } from '../utils/config.js';
import { TokenCacheManager, UserContextManager,AuthUtils } from '../utils/auth/index.js';

/**
 * API请求错误接口
 */
export interface ApiError {
  status: number;
  err: string;
  apiError?: any;
  logId?: string;
}

/**
 * API响应接口
 */
export interface ApiResponse<T = any> {
  code: number;
  msg: string;
  data: T;
  log_id?: string;
}

/**
 * API服务基类
 * 提供通用的HTTP请求处理和认证功能
 */
export abstract class BaseApiService {

  /**
   * 获取API基础URL
   * @returns API基础URL
   */
  protected abstract getBaseUrl(): string;

  /**
   * 获取访问令牌
   * @param userKey 用户标识（可选）
   * @returns 访问令牌
   */
  protected abstract getAccessToken(userKey?: string): Promise<string>;

  /**
   * 检查是否是 stdio 模式
   * @returns 如果是 stdio 模式返回 true
   */
  private isStdioMode(): boolean {
    return process.env.NODE_ENV === "cli" || process.argv.includes("--stdio");
  }

  /**
   * 处理API错误
   * @param error 错误对象
   * @param message 错误上下文消息
   * @throws 标准化的API错误
   */
  protected handleApiError(error: any, message: string): never {
    Logger.error(`${message}:`, error);
    
    // 如果已经是格式化的API错误，直接重新抛出
    if (error && typeof error === 'object' && 'status' in error && 'err' in error) {
      throw error;
    }
    
    // 处理Axios错误
    if (error instanceof AxiosError && error.response) {
      const responseData = error.response.data;
      const apiError: ApiError = {
        status: error.response.status,
        err: formatErrorMessage(error, message),
        apiError: responseData,
        logId: responseData?.log_id
      };
      throw apiError;
    }
    
    // 处理其他类型的错误
    const errorMessage = error instanceof Error 
      ? error.message 
      : (typeof error === 'string' ? error : '未知错误');
    
    throw {
      status: 500,
      err: formatErrorMessage(error, message),
      apiError: {
        code: -1,
        msg: errorMessage,
        error
      }
    } as ApiError;
  }
  
  /**
   * 执行API请求
   * @param endpoint 请求端点
   * @param method 请求方法
   * @param data 请求数据
   * @param needsAuth 是否需要认证
   * @param additionalHeaders 附加请求头
   * @param responseType 响应类型
   * @param retry 是否允许重试，默认为false
   * @returns 响应数据
   */
  protected async request<T = any>(
    endpoint: string,
    method: string = 'GET',
    data?: any,
    needsAuth: boolean = true,
    additionalHeaders?: Record<string, string>,
    responseType?: 'json' | 'arraybuffer' | 'blob' | 'document' | 'text' | 'stream',
    retry: boolean = false
  ): Promise<T> {
    // 获取用户上下文
    let userKey: string;
    let baseUrl: string;
    
    if (this.isStdioMode()) {
      // stdio 模式下直接使用默认值
      userKey = 'stdio';
      const config = Config.getInstance();
      baseUrl = `http://localhost:${config.server.port}`;
    } else {
      // HTTP 模式下从 UserContextManager 读取
      const userContextManager = UserContextManager.getInstance();
      userKey = userContextManager.getUserKey();
      baseUrl = userContextManager.getBaseUrl();
    }
    
    const clientKey = AuthUtils.generateClientKey(userKey);

    Logger.debug(`[BaseService] Request context - userKey: ${userKey}, baseUrl: ${baseUrl}`);

    try {
      // 构建请求URL
      const url = `${this.getBaseUrl()}${endpoint}`;

      // 准备请求头
      const headers: Record<string, string> = {
        ...additionalHeaders
      };

      // 如果数据是FormData，合并FormData的headers
      // 否则设置为application/json
      if (data instanceof FormData) {
        Object.assign(headers, data.getHeaders());
      } else {
        headers['Content-Type'] = 'application/json';
      }
      
      // 添加认证令牌
      if (needsAuth) {
        const accessToken = await this.getAccessToken(userKey);
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      
      // 记录请求信息
      Logger.debug('准备发送请求:');
      Logger.debug(`请求URL: ${url}`);
      Logger.debug(`请求方法: ${method}`);
      if (data) {
        Logger.debug(`请求数据:`, data);
      }
      
      // 构建请求配置
      const config: AxiosRequestConfig = {
        method,
        url,
        headers,
        data: method !== 'GET' ? data : undefined,
        params: method === 'GET' ? data : undefined,
        responseType: responseType || 'json'
      };
      
      // 发送请求
      const response = await axios<ApiResponse<T>>(config);
      
      // 记录响应信息
      Logger.debug('收到响应:');
      Logger.debug(`响应状态码: ${response.status}`);
      Logger.debug(`响应头:`, response.headers);
      Logger.debug(`响应数据:`, response.data);
      
      // 对于非JSON响应，直接返回数据
      if (responseType && responseType !== 'json') {
        return response.data as T;
      }
      
      // 检查API错误（仅对JSON响应）
      if (response.data && typeof response.data.code === 'number' && response.data.code !== 0) {
        Logger.error(`API返回错误码: ${response.data.code}, 错误消息: ${response.data.msg}`);
        throw {
          status: response.status,
          err: response.data.msg || 'API返回错误码',
          apiError: response.data,
          logId: response.data.log_id
        } as ApiError;
      }
      
      // 返回数据
      return response.data.data;
    } catch (error) {
      const config = Config.getInstance().feishu;

      // 优先处理权限不足异常
      if (error instanceof ScopeInsufficientError) {
        return this.handleScopeInsufficientError(error);
      }

      // 处理授权异常
      if (error instanceof AuthRequiredError) {
         return this.handleAuthFailure(config.authType==="tenant", clientKey, baseUrl, userKey);
      }

      const tokenError = new Set<number>([
        4001,         // Invalid token, please refresh
        20006,        // 过期 User Access Token
        20013,        // get tenant access token fail
        99991663,     // Invalid access token for authorization (often tenant token)
        99991668,     // Invalid access token for authorization (user token)
        99991677,     // user token expire
        99991669,     // invalid user refresh token
        99991664,     // invalid app token
        99991665,     // invalid tenant code
        99991679      // Unauthorized - missing required scope, need re-authorization
      ]);
      // 处理认证相关错误（401, 403等 或 明确的 token 错误码）
      if (error instanceof AxiosError && error.response && tokenError.has(Number(error.response.data?.code))) {
        Logger.warn(`认证失败 (${error.response.status}): ${endpoint}  ${JSON.stringify(error.response.data)}`);

        // 获取配置和token缓存管理器
        const tokenCacheManager = TokenCacheManager.getInstance();

        // 如果已经重试过，直接处理认证失败
        if (retry) {
          return this.handleAuthFailure(config.authType==="tenant", clientKey, baseUrl, userKey);
        }

        // 根据认证类型处理token过期
        if (config.authType === 'tenant') {
          return this.handleTenantTokenExpired(tokenCacheManager, clientKey, endpoint, method, data, needsAuth, additionalHeaders, responseType);
        } else {
          return this.handleUserTokenExpired(tokenCacheManager, clientKey, endpoint, method, data, needsAuth, additionalHeaders, responseType,baseUrl, userKey);
        }
      }
      // 处理其他错误
      this.handleApiError(error, `API请求失败 (${endpoint})`);
    }
  }
  
  /**
   * GET请求
   * @param endpoint 请求端点
   * @param params 请求参数
   * @param needsAuth 是否需要认证
   * @returns 响应数据
   */
  protected async get<T = any>(endpoint: string, params?: any, needsAuth: boolean = true): Promise<T> {
    return this.request<T>(endpoint, 'GET', params, needsAuth);
  }
  
  /**
   * POST请求
   * @param endpoint 请求端点
   * @param data 请求数据
   * @param needsAuth 是否需要认证
   * @returns 响应数据
   */
  protected async post<T = any>(endpoint: string, data?: any, needsAuth: boolean = true): Promise<T> {
    return this.request<T>(endpoint, 'POST', data, needsAuth);
  }
  
  /**
   * PUT请求
   * @param endpoint 请求端点
   * @param data 请求数据
   * @param needsAuth 是否需要认证
   * @returns 响应数据
   */
  protected async put<T = any>(endpoint: string, data?: any, needsAuth: boolean = true): Promise<T> {
    return this.request<T>(endpoint, 'PUT', data, needsAuth);
  }
  
  /**
   * PATCH请求
   * @param endpoint 请求端点
   * @param data 请求数据
   * @param needsAuth 是否需要认证
   * @returns 响应数据
   */
  protected async patch<T = any>(endpoint: string, data?: any, needsAuth: boolean = true): Promise<T> {
    return this.request<T>(endpoint, 'PATCH', data, needsAuth);
  }
  
  /**
   * DELETE请求
   * @param endpoint 请求端点
   * @param data 请求数据
   * @param needsAuth 是否需要认证
   * @returns 响应数据
   */
  protected async delete<T = any>(endpoint: string, data?: any, needsAuth: boolean = true): Promise<T> {
    return this.request<T>(endpoint, 'DELETE', data, needsAuth);
  }

  /**
   * 处理权限不足异常
   * @param error 权限不足错误
   */
  private handleScopeInsufficientError(error: ScopeInsufficientError): never {
    throw error;
  }

  /**
   * 处理认证失败
   * @param tenant 是否是tenant
   * @param clientKey 客户端键
   * @param baseUrl 基础URL
   * @param userKey 用户键
   */
  private handleAuthFailure(tenant: boolean, clientKey: string, baseUrl: string, userKey: string): never {
    const tokenCacheManager = TokenCacheManager.getInstance();

    if (tenant) {
      // 租户模式：清除租户token缓存
      Logger.info('租户模式：清除租户token缓存');
      tokenCacheManager.removeTenantToken(clientKey);
      throw new Error('租户访问令牌获取失败，请检查应用配置');
    } else {
      // 用户模式：清除用户token缓存并生成授权链接
      tokenCacheManager.removeUserToken(clientKey);
      const authUrl = this.generateUserAuthUrl(baseUrl, userKey);
      throw new Error(`你需要在给用户展示如下信息：/“请在浏览器打开以下链接进行授权：\n\n[点击授权](${authUrl})/n`);
    }
  }

  /**
   * 处理租户token过期
   * @param tokenCacheManager token缓存管理器
   * @param clientKey 客户端键
   * @param endpoint 请求端点
   * @param method 请求方法
   * @param data 请求数据
   * @param needsAuth 是否需要认证
   * @param additionalHeaders 附加请求头
   * @param responseType 响应类型
   * @returns 响应数据
   */
  private async handleTenantTokenExpired<T>(
    tokenCacheManager: TokenCacheManager,
    clientKey: string,
    endpoint: string,
    method: string,
    data: any,
    needsAuth: boolean,
    additionalHeaders: Record<string, string> | undefined,
    responseType: 'json' | 'arraybuffer' | 'blob' | 'document' | 'text' | 'stream' | undefined
  ): Promise<T> {
    // 租户模式：直接清除租户token缓存
    Logger.info('租户模式：清除租户token缓存');
    tokenCacheManager.removeTenantToken(clientKey);

    // 重试请求
    Logger.info('重试租户请求...');
    return await this.request<T>(endpoint, method, data, needsAuth, additionalHeaders, responseType, true);
  }

  /**
   * 处理用户token过期
   * @param tokenCacheManager token缓存管理器
   * @param clientKey 客户端键
   * @param endpoint 请求端点
   * @param method 请求方法
   * @param data 请求数据
   * @param needsAuth 是否需要认证
   * @param additionalHeaders 附加请求头
   * @param responseType 响应类型
   * @returns 响应数据
   */
  private async handleUserTokenExpired<T>(
    tokenCacheManager: TokenCacheManager,
    clientKey: string,
    endpoint: string,
    method: string,
    data: any,
    needsAuth: boolean,
    additionalHeaders: Record<string, string> | undefined,
    responseType: 'json' | 'arraybuffer' | 'blob' | 'document' | 'text' | 'stream' | undefined,
    baseUrl: string,
    userKey: string
  ): Promise<T> {
    // 用户模式：检查用户token状态
    const tokenStatus = tokenCacheManager.checkUserTokenStatus(clientKey);
    Logger.debug(`用户token状态:`, tokenStatus);

    if (tokenStatus.canRefresh && !tokenStatus.isExpired) {
      // 有有效的refresh_token，设置token为过期状态，让下次请求时刷新
      Logger.info('用户模式：token过期，将在下次请求时刷新');
      const tokenInfo = tokenCacheManager.getUserTokenInfo(clientKey);
      if (tokenInfo) {
        // 设置access_token为过期，但保留refresh_token
        tokenInfo.expires_at = Math.floor(Date.now() / 1000) - 1;
        tokenCacheManager.cacheUserToken(clientKey, tokenInfo);
      }

      // 重试请求
      Logger.info('重试用户请求...');
      return await this.request<T>(endpoint, method, data, needsAuth, additionalHeaders, responseType, true);
    } else {
      // refresh_token已过期或不存在，直接清除缓存
      Logger.warn('用户模式：refresh_token已过期，清除用户token缓存');
      tokenCacheManager.removeUserToken(clientKey);
      return this.handleAuthFailure(true,clientKey,baseUrl,userKey);
    }
  }

  /**
   * 生成用户授权URL
   * @param baseUrl 基础URL
   * @param userKey 用户键
   * @returns 授权URL
   */
  private generateUserAuthUrl(baseUrl: string, userKey: string): string {
    const { appId, appSecret } = Config.getInstance().feishu;
    const clientKey = AuthUtils.generateClientKey(userKey);
    const redirect_uri = `${baseUrl}/callback`;
    const scope = encodeURIComponent('base:app:read bitable:app bitable:app:readonly board:whiteboard:node:read board:whiteboard:node:create calendar:calendar contact:user.employee_id:readonly docs:document.content:read docx:document docx:document.block:convert docx:document:create docx:document:readonly drive:drive drive:drive:readonly drive:file drive:file:upload sheets:spreadsheet sheets:spreadsheet:readonly space:document:retrieve space:folder:create task:task:write wiki:space:read wiki:space:retrieve wiki:wiki wiki:wiki:readonly offline_access');
    const state = AuthUtils.encodeState(appId, appSecret, clientKey, redirect_uri);

    return `https://accounts.feishu.cn/open-apis/authen/v1/authorize?client_id=${appId}&redirect_uri=${encodeURIComponent(redirect_uri)}&scope=${scope}&state=${state}`;
  }
} 