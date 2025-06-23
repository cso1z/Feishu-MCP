import { z } from 'zod';

// 文档ID或URL参数定义
export const DocumentIdSchema = z.string().describe(
  'Document ID or URL (required). Supports the following formats:\n' +
  '1. Standard document URL: https://xxx.feishu.cn/docs/xxx or https://xxx.feishu.cn/docx/xxx\n' +
  '2. Direct document ID: e.g., JcKbdlokYoPIe0xDzJ1cduRXnRf\n' +
  'Note: Wiki links require conversion with convert_feishu_wiki_to_document_id first.'
);

// 父块ID参数定义
export const ParentBlockIdSchema = z.string().describe(
  'Parent block ID (required). Target block ID where content will be added, without any URL prefix. ' +
  'For page-level (root level) insertion, extract and use only the document ID portion (not the full URL) as parentBlockId. ' +
  'Obtain existing block IDs using the get_feishu_document_blocks tool.'
);

// 块ID参数定义
export const BlockIdSchema = z.string().describe(
  'Block ID (required). The ID of the specific block to get content from. You can obtain block IDs using the get_feishu_document_blocks tool.'
);

// 插入位置索引参数定义
export const IndexSchema = z.number().describe(
  'Insertion position index (required). Specifies where the block should be inserted. Use 0 to insert at the beginning. ' +
  'Use get_feishu_document_blocks tool to understand document structure if unsure. ' +
  'For consecutive insertions, calculate next index as previous index + 1.'
);

// 起始插入位置索引参数定义
export const StartIndexSchema = z.number().describe(
  'Starting insertion position index (required). Specifies where the first block should be inserted. Use 0 to insert at the beginning. ' +
  'Use get_feishu_document_blocks tool to understand document structure if unsure.'
);

// 结束位置索引参数定义
export const EndIndexSchema = z.number().describe(
  'Ending position index (required). Specifies the end of the range for deletion (exclusive). ' +
  'For example, to delete blocks 2, 3, and 4, use startIndex=2, endIndex=5. ' +
  'To delete a single block at position 2, use startIndex=2, endIndex=3.'
);

// 文本对齐方式参数定义
export const AlignSchema = z.number().optional().default(1).describe(
  'Text alignment: 1 for left (default), 2 for center, 3 for right.'
);

// 文本对齐方式参数定义（带验证）
export const AlignSchemaWithValidation = z.number().optional().default(1).refine(
  val => val === 1 || val === 2 || val === 3,
  { message: "Alignment must be one of: 1 (left), 2 (center), or 3 (right)" }
).describe(
  'Text alignment (optional): 1 for left (default), 2 for center, 3 for right. Only these three values are allowed.'
);

// 文本样式属性定义
export const TextStylePropertiesSchema = {
  bold: z.boolean().optional().describe('Whether to make text bold. Default is false, equivalent to **text** in Markdown.'),
  italic: z.boolean().optional().describe('Whether to make text italic. Default is false, equivalent to *text* in Markdown.'),
  underline: z.boolean().optional().describe('Whether to add underline. Default is false.'),
  strikethrough: z.boolean().optional().describe('Whether to add strikethrough. Default is false, equivalent to ~~text~~ in Markdown.'),
  inline_code: z.boolean().optional().describe('Whether to format as inline code. Default is false, equivalent to `code` in Markdown.'),
  text_color: z.number().optional().refine(val => !val || (val >= 0 && val <= 7), {
    message: "Text color must be between 0 and 7 inclusive"
  }).describe('Text color value. Default is 0 (black). Available values are only: 1 (gray), 2 (brown), 3 (orange), 4 (yellow), 5 (green), 6 (blue), 7 (purple). Values outside this range will cause an error.'),
  background_color: z.number().optional().refine(val => !val || (val >= 1 && val <= 7), {
    message: "Background color must be between 1 and 7 inclusive"
  }).describe('Background color value. Available values are only: 1 (gray), 2 (brown), 3 (orange), 4 (yellow), 5 (green), 6 (blue), 7 (purple). Values outside this range will cause an error.')
};

// 文本样式对象定义
export const TextStyleSchema = z.object(TextStylePropertiesSchema).optional().describe(
  'Text style settings. Explicitly set style properties instead of relying on Markdown syntax conversion.'
);

// 文本内容单元定义
export const TextElementSchema = z.object({
  text: z.string().describe('Text content. Provide plain text without markdown syntax; use style object for formatting.'),
  style: TextStyleSchema
});

// 文本内容数组定义
export const TextElementsArraySchema = z.array(TextElementSchema).describe(
  'Array of text content objects. A block can contain multiple text segments with different styles. Example: [{text:"Hello",style:{bold:true}},{text:" World",style:{italic:true}}]'
);

// 代码块语言参数定义
export const CodeLanguageSchema = z.number().optional().default(1).describe(
  "Programming language code (optional). Common language codes:\n" +
  "1: PlainText; 2: ABAP; 3: Ada; 4: Apache; 5: Apex; 6: Assembly; 7: Bash; 8: CSharp; 9: C++; 10: C; " +
  "11: COBOL; 12: CSS; 13: CoffeeScript; 14: D; 15: Dart; 16: Delphi; 17: Django; 18: Dockerfile; 19: Erlang; 20: Fortran; " +
  "22: Go; 23: Groovy; 24: HTML; 25: HTMLBars; 26: HTTP; 27: Haskell; 28: JSON; 29: Java; 30: JavaScript; " +
  "31: Julia; 32: Kotlin; 33: LateX; 34: Lisp; 36: Lua; 37: MATLAB; 38: Makefile; 39: Markdown; 40: Nginx; " +
  "41: Objective-C; 43: PHP; 44: Perl; 46: PowerShell; 47: Prolog; 48: ProtoBuf; 49: Python; 50: R; " +
  "52: Ruby; 53: Rust; 54: SAS; 55: SCSS; 56: SQL; 57: Scala; 58: Scheme; 60: Shell; 61: Swift; 62: Thrift; " +
  "63: TypeScript; 64: VBScript; 65: Visual Basic; 66: XML; 67: YAML; 68: CMake; 69: Diff; 70: Gherkin; 71: GraphQL. " +
  "Default is 1 (PlainText)."
);

// 代码块自动换行参数定义
export const CodeWrapSchema = z.boolean().optional().default(false).describe(
  'Whether to enable automatic line wrapping. Default is false.'
);

// 文本样式段落定义 - 用于批量创建块工具
export const TextStyleBlockSchema = z.object({
  textStyles: z.array(
    z.object({
      text: z.string().describe('Text segment content. The actual text to display.'),
      style: TextStyleSchema
    })
  ).describe('Array of text content objects with styles. A block can contain multiple text segments with different styles. Example: [{text:"Hello",style:{bold:true}},{text:" World",style:{italic:true}}]'),
  align: z.number().optional().default(1).describe('Text alignment: 1 for left (default), 2 for center, 3 for right.'),
});

// 代码块内容定义 - 用于批量创建块工具
export const CodeBlockSchema = z.object({
  code: z.string().describe('Code content. The complete code text to display.'),
  language: CodeLanguageSchema,
  wrap: CodeWrapSchema,
});

// 标题块内容定义 - 用于批量创建块工具
export const HeadingBlockSchema = z.object({
  level: z.number().min(1).max(9).describe('Heading level from 1 to 9, where 1 is the largest (h1) and 9 is the smallest (h9).'),
  content: z.string().describe('Heading text content. The actual text of the heading.'),
  align: AlignSchemaWithValidation,
});

// 列表块内容定义 - 用于批量创建块工具
export const ListBlockSchema = z.object({
  content: z.string().describe('List item content. The actual text of the list item.'),
  isOrdered: z.boolean().optional().default(false).describe('Whether this is an ordered (numbered) list item. Default is false (bullet point/unordered).'),
  align: AlignSchemaWithValidation,
});

// 块类型枚举 - 用于批量创建块工具
export const BlockTypeEnum = z.string().describe(
  "Block type (required). Supports: 'text', 'code', 'heading', 'list', as well as 'heading1' through 'heading9'. " +
  "For headings, we recommend using 'heading' with level property, but 'heading1'-'heading9' are also supported."
);

// 块配置定义 - 用于批量创建块工具
export const BlockConfigSchema = z.object({
  blockType: BlockTypeEnum,
  options: z.union([
    z.object({ text: TextStyleBlockSchema }).describe("Text block options. Used when blockType is 'text'."),
    z.object({ code: CodeBlockSchema }).describe("Code block options. Used when blockType is 'code'."),
    z.object({ heading: HeadingBlockSchema }).describe("Heading block options. Used with both 'heading' and 'headingN' formats."),
    z.object({ list: ListBlockSchema }).describe("List block options. Used when blockType is 'list'."),
    z.record(z.any()).describe("Fallback for any other block options")
  ]).describe('Options for the specific block type. Provide the corresponding options object based on blockType.'),
});

// 媒体ID参数定义
export const MediaIdSchema = z.string().describe(
  'Media ID (required). The unique identifier for a media resource (image, file, etc.) in Feishu. ' +
  'Usually obtained from image blocks or file references in documents. ' +
  'Format is typically like "boxcnrHpsg1QDqXAAAyachabcef".'
);

// 额外参数定义 - 用于媒体资源下载
export const MediaExtraSchema = z.string().optional().describe(
  'Extra parameters for media download (optional). ' +
  'These parameters are passed directly to the Feishu API and can modify how the media is returned.'
);

// 文件夹Token参数定义
export const FolderTokenSchema = z.string().describe(
  'Folder token (required). The unique identifier for a folder in Feishu. ' +
  'Format is an alphanumeric string like "FWK2fMleClICfodlHHWc4Mygnhb".'
);

// 文件夹名称参数定义
export const FolderNameSchema = z.string().describe(
  'Folder name (required). The name for the new folder to be created.'
);

// 排序方式参数定义
export const OrderBySchema = z.string().optional().default('EditedTime').describe(
  'Order by field (optional). Specifies how to sort the file list. Available values: ' +
  '"EditedTime" (default), "CreatedTime", "Name". For user-friendly display, case insensitive.'
);

// 排序方向参数定义
export const DirectionSchema = z.string().optional().default('DESC').describe(
  'Sort direction (optional). Specifies the sort order. Available values: ' +
  '"DESC" (default) for descending order, "ASC" for ascending order. Case sensitive.'
);

// 搜索关键字参数定义
export const SearchKeySchema = z.string().describe(
  'Search keyword (required). The keyword to search for in documents.'
);

// 用户Key参数定义
export const UserKeySchema = z.string().optional().describe('User key (optional). The key of the user invoking this tool.');
