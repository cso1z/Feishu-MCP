import { Logger } from '../../../utils/logger.js';
import { Config } from '../../../utils/config.js';
import { AuthService } from '../../../services/feishuAuthService.js';
import { FeishuBaseApiService } from '../../../services/feishu/FeishuBaseApiService.js';

/**
 * 飞书搜索服务
 * 负责文档和知识库的搜索
 */
export class FeishuSearchService extends FeishuBaseApiService {
  constructor(authService: AuthService) {
    super(authService);
  }

  /**
   * 搜索飞书文档（Docs），支持分页轮询直到获取指定数量的结果
   * 注意：仅支持 tenant 和 user 两种认证模式
   * @param searchKey 搜索关键字
   * @param maxSize 最大返回数量；不指定时只返回第一页（约 50 条）
   * @param offset 起始偏移量，用于分页续取，默认 0
   * @returns 搜索结果对象，包含 items（文档列表）、hasMore（是否还有更多）、nextOffset（下次请求的偏移量）
   */
  public async searchDocuments(searchKey: string, maxSize?: number, offset: number = 0): Promise<any> {
    try {
      Logger.info(`开始搜索文档，关键字: ${searchKey}, maxSize: ${maxSize || '未指定'}, offset: ${offset}`);

      const endpoint = '/suite/docs-api/search/object';
      const PAGE_SIZE = 50;
      const allResults: any[] = [];
      let currentOffset = offset;
      let hasMore = true;

      while (hasMore && (maxSize === undefined || allResults.length < maxSize)) {
        const payload = {
          search_key: searchKey,
          docs_types: ['doc'],
          count: PAGE_SIZE,
          offset: currentOffset
        };

        Logger.debug(`请求搜索文档，offset: ${currentOffset}, count: ${PAGE_SIZE}`);
        const response = await this.post(endpoint, payload);
        Logger.debug('搜索响应:', JSON.stringify(response, null, 2));

        if (response?.docs_entities) {
          const resultCount = response.docs_entities.length;
          const apiHasMore = response.has_more || false;
          currentOffset += resultCount;

          if (resultCount > 0) {
            allResults.push(...response.docs_entities);
            hasMore = apiHasMore;
            if (maxSize == undefined || allResults.length >= maxSize) {
              Logger.debug(`已达到maxSize ${maxSize}，停止获取，但API还有更多: ${hasMore}`);
              break;
            }
          } else {
            hasMore = false;
          }
          Logger.debug(`文档搜索进度: 已获取 ${allResults.length} 条，hasMore: ${hasMore}`);
        } else {
          Logger.warn('搜索响应格式异常:', JSON.stringify(response, null, 2));
          hasMore = false;
        }
      }

      Logger.info(`文档搜索完成，找到 ${allResults.length} 个结果${maxSize ? `(maxSize: ${maxSize})` : ''}`);
      return { items: allResults, hasMore, nextOffset: currentOffset };
    } catch (error) {
      this.handleApiError(error, '搜索文档失败');
      throw error;
    }
  }

  /**
   * 搜索飞书知识库（Wiki）节点，支持分页轮询直到获取指定数量的结果
   * 注意：Wiki 搜索需要 user 认证，tenant 模式下不可用
   * @param query 搜索关键字
   * @param maxSize 最大返回数量；不指定时只返回第一页（约 20 条）
   * @param pageToken 分页 Token，用于续取下一页，从上次返回的 pageToken 传入
   * @returns 搜索结果对象，包含 items（节点列表）、hasMore、pageToken（下次请求用）、count（本次数量）
   */
  public async searchWikiNodes(query: string, maxSize?: number, pageToken?: string): Promise<any> {
    try {
      Logger.info(`开始搜索知识库，关键字: ${query}, maxSize: ${maxSize || '未指定'}, pageToken: ${pageToken || '无'}`);

      const endpoint = '/wiki/v1/nodes/search';
      const PAGE_SIZE = 20;
      const allResults: any[] = [];
      let currentPageToken = pageToken;
      let hasMore = true;

      while (hasMore && (maxSize === undefined || allResults.length < maxSize)) {
        const size = Math.min(PAGE_SIZE, 100);
        let url = `${endpoint}?page_size=${size}`;
        if (currentPageToken) url += `&page_token=${currentPageToken}`;

        const payload = { query };
        Logger.debug(`请求搜索知识库，pageSize: ${size}, pageToken: ${currentPageToken || '无'}`);
        const response = await this.post(url, payload);
        Logger.debug('知识库搜索响应:', JSON.stringify(response, null, 2));

        if (response?.items) {
          const resultCount = response.items?.length || 0;
          const apiHasMore = response.has_more || false;
          currentPageToken = response.page_token || null;

          if (resultCount > 0) {
            allResults.push(...response.items);
            hasMore = apiHasMore;
            if (maxSize !== undefined) {
              if (allResults.length >= maxSize) {
                Logger.debug(`已达到maxSize ${maxSize}，停止获取，但API还有更多: ${hasMore}`);
                break;
              }
            } else {
              break;
            }
          } else {
            hasMore = false;
          }
          Logger.debug(`知识库搜索进度: 已获取 ${allResults.length} 条，hasMore: ${hasMore}`);
        } else {
          Logger.warn('知识库搜索响应格式异常:', JSON.stringify(response, null, 2));
          hasMore = false;
        }
      }

      Logger.info(`知识库搜索完成，找到 ${allResults.length} 个结果${maxSize ? `(maxSize: ${maxSize})` : ''}`);
      return { items: allResults, hasMore, pageToken: currentPageToken, count: allResults.length };
    } catch (error) {
      this.handleApiError(error, '搜索知识库失败');
      throw error;
    }
  }

  /**
   * 统一搜索入口，可同时搜索文档和知识库节点
   * 当 authType 为 tenant 时，wiki 搜索不可用，会自动降级为 document 搜索
   * 单次调用最多返回 100 条合并结果（文档 + Wiki）
   * @param searchKey 搜索关键字
   * @param searchType 搜索范围：'document' 仅搜文档，'wiki' 仅搜知识库，'both' 同时搜索，默认 'both'
   * @param offset 文档搜索的起始偏移量，用于分页续取，默认 0
   * @param pageToken 知识库搜索的分页 Token，用于续取下一页
   * @returns 搜索结果对象，包含 documents（文档列表）、wikis（知识库节点列表）和 paginationGuide（分页指导）
   */
  public async search(
    searchKey: string,
    searchType: 'document' | 'wiki' | 'both' = 'both',
    offset?: number,
    pageToken?: string
  ): Promise<any> {
    try {
      if (Config.getInstance().feishu.authType === 'tenant' && (searchType === 'wiki' || searchType === 'both')) {
        Logger.info(`租户认证模式下wiki搜索不支持，强制将searchType从 ${searchType} 修改为 document`);
        searchType = 'document';
      }

      const MAX_TOTAL_RESULTS = 100;
      const docOffset = offset ?? 0;
      Logger.info(`开始统一搜索，关键字: ${searchKey}, 类型: ${searchType}, offset: ${docOffset}, pageToken: ${pageToken || '无'}`);

      const documents: any[] = [];
      const wikis: any[] = [];
      let documentOffset = docOffset;
      let wikiPageToken: string | null = null;
      let documentHasMore = false;
      let wikiHasMore = false;

      if (searchType === 'document' || searchType === 'both') {
        const docResult = await this.searchDocuments(searchKey, MAX_TOTAL_RESULTS, docOffset);
        if (docResult.items?.length > 0) {
          documents.push(...docResult.items);
          documentOffset = docResult.nextOffset;
          documentHasMore = docResult.hasMore;
          Logger.debug(`文档搜索: 获取 ${docResult.items.length} 条，新offset: ${documentOffset}, hasMore: ${documentHasMore}`);
        } else {
          documentHasMore = false;
          Logger.debug('文档搜索: 无结果');
        }
      }

      if (searchType === 'wiki' || searchType === 'both') {
        const remainingCount = MAX_TOTAL_RESULTS - documents.length;
        if (remainingCount > 0) {
          const wikiResult = await this.searchWikiNodes(searchKey, remainingCount, pageToken);
          if (wikiResult.items?.length > 0) {
            wikis.push(...wikiResult.items);
            wikiPageToken = wikiResult.pageToken;
            wikiHasMore = wikiResult.hasMore;
            Logger.debug(`知识库搜索: 获取 ${wikiResult.items.length} 条，pageToken: ${wikiPageToken || '无'}, hasMore: ${wikiHasMore}`);
          } else {
            wikiHasMore = false;
            Logger.debug('知识库搜索: 无结果');
          }
        } else {
          Logger.info(`已达到总限制 ${MAX_TOTAL_RESULTS} 条，不再获取知识库`);
          wikiHasMore = true;
        }
      }

      const paginationGuide = this.generatePaginationGuide(searchType, documentHasMore, wikiHasMore, documentOffset, wikiPageToken);
      const total = documents.length + wikis.length;
      const hasMore = documentHasMore || wikiHasMore;
      Logger.info(`统一搜索完成，文档: ${documents.length} 条, 知识库: ${wikis.length} 条, 总计: ${total} 条, hasMore: ${hasMore}`);

      const result: any = { paginationGuide };
      if (searchType === 'document' || searchType === 'both') result.documents = documents;
      if (searchType === 'wiki' || searchType === 'both') result.wikis = wikis;
      return result;
    } catch (error) {
      this.handleApiError(error, '统一搜索失败');
      throw error;
    }
  }

  private generatePaginationGuide(
    searchType: 'document' | 'wiki' | 'both',
    documentHasMore: boolean,
    wikiHasMore: boolean,
    documentOffset: number,
    wikiPageToken: string | null
  ): any {
    const guide: any = { hasMore: documentHasMore || wikiHasMore, description: '' };

    if (!guide.hasMore) {
      guide.description = '没有更多结果了';
      return guide;
    }

    if (searchType === 'document') {
      if (documentHasMore) {
        guide.nextPageParams = { searchType: 'document', offset: documentOffset };
        guide.description = `请使用 search_feishu_documents工具获取下一页,searchType = document offset=${documentOffset} 获取文档的下一页`;
      }
    } else if (searchType === 'wiki') {
      if (wikiHasMore && wikiPageToken) {
        guide.nextPageParams = { searchType: 'wiki', pageToken: wikiPageToken };
        guide.description = `请使用 search_feishu_documents工具获取下一页,searchType = wiki pageToken="${wikiPageToken}" 获取知识库的下一页`;
      }
    } else if (searchType === 'both') {
      if (documentHasMore) {
        guide.nextPageParams = { searchType: 'both', offset: documentOffset };
        guide.description = `请使用 search_feishu_documents工具获取下一页,searchType = both offset=${documentOffset} 获取文档的下一页`;
      } else if (wikiHasMore && wikiPageToken) {
        guide.nextPageParams = { searchType: 'wiki', pageToken: wikiPageToken };
        guide.description = `请使用 search_feishu_documents工具获取下一页,searchType = wiki pageToken="${wikiPageToken}" 获取知识库的下一页wiki结果`;
      }
    }

    return guide;
  }
}
