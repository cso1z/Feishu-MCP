/**
 * 飞书各功能模块所需权限 Scope 定义
 * 按模块拆分，通过 getRequiredScopes 动态计算最小权限集
 */
export const MODULE_SCOPES: Record<string, { tenant: string[]; userOnly: string[] }> = {
  document: {
    tenant: [
      "docx:document.block:convert",
      "base:app:read",
      "bitable:app",
      "bitable:app:readonly",
      "board:whiteboard:node:create",
      "board:whiteboard:node:read",
      "contact:user.employee_id:readonly",
      "docs:document.content:read",
      "docx:document",
      "docx:document:create",
      "docx:document:readonly",
      "drive:drive",
      "drive:drive:readonly",
      "drive:file",
      "drive:file:upload",
      "sheets:spreadsheet",
      "sheets:spreadsheet:readonly",
      "space:document:retrieve",
      "space:folder:create",
      "wiki:space:read",
      "wiki:space:retrieve",
      "wiki:wiki",
      "wiki:wiki:readonly",
    ],
    userOnly: [
      "search:docs:read",
      "offline_access",
    ],
  },
  task: {
    tenant: [
      "task:task:write",
    ],
    userOnly: [],
  },
  calendar: {
    tenant: [],
    userOnly: [],
  },
  member: {
    tenant: [
      // 调用批量获取用户信息 API 所需（任选其一即可）
      "contact:contact.base:readonly",
      // 字段权限：返回完整用户信息
      // "contact:user.assign_info:read",
      "contact:user.base:readonly",
      // "contact:user.department:readonly",
      // "contact:user.department_path:readonly",
      // "contact:user.dotted_line_leader_info.read",
      // "contact:user.employee:readonly",
      // "contact:user.employee_id:readonly",
      // "contact:user.employee_number:read",
      // "contact:user.gender:readonly",
      // "contact:user.user_geo",
      // "contact:user.phone:readonly",
      // "contact:user.email:readonly",
      // "contact:user.job_family:readonly",
      // "contact:user.job_level:readonly",
    ],
    userOnly: [
      "contact:user:search",
      "contact:contact.base:readonly",
      "contact:user.employee_id:readonly",
    ],
  },
};

/**
 * 根据已启用模块和认证类型，计算所需的最小 Scope 集合
 * @param enabledModules 已启用的模块 ID 列表（含 'all' 则返回全量）
 * @param authType 认证类型
 */
export function getRequiredScopes(
  enabledModules: string[],
  authType: 'tenant' | 'user'
): string[] {
  const moduleIds = enabledModules.includes('all')
    ? Object.keys(MODULE_SCOPES)
    : enabledModules;

  const scopes = new Set<string>();
  for (const moduleId of moduleIds) {
    const moduleScopes = MODULE_SCOPES[moduleId];
    if (!moduleScopes) continue;
    moduleScopes.tenant.forEach(s => scopes.add(s));
    if (authType === 'user') {
      moduleScopes.userOnly.forEach(s => scopes.add(s));
    }
  }
  return Array.from(scopes);
}