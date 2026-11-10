import type { FeatureModule } from '../FeatureModule.js';
import { MODULE_SCOPES } from '../../services/constants/feishuScopes.js';
import { registerTableTools } from '../tableTools.js';
import { authTools } from './tools.js';
export const authModule: FeatureModule = {
  id: 'auth',
  name: '授权状态',
  description: '检查授权与重新授权链接',
  requiredScopes: MODULE_SCOPES.auth,
  registerTools(server, api) {
    registerTableTools(server, api, authTools);
  },
};
