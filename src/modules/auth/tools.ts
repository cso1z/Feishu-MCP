import { Config } from '../../utils/config.js';
import {
  AuthUtils,
  TokenCacheManager,
  UserContextManager,
  assertExplicitUserKey,
} from '../../utils/auth/index.js';
import { getRequiredScopes } from '../../services/constants/feishuScopes.js';
import { ModuleRegistry } from '../ModuleRegistry.js';
import { tableTool } from '../tableTools.js';

function context() {
  const config = Config.getInstance();
  const manager = UserContextManager.getInstance();
  const userKey = manager.hasContext()
    ? manager.getUserKey()
    : config.feishu.userKey;
  assertExplicitUserKey(
    config.feishu.authType,
    true,
    manager.hasContext() ? manager.isUserKeyProvided() : Boolean(userKey),
    manager.getUserKeyMode(),
  );
  const modules = ModuleRegistry.getEnabledModules(
    config.features.enabledModules,
    config.feishu.authType,
  ).map((m) => m.id);
  return {
    config,
    userKey,
    clientKey: AuthUtils.generateClientKey(userKey),
    requiredScopes: getRequiredScopes(modules, config.feishu.authType),
  };
}
export const authTools = [
  tableTool(
    'get_feishu_auth_status',
    'Inspect authorization status and missing scopes for the current user, without revealing access tokens, refresh tokens, or secrets.',
    {},
    true,
    async () => {
      const { config, clientKey, requiredScopes } = context();
      const cache = TokenCacheManager.getInstance();
      if (config.feishu.authType !== 'user')
        return {
          authType: config.feishu.authType,
          cacheDir: cache.getCacheDir(),
          requiredScopes,
        };
      const token = cache.getUserTokenInfo(clientKey);
      const grantedScopes = token?.scope.split(/\s+/).filter(Boolean) ?? [];
      return {
        authType: 'user',
        ...cache.checkUserTokenStatus(clientKey),
        expiresAt: token?.expires_at,
        refreshExpiresAt: token?.refresh_token_expires_at,
        grantedScopes,
        missingScopes: requiredScopes.filter(
          (scope) => !grantedScopes.includes(scope),
        ),
        cacheDir: cache.getCacheDir(),
      };
    },
  ),
  tableTool(
    'get_feishu_authorization_url',
    'Generate a 15-minute authorization link for the current user and enabled modules. Opening this link requires user interaction. The configured callback server must be reachable.',
    {},
    true,
    async () => {
      const { config, clientKey, userKey, requiredScopes } = context();
      if (config.feishu.authType !== 'user')
        throw new Error(
          'Reauthorization is only available with FEISHU_AUTH_TYPE=user.',
        );
      const { appId, appSecret, authBaseUrl, publicBaseUrl } = config.feishu;
      const base =
        publicBaseUrl ||
        UserContextManager.getInstance().getBaseUrl() ||
        `http://localhost:${config.server.port}`;
      const redirectUri = `${base.replace(/\/$/, '')}/callback`;
      const state = AuthUtils.encodeState(
        appId,
        appSecret,
        clientKey,
        redirectUri,
        userKey.slice(0, 4) + '…',
      );
      const url = new URL('/open-apis/authen/v1/authorize', authBaseUrl);
      url.search = new URLSearchParams({
        client_id: appId,
        redirect_uri: redirectUri,
        scope: requiredScopes.join(' '),
        state,
      }).toString();
      return {
        url: url.toString(),
        expiresIn: 900,
        redirectUri,
        scopes: requiredScopes,
      };
    },
  ),
];
