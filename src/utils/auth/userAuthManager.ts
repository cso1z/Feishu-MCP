import { Logger } from '../logger.js';

/**
 * 用户认证管理器
 * 管理 sessionId 与 userKey 的映射关系
 */
export class UserAuthManager {
  private static instance: UserAuthManager;
  private sessionToUserKey: Map<string, string>; // sessionId -> userKey

  /**
   * 私有构造函数，用于单例模式
   */
  private constructor() {
    this.sessionToUserKey = new Map();
  }

  /**
   * 获取用户认证管理器实例
   * @returns 用户认证管理器实例
   */
  public static getInstance(): UserAuthManager {
    if (!UserAuthManager.instance) {
      UserAuthManager.instance = new UserAuthManager();
    }
    return UserAuthManager.instance;
  }

  /**
   * 创建用户会话
   * @param sessionId 会话ID
   * @param userKey 用户密钥
   * @returns 是否创建成功
   */
  public createSession(sessionId: string, userKey: string): boolean {
    if (!sessionId || !userKey) {
      Logger.warn('创建会话失败：sessionId 或 userKey 为空');
      return false;
    }

    this.sessionToUserKey.set(sessionId, userKey);

    Logger.info(`创建用户会话：sessionId=${sessionId}, userKey=${userKey}`);
    return true;
  }

  /**
   * 根据 sessionId 获取 userKey
   * @param sessionId 会话ID
   * @returns 用户密钥，如果未找到则返回 null
   */
  public getUserKeyBySessionId(sessionId: string): string | null {
    if (!sessionId) {
      return null;
    }

    const userKey = this.sessionToUserKey.get(sessionId);
    if (!userKey) {
      Logger.debug(`未找到会话：${sessionId}`);
      return null;
    }

    Logger.debug(`获取用户密钥：sessionId=${sessionId}, userKey=${userKey}`);
    return userKey;
  }

  /**
   * 删除会话
   * @param sessionId 会话ID
   * @returns 是否删除成功
   */
  public removeSession(sessionId: string): boolean {
    if (!sessionId) {
      return false;
    }

    const userKey = this.sessionToUserKey.get(sessionId);
    if (!userKey) {
      Logger.debug(`会话不存在：${sessionId}`);
      return false;
    }

    this.sessionToUserKey.delete(sessionId);

    Logger.info(`删除用户会话：sessionId=${sessionId}, userKey=${userKey}`);
    return true;
  }

  /**
   * 检查会话是否存在
   * @param sessionId 会话ID
   * @returns 会话是否存在
   */
  public hasSession(sessionId: string): boolean {
    return this.sessionToUserKey.has(sessionId);
  }

  /**
   * 获取所有会话统计信息
   * @returns 会话统计信息
   */
  public getStats(): {
    totalSessions: number;
  } {
    return {
      totalSessions: this.sessionToUserKey.size
    };
  }

  /**
   * 清空所有会话
   */
  public clearAllSessions(): void {
    const count = this.sessionToUserKey.size;
    this.sessionToUserKey.clear();
    Logger.info(`清空所有会话，删除了 ${count} 个会话`);
  }
}
