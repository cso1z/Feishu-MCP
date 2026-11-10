import type { FeatureModule } from '../FeatureModule.js';
import { MODULE_SCOPES } from '../../services/constants/feishuScopes.js';
import { registerTableTools } from '../tableTools.js';
import { bitableTools } from './tools.js';

export const bitableModule: FeatureModule = {
  id: 'bitable',
  name: '飞书多维表格',
  description: '多维表格创建、字段查询、记录筛选及批量读写',
  requiredScopes: MODULE_SCOPES.bitable,
  registerTools(server, api) {
    registerTableTools(server, api, bitableTools);
  },
};
