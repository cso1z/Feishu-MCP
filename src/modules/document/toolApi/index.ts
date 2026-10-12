export {
  createDocument,
  importMarkdownToFeishuDocument,
  getDocumentInfo,
  getDocumentBlocks,
  searchDocuments,
} from './documentToolApi.js';
export type {
  CreateDocumentParams,
  ImportMarkdownToFeishuDocumentParams,
  GetDocumentInfoParams,
  SearchDocumentsParams,
} from './documentToolApi.js';

export {
  batchUpdateBlockText,
  batchCreateBlocks,
  deleteDocumentBlocks,
  getImageResource,
  uploadAndBindImageToBlock,
  createTable,
  getWhiteboardContent,
  fillWhiteboardWithPlantuml,
} from './blockToolApi.js';
export type {
  BatchUpdateBlockTextParams,
  BatchCreateBlocksParams,
  DeleteDocumentBlocksParams,
  UploadAndBindImageParams,
  CreateTableParams,
  GetWhiteboardContentResult,
  FillWhiteboardParams,
} from './blockToolApi.js';

export {
  getRootFolderInfo,
  getFolderFiles,
  createFolder,
} from './folderToolApi.js';
export type {
  GetFolderFilesParams,
  CreateFolderParams,
} from './folderToolApi.js';
