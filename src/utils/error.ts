import { Logger } from './logger.js';

/**
 * 飞书API错误接口
 */
export interface FeishuApiError {
  code?: number;
  msg?: string;
  error?: {
    field_violations?: Array<{
      field: string;
      description?: string;
      value?: any;
    }>;
    troubleshooter?: string;
  };
}

/**
 * 错误排查指南映射
 */
const errorGuides: Record<string, string> = {
  // 飞书API标准错误码
  '1770002': '资源未找到。请检查文档ID/块ID是否正确，并确保您有权限访问该资源。',
  '1770001': '权限不足。请确保应用有足够的权限访问此资源。',
  '1770003': '内部服务错误。请稍后重试。',
  '1770004': '参数格式错误。请检查API请求参数是否正确。',
  '1770005': '请求频率限制。请减少请求频率后重试。',
  '1770006': '操作冲突。可能有其他用户正在编辑同一资源。',
  '1770007': '资源已被删除。请检查资源是否存在。',
  '1770008': '资源已被归档。请检查资源状态。',
  '1770015': '文档或文件夹已被移动。请使用新的位置访问。',
  
  // 身份验证和通用错误
  '99991671': '飞书应用身份验证失败。请检查App ID和App Secret是否正确，或者重新注册飞书应用。',
  '99991663': '权限不足。请确保：\n1. 应用已获得正确的权限范围\n2. 文档已与应用共享\n3. 您有访问该文档的权限',
  '99991672': '请求频率超过限制。请稍后再试或优化代码减少请求次数。',
  '99991661': '资源不存在。请检查文档ID/块ID是否正确，并确保资源仍然存在。',
  '99991648': '文档ID格式不正确。请检查ID格式，应为标准飞书文档ID、URL或Token。',
  'token_invalid': '访问令牌无效。请尝试刷新访问令牌。',
  'invalid_token': '访问令牌无效。请尝试刷新访问令牌。',
  '404': '资源未找到。请检查URL或ID是否正确。',
  '403': '访问被拒绝。请检查权限设置并确保您有足够的访问权限。',
  '401': '未授权。请检查认证凭据或尝试重新获取访问令牌。',
  '400': '请求参数有误。请检查提供的参数格式和值是否正确。',
  '500': '服务器内部错误。请稍后重试或联系飞书支持团队。'
};

/**
 * 格式化错误消息
 * 对飞书API各种错误响应格式进行统一处理
 * 
 * @param error 原始错误
 * @param context 错误上下文（可选）
 * @returns 格式化的错误消息
 */
export function formatErrorMessage(error: any, context?: string): string {
  try {
    // 预处理错误对象
    if (!error) {
      return '发生未知错误';
    }

    // 确定错误类型
    let errorCode: number | string | undefined;
    let errorMsg = '';
    let fieldViolations: any[] = [];
    let troubleshooter = '';
    let logId = '';

    // 处理飞书API标准错误格式
    if (error.apiError) {
      const apiError = error.apiError;

      errorCode = apiError.code;
      errorMsg = apiError.msg || '';

      if (apiError.error) {
        fieldViolations = apiError.error.field_violations || [];
        troubleshooter = apiError.error.troubleshooter || '';
        logId = apiError.error.log_id || '';
      }
    } 
    // 处理直接包含code和msg的格式
    else if (error.code !== undefined && error.msg !== undefined) {
      errorCode = error.code;
      errorMsg = error.msg;

      if (error.error) {
        fieldViolations = error.error.field_violations || [];
        troubleshooter = error.error.troubleshooter || '';
        logId = error.error.log_id || '';
      }
    }
    // 处理HTTP类错误
    else if (error.status) {
      errorCode = error.status;
      errorMsg = error.statusText || error.err || '请求失败';
    }
    // 处理标准Error对象
    else if (error instanceof Error) {
      errorMsg = error.message;
    }
    // 处理字符串错误
    else if (typeof error === 'string') {
      errorMsg = error;
    }
    // 处理其他对象类型的错误
    else if (typeof error === 'object') {
      errorMsg = error.message || error.error || JSON.stringify(error);
    }

    // 构建基本错误消息
    let formattedMessage = '';
    if (context) {
      formattedMessage += `${context}: `;
    }
    
    if (errorCode !== undefined) {
      formattedMessage += `${errorMsg} (错误码: ${errorCode})`;
    } else {
      formattedMessage += errorMsg;
    }

    // 添加日志ID
    if (logId) {
      formattedMessage += `\n日志ID: ${logId}`;
    }

    // 添加字段验证错误信息
    if (fieldViolations && fieldViolations.length > 0) {
      formattedMessage += '\n字段验证错误:';
      fieldViolations.forEach((violation) => {
        let detail = `\n - ${violation.field}`;
        if (violation.description) {
          detail += `: ${violation.description}`;
        }
        if (violation.value !== undefined) {
          detail += `，提供的值: ${violation.value}`;
        }
        formattedMessage += detail;
      });
    }

    // 添加排查建议
    if (troubleshooter) {
      formattedMessage += `\n\n排查建议:\n${troubleshooter}`;
    } else {
      // 尝试添加预定义的错误指南
      const errorCodeStr = String(errorCode);
      if (errorGuides[errorCodeStr]) {
        formattedMessage += `\n\n排查建议:\n${errorGuides[errorCodeStr]}`;
      } else {
        // 如果没有精确匹配，尝试通过错误消息内容模糊匹配
        for (const [key, guide] of Object.entries(errorGuides)) {
          if (errorMsg.toLowerCase().includes(key.toLowerCase())) {
            formattedMessage += `\n\n排查建议:\n${guide}`;
            break;
          }
        }
      }
    }

    return formattedMessage;
  } catch (e) {
    Logger.error("格式化错误消息时发生错误:", e);
    return typeof error === 'string' ? error : '发生未知错误';
  }
}

/**
 * 包装错误为标准格式
 * 
 * @param message 错误消息前缀
 * @param originalError 原始错误
 * @returns 包装后的错误对象
 */
export function wrapError(message: string, originalError: any): Error {
  const errorMessage = formatErrorMessage(originalError);
  return new Error(`${message}: ${errorMessage}`);
} 