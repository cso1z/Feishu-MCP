import { config as loadDotEnv } from 'dotenv';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';
import { Logger, LogLevel } from './logger.js';

/**
 * 配置来源枚举
 */
export enum ConfigSource {
  DEFAULT = 'default',
  ENV = 'env',
  CLI = 'cli',
  FILE = 'file'
}

/**
 * 服务器配置接口
 */
export interface ServerConfig {
  port: number;
}

/**
 * 飞书配置接口
 */
export interface FeishuConfig {
  appId: string;
  appSecret: string;
  baseUrl: string;
  authType: 'tenant' | 'user';
  tokenEndpoint: string;
  callbackUrl?: string; // 用于stdio模式下的回调URL
}

/**
 * 日志配置接口
 */
export interface LogConfig {
  level: LogLevel;
  showTimestamp: boolean;
  showLevel: boolean;
  timestampFormat: string;
}

/**
 * 缓存配置接口
 */
export interface CacheConfig {
  enabled: boolean;
  ttl: number; // 单位：秒
  maxSize: number; // 最大缓存条目数
}

/**
 * 应用配置管理类
 * 统一管理所有配置，支持环境变量、命令行参数和默认值
 */
export class Config {
  private static instance: Config;
  
  public readonly server: ServerConfig;
  public readonly feishu: FeishuConfig;
  public readonly log: LogConfig;
  public readonly cache: CacheConfig;
  
  public readonly configSources: {
    [key: string]: ConfigSource;
  };

  /**
   * 私有构造函数，用于单例模式
   */
  private constructor() {
    // 确保在任何配置读取前加载.env文件
    loadDotEnv();
    
    // 解析命令行参数
    const argv = this.parseCommandLineArgs();
    
    // 初始化配置来源记录
    this.configSources = {};
    
    // 配置服务器
    this.server = this.initServerConfig(argv);
    
    // 配置飞书
    this.feishu = this.initFeishuConfig(argv);
    
    // 配置日志
    this.log = this.initLogConfig(argv);
    
    // 配置缓存
    this.cache = this.initCacheConfig(argv);
  }
  
  /**
   * 获取配置单例
   * @returns 配置实例
   */
  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }
  
  /**
   * 解析命令行参数
   * @returns 解析后的参数对象
   */
  private parseCommandLineArgs(): any {
    return yargs(hideBin(process.argv))
      .options({
        port: {
          type: 'number',
          description: '服务器监听端口'
        },
        'log-level': {
          type: 'string',
          description: '日志级别 (debug, info, log, warn, error, none)'
        },
        'feishu-app-id': {
          type: 'string',
          description: '飞书应用ID'
        },
        'feishu-app-secret': {
          type: 'string',
          description: '飞书应用密钥'
        },
        'feishu-base-url': {
          type: 'string',
          description: '飞书API基础URL'
        },
        'cache-enabled': {
          type: 'boolean',
          description: '是否启用缓存'
        },
        'cache-ttl': {
          type: 'number',
          description: '缓存生存时间（秒）'
        },
        'feishu-auth-type': {
          type: 'string',
          description: '飞书认证类型 (tenant 或 user)'
        },
        'feishu-token-endpoint': {
          type: 'string',
          description: '获取token的接口地址，默认 http://localhost:3333/getToken'
        },
        'feishu-callback-url': {
          type: 'string',
          description: '飞书OAuth回调URL，用于stdio模式下的用户授权'
        }
      })
      .help()
      .parseSync();
  }
  
  /**
   * 初始化服务器配置
   * @param argv 命令行参数
   * @returns 服务器配置
   */
  private initServerConfig(argv: any): ServerConfig {
    const serverConfig: ServerConfig = {
      port: 3333,
    };
    
    // 处理PORT
    if (argv.port) {
      serverConfig.port = argv.port;
      this.configSources['server.port'] = ConfigSource.CLI;
    } else if (process.env.PORT) {
      serverConfig.port = parseInt(process.env.PORT, 10);
      this.configSources['server.port'] = ConfigSource.ENV;
    } else {
      this.configSources['server.port'] = ConfigSource.DEFAULT;
    }
    return serverConfig;
  }
  
  /**
   * 初始化飞书配置
   * @param argv 命令行参数
   * @returns 飞书配置
   */
  private initFeishuConfig(argv: any): FeishuConfig {
    // 先初始化serverConfig以获取端口
    const serverConfig = this.server || this.initServerConfig(argv);
    const feishuConfig: FeishuConfig = {
      appId: '',
      appSecret: '',
      baseUrl: 'https://open.feishu.cn/open-apis',
      authType: 'tenant', // 默认
      tokenEndpoint: `http://127.0.0.1:${serverConfig.port}/getToken`, // 默认动态端口
    };
    
    // 处理App ID
    if (argv['feishu-app-id']) {
      feishuConfig.appId = argv['feishu-app-id'];
      this.configSources['feishu.appId'] = ConfigSource.CLI;
    } else if (process.env.FEISHU_APP_ID) {
      feishuConfig.appId = process.env.FEISHU_APP_ID;
      this.configSources['feishu.appId'] = ConfigSource.ENV;
    }
    
    // 处理App Secret
    if (argv['feishu-app-secret']) {
      feishuConfig.appSecret = argv['feishu-app-secret'];
      this.configSources['feishu.appSecret'] = ConfigSource.CLI;
    } else if (process.env.FEISHU_APP_SECRET) {
      feishuConfig.appSecret = process.env.FEISHU_APP_SECRET;
      this.configSources['feishu.appSecret'] = ConfigSource.ENV;
    }
    
    // 处理Base URL
    if (argv['feishu-base-url']) {
      feishuConfig.baseUrl = argv['feishu-base-url'];
      this.configSources['feishu.baseUrl'] = ConfigSource.CLI;
    } else if (process.env.FEISHU_BASE_URL) {
      feishuConfig.baseUrl = process.env.FEISHU_BASE_URL;
      this.configSources['feishu.baseUrl'] = ConfigSource.ENV;
    } else {
      this.configSources['feishu.baseUrl'] = ConfigSource.DEFAULT;
    }

    // 处理authType
    if (argv['feishu-auth-type']) {
      feishuConfig.authType = argv['feishu-auth-type'] === 'user' ? 'user' : 'tenant';
      this.configSources['feishu.authType'] = ConfigSource.CLI;
    } else if (process.env.FEISHU_AUTH_TYPE) {
      feishuConfig.authType = process.env.FEISHU_AUTH_TYPE === 'user' ? 'user' : 'tenant';
      this.configSources['feishu.authType'] = ConfigSource.ENV;
    } else {
      this.configSources['feishu.authType'] = ConfigSource.DEFAULT;
    }
    
    // 处理tokenEndpoint
    if (argv['feishu-token-endpoint']) {
      feishuConfig.tokenEndpoint = argv['feishu-token-endpoint'];
      this.configSources['feishu.tokenEndpoint'] = ConfigSource.CLI;
    } else if (process.env.FEISHU_TOKEN_ENDPOINT) {
      feishuConfig.tokenEndpoint = process.env.FEISHU_TOKEN_ENDPOINT;
      this.configSources['feishu.tokenEndpoint'] = ConfigSource.ENV;
    } else {
      this.configSources['feishu.tokenEndpoint'] = ConfigSource.DEFAULT;
    }
    
    // 处理callbackUrl
    if (argv['feishu-callback-url']) {
      feishuConfig.callbackUrl = argv['feishu-callback-url'];
      this.configSources['feishu.callbackUrl'] = ConfigSource.CLI;
    } else if (process.env.FEISHU_CALLBACK_URL) {
      feishuConfig.callbackUrl = process.env.FEISHU_CALLBACK_URL;
      this.configSources['feishu.callbackUrl'] = ConfigSource.ENV;
    }
    
    return feishuConfig;
  }
  
  /**
   * 初始化日志配置
   * @param argv 命令行参数
   * @returns 日志配置
   */
  private initLogConfig(argv: any): LogConfig {
    const logConfig: LogConfig = {
      level: LogLevel.INFO,
      showTimestamp: true,
      showLevel: true,
      timestampFormat: 'yyyy-MM-dd HH:mm:ss.SSS'
    };
    
    // 处理日志级别
    if (argv['log-level']) {
      logConfig.level = this.getLogLevelFromString(argv['log-level']);
      this.configSources['log.level'] = ConfigSource.CLI;
    } else if (process.env.LOG_LEVEL) {
      logConfig.level = this.getLogLevelFromString(process.env.LOG_LEVEL);
      this.configSources['log.level'] = ConfigSource.ENV;
    } else {
      this.configSources['log.level'] = ConfigSource.DEFAULT;
    }
    
    // 处理时间戳显示
    if (process.env.LOG_SHOW_TIMESTAMP) {
      logConfig.showTimestamp = process.env.LOG_SHOW_TIMESTAMP.toLowerCase() === 'true';
      this.configSources['log.showTimestamp'] = ConfigSource.ENV;
    } else {
      this.configSources['log.showTimestamp'] = ConfigSource.DEFAULT;
    }
    
    // 处理级别显示
    if (process.env.LOG_SHOW_LEVEL) {
      logConfig.showLevel = process.env.LOG_SHOW_LEVEL.toLowerCase() === 'true';
      this.configSources['log.showLevel'] = ConfigSource.ENV;
    } else {
      this.configSources['log.showLevel'] = ConfigSource.DEFAULT;
    }
    
    // 处理时间戳格式
    if (process.env.LOG_TIMESTAMP_FORMAT) {
      logConfig.timestampFormat = process.env.LOG_TIMESTAMP_FORMAT;
      this.configSources['log.timestampFormat'] = ConfigSource.ENV;
    } else {
      this.configSources['log.timestampFormat'] = ConfigSource.DEFAULT;
    }
    
    return logConfig;
  }
  
  /**
   * 初始化缓存配置
   * @param argv 命令行参数
   * @returns 缓存配置
   */
  private initCacheConfig(argv: any): CacheConfig {
    const cacheConfig: CacheConfig = {
      enabled: true,
      ttl: 300, // 5分钟，单位：秒
      maxSize: 100
    };
    
    // 处理缓存启用
    if (argv['cache-enabled'] !== undefined) {
      cacheConfig.enabled = argv['cache-enabled'];
      this.configSources['cache.enabled'] = ConfigSource.CLI;
    } else if (process.env.CACHE_ENABLED) {
      cacheConfig.enabled = process.env.CACHE_ENABLED.toLowerCase() === 'true';
      this.configSources['cache.enabled'] = ConfigSource.ENV;
    } else {
      this.configSources['cache.enabled'] = ConfigSource.DEFAULT;
    }
    
    // 处理TTL
    if (argv['cache-ttl']) {
      cacheConfig.ttl = argv['cache-ttl'];
      this.configSources['cache.ttl'] = ConfigSource.CLI;
    } else if (process.env.CACHE_TTL) {
      cacheConfig.ttl = parseInt(process.env.CACHE_TTL, 10);
      this.configSources['cache.ttl'] = ConfigSource.ENV;
    } else {
      this.configSources['cache.ttl'] = ConfigSource.DEFAULT;
    }
    
    // 处理最大缓存大小
    if (process.env.CACHE_MAX_SIZE) {
      cacheConfig.maxSize = parseInt(process.env.CACHE_MAX_SIZE, 10);
      this.configSources['cache.maxSize'] = ConfigSource.ENV;
    } else {
      this.configSources['cache.maxSize'] = ConfigSource.DEFAULT;
    }
    
    return cacheConfig;
  }
  
  /**
   * 从字符串获取日志级别
   * @param levelStr 日志级别字符串
   * @returns 日志级别枚举值
   */
  private getLogLevelFromString(levelStr: string): LogLevel {
    switch (levelStr.toLowerCase()) {
      case 'debug': return LogLevel.DEBUG;
      case 'info': return LogLevel.INFO;
      case 'log': return LogLevel.LOG;
      case 'warn': return LogLevel.WARN;
      case 'error': return LogLevel.ERROR;
      case 'none': return LogLevel.NONE;
      default: return LogLevel.INFO;
    }
  }
  
  /**
   * 打印当前配置信息
   * @param isStdioMode 是否在stdio模式下
   */
  public printConfig(isStdioMode: boolean = false): void {
    if (isStdioMode) return;
    
    Logger.info('当前配置:');
    
    Logger.info('服务器配置:');
    Logger.info(`- 端口: ${this.server.port} (来源: ${this.configSources['server.port']})`);

    Logger.info('飞书配置:');
    if (this.feishu.appId) {
      Logger.info(`- App ID: ${this.maskApiKey(this.feishu.appId)} (来源: ${this.configSources['feishu.appId']})`);
    }
    if (this.feishu.appSecret) {
      Logger.info(`- App Secret: ${this.maskApiKey(this.feishu.appSecret)} (来源: ${this.configSources['feishu.appSecret']})`);
    }
    Logger.info(`- API URL: ${this.feishu.baseUrl} (来源: ${this.configSources['feishu.baseUrl']})`);
    Logger.info(`- 认证类型: ${this.feishu.authType} (来源: ${this.configSources['feishu.authType']})`);
    if (this.feishu.callbackUrl) {
      Logger.info(`- 回调URL: ${this.feishu.callbackUrl} (来源: ${this.configSources['feishu.callbackUrl']})`);
    }

    Logger.info('日志配置:');
    Logger.info(`- 日志级别: ${LogLevel[this.log.level]} (来源: ${this.configSources['log.level']})`);
    Logger.info(`- 显示时间戳: ${this.log.showTimestamp} (来源: ${this.configSources['log.showTimestamp']})`);
    Logger.info(`- 显示日志级别: ${this.log.showLevel} (来源: ${this.configSources['log.showLevel']})`);
    
    Logger.info('缓存配置:');
    Logger.info(`- 启用缓存: ${this.cache.enabled} (来源: ${this.configSources['cache.enabled']})`);
    Logger.info(`- 缓存TTL: ${this.cache.ttl}秒 (来源: ${this.configSources['cache.ttl']})`);
    Logger.info(`- 最大缓存条目: ${this.cache.maxSize} (来源: ${this.configSources['cache.maxSize']})`);
  }
  
  /**
   * 掩盖API密钥
   * @param key API密钥
   * @returns 掩盖后的密钥字符串
   */
  private maskApiKey(key: string): string {
    if (!key || key.length <= 4) return '****';
    return `${key.substring(0, 2)}****${key.substring(key.length - 2)}`;
  }
  
  /**
   * 验证配置是否完整有效
   * @returns 是否验证成功
   */
  public validate(): boolean {
    // 验证服务器配置
    if (!this.server.port || this.server.port <= 0) {
      Logger.error('无效的服务器端口配置');
      return false;
    }
    
    // 验证飞书配置
    if (!this.feishu.appId) {
      Logger.error('缺少飞书应用ID，请通过环境变量FEISHU_APP_ID或命令行参数--feishu-app-id提供');
      return false;
    }
    
    if (!this.feishu.appSecret) {
      Logger.error('缺少飞书应用Secret，请通过环境变量FEISHU_APP_SECRET或命令行参数--feishu-app-secret提供');
      return false;
    }

    return true;
  }
} 