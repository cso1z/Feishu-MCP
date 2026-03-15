import { FeishuBaseApiService } from '../../../services/feishu/FeishuBaseApiService';
import type { AuthService } from '../../../services/feishuAuthService';


export class FeishuCalendarService extends FeishuBaseApiService {
  constructor(authService: AuthService) {
    super(authService);
  }
}