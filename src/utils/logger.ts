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
 * 增强的日志管理器类
 * 提供可配置的日志记录功能，支持不同日志级别和格式化
 */
export class Logger {
  private static config: LoggerConfig = {
    enabled: true,        // 默认开启日志
    minLevel: LogLevel.DEBUG,  // 修改为DEBUG级别，确保捕获所有日志
    showTimestamp: true,
    showLevel: true,
    timestampFormat: 'yyyy-MM-dd HH:mm:ss.SSS',
    logToFile: false,
    logFilePath: 'log/log.txt',
    maxObjectDepth: 2,         // 限制对象序列化深度
    maxObjectStringLength: 5000000 // 限制序列化后字符串长度
  };

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
   * 检查日志是否可输出
   * @param level 日志级别
   * @returns 是否可输出
   */
  private static canLog(level: LogLevel): boolean {
    return this.config.enabled && level >= this.config.minLevel;
  }

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
    
    // 添加原始日志内容
    return [...result, ...args];
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
            // 简化对象序列化
            logString += this.safeStringify(part) + ' ';
          } catch (e) {
            logString += '[Object] ';
          }
        } else {
          logString += part + ' ';
        }
      }
      
      // 添加换行符
      logString += '\n';
      
      // 以追加模式写入文件
      fs.appendFileSync(this.config.logFilePath, logString);
    } catch (error) {
      console.error('写入日志文件失败:', error);
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
      // 处理循环引用
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      
      // 处理请求/响应对象
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
   * @param date 日期对象
   * @param format 格式字符串
   * @returns 格式化后的日期字符串
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

  /**
   * 记录调试级别日志
   * @param args 日志参数
   */
  public static debug(...args: any[]): void {
    if (this.canLog(LogLevel.DEBUG)) {
      const formattedMessage = this.formatLogMessage(LogLevel.DEBUG, args);
      console.debug(...formattedMessage);
      this.writeToFile(formattedMessage);
    }
  }

  /**
   * 记录信息级别日志
   * @param args 日志参数
   */
  public static info(...args: any[]): void {
    if (this.canLog(LogLevel.INFO)) {
      const formattedMessage = this.formatLogMessage(LogLevel.INFO, args);
      console.info(...formattedMessage);
      this.writeToFile(formattedMessage);
    }
  }

  /**
   * 记录普通级别日志
   * @param args 日志参数
   */
  public static log(...args: any[]): void {
    if (this.canLog(LogLevel.LOG)) {
      const formattedMessage = this.formatLogMessage(LogLevel.LOG, args);
      console.log(...formattedMessage);
      this.writeToFile(formattedMessage);
    }
  }

  /**
   * 记录警告级别日志
   * @param args 日志参数
   */
  public static warn(...args: any[]): void {
    if (this.canLog(LogLevel.WARN)) {
      const formattedMessage = this.formatLogMessage(LogLevel.WARN, args);
      console.warn(...formattedMessage);
      this.writeToFile(formattedMessage);
    }
  }

  /**
   * 记录错误级别日志
   * @param args 日志参数
   */
  public static error(...args: any[]): void {
    if (this.canLog(LogLevel.ERROR)) {
      const formattedMessage = this.formatLogMessage(LogLevel.ERROR, args);
      console.error(...formattedMessage);
      this.writeToFile(formattedMessage);
    }
  }

  /**
   * 记录请求和响应的详细信息
   * @param method 请求方法
   * @param url 请求URL
   * @param data 请求数据
   * @param response 响应数据
   * @param statusCode 响应状态码
   */
  public static logApiCall(method: string, url: string, data: any, response: any, statusCode: number): void {
    if (this.canLog(LogLevel.DEBUG)) {
      this.debug('API调用详情:');
      this.debug(`请求: ${method} ${url}`);
      
      // 简化请求数据记录
      if (data) {
        try {
          if (typeof data === 'string') {
            // 尝试解析JSON字符串
            const parsedData = JSON.parse(data);
            this.debug('请求数据:', parsedData);
          } else {
            this.debug('请求数据:', data);
          }
        } catch (e) {
          this.debug('请求数据:', data);
        }
      } else {
        this.debug('请求数据: None');
      }
      
      this.debug(`响应状态: ${statusCode}`);
      
      // 简化响应数据记录
      if (response) {
        // 只记录关键信息
        const simplifiedResponse = response.data ? { data: response.data } : response;
        this.debug('响应数据:', simplifiedResponse);
      } else {
        this.debug('响应数据: None');
      }
    } else if (this.canLog(LogLevel.INFO)) {
      this.info(`API调用: ${method} ${url} - 状态码: ${statusCode}`);
    }
  }
} 