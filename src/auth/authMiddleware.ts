import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger.js';
import { TokenValidator } from './tokenValidator.js';
import {
  generateAuthErrorResponse,
  getBaseUrl,
  getRequestKey,
  isAuthForTenant,
  isUserAuthSupported
} from '../utils/auth.js';
import { TokenProvider } from './tokenProvider';

/**
 * 用户访问令牌验证中间件
 */
export interface AuthenticatedRequest extends Request {
  userAccessToken?: string;
  userInfo?: any;
}

/**
 * 验证用户访问令牌的中间件
 * 重构后：使用TokenValidator进行验证，职责更加清晰
 */
export const verifyUserToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tokenValidator = TokenValidator.getInstance();
    const validation = tokenValidator.validateUserToken(req);

    if (validation.isValid) {
      Logger.debug(
        `[Auth Middleware] Token验证通过，允许访问: ${validation.userKey?.substring(0, 8) || 'anonymous'}***`,
      );
      next();
      return;
    }

    // 验证失败，返回错误信息
    Logger.warn(`[Auth Middleware] Token验证失败: ${validation.error}`);
    const statusCode = validation.statusCode || 401;

    res.status(statusCode).json({
      error: validation.error || 'unauthorized',
      error_description:
        validation.errorDescription || 'Token validation failed',
    });
  } catch (error) {
    Logger.error(`[Auth Middleware] Token验证过程中发生异常:`, error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error during authentication.',
    });
  }
};

/**
 * 用户访问令牌验证中间件
 */
export interface AuthenticatedRequest extends Request {
  feishuToken?: string;
}

/**
 * 验证用户访问令牌的中间件
 * 重构后：使用TokenValidator进行验证，职责更加清晰
 */
export const verifyAndGetUserToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    Logger.error(`[verifyAndGetUserToken] Received message with sessionId: params: ${JSON.stringify(req.query)}, header:${JSON.stringify(req.body)}, body: ${JSON.stringify(req.body)}`,);
    Logger.debug(`[verifyAndGetUserToken] 开始获取用户访问令牌`);
    const tokenProvider = TokenProvider.getInstance();

    if (isAuthForTenant()) {
      Logger.debug(`[verifyAndGetUserToken] 使用租户级认证模式`);
      const tokenResult = await tokenProvider.getTenantToken();
      if (tokenResult.success) {
        Logger.debug(`[verifyAndGetUserToken] 租户令牌获取成功`);
        req.feishuToken = tokenResult.token;
        next();
        return;
      } else {
        Logger.error(`[verifyAndGetUserToken] 租户令牌获取失败: ${tokenResult.error}`);
        res.status(500).json({
          error: 'server_error',
          error_description: tokenResult.error,
        });
      }
    } else {
      const requestKey = getRequestKey(req);
      Logger.debug(`[verifyAndGetUserToken] 使用用户级认证模式，请求标识: ${requestKey?.substring(0, 8) || 'anonymous'}***`);


      const userToken = await TokenProvider.getInstance().getUserToken(requestKey);
      if (userToken.success) {
        Logger.debug(`[verifyAndGetUserToken] 用户令牌获取成功: ${requestKey?.substring(0, 8) || 'anonymous'}***`);
        req.feishuToken = userToken.token;
        next();
        return;
      } else {
        Logger.warn(`[verifyAndGetUserToken] 用户令牌获取失败: ${userToken.error}`);
        const { error, error_description, statusCode } =
          generateAuthErrorResponse(
            isUserAuthSupported(req),
            getBaseUrl(req),
            requestKey,
          );
        if (isUserAuthSupported(req)){
          Logger.debug(`[verifyAndGetUserToken] 生成认证错误响应: ${error} - ${error_description}`);
          res.status(statusCode).json({
            error: error,
            error_description: error_description,
          });
        }else {
          //让其在业务中返回错误
          req.feishuToken = "";
          next();
          return;
        }
      }
    }
  } catch (error) {
    Logger.error(`[Token Provider] 令牌获取过程中发生异常:`, error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error during authentication.',
    });
  }
};
