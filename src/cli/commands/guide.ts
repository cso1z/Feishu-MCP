import { openBrowser } from './auth.js';

const GUIDE_URL = 'https://github.com/cso1z/Feishu-MCP/blob/cli/FEISHU_CONFIG.md';

// 各模块的权限说明（摘要，完整列表见 FEISHU_CONFIG.md）
const MODULE_SCOPE_DESC: Record<string, { authTypes: string; desc: string }> = {
  document: { authTypes: 'tenant + user', desc: '文档读写、云盘、白板、知识库相关权限' },
  task:     { authTypes: 'user only',     desc: 'task:task:write' },
  member:   { authTypes: 'user only',     desc: 'contact:user.base:readonly 等联系人权限' },
};

/** 飞书 MCP 配置指南 */
export function handleGuide(): void {
  const authType   = (process.env.FEISHU_AUTH_TYPE ?? 'tenant') as 'tenant' | 'user';
  const rawModules = process.env.FEISHU_ENABLED_MODULES ?? 'document';
  const enabledModules = rawModules.split(',').map(s => s.trim()).filter(Boolean);
  const allModules = enabledModules.includes('all') ? Object.keys(MODULE_SCOPE_DESC) : enabledModules;
  const port = process.env.PORT ?? '3333';

  const guide = {
    title: '飞书 MCP 配置指南',
    detailedGuide: GUIDE_URL,
    tip: `完整配置说明（含截图）请查阅：${GUIDE_URL}，已自动在浏览器打开，也可将此链接提供给用户手动访问`,
    currentConfig: { authType, enabledModules },
    steps: [
      {
        step: 1,
        title: '创建飞书应用，获取 App ID 和 App Secret',
        actions: [
          '访问飞书开放平台：https://open.feishu.cn/app',
          '点击「创建企业自建应用」',
          '进入应用详情 → 凭证与基础信息 → 获取 App ID 和 App Secret',
        ],
        commands: [
          'feishu-tool config set FEISHU_APP_ID <your-app-id>',
          'feishu-tool config set FEISHU_APP_SECRET <your-app-secret>',
        ],
      },
      {
        step: 2,
        title: '申请应用权限',
        note: `按需添加，仅需为已启用模块申请权限，完整 scopes 列表见：${GUIDE_URL}`,
        enabledModules: allModules
          .filter(m => m in MODULE_SCOPE_DESC)
          .map(m => ({ module: m, ...MODULE_SCOPE_DESC[m] })),
      },
      ...(authType === 'user' ? [{
        step: 3,
        title: '配置 OAuth 回调地址',
        actions: [
          `飞书开放平台 → 安全设置 → 重定向 URL → 添加：http://localhost:${port}/callback`,
        ],
      }] : []),
      {
        step: authType === 'user' ? 4 : 3,
        title: '发布应用版本',
        actions: ['可用范围选择「全部员工」', '提交审批，等待管理员通过'],
      },
      {
        step: authType === 'user' ? 5 : 4,
        title: '验证配置',
        commands: [
          'feishu-tool config                           # 查看当前配置',
          'feishu-tool auth                             # 查看 token 状态',
          "feishu-tool get_feishu_root_folder_info '{}' # 测试接口连通性",
        ],
      },
    ],
  };

  process.stdout.write(JSON.stringify(guide, null, 2) + '\n');
  openBrowser(GUIDE_URL);
}