import * as crypto from 'crypto';
import { Config } from '../config.js';
import { Logger } from '../logger.js';

/**
 * 认证工具类
 * 提供认证相关的加密和哈希工具方法
 */
export class AuthUtils {


  /**
   * 生成客户端缓存键
   *
   * 安全说明：在 user 认证模式下，userKey 为空时会生成一个基于 appId:appSecret 的
   * 确定性共享键（sha256(appId:appSecret)），这意味着所有不带 userKey 的请求都会
   * 共享同一个缓存键，可能导致不同用户访问同一缓存 token，存在严重安全隐患。
   *
   * 因此在 user 认证模式下，调用方应确保 userKey 不为空；如果为空，应拒绝请求
   * 而不是使用此共享键。
   *
   * @param userKey 用户标识（可选）
   * @returns 生成的客户端键
   */
  public static generateClientKey(userKey?: string | null): string {
    const feishuConfig = Config.getInstance().feishu;
    const userPart = userKey ? `:${userKey}` : '';
    let source = ''
    if (feishuConfig.authType==="tenant"){
      source = `${feishuConfig.appId}:${feishuConfig.appSecret}`;
    }else {
      // user 认证模式下，userKey 为空时生成共享键，存在安全隐患
      if (!userKey) {
        Logger.warnOnce('[AuthUtils] user 认证模式下 userKey 为空，将生成共享缓存键 sha256(appId:appSecret)。不同请求可能共享同一缓存 token，存在安全隐患。请确保通过 user-key 请求头传递用户标识');
      }
      source = `${feishuConfig.appId}:${feishuConfig.appSecret}${userPart}`;
    }
    return crypto.createHash('sha256').update(source).digest('hex');
  }

  /**
   * 生成时间戳
   * @returns 当前时间戳（秒）
   */
  public static timestamp(): number {
    return Math.floor(Date.now() / 1000);
  }

  /**
   * 生成时间戳（毫秒）
   * @returns 当前时间戳（毫秒）
   */
  public static timestampMs(): number {
    return Date.now();
  }

  /**
   * 编码state参数
   * @param appId 应用ID
   * @param appSecret 应用密钥
   * @param clientKey 客户端缓存键
   * @param redirectUri 重定向URI（可选）
   * @returns AES-256-GCM 加密并认证的 state 字符串，有效期 15 分钟
   */
  public static encodeState(appId: string, appSecret: string, clientKey: string, redirectUri?: string, userKeyHint?: string): string {
    const stateData = {
      appId,
      clientKey,
      redirectUri,
      userKeyHint,
      timestamp: this.timestamp()
    };
    const key = crypto.createHash('sha256').update(appSecret).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(stateData), 'utf8'), cipher.final()]);
    return 'v2.' + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  }

  /**
   * 解码state参数
   * @param encodedState 加密状态，或有效期内由旧版生成的 Base64 状态
   * @returns 解码后的state数据
   */
  public static decodeState(encodedState: string): {
    appId: string;
    appSecret: string;
    clientKey: string;
    redirectUri?: string;
    userKeyHint?: string;
    timestamp: number;
  } | null {
    try {
      const { appId, appSecret } = Config.getInstance().feishu;
      let state;
      if (encodedState.startsWith('v2.')) {
        const bytes = Buffer.from(encodedState.slice(3), 'base64url');
        const key = crypto.createHash('sha256').update(appSecret).digest();
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
        decipher.setAuthTag(bytes.subarray(12, 28));
        state = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
      } else {
        state = JSON.parse(Buffer.from(encodedState, 'base64').toString('utf8'));
        if (state.appSecret !== appSecret) return null;
      }
      const age = this.timestamp() - state.timestamp;
      if (state.appId !== appId || typeof state.clientKey !== 'string' || !Number.isFinite(age) || age < 0 || age > 900) return null;
      return { ...state, appSecret };
    } catch (error) {
      return null;
    }
  }
}
