import axios from 'axios';
import { Config } from '../utils/config.js';
import { Logger } from '../utils/logger.js';

export class AuthService {
  public config = Config.getInstance();

  // 获取用户信息
  public async getUserInfo(access_token: string): Promise<any> {
    Logger.warn('[AuthService] getUserInfo called');
    try {
      const response = await axios.get(
        'https://open.feishu.cn/open-apis/authen/v1/user_info',
        { headers: { Authorization: `Bearer ${access_token}` } }
      );
      Logger.debug('[AuthService] getUserInfo response', response.data);
      return response.data;
    } catch (error) {
      Logger.error('[AuthService] getUserInfo error', error);
      throw error;
    }
  }

  // 通过授权码换取user_access_token
  public async getUserTokenByCode({ client_id, client_secret, code, redirect_uri, code_verifier }: {
    client_id: string;
    client_secret: string;
    code: string;
    redirect_uri: string;
    code_verifier?: string;
  }) {
    Logger.warn('[AuthService] getUserTokenByCode called', { client_id, code, redirect_uri });
    const body: any = {
      grant_type: 'authorization_code',
      client_id,
      client_secret,
      code,
      redirect_uri
    };
    if (code_verifier) body.code_verifier = code_verifier;
    Logger.debug('[AuthService] getUserTokenByCode request', body);
    const response = await fetch('https://open.feishu.cn/open-apis/authen/v2/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    Logger.debug('[AuthService] getUserTokenByCode response', data);
    return data;
  }
}