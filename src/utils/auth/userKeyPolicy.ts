import { randomUUID } from 'node:crypto';

export type AuthType = 'tenant' | 'user';
export type UserKeyMode = 'stdio' | 'http' | 'unknown';

export interface ExistingStreamableSessionInput {
  sessionId: string;
  storedUserKey?: string | null;
  storedIsUserKeyProvided: boolean;
  requestUserKey?: string;
}

export interface ExistingStreamableSessionContext {
  userKey: string;
  isUserKeyProvided: boolean;
  shouldUpdateSession: boolean;
}

export interface ServiceUserKeyContextInput {
  hasAsyncContext: boolean;
  contextIsUserKeyProvided: boolean;
  contextMode: UserKeyMode;
  userKey?: string | null;
}

export interface ServiceUserKeyContext {
  isUserKeyProvided: boolean;
  mode: UserKeyMode;
}

const warnedFallbackUserKeys = new Set<string>();

export function shouldRequireExplicitUserKey(
  authType: AuthType,
  requireUserKey: boolean
): boolean {
  return authType === 'user' && requireUserKey;
}

export function isConfiguredUserKeyProvided(userKey?: string | null): boolean {
  return !!userKey && userKey !== 'stdio';
}

export function isRequestUserKeyProvided(userKey?: string | null): boolean {
  return !!userKey;
}

export function shouldWarnFallbackUserKeyOnce(
  mode: UserKeyMode,
  userKey?: string | null
): boolean {
  const warningKey = `${mode}:${userKey || ''}`;
  if (warnedFallbackUserKeys.has(warningKey)) {
    return false;
  }
  warnedFallbackUserKeys.add(warningKey);
  return true;
}

export function resolveServiceUserKeyContext(
  input: ServiceUserKeyContextInput
): ServiceUserKeyContext {
  if (input.hasAsyncContext) {
    return {
      isUserKeyProvided: input.contextIsUserKeyProvided,
      mode: input.contextMode,
    };
  }

  return {
    isUserKeyProvided: isConfiguredUserKeyProvided(input.userKey),
    mode: 'stdio',
  };
}

export function resolveExistingStreamableSessionContext(
  input: ExistingStreamableSessionInput
): ExistingStreamableSessionContext {
  const storedUserKey = input.storedUserKey || input.sessionId;

  if (input.requestUserKey) {
    return {
      userKey: input.requestUserKey,
      isUserKeyProvided: true,
      shouldUpdateSession:
        input.requestUserKey !== storedUserKey || !input.storedIsUserKeyProvided,
    };
  }

  return {
    userKey: storedUserKey,
    isUserKeyProvided: input.storedIsUserKeyProvided,
    shouldUpdateSession: false,
  };
}

export function buildMissingUserKeyMessage(
  mode: UserKeyMode = 'unknown',
  suggestedUserKey: string = randomUUID()
): string {
  const intro = 'FEISHU_AUTH_TYPE=user 需要稳定的用户标识来隔离 user token 缓存。';
  const suggestion = `\n\n本次建议使用的 key：\n${suggestedUserKey}`;

  if (mode === 'stdio') {
    return [
      'stdio/CLI 模式缺少 user key。',
      '',
      intro,
      '请在启动工具前设置以下任一项：',
      '',
      '- 环境变量：FEISHU_USER_KEY=<your-user-key>',
      '- CLI 配置命令：feishu-tool config set FEISHU_USER_KEY <your-user-key>',
      '- 启动参数：--user-key <your-user-key>',
    ].join('\n') + suggestion;
  }

  if (mode === 'http') {
    return [
      'HTTP 模式缺少 user-key。',
      '',
      intro,
      '请通过以下任一方式传递 user key：',
      '',
      '- Header：user-key: <your-user-key>',
      '- Query：?userKey=<your-user-key>',
    ].join('\n') + suggestion;
  }

  return [
    '缺少 user-key。',
    '',
    intro,
    'HTTP/SSE/StreamableHTTP：',
    '- Header：user-key: <your-user-key>',
    '- Query：?userKey=<your-user-key>',
    '',
    'stdio/CLI：',
    '- 环境变量：FEISHU_USER_KEY=<your-user-key>',
    '- CLI 配置命令：feishu-tool config set FEISHU_USER_KEY <your-user-key>',
    '- 启动参数：--user-key <your-user-key>',
  ].join('\n') + suggestion;
}

export class MissingUserKeyError extends Error {
  constructor(mode: UserKeyMode = 'unknown') {
    super(buildMissingUserKeyMessage(mode));
    this.name = 'MissingUserKeyError';
  }
}

export function assertExplicitUserKey(
  authType: AuthType,
  requireUserKey: boolean,
  isUserKeyProvided: boolean,
  mode: UserKeyMode = 'unknown'
): void {
  if (shouldRequireExplicitUserKey(authType, requireUserKey) && !isUserKeyProvided) {
    throw new MissingUserKeyError(mode);
  }
}
