/**
 * 日志级别枚举
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  LOG = 2,
  WARN = 3,
  ERROR = 4,
  NONE = 5
}

// 导入文件系统模块
import * as fs from 'fs';
import * as path from 'path';

/**
 * 日志管理器配置接口
 */
export interface LoggerConfig {
  enabled: boolean;     // 日志总开关
  minLevel: LogLevel;
  showTimestamp: boolean;
  showLevel: boolean;
  timestampFormat?: string;
  logToFile: boolean;
  logFilePath: string;
  maxObjectDepth: number;
  maxObjectStringLength: number;
}

/**
 * 需要脱敏的字段名关键词列表
 * 匹配逻辑：字段名（去除分隔符后）包含以下任意关键词即触发脱敏
 */
const SENSITIVE_KEY_PATTERNS: string[] = [
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'apptoken',
  'tenanttoken',
  'bearertoken',
  'password',
  'passwd',
  'credential',
  'authorization',
  'apikey',
  'appkey',
  'appsecret',
  'clientsecret',
  'clientkey',
  'userkey',
  'tenantkey',
  'encryptionkey',
  'privatekey',
  'signingkey',
  'codeverifier',
];

/**
 * 需要在字符串值模式中脱敏的关键词
 * 用于匹配 key=value 或 key: value 形式的字符串中的敏感字段
 */
const SENSITIVE_STRING_PATTERNS: string[] = [
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'app_token',
  'tenant_token',
  'bearer_token',
  'password',
  'passwd',
  'credential',
  'authorization',
  'api_key',
  'app_key',
  'app_secret',
  'client_secret',
  'client_key',
  'user_key',
  'tenant_key',
  'encryption_key',
  'private_key',
  'signing_key',
  'code_verifier',
];

/**
 * 增强的日志管理器类
 * 提供可配置的日志记录功能，支持不同日志级别和格式化
 * 内置全面的敏感信息脱敏能力
 */
export class Logger {
  private static config: LoggerConfig = {
    enabled: true,        // 默认开启日志
    minLevel: LogLevel.INFO,   // 生产默认 INFO 级别
    showTimestamp: true,
    showLevel: true,
    timestampFormat: 'yyyy-MM-dd HH:mm:ss.SSS',
    logToFile: false,
    logFilePath: 'logs/log.txt',
    maxObjectDepth: 2,         // 限制对象序列化深度
    maxObjectStringLength: 5000000 // 限制序列化后字符串长度
  };

  /** 去重：已输出过的消息指纹 → 过期时间戳(ms) */
  private static dedupeCache = new Map<string, number>();
  /** 去重缓存 TTL（毫秒），默认 30 秒内相同消息只输出一次 */
  private static readonly DEDUP_TTL_MS = 30_000;
  /** 去重缓存最大条目数，防止内存泄漏 */
  private static readonly DEDUP_MAX_SIZE = 200;

  /**
   * 检查是否处于 stdio 模式
   * @returns 是否处于 stdio 模式
   */
  private static isStdioMode(): boolean {
    return process.env.NODE_ENV === "cli" || process.argv.includes("--stdio");
  }

  /**
   * 配置日志管理器
   * @param config 日志配置项
   */
  public static configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
    
    // 确保日志目录存在
    if (this.config.logToFile && this.config.enabled) {
      const logDir = path.dirname(this.config.logFilePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    }
  }

  /**
   * 设置日志开关
   * @param enabled 是否启用日志
   */
  public static setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * 检查日志是否可输出到控制台
   * @param level 日志级别
   * @returns 是否可输出到控制台
   */
  private static canLogToConsole(level: LogLevel): boolean {
    // 在 stdio 模式下，禁用控制台日志输出（避免污染 MCP 协议）
    if (this.isStdioMode()) {
      return false;
    }
    return this.config.enabled && level >= this.config.minLevel;
  }

  /**
   * 检查日志是否可输出（控制台或文件）
   * @param level 日志级别
   * @returns 是否应该处理该日志
   */
  private static canLog(level: LogLevel): boolean {
    if (!this.config.enabled || level < this.config.minLevel) {
      return false;
    }
    // 至少有一个输出渠道可用
    return !this.isStdioMode() || this.config.logToFile;
  }

  // ─── 去重机制 ─────────────────────────────────────────

  /**
   * 清理过期的去重缓存条目
   */
  private static pruneDedupeCache(): void {
    if (this.dedupeCache.size <= this.DEDUP_MAX_SIZE) return;
    const now = Date.now();
    for (const [key, expiresAt] of this.dedupeCache) {
      if (expiresAt <= now) {
        this.dedupeCache.delete(key);
      }
    }
    // 如果清理后仍超限，删除最早的条目
    if (this.dedupeCache.size > this.DEDUP_MAX_SIZE) {
      const entries = [...this.dedupeCache.entries()];
      entries.sort((a, b) => a[1] - b[1]);
      const toDelete = entries.slice(0, entries.length - this.DEDUP_MAX_SIZE / 2);
      for (const [key] of toDelete) {
        this.dedupeCache.delete(key);
      }
    }
  }

  /**
   * 检查消息是否在去重窗口内已输出过
   * @param fingerprint 消息指纹
   * @returns true 表示重复（应跳过），false 表示新消息
   */
  private static isDuplicate(fingerprint: string): boolean {
    const now = Date.now();
    const expiresAt = this.dedupeCache.get(fingerprint);
    if (expiresAt !== undefined && expiresAt > now) {
      return true;
    }
    this.dedupeCache.set(fingerprint, now + this.DEDUP_TTL_MS);
    this.pruneDedupeCache();
    return false;
  }

  /**
   * 生成消息指纹用于去重
   */
  private static getFingerprint(args: any[]): string {
    return args.map(arg => {
      if (typeof arg === 'string') return arg.slice(0, 200);
      if (arg instanceof Error) return `${arg.name}:${arg.message.slice(0, 200)}`;
      try { return JSON.stringify(arg).slice(0, 200); } catch { return String(arg).slice(0, 200); }
    }).join('|');
  }

  // ─── 去重日志方法 ─────────────────────────────────────

  /**
   * 带去重的 info 日志（在 TTL 内相同消息只输出一次）
   * 适用于：授权链接、认证成功等可能被多次触发的消息
   */
  public static infoOnce(...args: any[]): void {
    if (!this.canLog(LogLevel.INFO)) return;
    const fingerprint = `INFO:${this.getFingerprint(args)}`;
    if (this.isDuplicate(fingerprint)) return;
    this.outputLog(LogLevel.INFO, args);
  }

  /**
   * 带去重的 warn 日志
   */
  public static warnOnce(...args: any[]): void {
    if (!this.canLog(LogLevel.WARN)) return;
    const fingerprint = `WARN:${this.getFingerprint(args)}`;
    if (this.isDuplicate(fingerprint)) return;
    this.outputLog(LogLevel.WARN, args);
  }

  // ─── 脱敏核心逻辑 ─────────────────────────────────────

  /**
   * 判断字段名是否为敏感字段
   * 将字段名中的非字母数字字符去除后，检查是否包含敏感关键词
   */
  static isSecretKey(key: string): boolean {
    const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    return SENSITIVE_KEY_PATTERNS.some(pattern => normalized.includes(pattern));
  }

  /**
   * 对敏感值进行脱敏处理
   * 短值（≤8字符）完全遮蔽，长值保留首尾各2字符
   */
  static maskSecret(value: unknown): string {
    const text = String(value);
    if (text.length <= 8) return '****';
    return `${text.slice(0, 2)}****${text.slice(-2)}`;
  }

  /**
   * 对 userKey 进行脱敏处理（隐藏中间 1/3）
   * ≤3字符完全遮蔽，>3字符显示首尾各1/3，中间用 **** 替代
   */
  static maskUserKey(value: unknown): string {
    const text = String(value);
    if (text.length <= 3) return '****';
    const showLen = Math.max(1, Math.floor(text.length / 3));
    return `${text.slice(0, showLen)}****${text.slice(-showLen)}`;
  }

  /**
   * 对字符串内容进行脱敏
   * 处理 JSON 字符串和 key=value/key:value 格式的敏感信息
   */
  private static sanitizeString(value: string): string {
    // 尝试解析为 JSON 对象进行深度脱敏
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') {
        return JSON.stringify(this.sanitizeLogValue(parsed));
      }
    } catch {
      // 非 JSON 字符串，继续处理
    }

    // 构建敏感字段名匹配模式（支持各种命名格式）
    const keyPattern = SENSITIVE_STRING_PATTERNS
      .map(p => p.replace(/_/g, '[_\\-.]?'))
      .join('|');

    // 匹配带引号的 key: "value" 或 key: 'value' 模式
    const quotedRegex = new RegExp(
      `((?:"|')?(?:${keyPattern})(?:"|')?\\s*[:=]\\s*)(["'])(.*?)\\2`,
      'gi'
    );

    // 特殊处理：Authorization: Bearer <token> 模式（value 含空格）
    const bearerRegex = /(\b(?:authorization)\b\s*[:=]\s*)Bearer\s+([^\s,}&\]]+)/gi;

    // 匹配不带引号的 key=value 或 key: value 模式
    // 排除 authorization（已由 bearerRegex 专门处理）
    const unquotedKeyPattern = SENSITIVE_STRING_PATTERNS
      .filter(p => p !== 'authorization')
      .map(p => p.replace(/_/g, '[_\\-.]?'))
      .join('|');
    const unquotedRegex = new RegExp(
      `(\\b(?:${unquotedKeyPattern})\\b\\s*[:=]\\s*)(?!["'])([^,\\s&}\\]]+)`,
      'gi'
    );

    return value
      .replace(bearerRegex, (_match, prefix: string, token: string) =>
        `${prefix}Bearer ${this.maskSecret(token)}`)
      .replace(quotedRegex, (_match, prefix: string, quote: string, secret: string) =>
        `${prefix}${quote}${this.maskSecret(secret)}${quote}`)
      .replace(unquotedRegex, (_match, prefix: string, secret: string) => {
        // 不脱敏布尔值和纯数字
        if (/^(true|false|\d+)$/i.test(secret)) {
          return `${prefix}${secret}`;
        }
        return `${prefix}${this.maskSecret(secret)}`;
      });
  }

  /**
   * 递归脱敏任意值
   * 对对象中的敏感字段值、字符串中的敏感模式进行脱敏
   */
  private static sanitizeLogValue(value: any, seen = new WeakMap<object, any>()): any {
    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }
    if (!value || typeof value !== 'object') {
      return value;
    }
    if (seen.has(value)) {
      return '[Circular]';
    }

    // 处理 Error 对象
    if (value instanceof Error) {
      const sanitizedError: Record<string, unknown> = {
        name: value.name,
        message: this.sanitizeString(value.message),
        stack: value.stack ? this.sanitizeString(value.stack) : undefined,
      };
      seen.set(value, sanitizedError);
      for (const [key, nestedValue] of Object.entries(value)) {
        sanitizedError[key] = this.isSecretKey(key)
          ? this.maskSecret(nestedValue)
          : this.sanitizeLogValue(nestedValue, seen);
      }
      return sanitizedError;
    }

    // 跳过非纯对象/数组（如 class 实例）
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
      return value;
    }

    const sanitized: any = Array.isArray(value) ? [] : {};
    seen.set(value, sanitized);
    for (const [key, nestedValue] of Object.entries(value)) {
      sanitized[key] = this.isSecretKey(key)
        ? this.maskSecret(nestedValue)
        : this.sanitizeLogValue(nestedValue, seen);
    }
    return sanitized;
  }

  // ─── 格式化与输出 ─────────────────────────────────────

  /**
   * 格式化日志消息
   * @param level 日志级别
   * @param args 日志参数
   * @returns 格式化后的日志字符串数组
   */
  private static formatLogMessage(level: LogLevel, args: any[]): any[] {
    const result: any[] = [];
    
    // 添加时间戳
    if (this.config.showTimestamp) {
      const now = new Date();
      const timestamp = this.formatDate(now, this.config.timestampFormat || 'yyyy-MM-dd HH:mm:ss.SSS');
      result.push(`[${timestamp}]`);
    }
    
    // 添加日志级别
    if (this.config.showLevel) {
      const levelStr = LogLevel[level].padEnd(5, ' ');
      result.push(`[${levelStr}]`);
    }
    
    // 添加脱敏后的日志内容
    return [...result, ...args.map(arg => this.sanitizeLogValue(arg))];
  }

  /**
   * 统一输出逻辑
   */
  private static outputLog(level: LogLevel, args: any[]): void {
    const formattedMessage = this.formatLogMessage(level, args);
    if (this.canLogToConsole(level)) {
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(...formattedMessage);
          break;
        case LogLevel.INFO:
          console.info(...formattedMessage);
          break;
        case LogLevel.LOG:
          console.log(...formattedMessage);
          break;
        case LogLevel.WARN:
          console.warn(...formattedMessage);
          break;
        case LogLevel.ERROR:
          console.error(...formattedMessage);
          break;
      }
    }
    this.writeToFile(formattedMessage);
  }

  /**
   * 将日志写入文件
   * @param logParts 日志内容部分
   */
  private static writeToFile(logParts: any[]): void {
    if (!this.config.enabled || !this.config.logToFile) return;
    
    try {
      // 将日志内容转换为字符串
      let logString = '';
      for (const part of logParts) {
        if (typeof part === 'object') {
          try {
            logString += this.safeStringify(part) + ' ';
          } catch (e) {
            logString += '[Object] ';
          }
        } else {
          logString += part + ' ';
        }
      }
      
      logString += '\n';
      fs.appendFileSync(this.config.logFilePath, logString);
    } catch (error) {
      if (!this.isStdioMode()) {
        console.error('写入日志文件失败:', error);
      }
    }
  }

  /**
   * 安全的对象序列化，限制深度和长度
   * @param obj 要序列化的对象
   * @returns 序列化后的字符串
   */
  private static safeStringify(obj: any): string {
    const seen = new Set();
    
    const stringified = JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      
      // 跳过大型内部对象
      if (key === 'request' || key === 'socket' || key === 'agent' || 
          key === '_events' || key === '_eventsCount' || key === '_maxListeners' ||
          key === 'rawHeaders' || key === 'rawTrailers') {
        return '[Object]';
      }
      
      return value;
    }, 2);
    
    if (stringified && stringified.length > this.config.maxObjectStringLength) {
      return stringified.substring(0, this.config.maxObjectStringLength) + '... [截断]';
    }
    
    return stringified;
  }

  /**
   * 格式化日期
   */
  private static formatDate(date: Date, format: string): string {
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');

    return format
      .replace('yyyy', year)
      .replace('MM', month)
      .replace('dd', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds)
      .replace('SSS', milliseconds);
  }

  // ─── 公开日志方法 ─────────────────────────────────────

  /**
   * 记录调试级别日志
   */
  public static debug(...args: any[]): void {
    if (this.canLog(LogLevel.DEBUG)) {
      this.outputLog(LogLevel.DEBUG, args);
    }
  }

  /**
   * 记录信息级别日志
   */
  public static info(...args: any[]): void {
    if (this.canLog(LogLevel.INFO)) {
      this.outputLog(LogLevel.INFO, args);
    }
  }

  /**
   * 记录普通级别日志
   */
  public static log(...args: any[]): void {
    if (this.canLog(LogLevel.LOG)) {
      this.outputLog(LogLevel.LOG, args);
    }
  }

  /**
   * 记录警告级别日志
   */
  public static warn(...args: any[]): void {
    if (this.canLog(LogLevel.WARN)) {
      this.outputLog(LogLevel.WARN, args);
    }
  }

  /**
   * 记录错误级别日志
   */
  public static error(...args: any[]): void {
    if (this.canLog(LogLevel.ERROR)) {
      this.outputLog(LogLevel.ERROR, args);
    }
  }

  // ─── 测试辅助 ─────────────────────────────────────────

  /**
   * 清除去重缓存（仅用于测试）
   */
  public static clearDedupeCache(): void {
    this.dedupeCache.clear();
  }
}
