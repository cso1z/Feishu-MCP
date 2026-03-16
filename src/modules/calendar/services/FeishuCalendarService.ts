import { FeishuBaseApiService } from '../../../services/feishu/FeishuBaseApiService.js';
import type { AuthService } from '../../../services/feishuAuthService.js';


export class FeishuCalendarService extends FeishuBaseApiService {
  constructor(authService: AuthService) {
    super(authService);
  }
}