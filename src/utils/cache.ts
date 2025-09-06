import { Config } from './config.js';
import { Logger } from './logger.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 缓存项接口
 */
interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

/**
 * 缓存管理器类
 * 提供内存缓存功能，支持TTL和最大容量限制
 * 只用于缓存用户token和wiki转docid结果
 */
export class CacheManager {
  private static instance: CacheManager;
  private cache: Map<string, CacheItem<any>>;
  private readonly config: Config;
  private userTokenCacheFile = path.resolve(process.cwd(), 'user_token_cache.json');

  /**
   * 私有构造函数，用于单例模式
   */
  private constructor() {
    this.cache = new Map();
    this.config = Config.getInstance();
    this.loadUserTokenCache();

    // 定期清理过期缓存
    setInterval(() => {
      this.cleanExpiredCache();
    }, 60000); // 每分钟清理一次过期缓存
  }
  
  /**
   * 获取缓存管理器实例
   * @returns 缓存管理器实例
   */
  public static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }
  
  /**
   * 设置缓存
   * @param key 缓存键
   * @param data 缓存数据
   * @param ttl 缓存生存时间（秒），默认使用配置中的TTL
   * @returns 是否成功设置缓存
   */
  public set<T>(key: string, data: T, ttl?: number): boolean {
    if (!this.config.cache.enabled) {
      return false;
    }
    
    // 如果缓存已达到最大容量，清理最早的条目
    if (this.cache.size >= this.config.cache.maxSize) {
      this.cleanOldestCache();
    }
    
    const now = Date.now();
    const actualTtl = ttl || this.config.cache.ttl;
    
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + (actualTtl * 1000)
    });
    
    Logger.debug(`缓存设置: ${key} (TTL: ${actualTtl}秒)`);
    if (key.startsWith('user_access_token:')) {
      this.saveUserTokenCache();
    }
    return true;
  }
  
  /**
   * 获取缓存
   * @param key 缓存键
   * @returns 缓存数据，如果未找到或已过期则返回null
   */
  public get<T>(key: string): T | null {
    if (!this.config.cache.enabled) {
      return null;
    }
    
    const cacheItem = this.cache.get(key);
    if (!cacheItem) {
      Logger.debug(`缓存未命中: ${key}`);
      return null;
    }
    
    // 检查是否过期
    if (Date.now() > cacheItem.expiresAt) {
      Logger.debug(`缓存已过期: ${key}`);
      this.cache.delete(key);
      return null;
    }
    
    Logger.debug(`缓存命中: ${key}`);
    return cacheItem.data as T;
  }
  
  /**
   * 删除缓存
   * @param key 缓存键
   * @returns 是否成功删除
   */
  public delete(key: string): boolean {
    if (!this.config.cache.enabled) {
      return false;
    }
    
    const result = this.cache.delete(key);
    if (result) {
      Logger.debug(`缓存删除: ${key}`);
      if (key.startsWith('user_access_token:')) {
        this.saveUserTokenCache();
      }
    }
    return result;
  }
  
  /**
   * 清空所有缓存
   */
  public clear(): void {
    if (!this.config.cache.enabled) {
      return;
    }
    
    const size = this.cache.size;
    this.cache.clear();
    Logger.debug(`清空全部缓存，删除了 ${size} 条记录`);
  }
  
  /**
   * 根据前缀清除缓存
   * @param prefix 缓存键前缀
   * @returns 清除的缓存数量
   */
  public clearByPrefix(prefix: string): number {
    if (!this.config.cache.enabled) {
      return 0;
    }
    
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    
    if (count > 0) {
      Logger.debug(`按前缀清除缓存: ${prefix}, 删除了 ${count} 条记录`);
    }
    return count;
  }
  
  /**
   * 清理过期缓存
   * @returns 清理的缓存数量
   */
  private cleanExpiredCache(): number {
    if (!this.config.cache.enabled) {
      return 0;
    }
    
    const now = Date.now();
    let count = 0;
    
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
        count++;
      }
    }
    
    if (count > 0) {
      Logger.debug(`清理过期缓存，删除了 ${count} 条记录`);
    }
    return count;
  }
  
  /**
   * 清理最旧的缓存
   * @param count 要清理的条目数，默认为1
   */
  private cleanOldestCache(count: number = 1): void {
    if (!this.config.cache.enabled || this.cache.size === 0) {
      return;
    }
    
    // 按时间戳排序
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    // 删除最早的几条记录
    const toDelete = Math.min(count, entries.length);
    for (let i = 0; i < toDelete; i++) {
      this.cache.delete(entries[i][0]);
    }
    
    Logger.debug(`清理最旧缓存，删除了 ${toDelete} 条记录`);
  }
  
  /**
   * 获取缓存统计信息
   * @returns 缓存统计信息对象
   */
  public getStats(): { size: number; enabled: boolean; maxSize: number; ttl: number } {
    return {
      size: this.cache.size,
      enabled: this.config.cache.enabled,
      maxSize: this.config.cache.maxSize,
      ttl: this.config.cache.ttl
    };
  }


  /**
   * 缓存Wiki到文档ID的转换结果
   * @param wikiToken Wiki Token
   * @param documentId 文档ID
   * @returns 是否成功设置缓存
   */
  public cacheWikiToDocId(wikiToken: string, documentId: string): boolean {
    return this.set(`wiki:${wikiToken}`, documentId);
  }

  /**
   * 获取缓存的Wiki转换结果
   * @param wikiToken Wiki Token
   * @returns 文档ID，如果未找到或已过期则返回null
   */
  public getWikiToDocId(wikiToken: string): string | null {
    return this.get<string>(`wiki:${wikiToken}`);
  }


  /**
   * 缓存tenant访问令牌
   * @param token 访问令牌
   * @param expiresInSeconds 过期时间（秒）
   * @param key 缓存键，默认为'access_token'
   * @returns 是否成功设置缓存
   */
  public cacheTenantToken(key: string , token: any, expiresInSeconds: number): boolean {
    return this.set(`tenant_access_token:${key}`, token, expiresInSeconds);
  }

  /**
   * 获取tenant缓存的访问令牌
   * @param key 缓存键，默认为'access_token'
   * @returns 访问令牌，如果未找到或已过期则返回null
   */
  public getTenantToken(key: string): string | null {
    return this.get(`tenant_access_token:${key}`);
  }


  public cacheUserToken(key: string, tokenObj: any, expiresIn: number): boolean {
    return this.set(`user_access_token:${key}`, tokenObj, expiresIn);
  }

  public getUserToken(key: string): any {
    return this.get<any>(`user_access_token:${key}`);
  }

  /**
   * 缓存访问令牌
   * @param token 访问令牌
   * @param expiresInSeconds 过期时间（秒）
   * @returns 是否成功设置缓存
   */
  public cacheToken( token: string, expiresInSeconds: number): boolean {
    return this.set(`access_token`, token, expiresInSeconds);
  }

  /**
   * 获取缓存的访问令牌
   * @returns 访问令牌，如果未找到或已过期则返回null
   */
  public getToken(): string | null {
    return this.get(`access_token`);
  }

  /**
   * 生成client_id+client_secret签名
   * @param client_id
   * @param client_secret
   * @returns 唯一key
   */
  public static async getClientKey(client_id: string, client_secret: string): Promise<string> {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(client_id + ':' + client_secret).digest('hex');
  }

  private loadUserTokenCache() {
    if (fs.existsSync(this.userTokenCacheFile)) {
      try {
        const raw = fs.readFileSync(this.userTokenCacheFile, 'utf-8');
        const obj = JSON.parse(raw);
        for (const k in obj) {
          if (k.startsWith('user_access_token:')) {
            this.cache.set(k, obj[k]);
          }
        }
        Logger.info(`已加载本地 user_token_cache.json，共${Object.keys(obj).length}条`);
      } catch (e) {
        Logger.warn('加载 user_token_cache.json 失败', e);
      }
    }
  }

  private saveUserTokenCache() {
    const obj: Record<string, any> = {};
    for (const [k, v] of this.cache.entries()) {
      if (k.startsWith('user_access_token:')) {
        obj[k] = v;
      }
    }
    try {
      fs.writeFileSync(this.userTokenCacheFile, JSON.stringify(obj, null, 2), 'utf-8');
      Logger.debug('user_token_cache.json 已写入');
    } catch (e) {
      Logger.warn('写入 user_token_cache.json 失败', e);
    }
  }

} 