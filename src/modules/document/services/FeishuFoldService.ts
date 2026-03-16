import { Logger } from '../../../utils/logger.js';
import { AuthService } from '../../../services/feishuAuthService.js';
import { FeishuBaseApiService } from '../../../services/feishu/FeishuBaseApiService.js';

/**
 * 飞书文件夹与知识空间服务
 * 整合云盘文件夹（Drive）和知识空间（Wiki）的查询与创建操作
 */
export class FeishuFoldService extends FeishuBaseApiService {
  constructor(authService: AuthService) {
    super(authService);
  }

  // ─── 云盘文件夹（Drive）─────────────────────────────────────────

  /**
   * 获取当前用户根文件夹的元数据信息
   * @returns 根文件夹信息，包含 token（文件夹 Token）、id 和 user_id 字段
   */
  public async getRootFolderInfo(): Promise<any> {
    try {
      const response = await this.get('/drive/explorer/v2/root_folder/meta');
      Logger.debug('获取根文件夹信息成功:', response);
      return response;
    } catch (error) {
      this.handleApiError(error, '获取飞书根文件夹信息失败');
    }
  }

  /**
   * 获取指定文件夹内的文件和子文件夹列表
   * @param folderToken 目标文件夹的 Token
   * @param orderBy 排序字段，可选 'EditedTime'（编辑时间）、'CreatedTime'（创建时间）等，默认 'EditedTime'
   * @param direction 排序方向，'ASC' 升序 / 'DESC' 降序，默认 'DESC'
   * @returns 文件夹文件清单，包含 files 数组，每项含文件名、类型、token 等信息
   */
  public async getFolderFileList(
    folderToken: string,
    orderBy: string = 'EditedTime',
    direction: string = 'DESC'
  ): Promise<any> {
    try {
      const response = await this.get('/drive/v1/files', {
        folder_token: folderToken,
        order_by: orderBy,
        direction
      });
      Logger.debug(`获取文件夹(${folderToken})中的文件清单成功，文件数量: ${response.files?.length || 0}`);
      return response;
    } catch (error) {
      this.handleApiError(error, '获取文件夹中的文件清单失败');
    }
  }

  /**
   * 在指定文件夹下创建子文件夹
   * @param folderToken 父文件夹的 Token
   * @param name 新文件夹的名称
   * @returns 创建结果，包含新文件夹的 token 和访问 url
   */
  public async createFolder(folderToken: string, name: string): Promise<any> {
    try {
      const response = await this.post('/drive/v1/files/create_folder', { folder_token: folderToken, name });
      Logger.debug(`文件夹创建成功, token: ${response.token}, url: ${response.url}`);
      return response;
    } catch (error) {
      this.handleApiError(error, '创建文件夹失败');
    }
  }

  // ─── 知识空间（Wiki）────────────────────────────────────────────

  /**
   * 获取当前用户可见的所有知识空间列表，自动处理分页直到获取全部数据
   * @param pageSize 每次分页请求的数量，默认 20
   * @returns 知识空间对象数组，每项包含 space_id、name、description 等字段
   */
  public async getAllWikiSpacesList(pageSize: number = 20): Promise<any> {
    try {
      Logger.info(`开始获取所有知识空间列表，每页数量: ${pageSize}`);
      const endpoint = '/wiki/v2/spaces';
      let allItems: any[] = [];
      let pageToken: string | undefined = undefined;
      let hasMore = true;

      while (hasMore) {
        const params: any = { page_size: pageSize };
        if (pageToken) params.page_token = pageToken;

        Logger.debug(`请求知识空间列表，page_token: ${pageToken || 'null'}, page_size: ${pageSize}`);
        const response = await this.get(endpoint, params);

        if (response?.items) {
          allItems = [...allItems, ...response.items];
          hasMore = response.has_more || false;
          pageToken = response.page_token;
          Logger.debug(`当前页获取到 ${response.items.length} 个知识空间，累计 ${allItems.length} 个，hasMore: ${hasMore}`);
        } else {
          hasMore = false;
          Logger.warn('知识空间列表响应格式异常:', JSON.stringify(response, null, 2));
        }
      }

      Logger.info(`知识空间列表获取完成，共 ${allItems.length} 个空间`);
      return allItems;
    } catch (error) {
      this.handleApiError(error, '获取知识空间列表失败');
    }
  }

  /**
   * 获取指定知识空间下的所有子节点，自动处理分页直到获取全部数据
   * @param spaceId 知识空间 ID
   * @param parentNodeToken 父节点 Token，不传则获取根节点下的直属子节点
   * @param pageSize 每次分页请求的数量，默认 20
   * @returns 节点对象数组，每项包含 node_token、obj_token、title、obj_type 等字段
   */
  public async getAllWikiSpaceNodes(spaceId: string, parentNodeToken?: string, pageSize: number = 20): Promise<any> {
    try {
      Logger.info(`开始获取知识空间子节点列表，space_id: ${spaceId}, parent_node_token: ${parentNodeToken || 'null'}`);
      const endpoint = `/wiki/v2/spaces/${spaceId}/nodes`;
      let allItems: any[] = [];
      let pageToken: string | undefined = undefined;
      let hasMore = true;

      while (hasMore) {
        const params: any = { page_size: pageSize };
        if (parentNodeToken) params.parent_node_token = parentNodeToken;
        if (pageToken) params.page_token = pageToken;

        Logger.debug(`请求知识空间子节点列表，page_token: ${pageToken || 'null'}`);
        const response = await this.get(endpoint, params);

        if (response?.items) {
          allItems = [...allItems, ...response.items];
          hasMore = response.has_more || false;
          pageToken = response.page_token;
          Logger.debug(`当前页获取到 ${response.items.length} 个子节点，累计 ${allItems.length} 个，hasMore: ${hasMore}`);
        } else {
          hasMore = false;
          Logger.warn('知识空间子节点列表响应格式异常:', JSON.stringify(response, null, 2));
        }
      }

      Logger.info(`知识空间子节点列表获取完成，共 ${allItems.length} 个节点`);
      return allItems;
    } catch (error) {
      this.handleApiError(error, '获取知识空间子节点列表失败');
    }
  }

  /**
   * 获取指定知识空间的详细信息
   * 当 spaceId 传入 'my_library' 时，获取当前用户的"我的知识库"信息
   * @param spaceId 知识空间 ID，或传入 'my_library' 获取个人知识库
   * @param lang 语言参数，仅当 spaceId 为 'my_library' 时有效，默认 'en'
   * @returns 知识空间信息对象，包含 space_id、name、description 等字段
   */
  public async getWikiSpaceInfo(spaceId: string, lang: string = 'en'): Promise<any> {
    try {
      const params: any = {};
      if (spaceId === 'my_library') params.lang = lang;

      const response = await this.get(`/wiki/v2/spaces/${spaceId}`, params);
      Logger.debug(`获取知识空间信息成功 (space_id: ${spaceId}):`, response);
      return response?.space || response;
    } catch (error) {
      this.handleApiError(error, `获取知识空间信息失败 (space_id: ${spaceId})`);
    }
  }

  /**
   * 在知识空间中创建一个新的文档节点（类型固定为 docx）
   * @param spaceId 目标知识空间 ID
   * @param title 节点标题
   * @param parentNodeToken 父节点 Token，不传则在根目录下创建
   * @returns 创建的节点信息，包含 node_token（节点 ID）和 obj_token（关联文档 ID）
   */
  public async createWikiSpaceNode(spaceId: string, title: string, parentNodeToken?: string): Promise<any> {
    try {
      Logger.info(`开始创建知识空间节点，space_id: ${spaceId}, title: ${title}, parent_node_token: ${parentNodeToken || 'null（根节点）'}`);
      const endpoint = `/wiki/v2/spaces/${spaceId}/nodes`;
      const payload: any = { title, obj_type: 'docx', node_type: 'origin' };
      if (parentNodeToken) payload.parent_node_token = parentNodeToken;

      const response = await this.post(endpoint, payload);

      if (response?.data?.node) {
        const node = response.data.node;
        Logger.info(`知识空间节点创建成功，node_token: ${node.node_token}, obj_token: ${node.obj_token}`);
        return node;
      }

      Logger.info('知识空间节点创建成功');
      return response;
    } catch (error) {
      this.handleApiError(error, '创建知识空间节点失败');
    }
  }
}
