import { Request } from 'express';
import { Config } from './config.js';
import { Logger } from './logger.js';

/**
 * sessionId 和 userKey 的映射关系存储
 * key: sessionId, value: userKey
 */
const sessionUserKeyMap = new Map<string, string>();

/**
 * 绑定sessionId和userKey的映射关系
 * @param sessionId 会话标识
 * @param userKey 用户标识
 */
export function bindSessionUserKey(sessionId: string, userKey: string): void {
  sessionUserKeyMap.set(sessionId, userKey);
  Logger.info(`绑定映射关系: sessionId=${sessionId}, userKey=${userKey}`);
}

/**
 * 解绑sessionId和userKey的映射关系
 * @param sessionId 会话标识
 * @returns 是否解绑成功
 */
export function unbindSessionUserKey(sessionId: string): boolean {
  const result = sessionUserKeyMap.delete(sessionId);
  if (result) {
    Logger.info(`解绑映射关系: sessionId=${sessionId}`);
  }
  return result;
}

/**
 * 根据sessionId获取对应的userKey
 * @param sessionId 会话标识
 * @returns 对应的userKey，如果不存在则返回undefined
 */
export function getUserKeyBySessionId(sessionId: string): string | undefined {
  return sessionUserKeyMap.get(sessionId);
}

/**
 * 根据userKey获取对应的sessionId
 * @param userKey 用户标识
 * @returns 对应的sessionId，如果不存在则返回undefined
 */
export function getSessionIdByUserKey(userKey: string): string | undefined {
  for (const [sessionId, mappedUserKey] of sessionUserKeyMap.entries()) {
    if (mappedUserKey === userKey) {
      return sessionId;
    }
  }
  return undefined;
}

/**
 * 获取所有映射关系
 * @returns 所有sessionId和userKey的映射关系
 */
export function getAllSessionUserKeyMappings(): Map<string, string> {
  return new Map(sessionUserKeyMap);
}

/**
 * 检查sessionId是否已绑定userKey
 * @param sessionId 会话标识
 * @returns 是否已绑定
 */
export function isSessionIdBound(sessionId: string): boolean {
  return sessionUserKeyMap.has(sessionId);
}

/**
 * 检查userKey是否已绑定sessionId
 * @param userKey 用户标识
 * @returns 是否已绑定
 */
export function isUserKeyBound(userKey: string): boolean {
  return getSessionIdByUserKey(userKey) !== undefined;
}

/**
 * 客户端版本信息模型
 */
export interface ClientVersionInfo {
  /** 客户端名称 */
  client: string;
  /** 版本号 */
  version: string;
  /** 平台信息 */
  platform: string;
  /** 是否支持用户授权 */
  isSupported: boolean;
  /** 主版本号 */
  major: number;
  /** 次版本号 */
  minor: number;
  /** 补丁版本号 */
  patch: number;
}

/**
 * 用户代理解析结果模型
 */
export interface UserAgentParseResult {
  /** 是否成功解析 */
  success: boolean;
  /** 客户端版本信息 */
  versionInfo?: ClientVersionInfo;
  /** 错误信息 */
  error?: string;
}

/**
 * 是否是企业授权模式
 */
export function isAuthForTenant(): boolean {
  return Config.getInstance().feishu.authType === 'tenant';
}


/**
 * 获取请求的唯一标识符，用于区分不同的用户会话
 * 
 * 功能说明：
 * 1. 企业授权模式：返回null，使用全局配置
 * 2. 用户授权模式：
 *    - 如果客户端支持用户授权（新版本Cursor）：从Authorization header中提取Bearer token
 *    - 如果客户端不支持用户授权（旧版本Cursor）：从query参数中获取sessionId
 * 
 * @param req Express请求对象
 * @returns 请求标识符，可能为null、token字符串或sessionId字符串
 */
export function getRequestKey(req: Request): string  {
  // 企业授权模式：使用全局配置，不需要区分用户
  if (isAuthForTenant()) {
    return "";
  }
  
  // 用户授权模式：需要区分不同用户
  if (isUserAuthSupported(req)) {
    // 新版本Cursor支持用户授权，从Authorization header获取token
    const authorization = req.headers.authorization;
    if (authorization && authorization.startsWith('Bearer ')) {
      const token = authorization.substring(7).trim();
      // 验证token不为空
      if (token.length > 0) {
        return token;
      }
    }
    // 如果Authorization header无效，返回null而不是空字符串
    return "";
  } else {
    // 旧版本Cursor不支持用户授权，从query参数获取sessionId
    const sessionId = req.query.sessionId;
    const userKey = req.query.userKey;

    if (userKey && typeof userKey === 'string' && userKey.trim().length > 0) {
      // 如果存在userKey，绑定sessionId和userKey的映射关系，并返回userKey
      if (sessionId && typeof sessionId === 'string' && sessionId.trim().length > 0) {
        bindSessionUserKey(sessionId.trim(), userKey.trim());
      }
      return userKey.trim();
    } else if (sessionId && typeof sessionId === 'string' && sessionId.trim().length > 0) {
      // 如果不存在userKey，根据sessionId查找对应的userKey
      const trimmedSessionId = sessionId.trim();
      const foundUserKey = getUserKeyBySessionId(trimmedSessionId);
      if (foundUserKey) {
        Logger.info(`根据sessionId找到userKey: sessionId=${trimmedSessionId}, userKey=${foundUserKey}`);
        return foundUserKey;
      }
      // 如果找不到对应的userKey，返回sessionId
      Logger.info(`未找到sessionId对应的userKey，返回sessionId: ${trimmedSessionId}`);
      return trimmedSessionId;
    }
    // 如果sessionId和userKey都无效，返回空字符串
    return "";
  }
}

/**
 * 分析客户端版本，判断是否支持用户授权
 * 
 * 版本支持策略：
 * - 主版本号 > 1：支持用户授权
 * - 主版本号 = 1 且 次版本号 > 5：支持用户授权  
 * - 主版本号 = 1 且 次版本号 = 5 且 补丁版本号 >= 0：支持用户授权
 * - 其他版本：不支持用户授权
 * 
 * @param req Express请求对象
 * @returns 是否支持用户授权
 */
export function isUserAuthSupported(req: Request): boolean {

  //模拟不支持用户授权的客户端
  // if (true){
  //   return false;
  // }
  const userAgent = req.headers['user-agent'];

  // 检查user-agent是否存在
  if (!userAgent || typeof userAgent !== 'string') {
    return false;
  }

  // 解析Cursor版本号，格式：Cursor/1.5.11
  const cursorMatch = userAgent.match(/Cursor\/(\d+)\.(\d+)\.(\d+)/);
  if (!cursorMatch || cursorMatch.length < 4) {
    return false;
  }

  // 解析版本号，添加错误处理
  const major = parseInt(cursorMatch[1], 10);
  const minor = parseInt(cursorMatch[2], 10);
  const patch = parseInt(cursorMatch[3], 10);

  // 验证版本号解析是否成功
  if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
    return false;
  }

  // 判断版本是否支持用户授权
  // 要求1.5.0及以上版本支持用户授权
  if (major > 1) {
    return true;
  } else if (major === 1 && minor > 5) {
    return true;
  } else if (major === 1 && minor === 5 && patch >= 0) {
    return true;
  }

  return false;
}

/**
 * 获取客户端版本信息
 * 
 * 解析user-agent字符串，提取Cursor客户端的详细信息
 * 格式示例：Cursor/1.5.11 (win32 x64)
 * 
 * @param req Express请求对象
 * @returns 版本信息对象，解析失败时返回null
 */
export function getClientVersion(req: Request): ClientVersionInfo | null {
  const userAgent = req.headers['user-agent'];

  // 检查user-agent是否存在
  if (!userAgent || typeof userAgent !== 'string') {
    return null;
  }

  // 解析Cursor版本和平台信息，格式：Cursor/1.5.11 (win32 x64)
  const cursorMatch = userAgent.match(/Cursor\/(\d+\.\d+\.\d+)\s+\(([^)]+)\)/);
  if (!cursorMatch || cursorMatch.length < 3) {
    return null;
  }

  const version = cursorMatch[1];
  const platform = cursorMatch[2];
  const isSupported = isUserAuthSupported(req);

  // 解析版本号，添加错误处理
  const versionParts = version.split('.').map(part => {
    const num = parseInt(part, 10);
    return isNaN(num) ? 0 : num;
  });

  // 确保版本号解析成功
  if (versionParts.length !== 3) {
    return null;
  }

  const [major, minor, patch] = versionParts;

  return {
    client: 'Cursor',
    version,
    platform,
    isSupported,
    major,
    minor,
    patch,
  };
}

/**
 * 解析用户代理字符串
 * @param req Express请求对象
 * @returns 解析结果
 */
export function parseUserAgent(req: Request): UserAgentParseResult {
  try {
    const versionInfo = getClientVersion(req);

    if (!versionInfo) {
      return {
        success: false,
        error: '无法解析用户代理字符串',
      };
    }

    return {
      success: true,
      versionInfo,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}


  /**
 * 生成用户授权失败时的返回数据
 * @param isUserAuthSupported 客户端是否支持用户认证
 * @param baseUrl 服务端的ip地址
 * @param reqKey 请求标识符
 * @returns 授权失败响应数据
 */
export function generateAuthErrorResponse(isUserAuthSupported: boolean, baseUrl: string, reqKey: string): { error: string; error_description: string; statusCode: number } {
  const config = Config.getInstance();
  
  if (isUserAuthSupported) {
    // 新版本Cursor支持用户授权，返回401状态码
    return {
      error: 'unauthorized',
      error_description: 'Missing or invalid Authorization header. Please provide a valid user access token.',
      statusCode: 401
    };
  } else {
    // 旧版本Cursor不支持用户授权，返回500状态码和授权链接
    const redirect_uri = encodeURIComponent(`${baseUrl}/callback?baseUrl=${baseUrl}`);
    Logger.info(`redirect_uri:${redirect_uri}`)
    const scope = encodeURIComponent('base:app:read bitable:app bitable:app:readonly board:whiteboard:node:read contact:user.employee_id:readonly docs:document.content:read docx:document docx:document.block:convert docx:document:create docx:document:readonly drive:drive drive:drive:readonly drive:file drive:file:upload sheets:spreadsheet sheets:spreadsheet:readonly space:document:retrieve space:folder:create wiki:space:read wiki:space:retrieve wiki:wiki wiki:wiki:readonly offline_access');
    const state = reqKey;
    const url = `https://accounts.feishu.cn/open-apis/authen/v1/authorize?client_id=${config.feishu.appId}&redirect_uri=${redirect_uri}&scope=${scope}&state=${state}`;
    return {
      error: 'unauthorized',
      error_description: `请提示用戶在浏览器打开以下链接进行授权：\n\n[点击授权](${url})`,
      statusCode: 500
    };
  }
}

/**
 * 获取基础URL
 */
export function getBaseUrl(req: Request): string {
  const protocol = getProtocol(req);
  const host = req.get('X-Forwarded-Host') || req.get('host');
  return `${protocol}://${host}`;
}


/**
 * 获取协议类型
 */
function getProtocol(req: Request): string {
  // 检查代理头
  const forwardedProto = req.get('X-Forwarded-Proto');
  const forwardedSsl = req.get('X-Forwarded-Ssl');

  if (forwardedProto) {
    return forwardedProto;
  }

  if (forwardedSsl === 'on') {
    return 'https';
  }

  // 检查连接是否安全
  if (req.secure) {
    return 'https';
  }

  // 默认为 http
  return 'http';
}