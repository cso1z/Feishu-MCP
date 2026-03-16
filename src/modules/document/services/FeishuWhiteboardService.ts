import { Logger } from '../../../utils/logger.js';
import { ParamUtils } from '../../../utils/paramUtils.js';
import { AuthService } from '../../../services/feishuAuthService.js';
import { FeishuBaseApiService } from '../../../services/feishu/FeishuBaseApiService.js';

/**
 * 飞书画板（Whiteboard）服务
 */
export class FeishuWhiteboardService extends FeishuBaseApiService {
  constructor(authService: AuthService) {
    super(authService);
  }

  /**
   * 获取画板的所有节点内容
   * @param whiteboardId 画板 ID、Token 或包含画板 ID 的 URL
   * @returns 画板节点数据，包含 nodes 数组，每项含节点 ID、类型、位置等信息
   */
  public async getWhiteboardContent(whiteboardId: string): Promise<any> {
    try {
      const normalizedWhiteboardId = ParamUtils.processWhiteboardId(whiteboardId);
      const endpoint = `/board/v1/whiteboards/${normalizedWhiteboardId}/nodes`;

      Logger.info(`开始获取画板内容，画板ID: ${normalizedWhiteboardId}`);
      const response = await this.get(endpoint);
      Logger.info(`画板内容获取成功，节点数量: ${response.nodes?.length || 0}`);
      return response;
    } catch (error) {
      this.handleApiError(error, '获取画板内容失败');
    }
  }

  /**
   * 获取画板的缩略图，以二进制数据返回
   * @param whiteboardId 画板 ID、Token 或包含画板 ID 的 URL
   * @returns 缩略图的二进制 Buffer 数据（PNG 格式）
   */
  public async getWhiteboardThumbnail(whiteboardId: string): Promise<Buffer> {
    try {
      const normalizedWhiteboardId = ParamUtils.processWhiteboardId(whiteboardId);
      const endpoint = `/board/v1/whiteboards/${normalizedWhiteboardId}/download_as_image`;

      Logger.info(`开始获取画板缩略图，画板ID: ${normalizedWhiteboardId}`);
      const response = await this.request<ArrayBuffer>(endpoint, 'GET', {}, true, {}, 'arraybuffer');
      const thumbnailBuffer = Buffer.from(response);
      Logger.info(`画板缩略图获取成功，大小: ${thumbnailBuffer.length} 字节`);
      return thumbnailBuffer;
    } catch (error) {
      this.handleApiError(error, '获取画板缩略图失败');
      return Buffer.from([]);
    }
  }

  /**
   * 在画板中创建图表节点，支持 PlantUML 和 Mermaid 两种语法
   * 注意：style_type 固定为 1（画板样式），会解析为多个画板节点
   * @param whiteboardId 画板 ID、Token 或包含画板 ID 的 URL
   * @param code 图表代码，PlantUML 或 Mermaid 语法字符串
   * @param syntaxType 语法类型，1 = PlantUML，2 = Mermaid
   * @returns 创建的图表节点信息
   */
  public async createDiagramNode(whiteboardId: string, code: string, syntaxType: number): Promise<any> {
    try {
      const normalizedWhiteboardId = ParamUtils.processWhiteboardId(whiteboardId);
      const endpoint = `/board/v1/whiteboards/${normalizedWhiteboardId}/nodes/plantuml`;

      const syntaxTypeName = syntaxType === 1 ? 'PlantUML' : 'Mermaid';
      Logger.info(`开始在画板中创建 ${syntaxTypeName} 节点，画板ID: ${normalizedWhiteboardId}`);
      Logger.debug(`${syntaxTypeName} 代码: ${code.substring(0, 200)}...`);

      const payload = {
        plant_uml_code: code,
        style_type: 1,
        syntax_type: syntaxType
      };

      Logger.debug(`请求载荷: ${JSON.stringify(payload, null, 2)}`);
      const response = await this.post(endpoint, payload);
      Logger.info(`${syntaxTypeName} 节点创建成功`);
      return response;
    } catch (error) {
      const syntaxTypeName = syntaxType === 1 ? 'PlantUML' : 'Mermaid';
      Logger.error(`创建 ${syntaxTypeName} 节点失败，画板ID: ${whiteboardId}`, error);
      this.handleApiError(error, `创建 ${syntaxTypeName} 节点失败`);
    }
  }
}
