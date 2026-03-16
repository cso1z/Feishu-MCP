import { AuthService } from './feishuAuthService.js';
import { BlockFactory } from '../modules/document/services/blockFactory.js';
import { FeishuDocumentService } from '../modules/document/services/FeishuDocumentService.js';
import { FeishuBlockService } from '../modules/document/services/FeishuBlockService.js';
import { FeishuFoldService } from '../modules/document/services/FeishuFoldService.js';
import { FeishuSearchService } from '../modules/document/services/FeishuSearchService.js';
import { FeishuWhiteboardService } from '../modules/document/services/FeishuWhiteboardService.js';
import {
  FeishuTaskService,
  type CreateTaskParams,
  type RootNestedCreateItem,
  type CreatedTaskResult,
  type UpdateTaskParams,
  type TaskMember,
  type TaskMemberRemoveItem,
} from '../modules/task/services/FeishuTaskService.js';
import { FeishuCalendarService } from '../modules/calendar/services/FeishuCalendarService.js';
import { FeishuMemberService } from '../modules/member/services/FeishuMemberService.js';

/**
 * 飞书 API 服务门面（Facade）
 *
 * 统一对外入口，持有并编排各领域服务实例。
 * 所有 public 方法均委托给对应的领域服务，本类不直接发起 HTTP 请求。
 * 采用单例模式，通过 {@link getInstance} 获取实例。
 *
 * 领域服务对应关系：
 * - 文档操作              → {@link FeishuDocumentService}
 * - 块/图片操作           → {@link FeishuBlockService}
 * - 文件夹/知识空间操作  → {@link FeishuFoldService}
 * - 搜索                 → {@link FeishuSearchService}
 * - 画板                 → {@link FeishuWhiteboardService}
 * - 任务                 → {@link FeishuTaskService}
 * - 日历                 → {@link FeishuCalendarService}
 * - 成员/通讯录          → {@link FeishuMemberService}
 */
export class FeishuApiService {
  private static instance: FeishuApiService;

  private constructor(
    private readonly documentService: FeishuDocumentService,
    private readonly blockService: FeishuBlockService,
    private readonly foldService: FeishuFoldService,
    private readonly searchService: FeishuSearchService,
    private readonly whiteboardService: FeishuWhiteboardService,
    private readonly taskService: FeishuTaskService,
    private readonly calendarService: FeishuCalendarService,
    private readonly memberService: FeishuMemberService,
  ) {}

  /** 组装所有领域服务并返回 FeishuApiService 新实例 */
  private static createInstance(): FeishuApiService {
    const authService = new AuthService();

    const documentService = new FeishuDocumentService(authService);
    const blockService = new FeishuBlockService(authService);
    const foldService = new FeishuFoldService(authService);
    const searchService = new FeishuSearchService(authService);
    const whiteboardService = new FeishuWhiteboardService(authService);
    const taskService = new FeishuTaskService(authService);
    const calendarService = new FeishuCalendarService(authService);
    const memberService = new FeishuMemberService(authService);

    return new FeishuApiService(
      documentService,
      blockService,
      foldService,
      searchService,
      whiteboardService,
      taskService,
      calendarService,
      memberService,
    );
  }

  /**
   * 获取 FeishuApiService 单例
   * @returns 全局唯一的 FeishuApiService 实例
   */
  public static getInstance(): FeishuApiService {
    if (!FeishuApiService.instance) {
      FeishuApiService.instance = FeishuApiService.createInstance();
    }
    return FeishuApiService.instance;
  }

  // ─── 文档服务委托 ─────────────────────────────────────────────────

  /**
   * 创建飞书文档
   * @see FeishuDocumentService.createDocument
   */
  public async createDocument(title: string, folderToken: string): Promise<any> {
    return this.documentService.createDocument(title, folderToken);
  }

  /**
   * 获取文档信息，支持普通文档和 Wiki 文档
   * @see FeishuDocumentService.getDocumentInfo
   */
  public async getDocumentInfo(documentId: string, documentType?: 'document' | 'wiki'): Promise<any> {
    return this.documentService.getDocumentInfo(documentId, documentType);
  }

  /**
   * 获取文档的纯文本内容
   * @see FeishuDocumentService.getDocumentContent
   */
  public async getDocumentContent(documentId: string, lang: number = 0): Promise<string> {
    return this.documentService.getDocumentContent(documentId, lang);
  }

  /**
   * 获取文档的所有块结构（自动分页）
   * @see FeishuDocumentService.getDocumentBlocks
   */
  public async getDocumentBlocks(documentId: string, pageSize: number = 500): Promise<any[]> {
    return this.documentService.getDocumentBlocks(documentId, pageSize);
  }

  // ─── 块服务委托 ───────────────────────────────────────────────────

  /**
   * 更新块的文本内容，支持普通文本与行内公式混排
   * @see FeishuBlockService.updateBlockTextContent
   */
  public async updateBlockTextContent(
    documentId: string,
    blockId: string,
    textElements: Array<{ text?: string; equation?: string; style?: any }>
  ): Promise<any> {
    return this.blockService.updateBlockTextContent(documentId, blockId, textElements);
  }

  /**
   * 批量更新多个块的文本内容（一次 API 调用）
   * @see FeishuBlockService.batchUpdateBlocksTextContent
   */
  public async batchUpdateBlocksTextContent(
    documentId: string,
    updates: Array<{ blockId: string; textElements: Array<{ text?: string; equation?: string; style?: any }> }>
  ): Promise<any> {
    return this.blockService.batchUpdateBlocksTextContent(documentId, updates);
  }

  /**
   * 在指定父块下批量创建多个子块
   * @see FeishuBlockService.createDocumentBlocks
   */
  public async createDocumentBlocks(documentId: string, parentBlockId: string, blockContents: any[], index: number = 0): Promise<any> {
    return this.blockService.createDocumentBlocks(documentId, parentBlockId, blockContents, index);
  }

  /**
   * 创建表格块，支持自定义单元格内容
   * @see FeishuBlockService.createTableBlock
   */
  public async createTableBlock(
    documentId: string,
    parentBlockId: string,
    tableConfig: {
      columnSize: number;
      rowSize: number;
      cells?: Array<{ coordinate: { row: number; column: number }; content: any }>;
    },
    index: number = 0
  ): Promise<any> {
    return this.blockService.createTableBlock(documentId, parentBlockId, tableConfig, index);
  }

  /**
   * 批量删除指定父块下的连续子块（按索引范围）
   * @see FeishuBlockService.deleteDocumentBlocks
   */
  public async deleteDocumentBlocks(
    documentId: string,
    parentBlockId: string,
    startIndex: number,
    endIndex: number
  ): Promise<any> {
    return this.blockService.deleteDocumentBlocks(documentId, parentBlockId, startIndex, endIndex);
  }

  /**
   * 根据块类型字符串和选项对象创建块内容对象
   * @see FeishuBlockService.createBlockContent
   */
  public createBlockContent(blockType: string, options: any): any {
    return this.blockService.createBlockContent(blockType, options);
  }

  /**
   * 获取 BlockFactory 单例实例
   * @see FeishuBlockService.getBlockFactory
   */
  public getBlockFactory(): BlockFactory {
    return this.blockService.getBlockFactory();
  }

  // ─── 文件夹 / 知识空间服务委托 ───────────────────────────────────

  /**
   * 获取当前用户根文件夹的元数据信息
   * @see FeishuFoldService.getRootFolderInfo
   */
  public async getRootFolderInfo(): Promise<any> {
    return this.foldService.getRootFolderInfo();
  }

  /**
   * 获取指定文件夹内的文件和子文件夹列表
   * @see FeishuFoldService.getFolderFileList
   */
  public async getFolderFileList(folderToken: string, orderBy: string = 'EditedTime', direction: string = 'DESC'): Promise<any> {
    return this.foldService.getFolderFileList(folderToken, orderBy, direction);
  }

  /**
   * 在指定文件夹下创建子文件夹
   * @see FeishuFoldService.createFolder
   */
  public async createFolder(folderToken: string, name: string): Promise<any> {
    return this.foldService.createFolder(folderToken, name);
  }

  /**
   * 获取所有知识空间列表（自动分页）
   * @see FeishuFoldService.getAllWikiSpacesList
   */
  public async getAllWikiSpacesList(pageSize: number = 20): Promise<any> {
    return this.foldService.getAllWikiSpacesList(pageSize);
  }

  /**
   * 获取指定知识空间下的所有子节点（自动分页）
   * @see FeishuFoldService.getAllWikiSpaceNodes
   */
  public async getAllWikiSpaceNodes(spaceId: string, parentNodeToken?: string, pageSize: number = 20): Promise<any> {
    return this.foldService.getAllWikiSpaceNodes(spaceId, parentNodeToken, pageSize);
  }

  /**
   * 获取指定知识空间的详细信息
   * @see FeishuFoldService.getWikiSpaceInfo
   */
  public async getWikiSpaceInfo(spaceId: string, lang: string = 'en'): Promise<any> {
    return this.foldService.getWikiSpaceInfo(spaceId, lang);
  }

  /**
   * 在知识空间中创建文档节点
   * @see FeishuFoldService.createWikiSpaceNode
   */
  public async createWikiSpaceNode(spaceId: string, title: string, parentNodeToken?: string): Promise<any> {
    return this.foldService.createWikiSpaceNode(spaceId, title, parentNodeToken);
  }

  // ─── Search 服务委托 ──────────────────────────────────────────────

  /**
   * 搜索飞书文档，支持分页
   * @see FeishuSearchService.searchDocuments
   */
  public async searchDocuments(searchKey: string, maxSize?: number, offset: number = 0): Promise<any> {
    return this.searchService.searchDocuments(searchKey, maxSize, offset);
  }

  /**
   * 搜索飞书知识库节点，支持分页
   * @see FeishuSearchService.searchWikiNodes
   */
  public async searchWikiNodes(query: string, maxSize?: number, pageToken?: string): Promise<any> {
    return this.searchService.searchWikiNodes(query, maxSize, pageToken);
  }

  /**
   * 统一搜索入口，可同时搜索文档和知识库节点
   * @see FeishuSearchService.search
   */
  public async search(
    searchKey: string,
    searchType: 'document' | 'wiki' | 'both' = 'both',
    offset?: number,
    pageToken?: string
  ): Promise<any> {
    return this.searchService.search(searchKey, searchType, offset, pageToken);
  }

  // ─── 图片块操作委托 ───────────────────────────────────────────────

  /**
   * 将本地路径或远程 URL 的图片转换为 Base64 及文件名
   * @see FeishuBlockService.getImageBase64FromPathOrUrl
   */
  public async getImageBase64FromPathOrUrl(imagePathOrUrl: string): Promise<{ base64: string; fileName: string }> {
    return this.blockService.getImageBase64FromPathOrUrl(imagePathOrUrl);
  }

  /**
   * 下载飞书图片素材，返回二进制数据
   * @see FeishuBlockService.getImageResource
   */
  public async getImageResource(mediaId: string, extra: string = ''): Promise<Buffer> {
    return this.blockService.getImageResource(mediaId, extra);
  }

  /**
   * 将图片素材上传到飞书云端
   * @see FeishuBlockService.uploadImageMedia
   */
  public async uploadImageMedia(imageBase64: string, fileName: string, parentBlockId: string): Promise<any> {
    return this.blockService.uploadImageMedia(imageBase64, fileName, parentBlockId);
  }

  /**
   * 将已上传的图片素材绑定到指定图片块
   * @see FeishuBlockService.setImageBlockContent
   */
  public async setImageBlockContent(documentId: string, imageBlockId: string, fileToken: string): Promise<any> {
    return this.blockService.setImageBlockContent(documentId, imageBlockId, fileToken);
  }

  /**
   * 完整创建图片块（创建空块 → 上传素材 → 绑定），支持本地路径和 URL
   * @see FeishuBlockService.createImageBlock
   */
  public async createImageBlock(
    documentId: string,
    parentBlockId: string,
    imagePathOrUrl: string,
    options: { fileName?: string; width?: number; height?: number; index?: number } = {}
  ): Promise<any> {
    return this.blockService.createImageBlock(documentId, parentBlockId, imagePathOrUrl, options);
  }

  // ─── Whiteboard 服务委托 ──────────────────────────────────────────

  /**
   * 获取画板的所有节点内容
   * @see FeishuWhiteboardService.getWhiteboardContent
   */
  public async getWhiteboardContent(whiteboardId: string): Promise<any> {
    return this.whiteboardService.getWhiteboardContent(whiteboardId);
  }

  /**
   * 获取画板缩略图，返回二进制数据
   * @see FeishuWhiteboardService.getWhiteboardThumbnail
   */
  public async getWhiteboardThumbnail(whiteboardId: string): Promise<Buffer> {
    return this.whiteboardService.getWhiteboardThumbnail(whiteboardId);
  }

  /**
   * 在画板中创建图表节点（支持 PlantUML / Mermaid）
   * @see FeishuWhiteboardService.createDiagramNode
   */
  public async createDiagramNode(whiteboardId: string, code: string, syntaxType: number): Promise<any> {
    return this.whiteboardService.createDiagramNode(whiteboardId, code, syntaxType);
  }

  // ─── 任务服务委托 ─────────────────────────────────────────────────

  /** @see FeishuTaskService.createTask */
  public async createTask(params: CreateTaskParams): Promise<any> {
    return this.taskService.createTask(params);
  }

  /** @see FeishuTaskService.createTasksNested. Supports multi-level subTasks. */
  public async createTasksNested(
    rootItems: RootNestedCreateItem[],
    options?: { maxDepth?: number },
  ): Promise<{ results: CreatedTaskResult[]; errors: { path: string; error: string }[] }> {
    return this.taskService.createTasksNested(rootItems, options);
  }

  /** @see FeishuTaskService.updateTask */
  public async updateTask(taskGuid: string, params: UpdateTaskParams): Promise<any> {
    return this.taskService.updateTask(taskGuid, params);
  }

  /** @see FeishuTaskService.addTaskMembers */
  public async addTaskMembers(taskGuid: string, members: TaskMember[]): Promise<any> {
    return this.taskService.addTaskMembers(taskGuid, members);
  }

  /** @see FeishuTaskService.removeTaskMembers */
  public async removeTaskMembers(taskGuid: string, members: TaskMemberRemoveItem[]): Promise<any> {
    return this.taskService.removeTaskMembers(taskGuid, members);
  }

  /** @see FeishuTaskService.addTaskReminder. Task must have due; only one reminder per task. */
  public async addTaskReminder(taskGuid: string, relativeFireMinute: number): Promise<any> {
    return this.taskService.addTaskReminder(taskGuid, relativeFireMinute);
  }

  /** @see FeishuTaskService.removeTaskReminders */
  public async removeTaskReminders(taskGuid: string, reminderIds: string[]): Promise<any> {
    return this.taskService.removeTaskReminders(taskGuid, reminderIds);
  }

  /** @see FeishuTaskService.listTasksTwoPages. Lists "my_tasks" (我负责的), 2 pages (up to 100 items), slimmed fields. Requires user token. */
  public async listTasks(pageToken?: string, completed?: boolean): Promise<{ items: any[]; page_token?: string; has_more: boolean }> {
    return this.taskService.listTasksTwoPages(pageToken, completed);
  }

  /** @see FeishuTaskService.deleteTask */
  public async deleteTask(taskGuid: string): Promise<void> {
    return this.taskService.deleteTask(taskGuid);
  }

  /** 批量删除任务。逐条调用 deleteTask，返回已删除的 guid 与每项错误。 */
  public async deleteTasks(taskGuids: string[]): Promise<{ deleted: string[]; errors: { taskGuid: string; error: string }[] }> {
    const deleted: string[] = [];
    const errors: { taskGuid: string; error: string }[] = [];
    for (const guid of taskGuids) {
      try {
        await this.taskService.deleteTask(guid);
        deleted.push(guid);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ taskGuid: guid, error: msg });
      }
    }
    return { deleted, errors };
  }

  // ─── 日历服务委托 ─────────────────────────────────────────────────

  /** @see FeishuCalendarService - 供 calendarTools 等调用 */
  public getCalendarService(): FeishuCalendarService {
    return this.calendarService;
  }

  // ─── 成员搜索服务委托 ──────────────────────────────────────────────

  /** @see FeishuMemberService.searchUsers */
  public async searchUsers(query: string, pageToken?: string): Promise<any> {
    return this.memberService.searchUsers(query, pageToken);
  }

  /** @see FeishuMemberService.batchGetUsers */
  public async getUsersBatch(
    userIds: string[],
    userIdType: 'open_id' | 'union_id' | 'user_id' = 'open_id',
  ): Promise<{ items: any[] }> {
    return this.memberService.batchGetUsers(userIds, userIdType);
  }
}
