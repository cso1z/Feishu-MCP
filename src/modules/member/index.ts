import type { FeatureModule } from '../FeatureModule.js';
import { MODULE_SCOPES } from '../../services/constants/feishuScopes.js';
import { registerMemberTools } from './tools/memberTools.js';

export const memberModule: FeatureModule = {
  id: 'member',
  name: '飞书成员',
  description: '通过用户名关键词搜索用户，返回头像、部门、open_id 等，用于任务指派（1 个工具）',
  requiredScopes: MODULE_SCOPES.member,
  registerTools(server, apiService) {
    registerMemberTools(server, apiService);
  },
};
