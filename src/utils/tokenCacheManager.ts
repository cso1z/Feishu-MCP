import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Logger } from './logger.js';

/**
 * 用户Token信息接口
 */
export interface UserTokenInfo {
  token_type: string;
  access_token: string;
  refresh_token: string;
  scope: string;
  code: number;
  expires_at: number;
  refresh_token_expires_at: number;
  generated_token: string;
}

/**
 * 租户Token信息接口
 */
export interface TenantTokenInfo {
  app_access_token: string;
  expires_at: number;
}

/**
 * 缓存项接口
 */
interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

/**
 * Token状态接口
 */
export interface TokenStatus {
  isValid: boolean;
  isExpired: boolean;
  canRefresh: boolean;
  shouldRefresh: boolean; // 是否应该提前刷新
}

/**
 * Token缓存管理器
 * 专门处理用户token和租户token的缓存管理
 */
export class TokenCacheManager {
  private static instance: TokenCacheManager;
  private cache: Map<string, CacheItem<any>>;
  private userTokenCacheFile: string;
  private tenantTokenCacheFile: string;

  /**
   * 私有构造函数，用于单例模式
   */
  private constructor() {
    this.cache = new Map();
    this.userTokenCacheFile = path.resolve(process.cwd(), 'user_token_cache.json');
    this.tenantTokenCacheFile = path.resolve(process.cwd(), 'tenant_token_cache.json');
    
    this.loadTokenCaches();
    this.startCacheCleanupTimer();
  }

  /**
   * 获取TokenCacheManager实例
   */
  public static getInstance(): TokenCacheManager {
    if (!TokenCacheManager.instance) {
      TokenCacheManager.instance = new TokenCacheManager();
    }
    return TokenCacheManager.instance;
  }

  /**
   * 系统启动时从本地文件缓存中读取token记录
   */
  private loadTokenCaches(): void {
    this.loadUserTokenCache();
    this.loadTenantTokenCache();
  }

  /**
   * 加载用户token缓存
   */
  private loadUserTokenCache(): void {
    if (fs.existsSync(this.userTokenCacheFile)) {
      try {
        const raw = fs.readFileSync(this.userTokenCacheFile, 'utf-8');
        Logger.info(`loadUserTokenCache:${raw}`)
        const cacheData = JSON.parse(raw);
        
        let loadedCount = 0;
        for (const key in cacheData) {
          if (key.startsWith('user_access_token:')) {
            this.cache.set(key, cacheData[key]);
            loadedCount++;
          }
        }
        
        Logger.info(`已加载用户token缓存，共 ${loadedCount} 条记录`);
      } catch (error) {
        Logger.warn('加载用户token缓存失败:', error);
      }
    } else {
      Logger.info('用户token缓存文件不存在，将创建新的缓存');
    }
  }

  /**
   * 加载租户token缓存
   */
  private loadTenantTokenCache(): void {
    if (fs.existsSync(this.tenantTokenCacheFile)) {
      try {
        const raw = fs.readFileSync(this.tenantTokenCacheFile, 'utf-8');
        const cacheData = JSON.parse(raw);
        
        let loadedCount = 0;
        for (const key in cacheData) {
          if (key.startsWith('tenant_access_token:')) {
            this.cache.set(key, cacheData[key]);
            loadedCount++;
          }
        }
        
        Logger.info(`已加载租户token缓存，共 ${loadedCount} 条记录`);
      } catch (error) {
        Logger.warn('加载租户token缓存失败:', error);
      }
    }
  }

  /**
   * 根据key获取完整的用户token信息
   * @param key 缓存键
   * @returns 完整的用户token信息对象，如果未找到或refresh_token过期则返回null
   */
  public getUserTokenInfo(key: string): UserTokenInfo | null {
    const cacheKey = `user_access_token:${key}`;
    const cacheItem = this.cache.get(cacheKey);
    
    if (!cacheItem) {
      Logger.debug(`用户token信息未找到: ${key}`);
      return null;
    }

    const tokenInfo = cacheItem.data as UserTokenInfo;
    const now = Math.floor(Date.now() / 1000);
    
    // 检查refresh_token是否过期（如果有的话）
    if (tokenInfo.refresh_token && tokenInfo.refresh_token_expires_at) {
      if (tokenInfo.refresh_token_expires_at < now) {
        Logger.debug(`用户token的refresh_token已过期，从缓存中删除: ${key}`);
        this.cache.delete(cacheKey);
        this.saveUserTokenCache();
        return null;
      }
    } else {
      // 如果没有refresh_token信息，检查缓存本身是否过期
      if (Date.now() > cacheItem.expiresAt) {
        Logger.debug(`用户token缓存已过期: ${key}`);
        this.cache.delete(cacheKey);
        this.saveUserTokenCache();
        return null;
      }
    }

    Logger.debug(`获取用户token信息成功: ${key}`);
    return tokenInfo;
  }

  /**
   * 根据key获取用户的access_token值
   * @param key 缓存键
   * @returns access_token字符串，如果未找到或已过期则返回null
   */
  public getUserToken(key: string): string | null {
    const tokenInfo = this.getUserTokenInfo(key);
    return tokenInfo ? tokenInfo.access_token : null;
  }

  /**
   * 根据key获取租户token信息
   * @param key 缓存键
   * @returns 租户token信息，如果未找到或已过期则返回null
   */
  public getTenantTokenInfo(key: string): TenantTokenInfo | null {
    const cacheKey = `tenant_access_token:${key}`;
    const cacheItem = this.cache.get(cacheKey);
    
    if (!cacheItem) {
      Logger.debug(`租户token信息未找到: ${key}`);
      return null;
    }

    // 检查是否过期
    if (Date.now() > cacheItem.expiresAt) {
      Logger.debug(`租户token信息已过期: ${key}`);
      this.cache.delete(cacheKey);
      this.saveTenantTokenCache();
      return null;
    }

    Logger.debug(`获取租户token信息成功: ${key}`);
    return cacheItem.data as TenantTokenInfo;
  }

  /**
   * 根据key获取租户的access_token值
   * @param key 缓存键
   * @returns app_access_token字符串，如果未找到或已过期则返回null
   */
  public getTenantToken(key: string): string | null {
    const tokenInfo = this.getTenantTokenInfo(key);
    return tokenInfo ? tokenInfo.app_access_token : null;
  }

  /**
   * 缓存用户token信息
   * @param key 缓存键
   * @param tokenInfo 用户token信息
   * @param customTtl 自定义TTL（秒），如果不提供则使用refresh_token的过期时间
   * @returns 是否成功缓存
   */
  public cacheUserToken(key: string, tokenInfo: UserTokenInfo, customTtl?: number): boolean {
    try {
      const now = Date.now();
      const cacheKey = `user_access_token:${key}`;
      
      // 计算过期时间 - 优先使用refresh_token的过期时间，确保可以刷新
      let expiresAt: number;
      if (customTtl) {
        expiresAt = now + (customTtl * 1000);
      } else if (tokenInfo.refresh_token_expires_at) {
        // 使用refresh_token的过期时间，确保在refresh_token有效期内缓存不会被清除
        expiresAt = tokenInfo.refresh_token_expires_at * 1000; // 转换为毫秒
        Logger.debug(`使用refresh_token过期时间作为缓存过期时间: ${new Date(expiresAt).toISOString()}`);
      } else if (tokenInfo.expires_at) {
        // 如果没有refresh_token_expires_at信息，降级使用access_token的过期时间
        expiresAt = tokenInfo.expires_at * 1000;
        Logger.warn(`没有refresh_token过期时间戳，使用access_token过期时间: ${new Date(expiresAt).toISOString()}`);
      } else {
        // 最后的降级方案：如果没有任何过期时间信息，设置默认的2小时过期
        expiresAt = now + (2 * 60 * 60 * 1000); // 2小时
        Logger.warn(`没有过期时间信息，使用默认2小时作为缓存过期时间`);
      }

      const cacheItem: CacheItem<UserTokenInfo> = {
        data: tokenInfo,
        timestamp: now,
        expiresAt: expiresAt
      };

      this.cache.set(cacheKey, cacheItem);
      this.saveUserTokenCache();
      
      Logger.debug(`用户token缓存成功: ${key}, 缓存过期时间: ${new Date(expiresAt).toISOString()}`);
      return true;
    } catch (error) {
      Logger.error(`缓存用户token失败: ${key}`, error);
      return false;
    }
  }

  /**
   * 缓存租户token信息
   * @param key 缓存键
   * @param tokenInfo 租户token信息
   * @param customTtl 自定义TTL（秒），如果不提供则使用token本身的过期时间
   * @returns 是否成功缓存
   */
  public cacheTenantToken(key: string, tokenInfo: TenantTokenInfo, customTtl?: number): boolean {
    try {
      const now = Date.now();
      const cacheKey = `tenant_access_token:${key}`;
      
      // 计算过期时间
      let expiresAt: number;
      if (customTtl) {
        expiresAt = now + (customTtl * 1000);
      } else if (tokenInfo.expires_at) {
        expiresAt = tokenInfo.expires_at * 1000; // 转换为毫秒
      } else {
        // 如果没有过期时间信息，设置默认的2小时过期
        expiresAt = now + (2 * 60 * 60 * 1000);
        Logger.warn(`租户token没有过期时间信息，使用默认2小时`);
      }

      const cacheItem: CacheItem<TenantTokenInfo> = {
        data: tokenInfo,
        timestamp: now,
        expiresAt: expiresAt
      };

      this.cache.set(cacheKey, cacheItem);
      this.saveTenantTokenCache();
      
      Logger.debug(`租户token缓存成功: ${key}, 过期时间: ${new Date(expiresAt).toISOString()}`);
      return true;
    } catch (error) {
      Logger.error(`缓存租户token失败: ${key}`, error);
      return false;
    }
  }

  /**
   * 检查用户token状态
   * @param key 缓存键
   * @returns token状态信息
   */
  public checkUserTokenStatus(key: string): TokenStatus {
    const tokenInfo = this.getUserTokenInfo(key);
    
    if (!tokenInfo) {
      return {
        isValid: false,
        isExpired: true,
        canRefresh: false,
        shouldRefresh: false
      };
    }

    const now = Math.floor(Date.now() / 1000);
    const isExpired = tokenInfo.expires_at ? tokenInfo.expires_at < now : false;
    const timeToExpiry = tokenInfo.expires_at ? Math.max(0, tokenInfo.expires_at - now) : 0;
    
    // 判断是否可以刷新
    const canRefresh = !!(
      tokenInfo.refresh_token && 
      tokenInfo.refresh_token_expires_at && 
      tokenInfo.refresh_token_expires_at > now
    );
    
    // 判断是否应该提前刷新（提前5分钟）
    const shouldRefresh = timeToExpiry > 0 && timeToExpiry < 300 && canRefresh;

    return {
      isValid: !isExpired,
      isExpired,
      canRefresh,
      shouldRefresh
    };
  }

  /**
   * 检查租户token状态
   * @param key 缓存键
   * @returns token状态信息
   */
  public checkTenantTokenStatus(key: string): TokenStatus {
    const tokenInfo = this.getTenantTokenInfo(key);
    
    if (!tokenInfo) {
      return {
        isValid: false,
        isExpired: true,
        canRefresh: false,
        shouldRefresh: false
      };
    }

    const now = Math.floor(Date.now() / 1000);
    const isExpired = tokenInfo.expires_at ? tokenInfo.expires_at < now : false;
    const timeToExpiry = tokenInfo.expires_at ? Math.max(0, tokenInfo.expires_at - now) : 0;
    
    // 租户token通常不支持刷新，需要重新获取
    const shouldRefresh = timeToExpiry > 0 && timeToExpiry < 300;

    return {
      isValid: !isExpired,
      isExpired,
      canRefresh: false,
      shouldRefresh
    };
  }

  /**
   * 删除用户token
   * @param key 缓存键
   * @returns 是否成功删除
   */
  public removeUserToken(key: string): boolean {
    const cacheKey = `user_access_token:${key}`;
    const result = this.cache.delete(cacheKey);
    
    if (result) {
      this.saveUserTokenCache();
      Logger.debug(`用户token删除成功: ${key}`);
    }
    
    return result;
  }

  /**
   * 删除租户token
   * @param key 缓存键
   * @returns 是否成功删除
   */
  public removeTenantToken(key: string): boolean {
    const cacheKey = `tenant_access_token:${key}`;
    const result = this.cache.delete(cacheKey);
    
    if (result) {
      this.saveTenantTokenCache();
      Logger.debug(`租户token删除成功: ${key}`);
    }
    
    return result;
  }

  /**
   * 清空所有用户token
   * @returns 清除的数量
   */
  public clearUserTokens(): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith('user_access_token:')) {
        this.cache.delete(key);
        count++;
      }
    }
    
    if (count > 0) {
      this.saveUserTokenCache();
      Logger.info(`清空用户token缓存，删除了 ${count} 条记录`);
    }
    
    return count;
  }

  /**
   * 清空所有租户token
   * @returns 清除的数量
   */
  public clearTenantTokens(): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith('tenant_access_token:')) {
        this.cache.delete(key);
        count++;
      }
    }
    
    if (count > 0) {
      this.saveTenantTokenCache();
      Logger.info(`清空租户token缓存，删除了 ${count} 条记录`);
    }
    
    return count;
  }

  /**
   * 获取所有有效的用户token键列表
   * @returns 有效的用户token键数组
   */
  public getValidUserTokenKeys(): string[] {
    const validKeys: string[] = [];
    const now = Date.now();
    
    for (const [cacheKey, cacheItem] of this.cache.entries()) {
      if (cacheKey.startsWith('user_access_token:') && cacheItem.expiresAt > now) {
        const key = cacheKey.replace('user_access_token:', '');
        validKeys.push(key);
      }
    }
    
    return validKeys;
  }

  /**
   * 获取所有有效的租户token键列表
   * @returns 有效的租户token键数组
   */
  public getValidTenantTokenKeys(): string[] {
    const validKeys: string[] = [];
    const now = Date.now();
    
    for (const [cacheKey, cacheItem] of this.cache.entries()) {
      if (cacheKey.startsWith('tenant_access_token:') && cacheItem.expiresAt > now) {
        const key = cacheKey.replace('tenant_access_token:', '');
        validKeys.push(key);
      }
    }
    
    return validKeys;
  }

  /**
   * 生成客户端缓存键
   * @param clientId 客户端ID
   * @param clientSecret 客户端密钥
   * @param userKey 用户标识（可选）
   * @returns 生成的缓存键
   */
  public static generateClientKey(clientId: string, clientSecret: string, userKey?: string | null): string {
    const userPart = userKey ? `:${userKey}` : '';
    const source = `${clientId}:${clientSecret}${userPart}`;
    return source;
    // return crypto.createHash('sha256').update(source).digest('hex');
  }

  /**
   * 生成随机键
   * @param length 键长度，默认32
   * @returns 随机字符串
   */
  public static generateRandomKey(length: number = 32): string {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
  }

  /**
   * 保存用户token缓存到文件
   */
  private saveUserTokenCache(): void {
    const cacheData: Record<string, any> = {};
    
    for (const [key, value] of this.cache.entries()) {
      if (key.startsWith('user_access_token:')) {
        cacheData[key] = value;
      }
    }
    
    try {
      fs.writeFileSync(this.userTokenCacheFile, JSON.stringify(cacheData, null, 2), 'utf-8');
      Logger.debug('用户token缓存已保存到文件');
    } catch (error) {
      Logger.warn('保存用户token缓存失败:', error);
    }
  }

  /**
   * 保存租户token缓存到文件
   */
  private saveTenantTokenCache(): void {
    const cacheData: Record<string, any> = {};
    
    for (const [key, value] of this.cache.entries()) {
      if (key.startsWith('tenant_access_token:')) {
        cacheData[key] = value;
      }
    }
    
    try {
      fs.writeFileSync(this.tenantTokenCacheFile, JSON.stringify(cacheData, null, 2), 'utf-8');
      Logger.debug('租户token缓存已保存到文件');
    } catch (error) {
      Logger.warn('保存租户token缓存失败:', error);
    }
  }

  /**
   * 清理过期缓存
   * 对于用户token，只有在refresh_token过期时才清理
   * 对于租户token，按缓存过期时间清理
   * @returns 清理的数量
   */
  public cleanExpiredTokens(): number {
    const now = Date.now();
    const nowSeconds = Math.floor(now / 1000);
    let cleanedCount = 0;
    const keysToDelete: string[] = [];
    
    for (const [key, cacheItem] of this.cache.entries()) {
      let shouldDelete = false;
      
      if (key.startsWith('user_access_token:')) {
        // 用户token：检查refresh_token是否过期
        const tokenInfo = cacheItem.data as UserTokenInfo;
        if (tokenInfo.refresh_token && tokenInfo.refresh_token_expires_at) {
          // 有refresh_token，只有refresh_token过期才删除
          shouldDelete = tokenInfo.refresh_token_expires_at < nowSeconds;
          if (shouldDelete) {
            Logger.debug(`清理用户token - refresh_token已过期: ${key}`);
          }
        } else {
          // 没有refresh_token，按缓存过期时间删除
          shouldDelete = cacheItem.expiresAt <= now;
          if (shouldDelete) {
            Logger.debug(`清理用户token - 无refresh_token且缓存过期: ${key}`);
          }
        }
      } else {
        // 租户token或其他类型：按缓存过期时间删除
        shouldDelete = cacheItem.expiresAt <= now;
        if (shouldDelete) {
          Logger.debug(`清理过期缓存: ${key}`);
        }
      }
      
      if (shouldDelete) {
        keysToDelete.push(key);
      }
    }
    
    // 批量删除
    keysToDelete.forEach(key => {
      this.cache.delete(key);
      cleanedCount++;
    });
    
    if (cleanedCount > 0) {
      // 分别保存用户和租户缓存
      this.saveUserTokenCache();
      this.saveTenantTokenCache();
      Logger.info(`清理过期token，删除了 ${cleanedCount} 条记录`);
    }
    
    return cleanedCount;
  }

  /**
   * 启动缓存清理定时器
   */
  private startCacheCleanupTimer(): void {
    // 每5分钟清理一次过期缓存
    setInterval(() => {
      this.cleanExpiredTokens();
    }, 5 * 60 * 1000);
    
    Logger.info('Token缓存清理定时器已启动，每5分钟执行一次');
  }

  /**
   * 获取缓存统计信息
   * @returns 缓存统计信息
   */
  public getStats(): {
    userTokenCount: number;
    tenantTokenCount: number;
    totalCacheSize: number;
    validUserTokens: number;
    validTenantTokens: number;
  } {
    const now = Date.now();
    let userTokenCount = 0;
    let tenantTokenCount = 0;
    let validUserTokens = 0;
    let validTenantTokens = 0;
    
    for (const [key, cacheItem] of this.cache.entries()) {
      if (key.startsWith('user_access_token:')) {
        userTokenCount++;
        if (cacheItem.expiresAt > now) {
          validUserTokens++;
        }
      } else if (key.startsWith('tenant_access_token:')) {
        tenantTokenCount++;
        if (cacheItem.expiresAt > now) {
          validTenantTokens++;
        }
      }
    }
    
    return {
      userTokenCount,
      tenantTokenCount,
      totalCacheSize: this.cache.size,
      validUserTokens,
      validTenantTokens
    };
  }
}
