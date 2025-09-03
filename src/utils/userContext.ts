import { AsyncLocalStorage } from 'async_hooks';

/**
 * 用户上下文接口
 */
interface UserContext {
  accessToken?: string;
  userInfo?: any;
  openId?: string; // 添加 open_id 支持
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
   * 获取当前上下文中的用户访问令牌
   * @returns 用户访问令牌，如果不存在则返回 undefined
   */
  public getUserAccessToken(): string | undefined {
    const context = this.asyncLocalStorage.getStore();
    return context?.accessToken;
  }

  /**
   * 获取当前上下文中的用户信息
   * @returns 用户信息，如果不存在则返回 undefined
   */
  public getUserInfo(): any | undefined {
    const context = this.asyncLocalStorage.getStore();
    return context?.userInfo;
  }

  /**
   * 获取当前上下文中的 open_id
   * @returns open_id，如果不存在则返回 undefined
   */
  public getOpenId(): string | undefined {
    const context = this.asyncLocalStorage.getStore();
    return context?.openId;
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
