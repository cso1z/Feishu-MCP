import type { FeatureModule } from '../FeatureModule.js';
import { MODULE_SCOPES } from '../../services/constants/feishuScopes.js';
import { registerTableTools } from '../tableTools.js';
import { transferTools } from './tools.js';
export const transferModule: FeatureModule = {
  id: 'transfer',
  name: '表格文件导入导出',
  description: 'CSV/Excel 与飞书表格互转',
  requiredScopes: MODULE_SCOPES.transfer,
  registerTools(server, api) {
    registerTableTools(server, api, transferTools);
  },
};
