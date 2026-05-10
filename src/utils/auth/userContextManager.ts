import { AsyncLocalStorage } from 'async_hooks';
import { Request } from 'express';

/**
 * 用户上下文接口
 */
interface UserContext {
  userKey: string;
  baseUrl: string;
  isUserKeyProvided: boolean; // 是否由客户端明确提供 user-key（而非系统自动生成的 fallback）
}

/**
 * 用户上下文管理器
 * 使用 AsyncLocalStorage 在异步调用链中传递用户信息
 */
export class UserContextManager {
  private static instance: UserContextManager;
  private readonly asyncLocalStorage: AsyncLocalStorage<UserContext>;

  private constructor() {
    this.asyncLocalStorage = new AsyncLocalStorage<UserContext>();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): UserContextManager {
    if (!UserContextManager.instance) {
      UserContextManager.instance = new UserContextManager();
    }
    return UserContextManager.instance;
  }

  /**
   * 在指定上下文中运行回调函数
   * @param context 用户上下文
   * @param callback 回调函数
   * @returns 回调函数的返回值
   */
  public run<T>(context: UserContext, callback: () => T): T {
    return this.asyncLocalStorage.run(context, callback);
  }

  /**
   * 获取当前上下文中的用户密钥
   * @returns 用户密钥，如果不存在则返回空字符串
   */
  public getUserKey(): string {
    const context = this.asyncLocalStorage.getStore();
    return context?.userKey || '';
  }

  /**
   * 检查当前上下文中的 userKey 是否由客户端明确提供
   * 当返回 false 时，userKey 是系统自动生成的 fallback 值（如 sessionId 或 anon-xxx），
   * 不应用于查找缓存 token，否则可能访问到其他用户的缓存数据
   * @returns 如果 userKey 由客户端明确提供则返回 true
   */
  public isUserKeyProvided(): boolean {
    const context = this.asyncLocalStorage.getStore();
    return context?.isUserKeyProvided ?? false;
  }

  /**
   * 获取当前上下文中的基础URL
   * @returns 基础URL，如果不存在则返回空字符串
   */
  public getBaseUrl(): string {
    const context = this.asyncLocalStorage.getStore();
    return context?.baseUrl || '';
  }

  /**
   * 获取当前完整的用户上下文
   * @returns 用户上下文，如果不存在则返回 undefined
   */
  public getContext(): UserContext | undefined {
    return this.asyncLocalStorage.getStore();
  }

  /**
   * 检查是否存在用户上下文
   * @returns 如果存在用户上下文则返回 true
   */
  public hasContext(): boolean {
    return this.asyncLocalStorage.getStore() !== undefined;
  }
}

/**
 * 获取协议
 */
function getProtocol(req: Request): string {
  if (req.secure || req.get('X-Forwarded-Proto') === 'https') {
    return 'https';
  }
  return 'http';
}

/**
 * 获取基础URL
 */
export function getBaseUrl(req: Request): string {
  const protocol = getProtocol(req);
  const host = req.get('X-Forwarded-Host') || req.get('host');
  return `${protocol}://${host}`;
}
