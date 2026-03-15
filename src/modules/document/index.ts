import type { FeatureModule } from '../FeatureModule.js';
import { MODULE_SCOPES } from '../../services/constants/feishuScopes.js';
import { registerDocumentTools } from './tools/documentTools.js';
import { registerBlockTools } from './tools/blockTools.js';
import { registerFolderTools } from './tools/folderTools.js';

export const documentModule: FeatureModule = {
  id: 'document',
  name: '飞书文档',
  description: '飞书文档、块操作、文件夹和知识库管理',
  requiredScopes: MODULE_SCOPES.document,
  registerTools(server, apiService) {
    registerDocumentTools(server, apiService);
    registerBlockTools(server, apiService);
    registerFolderTools(server, apiService);
  },
};
