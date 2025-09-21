import { AsyncLocalStorage } from 'async_hooks';

/**
 * 用户上下文接口
 */
interface UserContext {
  feishuToken:string | null |undefined,
  reqKey: string;
  isUserAuthSupported: boolean;
  baseUrl:string;
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
  public getFeishuToken(): string{
    const context = this.asyncLocalStorage.getStore();
    return context?.feishuToken || "";
  }

  public getReqKey():string{
    const context = this.asyncLocalStorage.getStore();
    return context?.reqKey || "";
  }

  /**
   * 获取当前上下文中的是否支持用户认证
   * @returns 用户访问令牌，如果不存在则返回 undefined
   */
  public isUserAuthSupported(): boolean {
    const context = this.asyncLocalStorage.getStore();
    if (context){
      return context.isUserAuthSupported;
    }else {
      return false
    }
  }


  /**
   * 获取当前上下文中的请求baseUrl
   * @returns 用户访问令牌，如果不存在则返回 undefined
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
