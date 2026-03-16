import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { Logger } from '../../../utils/logger.js';
import { ParamUtils } from '../../../utils/paramUtils.js';
import { AuthService } from '../../../services/feishuAuthService.js';
import { BlockFactory } from './blockFactory.js';
import { FeishuBaseApiService } from '../../../services/feishu/FeishuBaseApiService.js';

/**
 * 飞书块服务
 * 负责文档块的增删改查及图片块的完整操作
 */
export class FeishuBlockService extends FeishuBaseApiService {
  private readonly blockFactory: BlockFactory = BlockFactory.getInstance();

  constructor(authService: AuthService) {
    super(authService);
  }

  /**
   * 更新块的文本内容，支持普通文本和行内公式混排
   * @param documentId 文档 ID 或 URL
   * @param blockId 目标块的 ID
   * @param textElements 文本元素数组，每个元素可包含 text（普通文本）或 equation（LaTeX 公式），
   *                     以及可选的 style 样式（bold、italic、underline 等）
   * @returns 更新后的块信息
   */
  public async updateBlockTextContent(
    documentId: string,
    blockId: string,
    textElements: Array<{ text?: string; equation?: string; style?: any }>
  ): Promise<any> {
    try {
      const docId = ParamUtils.processDocumentId(documentId);
      const endpoint = `/docx/v1/documents/${docId}/blocks/${blockId}?document_revision_id=-1`;
      Logger.debug(`准备请求API端点: ${endpoint}`);

      const elements = textElements.map(item => {
        if (item.equation !== undefined) {
          return { equation: { content: item.equation, text_element_style: BlockFactory.applyDefaultTextStyle(item.style) } };
        }
        return { text_run: { content: item.text || '', text_element_style: BlockFactory.applyDefaultTextStyle(item.style) } };
      });

      const data = { update_text_elements: { elements } };
      Logger.debug(`请求数据: ${JSON.stringify(data, null, 2)}`);
      return await this.patch(endpoint, data);
    } catch (error) {
      this.handleApiError(error, '更新块文本内容失败');
      return null;
    }
  }

  /**
   * 批量更新多个块的文本内容（一次 API 调用）
   * @param documentId 文档 ID 或 URL
   * @param updates 更新项数组，每项包含 blockId 和 textElements
   * @returns 更新结果
   */
  public async batchUpdateBlocksTextContent(
    documentId: string,
    updates: Array<{ blockId: string; textElements: Array<{ text?: string; equation?: string; style?: any }> }>
  ): Promise<any> {
    const docId = ParamUtils.processDocumentId(documentId);
    const endpoint = `/docx/v1/documents/${docId}/blocks/batch_update?document_revision_id=-1`;

    const requests = updates.map(({ blockId, textElements }) => ({
      block_id: blockId,
      update_text_elements: {
        elements: textElements.map(item =>
          item.equation !== undefined
            ? { equation: { content: item.equation, text_element_style: BlockFactory.applyDefaultTextStyle(item.style) } }
            : { text_run: { content: item.text || '', text_element_style: BlockFactory.applyDefaultTextStyle(item.style) } }
        ),
      },
    }));

    Logger.debug(`批量更新块文本请求数据: ${JSON.stringify({ requests }, null, 2)}`);
    return await this.patch(endpoint, { requests });
  }

  /**
   * 在指定父块下创建单个子块
   * @param documentId 文档 ID 或 URL
   * @param parentBlockId 父块 ID，子块将插入到该块的子节点列表中
   * @param blockContent 块内容对象，使用 BlockFactory 或 createBlockContent 生成
   * @param index 插入位置的索引，0 表示插入到第一个子节点，默认 0
   * @returns 创建结果，包含新块的 block_id、block_type 等信息
   */
  private async createDocumentBlock(documentId: string, parentBlockId: string, blockContent: any, index: number = 0): Promise<any> {
    try {
      const normalizedDocId = ParamUtils.processDocumentId(documentId);
      const endpoint = `/docx/v1/documents/${normalizedDocId}/blocks/${parentBlockId}/children?document_revision_id=-1`;
      Logger.debug(`准备请求API端点: ${endpoint}`);
      const payload = { children: [blockContent], index };
      Logger.debug(`请求数据: ${JSON.stringify(payload, null, 2)}`);
      return await this.post(endpoint, payload);
    } catch (error) {
      this.handleApiError(error, '创建文档块失败');
      return null;
    }
  }

  /**
   * 在指定父块下批量创建多个子块，一次 API 调用插入全部内容
   * @param documentId 文档 ID 或 URL
   * @param parentBlockId 父块 ID
   * @param blockContents 块内容对象数组，按顺序插入
   * @param index 起始插入位置的索引，默认 0
   * @returns 创建结果，包含各新块的 block_id 等信息
   */
  public async createDocumentBlocks(documentId: string, parentBlockId: string, blockContents: any[], index: number = 0): Promise<any> {
    try {
      const normalizedDocId = ParamUtils.processDocumentId(documentId);
      const endpoint = `/docx/v1/documents/${normalizedDocId}/blocks/${parentBlockId}/children?document_revision_id=-1`;
      Logger.debug(`准备请求API端点: ${endpoint}`);
      const payload = { children: blockContents, index };
      Logger.debug(`请求数据: ${JSON.stringify(payload, null, 2)}`);
      return await this.post(endpoint, payload);
    } catch (error) {
      this.handleApiError(error, '批量创建文档块失败');
      return null;
    }
  }

  /**
   * 创建表格块，支持自定义单元格内容
   * 使用 descendant API 一次性创建表格及所有子块，并返回图片单元格的 blockId 映射
   * @param documentId 文档 ID 或 URL
   * @param parentBlockId 父块 ID
   * @param tableConfig 表格配置
   * @param tableConfig.columnSize 表格列数
   * @param tableConfig.rowSize 表格行数
   * @param tableConfig.cells 单元格内容配置，每项指定坐标（row/column）和内容（blockType/options）
   * @param index 插入位置索引，默认 0
   * @returns 创建结果，额外附加 imageTokens 字段，包含图片单元格的坐标与 blockId 映射
   */
  public async createTableBlock(
    documentId: string,
    parentBlockId: string,
    tableConfig: {
      columnSize: number;
      rowSize: number;
      cells?: Array<{
        coordinate: { row: number; column: number };
        content: any;
      }>;
    },
    index: number = 0
  ): Promise<any> {
    const normalizedDocId = ParamUtils.processDocumentId(documentId);
    const endpoint = `/docx/v1/documents/${normalizedDocId}/blocks/${parentBlockId}/descendant?document_revision_id=-1`;

    const processedTableConfig = {
      ...tableConfig,
      cells: tableConfig.cells?.map(cell => ({
        ...cell,
        content: this.blockFactory.createBlockContentFromOptions(cell.content.blockType, cell.content.options)
      }))
    };

    const tableStructure = this.blockFactory.createTableBlock(processedTableConfig);
    const payload = { children_id: tableStructure.children_id, descendants: tableStructure.descendants, index };

    Logger.info(`请求创建表格块: ${tableConfig.rowSize}x${tableConfig.columnSize}，单元格数量: ${tableConfig.cells?.length || 0}`);
    const response = await this.post(endpoint, payload);

    const imageTokens = await this.extractImageTokensFromTable(response, tableStructure.imageBlocks);
    return { ...response, imageTokens };
  }

  private async extractImageTokensFromTable(
    tableResponse: any,
    cells?: Array<{ coordinate: { row: number; column: number }; localBlockId: string }>
  ): Promise<Array<{ row: number; column: number; blockId: string }>> {
    try {
      const imageTokens: Array<{ row: number; column: number; blockId: string }> = [];

      Logger.info(`tableResponse: ${JSON.stringify(tableResponse)}`);

      if (!cells || cells.length === 0) {
        Logger.info('表格中没有图片单元格，跳过图片块信息提取');
        return imageTokens;
      }

      const blockIdMap = new Map<string, string>();
      if (tableResponse?.block_id_relations) {
        for (const relation of tableResponse.block_id_relations) {
          blockIdMap.set(relation.temporary_block_id, relation.block_id);
        }
        Logger.debug(`创建了 ${blockIdMap.size} 个块ID映射关系`);
      }

      for (const cell of cells) {
        const { coordinate, localBlockId } = cell;
        const blockId = blockIdMap.get(localBlockId);
        if (!blockId) {
          Logger.warn(`未找到 localBlockId ${localBlockId} 对应的 block_id`);
          continue;
        }
        imageTokens.push({ row: coordinate.row, column: coordinate.column, blockId });
        Logger.info(`提取到图片块信息: 位置(${coordinate.row}, ${coordinate.column})，blockId: ${blockId}`);
      }

      Logger.info(`成功提取 ${imageTokens.length} 个图片块信息`);
      return imageTokens;
    } catch (error) {
      Logger.error(`提取表格图片块信息失败: ${error}`);
      return [];
    }
  }

  /**
   * 批量删除指定父块下的连续子块（按索引范围）
   * @param documentId 文档 ID 或 URL
   * @param parentBlockId 父块 ID
   * @param startIndex 起始索引（含），必须 >= 0
   * @param endIndex 结束索引（含），必须 >= startIndex
   * @returns 操作结果
   */
  public async deleteDocumentBlocks(
    documentId: string,
    parentBlockId: string,
    startIndex: number,
    endIndex: number
  ): Promise<any> {
    try {
      const normalizedDocId = ParamUtils.processDocumentId(documentId);
      const endpoint = `/docx/v1/documents/${normalizedDocId}/blocks/${parentBlockId}/children/batch_delete`;

      if (startIndex < 0 || endIndex < startIndex) {
        throw new Error('无效的索引范围：起始索引必须大于等于0，结束索引必须大于等于起始索引');
      }

      Logger.info(`开始删除文档块，文档ID: ${normalizedDocId}，父块ID: ${parentBlockId}，索引范围: ${startIndex}-${endIndex}`);
      const response = await this.delete(endpoint, { start_index: startIndex, end_index: endIndex });
      Logger.info('文档块删除成功');
      return response;
    } catch (error) {
      this.handleApiError(error, '删除文档块失败');
    }
  }

  /**
   * 根据块类型字符串和选项对象创建块内容对象
   * 委托给 BlockFactory.createBlockContentFromOptions 完成实际转换
   * @param blockType 块类型字符串，如 'text'、'code'、'heading1'～'heading9'、'list'、'image' 等
   * @param options 块配置选项对象，结构因 blockType 而异
   * @returns 可传入 createDocumentBlock / createDocumentBlocks 的块内容对象，失败时返回 null
   */
  public createBlockContent(blockType: string, options: any): any {
    return this.blockFactory.createBlockContentFromOptions(blockType, options);
  }

  /**
   * 获取当前服务持有的 BlockFactory 实例
   * @returns BlockFactory 单例实例
   */
  public getBlockFactory(): BlockFactory {
    return this.blockFactory;
  }

  // ─── 图片块操作 ───────────────────────────────────────────────────

  /**
   * 下载飞书云文档中的图片素材，返回二进制数据
   * @param mediaId 图片的媒体 ID（media_id / file_token）
   * @param extra 额外参数，部分场景需要传递（如加密图片），默认为空字符串
   * @returns 图片的二进制 Buffer 数据
   */
  public async getImageResource(mediaId: string, extra: string = ''): Promise<Buffer> {
    try {
      Logger.info(`开始获取图片资源，媒体ID: ${mediaId}`);

      if (!mediaId) throw new Error('媒体ID不能为空');

      const endpoint = `/drive/v1/medias/${mediaId}/download`;
      const params: any = {};
      if (extra) params.extra = extra;

      const response = await this.request<ArrayBuffer>(endpoint, 'GET', params, true, {}, 'arraybuffer');
      const imageBuffer = Buffer.from(response);
      Logger.info(`图片资源获取成功，大小: ${imageBuffer.length} 字节`);
      return imageBuffer;
    } catch (error) {
      this.handleApiError(error, '获取图片资源失败');
      return Buffer.from([]);
    }
  }

  /**
   * 将图片素材上传到飞书云端，关联到指定的图片块
   * @param imageBase64 图片的 Base64 编码字符串（不含 data:image/xxx;base64, 前缀）
   * @param fileName 图片文件名（含扩展名），若为空字符串则根据 Base64 内容自动检测格式并生成文件名
   * @param parentBlockId 关联的图片块 ID（parent_node），用于告知飞书该素材归属的块
   * @returns 上传结果，包含 file_token 字段，用于后续 setImageBlockContent 调用
   */
  public async uploadImageMedia(imageBase64: string, fileName: string, parentBlockId: string): Promise<any> {
    try {
      const endpoint = '/drive/v1/medias/upload_all';
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      const imageSize = imageBuffer.length;

      if (!fileName) {
        if (imageBase64.startsWith('/9j/')) {
          fileName = `image_${Date.now()}.jpg`;
        } else if (imageBase64.startsWith('iVBORw0KGgo')) {
          fileName = `image_${Date.now()}.png`;
        } else if (imageBase64.startsWith('R0lGODlh')) {
          fileName = `image_${Date.now()}.gif`;
        } else {
          fileName = `image_${Date.now()}.png`;
        }
      }

      Logger.info(`开始上传图片素材，文件名: ${fileName}，大小: ${imageSize} 字节，关联块ID: ${parentBlockId}`);

      if (imageSize > 20 * 1024 * 1024) {
        Logger.warn(`图片文件过大: ${imageSize} 字节，建议小于20MB`);
      }

      const formData = new FormData();
      formData.append('file', imageBuffer, {
        filename: fileName,
        contentType: this.getMimeTypeFromFileName(fileName),
        knownLength: imageSize
      });
      formData.append('file_name', fileName);
      formData.append('parent_type', 'docx_image');
      formData.append('parent_node', parentBlockId);
      formData.append('size', imageSize.toString());

      const response = await this.post(endpoint, formData);
      Logger.info(`图片素材上传成功，file_token: ${response.file_token}`);
      return response;
    } catch (error) {
      this.handleApiError(error, '上传图片素材失败');
    }
  }

  /**
   * 将已上传的图片素材绑定到指定的图片块，完成图片块的最终渲染
   * @param documentId 文档 ID 或 URL
   * @param imageBlockId 目标图片块的 block_id
   * @param fileToken 图片素材的 file_token（由 uploadImageMedia 返回）
   * @returns 更新结果，包含 document_revision_id 等字段
   */
  public async setImageBlockContent(documentId: string, imageBlockId: string, fileToken: string): Promise<any> {
    try {
      const normalizedDocId = ParamUtils.processDocumentId(documentId);
      const endpoint = `/docx/v1/documents/${normalizedDocId}/blocks/${imageBlockId}`;
      const payload = { replace_image: { token: fileToken } };

      Logger.info(`开始设置图片块内容，文档ID: ${normalizedDocId}，块ID: ${imageBlockId}，file_token: ${fileToken}`);
      const response = await this.patch(endpoint, payload);
      Logger.info('图片块内容设置成功');
      return response;
    } catch (error) {
      this.handleApiError(error, '设置图片块内容失败');
    }
  }

  /**
   * 完整创建图片块的三步流程：创建空块 → 上传素材 → 绑定素材
   * 支持本地文件路径和 HTTP/HTTPS URL 两种图片来源
   * @param documentId 文档 ID 或 URL
   * @param parentBlockId 父块 ID，图片块将插入到该块的子节点列表中
   * @param imagePathOrUrl 图片来源，支持本地绝对路径或 HTTP/HTTPS URL
   * @param options 可选配置
   * @param options.fileName 自定义文件名（含扩展名），不传则从路径/URL 自动提取
   * @param options.width 图片显示宽度（像素），不传则使用默认值
   * @param options.height 图片显示高度（像素），不传则使用默认值
   * @param options.index 插入位置索引，默认 0
   * @returns 综合结果对象，包含 imageBlockId、fileToken、imageBlock、uploadResult、setContentResult、documentRevisionId
   */
  public async createImageBlock(
    documentId: string,
    parentBlockId: string,
    imagePathOrUrl: string,
    options: { fileName?: string; width?: number; height?: number; index?: number } = {}
  ): Promise<any> {
    try {
      const { fileName: providedFileName, width, height, index = 0 } = options;

      Logger.info(`开始创建图片块，文档ID: ${documentId}，父块ID: ${parentBlockId}，图片源: ${imagePathOrUrl}，插入位置: ${index}`);

      const { base64: imageBase64, fileName: detectedFileName } = await this.getImageBase64FromPathOrUrl(imagePathOrUrl);
      const finalFileName = providedFileName || detectedFileName;

      Logger.info('第1步：创建空图片块');
      const imageBlockContent = this.blockFactory.createImageBlock({ width, height });
      const createBlockResult = await this.createDocumentBlock(documentId, parentBlockId, imageBlockContent, index);

      if (!createBlockResult?.children?.[0]?.block_id) {
        throw new Error('创建空图片块失败：无法获取块ID');
      }

      const imageBlockId = createBlockResult.children[0].block_id;
      Logger.info(`空图片块创建成功，块ID: ${imageBlockId}`);

      Logger.info('第2步：上传图片素材');
      const uploadResult = await this.uploadImageMedia(imageBase64, finalFileName, imageBlockId);

      if (!uploadResult?.file_token) {
        throw new Error('上传图片素材失败：无法获取file_token');
      }

      Logger.info(`图片素材上传成功，file_token: ${uploadResult.file_token}`);

      Logger.info('第3步：设置图片块内容');
      const setContentResult = await this.setImageBlockContent(documentId, imageBlockId, uploadResult.file_token);

      Logger.info('图片块创建完成');
      return {
        imageBlock: createBlockResult.children[0],
        imageBlockId,
        fileToken: uploadResult.file_token,
        uploadResult,
        setContentResult,
        documentRevisionId: setContentResult.document_revision_id || createBlockResult.document_revision_id
      };
    } catch (error) {
      this.handleApiError(error, '创建图片块失败');
    }
  }

  private getMimeTypeFromFileName(fileName: string): string {
    const extension = fileName.toLowerCase().split('.').pop();
    switch (extension) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'bmp':
        return 'image/bmp';
      case 'svg':
        return 'image/svg+xml';
      default:
        return 'image/png';
    }
  }

  public async getImageBase64FromPathOrUrl(imagePathOrUrl: string): Promise<{ base64: string; fileName: string }> {
    try {
      let imageBuffer: Buffer;
      let fileName: string;

      if (imagePathOrUrl.startsWith('http://') || imagePathOrUrl.startsWith('https://')) {
        Logger.info(`从URL获取图片: ${imagePathOrUrl}`);
        const response = await axios.get(imagePathOrUrl, { responseType: 'arraybuffer', timeout: 30000 });
        imageBuffer = Buffer.from(response.data);
        const urlPath = new URL(imagePathOrUrl).pathname;
        fileName = path.basename(urlPath) || `image_${Date.now()}.png`;
        Logger.info(`从URL成功获取图片，大小: ${imageBuffer.length} 字节，文件名: ${fileName}`);
      } else {
        Logger.info(`从本地路径读取图片: ${imagePathOrUrl}`);
        if (!fs.existsSync(imagePathOrUrl)) {
          throw new Error(`图片文件不存在: ${imagePathOrUrl}`);
        }
        imageBuffer = fs.readFileSync(imagePathOrUrl);
        fileName = path.basename(imagePathOrUrl);
        Logger.info(`从本地路径成功读取图片，大小: ${imageBuffer.length} 字节，文件名: ${fileName}`);
      }

      return { base64: imageBuffer.toString('base64'), fileName };
    } catch (error) {
      Logger.error(`获取图片失败: ${error}`);
      throw new Error(`获取图片失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
