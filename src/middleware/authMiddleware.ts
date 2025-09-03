import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger.js';
import axios from 'axios';

/**
 * 用户访问令牌验证中间件
 */
export interface AuthenticatedRequest extends Request {
  userAccessToken?: string;
  userInfo?: any;
}

/**
 * 验证用户访问令牌的中间件
 */
export const verifyUserToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    // 从 Authorization header 获取令牌
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      Logger.warn(`[Auth Middleware] Missing or invalid Authorization header`);
      res.status(401).json({
        error: 'unauthorized',
        error_description: 'Missing or invalid Authorization header. Please provide a valid user access token.'
      });
      return;
    }

    const userAccessToken = authHeader.substring(7); // 移除 "Bearer " 前缀
    
    // 验证令牌有效性 - 调用飞书API获取用户信息
    try {
      const response = await axios.get('https://open.feishu.cn/open-apis/authen/v1/user_info', {
        headers: {
          'Authorization': `Bearer ${userAccessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.code === 0) {
        // 令牌有效，保存用户信息
        req.userAccessToken = userAccessToken;
        req.userInfo = response.data.data;
        
        Logger.debug(`[Auth Middleware] User authenticated successfully: ${response.data.data?.name || 'Unknown'}`);
        next();
      } else {
        Logger.warn(`[Auth Middleware] Invalid user token: ${response.data.msg}`);
        res.status(401).json({
          error: 'invalid_token',
          error_description: 'The provided user access token is invalid or expired.'
        });
      }
    } catch (error: any) {
      Logger.error(`[Auth Middleware] Error validating user token:`, error);
      
      // 检查是否是401错误（令牌无效）
      if (error.response?.status === 401) {
        res.status(401).json({
          error: 'invalid_token',
          error_description: 'The provided user access token is invalid or expired.'
        });
        return;
      }
      
      // 其他错误
      res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to validate user access token.'
      });
    }
  } catch (error) {
    Logger.error(`[Auth Middleware] Unexpected error:`, error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error during authentication.'
    });
  }
};

/**
 * 可选的用户令牌验证中间件 - 如果有令牌则验证，没有则继续
 */
export const optionalUserToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // 没有令牌，直接继续
      next();
      return;
    }

    // 有令牌，验证它
    await verifyUserToken(req, res, next);
  } catch (error) {
    // 验证失败，但这是可选的，所以继续
    Logger.warn(`[Optional Auth Middleware] Token validation failed, continuing without authentication:`, error);
    next();
  }
}; 