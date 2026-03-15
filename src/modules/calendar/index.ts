import type { FeatureModule } from '../FeatureModule.js';
import { MODULE_SCOPES } from '../../services/constants/feishuScopes.js';
import { registerCalendarTools } from './tools/calendarTools.js';

export const calendarModule: FeatureModule = {
  id: 'calendar',
  name: '飞书日历',
  description: '飞书日历和日程管理',
  requiredScopes: MODULE_SCOPES.calendar,
  registerTools(server, apiService) {
    registerCalendarTools(server, apiService);
  },
};
