import type { FeatureModule } from '../FeatureModule.js';
import { MODULE_SCOPES } from '../../services/constants/feishuScopes.js';
import { registerTaskTools } from './tools/taskTools.js';

export const taskModule: FeatureModule = {
  id: 'task',
  name: '飞书任务',
  description: '飞书任务查询、创建、更新、删除功能',
  requiredScopes: MODULE_SCOPES.task,
  registerTools(server, apiService) {
    registerTaskTools(server, apiService);
  },
};
