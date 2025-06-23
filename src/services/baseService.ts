import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { Logger } from '../utils/logger.js';
import { formatErrorMessage } from '../utils/error.js';

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
  protected accessToken: string = '';
  protected tokenExpireTime: number | null = null;

  /**
   * 获取API基础URL
   * @returns API基础URL
   */
  protected abstract getBaseUrl(): string;
  
  /**
   * 获取API认证端点
   * @returns 认证端点URL
   */
  protected abstract getAuthEndpoint(): string;
  
  /**
   * 检查访问令牌是否过期
   * @returns 是否过期
   */
  protected isTokenExpired(): boolean {
    if (!this.accessToken || !this.tokenExpireTime) return true;
    // 预留5分钟的缓冲时间
    return Date.now() >= (this.tokenExpireTime - 5 * 60 * 1000);
  }
  
  /**
   * 获取访问令牌
   * @param userKey 用户标识（可选），用于多用户token场景
   * @returns 访问令牌
   */
  protected abstract getAccessToken(userKey?: string): Promise<string>;
  
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
   * @param userKey 用户标识（可选），用于多用户token场景
   * @returns 响应数据
   */
  protected async request<T = any>(
    endpoint: string, 
    method: string = 'GET', 
    data?: any, 
    needsAuth: boolean = true,
    additionalHeaders?: Record<string, string>,
    userKey?: string
  ): Promise<T> {
    try {
      // 构建请求URL
      const url = `${this.getBaseUrl()}${endpoint}`;
      
      // 准备请求头
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...additionalHeaders
      };
      
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
        params: method === 'GET' ? data : undefined
      };
      
      // 发送请求
      const response = await axios<ApiResponse<T>>(config);
      
      // 记录响应信息
      Logger.debug('收到响应:');
      Logger.debug(`响应状态码: ${response.status}`);
      Logger.debug(`响应头:`, response.headers);
      Logger.debug(`响应数据:`, response.data);
      
      // 检查API错误
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
      // 处理401错误，可能是令牌过期
      if (error instanceof AxiosError && error.response?.status === 401) {
        // 清除当前令牌，下次请求会重新获取
        this.accessToken = '';
        this.tokenExpireTime = null;
        Logger.warn('访问令牌可能已过期，已清除缓存的令牌');
        
        // 如果这是重试请求，避免无限循环
        if ((error as any).isRetry) {
          this.handleApiError(error, `API请求失败 (${endpoint})`);
        }
        
        // 重试请求
        Logger.info('重试请求...');
        try {
          return await this.request<T>(endpoint, method, data, needsAuth, additionalHeaders, userKey);
        } catch (retryError) {
          // 标记为重试请求
          (retryError as any).isRetry = true;
          this.handleApiError(retryError, `重试API请求失败 (${endpoint})`);
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
   * @param userKey 用户标识（可选），用于多用户token场景
   * @returns 响应数据
   */
  protected async get<T = any>(endpoint: string, params?: any, needsAuth: boolean = true, userKey?: string): Promise<T> {
    return this.request<T>(endpoint, 'GET', params, needsAuth, undefined, userKey);
  }
  
  /**
   * POST请求
   * @param endpoint 请求端点
   * @param data 请求数据
   * @param needsAuth 是否需要认证
   * @param userKey 用户标识（可选），用于多用户token场景
   * @returns 响应数据
   */
  protected async post<T = any>(endpoint: string, data?: any, needsAuth: boolean = true, userKey?: string): Promise<T> {
    return this.request<T>(endpoint, 'POST', data, needsAuth, undefined, userKey);
  }
  
  /**
   * PUT请求
   * @param endpoint 请求端点
   * @param data 请求数据
   * @param needsAuth 是否需要认证
   * @param userKey 用户标识（可选），用于多用户token场景
   * @returns 响应数据
   */
  protected async put<T = any>(endpoint: string, data?: any, needsAuth: boolean = true, userKey?: string): Promise<T> {
    return this.request<T>(endpoint, 'PUT', data, needsAuth, undefined, userKey);
  }
  
  /**
   * PATCH请求
   * @param endpoint 请求端点
   * @param data 请求数据
   * @param needsAuth 是否需要认证
   * @param userKey 用户标识（可选），用于多用户token场景
   * @returns 响应数据
   */
  protected async patch<T = any>(endpoint: string, data?: any, needsAuth: boolean = true, userKey?: string): Promise<T> {
    return this.request<T>(endpoint, 'PATCH', data, needsAuth, undefined, userKey);
  }
  
  /**
   * DELETE请求
   * @param endpoint 请求端点
   * @param data 请求数据
   * @param needsAuth 是否需要认证
   * @param userKey 用户标识（可选），用于多用户token场景
   * @returns 响应数据
   */
  protected async delete<T = any>(endpoint: string, data?: any, needsAuth: boolean = true, userKey?: string): Promise<T> {
    return this.request<T>(endpoint, 'DELETE', data, needsAuth, undefined, userKey);
  }
} 