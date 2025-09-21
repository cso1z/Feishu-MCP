import { Config } from './config.js';
import { Logger } from './logger.js';

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
 */
export class CacheManager {
  private static instance: CacheManager;
  private cache: Map<string, CacheItem<any>>;
  private readonly config: Config;

  /**
   * 私有构造函数，用于单例模式
   */
  private constructor() {
    this.cache = new Map();
    this.config = Config.getInstance();

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

} 