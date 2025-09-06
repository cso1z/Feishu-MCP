import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { formatErrorMessage } from '../../utils/error.js';
import { FeishuApiService } from '../../services/feishuApiService.js';
import { Logger } from '../../utils/logger.js';
import { detectMimeType } from '../../utils/document.js';
import {
  DocumentIdSchema,
  ParentBlockIdSchema,
  BlockIdSchema,
  IndexSchema,
  StartIndexSchema,
  EndIndexSchema,
  // AlignSchema,
  // AlignSchemaWithValidation,
  TextElementsArraySchema,
  // CodeLanguageSchema,
  // CodeWrapSchema,
  BlockConfigSchema,
  MediaIdSchema,
  MediaExtraSchema,
  ImagesArraySchema,
  // ImageWidthSchema,
  // ImageHeightSchema
} from '../../types/feishuSchema.js';

/**
 * 注册飞书块相关的MCP工具
 * @param server MCP服务器实例
 * @param feishuService 飞书API服务实例
 */
export function registerFeishuBlockTools(server: McpServer, feishuService: FeishuApiService | null): void {
  // 添加更新块文本内容工具
  server.tool(
    'update_feishu_block_text',
    'Updates the text content and styling of a specific block in a Feishu document. Can be used to modify content in existing text, code, or heading blocks while preserving the block type and other properties. Note: For Feishu wiki links (https://xxx.feishu.cn/wiki/xxx) you must first use convert_feishu_wiki_to_document_id tool to obtain a compatible document ID.',
    {
      documentId: DocumentIdSchema,
      blockId: BlockIdSchema,
      textElements: TextElementsArraySchema,
    },
    async ({ documentId, blockId, textElements }) => {
      try {
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: '飞书服务未初始化，请检查配置' }],
          };
        }

        Logger.info(`开始更新飞书块文本内容，文档ID: ${documentId}，块ID: ${blockId}`);
        const result = await feishuService.updateBlockTextContent(documentId, blockId, textElements);
        Logger.info(`飞书块文本内容更新成功`);

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        Logger.error(`更新飞书块文本内容失败:`, error);
        const errorMessage = formatErrorMessage(error);
        return {
          content: [{ type: 'text', text: `更新飞书块文本内容失败: ${errorMessage}` }],
        };
      }
    },
  );

  // 添加通用飞书块创建工具（支持文本、代码、标题）
  server.tool(
    'batch_create_feishu_blocks',
    'PREFERRED: Efficiently creates multiple blocks (text, code, heading, list) in a single API call. USE THIS TOOL when creating multiple consecutive blocks at the same position - reduces API calls by up to 90%. KEY FEATURES: (1) Handles any number of blocks by auto-batching large requests (>50 blocks), (2) Creates blocks at consecutive positions in a document, (3) Supports direct heading level format (e.g. "heading1", "heading2") or standard "heading" type with level in options. CORRECT FORMAT: mcp_feishu_batch_create_feishu_blocks({documentId:"doc123",parentBlockId:"para123",startIndex:0,blocks:[{blockType:"text",options:{...}},{blockType:"heading1",options:{heading:{content:"Title"}}}]}). For separate positions, use individual block creation tools instead. For wiki links (https://xxx.feishu.cn/wiki/xxx), first convert with convert_feishu_wiki_to_document_id tool.',
    {
      documentId: DocumentIdSchema,
      parentBlockId: ParentBlockIdSchema,
      index: IndexSchema,
      blocks: z.array(BlockConfigSchema).describe('Array of block configurations. CRITICAL: Must be a JSON array object, NOT a string. CORRECT: blocks:[{...}] - WITHOUT quotes around array. INCORRECT: blocks:"[{...}]". Example: [{blockType:"text",options:{text:{textStyles:[{text:"Hello",style:{bold:true}}]}}},{blockType:"heading1",options:{heading:{content:"My Title"}}}]. Auto-batches requests when exceeding 50 blocks.'),
    },
    async ({ documentId, parentBlockId, index = 0, blocks }) => {
      try {
        if (!feishuService) {
          return {
            content: [
              {
                type: 'text',
                text: 'Feishu service is not initialized. Please check the configuration',
              },
            ],
          };
        }

        // 类型检查：确保blocks是数组而不是字符串
        if (typeof blocks === 'string') {
          return {
            content: [
              {
                type: 'text',
                text: 'ERROR: The "blocks" parameter was passed as a string instead of an array. Please provide a proper JSON array without quotes. Example: {blocks:[{blockType:"text",options:{...}}]} instead of {blocks:"[{...}]"}',
              },
            ],
          };
        }

        // 如果块数量不超过50，直接调用一次API
        if (blocks.length <= 50) {
          Logger.info(
            `开始批量创建飞书块，文档ID: ${documentId}，父块ID: ${parentBlockId}，块数量: ${blocks.length}，起始插入位置: ${index}`);

          // 准备要创建的块内容数组
          const blockContents = [];

          // 处理每个块配置
          for (const blockConfig of blocks) {
            const { blockType, options = {} } = blockConfig;
            
            // 创建块内容
            try {
              const blockContent = feishuService.createBlockContent(blockType, options);

              if (blockContent) {
                blockContents.push(blockContent);
                Logger.info(`已准备${blockType}块，内容: ${JSON.stringify(blockContent).substring(0, 100)}...`);
              } else {
                Logger.warn(`创建${blockType}块失败，跳过此块`);
              }
            } catch (error) {
              Logger.error(`处理块类型${blockType}时出错: ${error}`);
              return {
                content: [{ 
                  type: 'text', 
                  text: `处理块类型"${blockType}"时出错: ${error}\n请检查该块类型的配置是否正确。`
                }],
              };
            }
          }

          // 批量创建所有块
          const result = await feishuService.createDocumentBlocks(documentId, parentBlockId, blockContents, index);
          Logger.info(`飞书块批量创建成功，共创建 ${blockContents.length} 个块`);

          // 检查是否有图片块（block_type=27）
          const imageBlocks = result.children?.filter((child: any) => child.block_type === 27) || [];
          const hasImageBlocks = imageBlocks.length > 0;

          const responseData = {
            ...result,
            nextIndex: index + blockContents.length,
            totalBlocksCreated: blockContents.length,
            ...(hasImageBlocks && {
              imageBlocksInfo: {
                count: imageBlocks.length,
                blockIds: imageBlocks.map((block: any) => block.block_id),
                reminder: "检测到图片块已创建！请使用 upload_and_bind_image_to_block 工具上传图片并绑定到对应的块ID。"
              }
            })
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(responseData, null, 2) }],
          };
        } else {
          // 如果块数量超过50，需要分批处理
          Logger.info(
            `块数量(${blocks.length})超过50，将分批创建`);

          const batchSize = 50; // 每批最大50个
          const totalBatches = Math.ceil(blocks.length / batchSize);
          const results = [];
          let currentStartIndex = index;
          let createdBlocksCount = 0;
          let allBatchesSuccess = true;

          // 分批创建块
          for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
            const batchStart = batchNum * batchSize;
            const batchEnd = Math.min((batchNum + 1) * batchSize, blocks.length);
            const currentBatch = blocks.slice(batchStart, batchEnd);
            
            Logger.info(
              `处理第 ${batchNum + 1}/${totalBatches} 批，起始位置: ${currentStartIndex}，块数量: ${currentBatch.length}`);
            
            try {
              // 准备当前批次的块内容
              const batchBlockContents = [];
              for (const blockConfig of currentBatch) {
                const { blockType, options = {} } = blockConfig;
                try {
                  const blockContent = feishuService.createBlockContent(blockType, options);
                  if (blockContent) {
                    batchBlockContents.push(blockContent);
                  } else {
                    Logger.warn(`创建${blockType}块失败，跳过此块`);
                  }
                } catch (error) {
                  Logger.error(`处理块类型${blockType}时出错: ${error}`);
                  return {
                    content: [{ 
                      type: 'text', 
                      text: `处理块类型"${blockType}"时出错: ${error}\n请检查该块类型的配置是否正确。`
                    }],
                  };
                }
              }

              // 批量创建当前批次的块
              const batchResult = await feishuService.createDocumentBlocks(
                documentId, 
                parentBlockId, 
                batchBlockContents, 
                currentStartIndex
              );

              results.push(batchResult);
              
              // 计算下一批的起始位置（当前位置+已创建块数量）
              // 注意：每批成功创建后，需要将起始索引更新为当前索引 + 已创建块数量
              createdBlocksCount += batchBlockContents.length;
              currentStartIndex = index + createdBlocksCount;
              
              Logger.info(
                `第 ${batchNum + 1}/${totalBatches} 批创建成功，当前已创建 ${createdBlocksCount} 个块`);
            } catch (error) {
              Logger.error(`第 ${batchNum + 1}/${totalBatches} 批创建失败:`, error);
              allBatchesSuccess = false;
              
              // 如果有批次失败，返回详细错误信息
              const errorMessage = formatErrorMessage(error);
              return {
                content: [
                  { 
                    type: 'text', 
                    text: `批量创建飞书块部分失败：第 ${batchNum + 1}/${totalBatches} 批处理时出错。\n\n` +
                          `已成功创建 ${createdBlocksCount} 个块，但还有 ${blocks.length - createdBlocksCount} 个块未能创建。\n\n` +
                          `错误信息: ${errorMessage}\n\n` +
                          `建议使用 get_feishu_document_blocks 工具获取文档最新状态，确认已创建的内容，然后从索引位置 ${currentStartIndex} 继续创建剩余块。`
                  }
                ],
              };
            }
          }

          if (allBatchesSuccess) {
            Logger.info(`所有批次创建成功，共创建 ${createdBlocksCount} 个块`);
            
            // 检查所有批次中是否有图片块（block_type=27）
            const allImageBlocks: any[] = [];
            results.forEach(batchResult => {
              const imageBlocks = batchResult.children?.filter((child: any) => child.block_type === 27) || [];
              allImageBlocks.push(...imageBlocks);
            });
            const hasImageBlocks = allImageBlocks.length > 0;

            const responseText = `所有飞书块创建成功，共分 ${totalBatches} 批创建了 ${createdBlocksCount} 个块。\n\n` +
                               `最后一批结果: ${JSON.stringify(results[results.length - 1], null, 2)}\n\n` +
                               `下一个索引位置: ${currentStartIndex}，总创建块数: ${createdBlocksCount}` +
                               (hasImageBlocks ? `\n\n⚠️ 检测到 ${allImageBlocks.length} 个图片块已创建！\n` +
                                `图片块IDs: ${allImageBlocks.map(block => block.block_id).join(', ')}\n` +
                                `请使用 upload_and_bind_image_to_block 工具上传图片并绑定到对应的块ID。` : '');
            
            return {
              content: [
                {
                  type: 'text',
                  text: responseText
                }
              ],
            };
          }
        }
        
        // 这个return语句是为了避免TypeScript错误，实际上代码永远不会执行到这里
        return {
          content: [{ type: 'text', text: '操作完成' }],
        };
      } catch (error) {
        Logger.error(`批量创建飞书块失败:`, error);
        const errorMessage = formatErrorMessage(error);
        return {
          content: [
            { 
              type: 'text', 
              text: `批量创建飞书块失败: ${errorMessage}\n\n` +
                    `建议使用 get_feishu_document_blocks 工具获取文档当前状态，确认是否有部分内容已创建成功。`
            }
          ],
        };
      }
    },
  );

  // 添加创建飞书文本块工具
  // server.tool(
  //   "create_feishu_text_block",
  //   "Creates a new text block with precise style control. Unlike markdown-based formatting, this tool lets you explicitly set text styles for each text segment. Ideal for formatted documents where exact styling control is needed. NOTE: If creating multiple blocks at once, use batch_create_feishu_blocks tool instead for better efficiency. Note: For Feishu wiki links (https://xxx.feishu.cn/wiki/xxx) you must first use convert_feishu_wiki_to_document_id tool to obtain a compatible document ID.",
  //   {
  //     documentId: DocumentIdSchema,
  //     parentBlockId: ParentBlockIdSchema,
  //     textContents: TextElementsArraySchema,
  //     align: AlignSchema,
  //     index: IndexSchema
  //   },
  //   async ({ documentId, parentBlockId, textContents, align = 1, index }) => {
  //     try {
  //       if (!feishuService) {
  //         return {
  //           content: [{ type: "text", text: "Feishu service is not initialized. Please check the configuration" }],
  //         };
  //       }
  //
  //       Logger.info(`开始创建飞书文本块，文档ID: ${documentId}，父块ID: ${parentBlockId}，对齐方式: ${align}，插入位置: ${index}`);
  //       const result = await feishuService.createTextBlock(documentId, parentBlockId, textContents, align, index);
  //       Logger.info(`飞书文本块创建成功`);
  //
  //       return {
  //         content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  //       };
  //     } catch (error) {
  //       Logger.error(`创建飞书文本块失败:`, error);
  //       const errorMessage = formatErrorMessage(error);
  //       return {
  //         content: [{ type: "text", text: `创建飞书文本块失败: ${errorMessage}` }],
  //       };
  //     }
  //   },
  // );
  //
  // // 添加创建飞书代码块工具
  // server.tool(
  //   "create_feishu_code_block",
  //   "Creates a new code block with syntax highlighting and formatting options. Ideal for technical documentation, tutorials, or displaying code examples with proper formatting and language-specific highlighting. NOTE: If creating multiple blocks at once, use batch_create_feishu_blocks tool instead for better efficiency. Note: For Feishu wiki links (https://xxx.feishu.cn/wiki/xxx) you must first use convert_feishu_wiki_to_document_id tool to obtain a compatible document ID.",
  //   {
  //     documentId: DocumentIdSchema,
  //     parentBlockId: ParentBlockIdSchema,
  //     code: z.string().describe("Code content (required). The complete code text to display."),
  //     language: CodeLanguageSchema,
  //     wrap: CodeWrapSchema,
  //     index: IndexSchema
  //   },
  //   async ({ documentId, parentBlockId, code, language = 1, wrap = false, index = 0 }) => {
  //     try {
  //       if (!feishuService) {
  //         return {
  //           content: [{ type: "text", text: "Feishu service is not initialized. Please check the configuration" }],
  //         };
  //       }
  //
  //       Logger.info(`开始创建飞书代码块，文档ID: ${documentId}，父块ID: ${parentBlockId}，语言: ${language}，自动换行: ${wrap}，插入位置: ${index}`);
  //       const result = await feishuService.createCodeBlock(documentId, parentBlockId, code, language, wrap, index);
  //       Logger.info(`飞书代码块创建成功`);
  //
  //       return {
  //         content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  //       };
  //     } catch (error) {
  //       Logger.error(`创建飞书代码块失败:`, error);
  //       const errorMessage = formatErrorMessage(error);
  //       return {
  //         content: [{ type: "text", text: `创建飞书代码块失败: ${errorMessage}` }],
  //       };
  //     }
  //   },
  // );
  //
  // // 添加创建飞书标题块工具
  // server.tool(
  //   "create_feishu_heading_block",
  //   "Creates a heading block with customizable level and alignment. Use this tool to add section titles, chapter headings, or any hierarchical structure elements to your document. Supports nine heading levels for different emphasis needs. NOTE: If creating multiple blocks at once, use batch_create_feishu_blocks tool instead for better efficiency. Note: For Feishu wiki links (https://xxx.feishu.cn/wiki/xxx) you must first use convert_feishu_wiki_to_document_id tool to obtain a compatible document ID.",
  //   {
  //     documentId: DocumentIdSchema,
  //     parentBlockId: ParentBlockIdSchema,
  //     level: z.number().min(1).max(9).describe("Heading level (required). Integer between 1 and 9, where 1 is the largest heading (h1) and 9 is the smallest (h9)."),
  //     content: z.string().describe("Heading text content (required). The actual text of the heading."),
  //     align: AlignSchemaWithValidation,
  //     index: IndexSchema
  //   },
  //   async ({ documentId, parentBlockId, level, content, align = 1, index = 0 }) => {
  //     try {
  //       if (!feishuService) {
  //         return {
  //           content: [{ type: "text", text: "Feishu service is not initialized. Please check the configuration" }],
  //         };
  //       }
  //
  //       // 确保align值在合法范围内（1-3）
  //       if (align !== 1 && align !== 2 && align !== 3) {
  //         return {
  //           content: [{ type: "text", text: "错误: 对齐方式(align)参数必须是1(居左)、2(居中)或3(居右)中的一个值。" }],
  //         };
  //       }
  //
  //       Logger.info(`开始创建飞书标题块，文档ID: ${documentId}，父块ID: ${parentBlockId}，标题级别: ${level}，对齐方式: ${align}，插入位置: ${index}`);
  //       const result = await feishuService.createHeadingBlock(documentId, parentBlockId, content, level, index, align);
  //       Logger.info(`飞书标题块创建成功`);
  //
  //       return {
  //         content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  //       };
  //     } catch (error) {
  //       Logger.error(`创建飞书标题块失败:`, error);
  //       const errorMessage = formatErrorMessage(error);
  //       return {
  //         content: [{ type: "text", text: `创建飞书标题块失败: ${errorMessage}` }],
  //       };
  //     }
  //   },
  // );
  //
  // // 添加创建飞书列表块工具
  // server.tool(
  //   "create_feishu_list_block",
  //   "Creates a list item block (either ordered or unordered). Perfect for creating hierarchical and structured content with bullet points or numbered lists. NOTE: If creating multiple blocks at once, use batch_create_feishu_blocks tool instead for better efficiency. Note: For Feishu wiki links (https://xxx.feishu.cn/wiki/xxx) you must first use convert_feishu_wiki_to_document_id tool to obtain a compatible document ID.",
  //   {
  //     documentId: DocumentIdSchema,
  //     parentBlockId: ParentBlockIdSchema,
  //     content: z.string().describe("List item content (required). The actual text of the list item."),
  //     isOrdered: z.boolean().optional().default(false).describe("Whether this is an ordered (numbered) list item. Default is false (bullet point/unordered)."),
  //     align: AlignSchemaWithValidation,
  //     index: IndexSchema
  //   },
  //   async ({ documentId, parentBlockId, content, isOrdered = false, align = 1, index = 0 }) => {
  //     try {
  //       if (!feishuService) {
  //         return {
  //           content: [{ type: "text", text: "Feishu service is not initialized. Please check the configuration" }],
  //         };
  //       }
  //
  //       // 确保align值在合法范围内（1-3）
  //       if (align !== 1 && align !== 2 && align !== 3) {
  //         return {
  //           content: [{ type: "text", text: "错误: 对齐方式(align)参数必须是1(居左)、2(居中)或3(居右)中的一个值。" }],
  //         };
  //       }
  //
  //       const listType = isOrdered ? "有序" : "无序";
  //       Logger.info(`开始创建飞书${listType}列表块，文档ID: ${documentId}，父块ID: ${parentBlockId}，对齐方式: ${align}，插入位置: ${index}`);
  //       const result = await feishuService.createListBlock(documentId, parentBlockId, content, isOrdered, index, align);
  //       Logger.info(`飞书${listType}列表块创建成功`);
  //
  //       return {
  //         content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  //       };
  //     } catch (error) {
  //       Logger.error(`创建飞书列表块失败:`, error);
  //       const errorMessage = formatErrorMessage(error);
  //       return {
  //         content: [{ type: "text", text: `创建飞书列表块失败: ${errorMessage}` }],
  //       };
  //     }
  //   },
  // );

  // 添加飞书Wiki文档ID转换工具
  server.tool(
    'convert_feishu_wiki_to_document_id',
    'Converts a Feishu Wiki document link to a compatible document ID. This conversion is required before using wiki links with any other Feishu document tools.',
    {
      wikiUrl: z.string().describe('Wiki URL or Token (required). Supports complete URL formats like https://xxx.feishu.cn/wiki/xxxxx or direct use of the Token portion'),
    },
    async ({ wikiUrl }) => {
      try {
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: '飞书服务未初始化，请检查配置' }],
          };
        }

        Logger.info(`开始转换Wiki文档链接，输入: ${wikiUrl}`);
        const documentId = await feishuService.convertWikiToDocumentId(wikiUrl);
        
        Logger.info(`Wiki文档转换成功，可用的文档ID为: ${documentId}`);

        return {
          content: [
            { type: 'text', text: `Converted Wiki link to Document ID: ${documentId}\n\nUse this Document ID with other Feishu document tools.` }
          ],
        };
      } catch (error) {
        Logger.error(`转换Wiki文档链接失败:`, error);
        const errorMessage = formatErrorMessage(error);
        return {
          content: [{ type: 'text', text: `转换Wiki文档链接失败: ${errorMessage}` }],
        };
      }
    },
  );

  // 添加删除文档块工具
  server.tool(
    'delete_feishu_document_blocks',
    'Deletes one or more consecutive blocks from a Feishu document. Use this tool to remove unwanted content, clean up document structure, or clear space before inserting new content. Supports batch deletion for efficiency. Note: For Feishu wiki links (https://xxx.feishu.cn/wiki/xxx) you must first use convert_feishu_wiki_to_document_id tool to obtain a compatible document ID.',
    {
      documentId: DocumentIdSchema,
      parentBlockId: ParentBlockIdSchema,
      startIndex: StartIndexSchema,
      endIndex: EndIndexSchema,
    },
    async ({ documentId, parentBlockId, startIndex, endIndex }) => {
      try {
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: 'Feishu service is not initialized. Please check the configuration' }],
          };
        }

        Logger.info(`开始删除飞书文档块，文档ID: ${documentId}，父块ID: ${parentBlockId}，索引范围: ${startIndex}-${endIndex}`);
        const result = await feishuService.deleteDocumentBlocks(documentId, parentBlockId, startIndex, endIndex);
        Logger.info(`飞书文档块删除成功，文档修订ID: ${result.document_revision_id}`);

        return {
          content: [{ type: 'text', text: `Successfully deleted blocks from index ${startIndex} to ${endIndex - 1}` }],
        };
      } catch (error) {
        Logger.error(`删除飞书文档块失败:`, error);
        const errorMessage = formatErrorMessage(error);
        return {
          content: [{ type: 'text', text: `Failed to delete document blocks: ${errorMessage}` }],
        };
      }
    },
  );

  // 添加获取图片资源工具
  server.tool(
    'get_feishu_image_resource',
    'Downloads an image resource from Feishu by its media ID. Use this to retrieve images referenced in document blocks or other Feishu resources. Returns the binary image data that can be saved or processed further. For example, extract the media_id from an image block in a document, then use this tool to download the actual image.',
    {
      mediaId: MediaIdSchema,
      extra: MediaExtraSchema,
    },
    async ({ mediaId, extra = '' }) => {
      try {
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: 'Feishu service is not initialized. Please check the configuration' }],
          };
        }

        Logger.info(`开始获取飞书图片资源，媒体ID: ${mediaId}`);
        const imageBuffer = await feishuService.getImageResource(mediaId, extra);
        Logger.info(`飞书图片资源获取成功，大小: ${imageBuffer.length} 字节`);

        // 将图片数据转为Base64编码，以便在MCP协议中传输
        const base64Image = imageBuffer.toString('base64');
        const mimeType = detectMimeType(imageBuffer);

        return {
          content: [{ 
            type: 'image', 
            mimeType: mimeType,
            data: base64Image 
          }],
        };
      } catch (error) {
        Logger.error(`获取飞书图片资源失败:`, error);
        const errorMessage = formatErrorMessage(error);
        return {
          content: [{ type: 'text', text: `Failed to get image resource: ${errorMessage}` }],
        };
      }
    },
  );

  // 添加创建飞书图片块工具
  // server.tool(
  //   'create_feishu_image_block',
  //   'Creates a complete image block in a Feishu document by uploading an image from a local path or URL and setting it to the block. This tool handles the entire 3-step process: (1) Creates an empty image block, (2) Downloads/reads the image and uploads it as media resource, (3) Sets the image content to the block. Supports local file paths and HTTP/HTTPS URLs. Use this when you want to insert images into Feishu documents. Note: For Feishu wiki links (https://xxx.feishu.cn/wiki/xxx) you must first use convert_feishu_wiki_to_document_id tool to obtain a compatible document ID.',
  //   {
  //     documentId: DocumentIdSchema,
  //     parentBlockId: ParentBlockIdSchema,
  //     imagePathOrUrl: ImagePathOrUrlSchema,
  //     fileName: ImageFileNameSchema,
  //     width: ImageWidthSchema,
  //     height: ImageHeightSchema,
  //     index: IndexSchema
  //   },
  //   async ({ documentId, parentBlockId, imagePathOrUrl, fileName, width, height, index = 0 }) => {
  //     try {
  //       if (!feishuService) {
  //         return {
  //           content: [{ type: 'text', text: 'Feishu service is not initialized. Please check the configuration' }],
  //         };
  //       }
  //
  //       Logger.info(`开始创建飞书图片块，文档ID: ${documentId}，父块ID: ${parentBlockId}，图片源: ${imagePathOrUrl}，插入位置: ${index}`);
  //
  //       const result = await feishuService.createImageBlock(documentId, parentBlockId, imagePathOrUrl, {
  //         fileName,
  //         width,
  //         height,
  //         index
  //       });
  //
  //       Logger.info(`飞书图片块创建成功，块ID: ${result.imageBlockId}`);
  //
  //       return {
  //         content: [{
  //           type: 'text',
  //           text: `图片块创建成功！\n\n块ID: ${result.imageBlockId}\n文件Token: ${result.fileToken}\n文档修订ID: ${result.documentRevisionId}\n\n完整结果:\n${JSON.stringify(result, null, 2)}`
  //         }],
  //       };
  //     } catch (error) {
  //       Logger.error(`创建飞书图片块失败:`, error);
  //       const errorMessage = formatErrorMessage(error);
  //       return {
  //         content: [{ type: 'text', text: `创建飞书图片块失败: ${errorMessage}` }],
  //       };
  //     }
  //   },
  // );

  // 添加图片上传绑定工具
  server.tool(
    'upload_and_bind_image_to_block',
    'Uploads images from local paths or URLs and binds them to existing empty image blocks. This tool is used after creating image blocks with batch_create_feishu_blocks tool. It handles uploading the image media and setting the image content to the specified block IDs. Supports local file paths and HTTP/HTTPS URLs. Each image upload and binding is processed independently, and all results are returned in order.',
    {
      documentId: DocumentIdSchema,
      images:ImagesArraySchema,
    },
    async ({ documentId, images }) => {
      try {
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: 'Feishu service is not initialized. Please check the configuration' }],
          };
        }
        const results = [];
        for (const { blockId, imagePathOrUrl, fileName } of images) {
          Logger.info(`开始上传图片并绑定到块，文档ID: ${documentId}，块ID: ${blockId}，图片源: ${imagePathOrUrl}`);
          try {
            const { base64: imageBase64, fileName: detectedFileName } = await (feishuService as any).getImageBase64FromPathOrUrl(imagePathOrUrl);
            const finalFileName = fileName || detectedFileName;
            Logger.info('第1步：上传图片素材');
            const uploadResult = await feishuService.uploadImageMedia(
              imageBase64,
              finalFileName,
              blockId,
            );
            if (!uploadResult?.file_token) {
              throw new Error('上传图片素材失败：无法获取file_token');
            }
            Logger.info(`图片素材上传成功，file_token: ${uploadResult.file_token}`);
            Logger.info('第2步：设置图片块内容');
            const setContentResult = await feishuService.setImageBlockContent(
              documentId,
              blockId,
              uploadResult.file_token,
            );
            Logger.info('图片上传并绑定完成');
            results.push({
              blockId,
              fileToken: uploadResult.file_token,
              uploadResult,
              setContentResult,
              documentRevisionId: setContentResult.document_revision_id
            });
          } catch (err) {
            Logger.error(`上传图片并绑定到块失败:`, err);
            results.push({
              blockId,
              error: err instanceof Error ? err.message : String(err)
            });
          }
        }
        return {
          content: [{ type: 'text', text: `批量图片上传绑定结果：\n${JSON.stringify(results, null, 2)}` }],
        };
      } catch (error) {
        Logger.error(`批量上传图片并绑定到块失败:`, error);
        const errorMessage = formatErrorMessage(error);
        return {
          content: [{ type: 'text', text: `批量上传图片并绑定到块失败: ${errorMessage}` }],
        };
      }
    },
  );
} 