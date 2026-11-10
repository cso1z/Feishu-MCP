import type { FeatureModule } from '../FeatureModule.js';
import { MODULE_SCOPES } from '../../services/constants/feishuScopes.js';
import { registerTableTools } from '../tableTools.js';
import { sheetsTools } from './tools.js';

export const sheetsModule: FeatureModule = {
  id: 'sheets',
  name: '飞书电子表格',
  description: '电子表格创建、工作表管理、单元格及公式读写',
  requiredScopes: MODULE_SCOPES.sheets,
  registerTools(server, api) {
    registerTableTools(server, api, sheetsTools);
  },
};
