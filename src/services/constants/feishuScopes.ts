/**
 * 飞书应用所需权限 scope 列表
 * 与 FEISHU_CONFIG.md 保持一致
 */
export const TENANT_SCOPES = [
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
  "wiki:wiki:readonly"
];

export const USER_ONLY_SCOPES = [
  "search:docs:read",
  "offline_access"
];

export function getRequiredScopes(authType: 'tenant' | 'user'): string[] {
  return authType === 'tenant' ? TENANT_SCOPES : [...TENANT_SCOPES, ...USER_ONLY_SCOPES];
}
