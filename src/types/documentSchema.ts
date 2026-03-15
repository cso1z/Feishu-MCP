import { z } from 'zod';

// 文档类型枚举（用于 get_feishu_document_info）
export const DocumentTypeSchema = z.enum(['document', 'wiki']).optional().describe(
  'Document type (optional). "document" for regular document, "wiki" for Wiki document.'
);

// 文档ID或URL参数定义（仅支持普通文档）
export const DocumentIdSchema = z.string().describe(
  'Document ID or URL (required). Supports the following formats:\n' +
  '1. Standard document URL: https://xxx.feishu.cn/docs/xxx or https://xxx.feishu.cn/docx/xxx\n' +
  '2. Direct document ID: e.g., JcKbdlokYoPIe0xDzJ1cduRXnRf'
);

// 文档ID或Wiki ID参数定义（用于 get_feishu_document_info，支持普通文档和Wiki文档）
export const DocumentIdOrWikiIdSchema = z.string().describe(
  'Document ID, URL, or Wiki ID/URL (required). Supports regular document formats (https://xxx.feishu.cn/docx/xxx or direct ID) and Wiki formats (https://xxx.feishu.cn/wiki/xxxxx or Wiki token).'
);

// 父块ID参数定义
export const ParentBlockIdSchema = z.string().describe(
  'Parent block ID (required). The block ID whose direct children will be operated on, without any URL prefix. ' +
  'For root-level operations, use the document ID as parentBlockId.'
);

// 块ID参数定义
export const BlockIdSchema = z.string().describe(
  'Block ID (required). The ID of the target block.'
);

// 插入位置索引参数定义
export const IndexSchema = z.number().int().min(0).describe(
  'Insertion position within the direct children of `parentBlockId` (0-based, title block excluded).\n' +
  '0 = before the first content block; max = children.length (append after last block).\n' +
  'Example: document has 3 blocks → valid values are 0, 1, 2, 3.'
);

// 起始位置索引参数定义
export const StartIndexSchema = z.number().int().min(0).describe(
  'Start of the target range within the direct children of `parentBlockId` (0-based, title block excluded).\n' +
  '0 = first content block; max = children.length - 1.\n' +
  'Example: to target blocks at positions 2, 3, 4 → startIndex=2.'
);

// 结束位置索引参数定义
export const EndIndexSchema = z.number().int().min(1).describe(
  'End of the target range (exclusive) within the direct children of `parentBlockId` (title block excluded).\n' +
  'Must satisfy endIndex > startIndex.\n' +
  'Example: to delete blocks at positions 2, 3, 4 → startIndex=2, endIndex=5; single block at 2 → startIndex=2, endIndex=3.'
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
  }).describe('Text color (optional): 0=black (default), 1=gray, 2=brown, 3=orange, 4=yellow, 5=green, 6=blue, 7=purple.'),
  background_color: z.number().optional().refine(val => !val || (val >= 1 && val <= 7), {
    message: "Background color must be between 1 and 7 inclusive"
  }).describe('Background color (optional): 1=gray, 2=brown, 3=orange, 4=yellow, 5=green, 6=blue, 7=purple.')
};

// 文本样式对象定义
export const TextStyleSchema = z.object(TextStylePropertiesSchema).optional().describe(
  'Text style settings (optional). Omit entirely for unstyled text; only set properties that differ from the default (false).'
);

// 文本内容单元定义 - 支持普通文本和公式元素
export const TextElementSchema = z.union([
  z.object({
    text: z.string().describe('Text content. Provide plain text without markdown syntax; use style object for formatting.'),
    style: TextStyleSchema
  }).describe('Regular text element with optional styling.'),
  z.object({
    equation: z.string().describe('Mathematical equation content. The formula or expression to display. Format: LaTeX.'),
    style: TextStyleSchema
  }).describe('Mathematical equation element with optional styling.')
]);

// 文本内容数组定义
export const TextElementsArraySchema = z.array(TextElementSchema).describe(
  'Array of text content objects. A block can contain multiple text segments with different styles. Example: [{text:"Hello",style:{bold:true}},{text:" World",style:{italic:true}}]'
);

// 单块文本更新项定义
export const BlockTextUpdateItemSchema = z.object({
  blockId: z.string().describe('Block ID (required). The ID of the block to update.'),
  textElements: TextElementsArraySchema,
}).describe('A single block text update item: target blockId and its new text content.');

// 批量更新块文本数组定义
export const BlockTextUpdatesArraySchema = z.array(BlockTextUpdateItemSchema).min(1).describe(
  'Array of block text update items (required, at least 1). ' +
  'Example: [{blockId:"xxx",textElements:[{text:"Hello",style:{bold:true}}]},{blockId:"yyy",textElements:[{text:"World"}]}]'
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
  textStyles: z.array(TextElementSchema).describe('Array of text content objects with styles. A block can contain multiple text segments with different styles, including both regular text and equations. Example: [{text:"Hello",style:{bold:true}},{equation:"1+2=3",style:{}}]'),
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
  content: z.string().describe('Heading text content.'),
  align: AlignSchemaWithValidation,
});

// 列表块内容定义 - 用于批量创建块工具
export const ListBlockSchema = z.object({
  content: z.string().describe('List item content. The actual text of the list item.'),
  isOrdered: z.boolean().optional().default(false).describe('Whether this is an ordered (numbered) list item. Default is false (bullet point/unordered).'),
  align: AlignSchemaWithValidation,
});

// 块类型枚举 - 用于批量创建块工具
export const BlockTypeEnum = z.enum([
  'text', 'code', 'heading', 'list', 'image', 'mermaid', 'whiteboard',
]).describe(
  "Block type. 'image' and 'whiteboard' create empty blocks to be filled after creation."
);

// 图片宽度参数定义
export const ImageWidthSchema = z.number().optional().describe(
  'Image width in pixels (optional). If not provided, the original image width will be used.'
);

// 图片高度参数定义
export const ImageHeightSchema = z.number().optional().describe(
  'Image height in pixels (optional). If not provided, the original image height will be used.'
);

// 图片块内容定义 - 用于批量创建块工具
export const ImageBlockSchema = z.object({
  width: ImageWidthSchema,
  height: ImageHeightSchema
});

// Mermaid代码参数定义
export const MermaidCodeSchema = z.string().describe(
  'Mermaid chart code (required). Node labels containing special characters ((), [], -->) must be wrapped in double quotes.\n' +
  'Example: A["finish()/返回键"] --> B'
);

export const MermaidBlockSchema = z.object({
  code: MermaidCodeSchema,
});

// 画板对齐方式参数定义
export const WhiteboardAlignSchema = z.number().optional().default(2).describe(
  'Whiteboard alignment: 1 for left, 2 for center (default), 3 for right.'
);

// 画板块内容定义 - 用于批量创建块工具
export const WhiteboardBlockSchema = z.object({
  align: WhiteboardAlignSchema,
});

// 块配置定义 - 用于批量创建块工具
export const BlockConfigSchema = z.object({
  blockType: BlockTypeEnum,
  options: z.union([
    z.object({ text: TextStyleBlockSchema }).describe("Text block options. Used when blockType is 'text'."),
    z.object({ code: CodeBlockSchema }).describe("Code block options. Used when blockType is 'code'."),
    z.object({ heading: HeadingBlockSchema }).describe("Heading block options. Used with both 'heading' and 'headingN' formats."),
    z.object({ list: ListBlockSchema }).describe("List block options. Used when blockType is 'list'."),
    z.object({ image: ImageBlockSchema }).describe("Image block options. Used when blockType is 'image'. Creates empty image blocks."),
    z.object({ mermaid: MermaidBlockSchema}).describe("Mermaid block options.  Used when blockType is 'mermaid'."),
    z.object({ whiteboard: WhiteboardBlockSchema }).describe("Whiteboard block options. Used when blockType is 'whiteboard'. Creates an empty whiteboard; response includes board.token — pass it as whiteboardId to fill_whiteboard_with_plantuml."),
  ]).describe('Options for the block type. Key must match blockType (e.g., blockType:"text" → options:{text:{...}}).'),
});

// 表格列数参数定义
export const TableColumnSizeSchema = z.number().min(1).describe(
  'Table column size (required). The number of columns in the table. Must be at least 1.'
);

// 表格行数参数定义
export const TableRowSizeSchema = z.number().min(1).describe(
  'Table row size (required). The number of rows in the table. Must be at least 1.'
);

// 表格单元格坐标参数定义
export const TableCellCoordinateSchema = z.object({
  row: z.number().min(0).describe('Row coordinate (0-based). The row position of the cell in the table.'),
  column: z.number().min(0).describe('Column coordinate (0-based). The column position of the cell in the table.')
});


// 表格单元格内容配置定义
export const TableCellContentSchema = z.object({
  coordinate: TableCellCoordinateSchema,
  content: BlockConfigSchema
});

// 表格创建参数定义 - 专门用于创建表格块工具
export const TableCreateSchema = z.object({
  columnSize: TableColumnSizeSchema,
  rowSize: TableRowSizeSchema,
  cells: z.array(TableCellContentSchema).optional().describe(
    'Array of cell configurations (optional). Each cell specifies its position (row, column) and content block configuration. ' +
    'If not provided, empty text blocks will be created for all cells. ' +
    'Multiple entries with the same coordinates add content blocks sequentially to that cell. ' +
    'Example: [{coordinate:{row:0,column:0}, content:{blockType:"text", options:{text:{textStyles:[{text:"Header"}]}}}}, ' +
    '{coordinate:{row:0,column:0}, content:{blockType:"code", options:{code:{code:"console.log(\'hello\')", language:30}}}}] ' +
    'adds both a text block and a code block to cell (0,0).'
  )
});

// 媒体ID参数定义
export const MediaIdSchema = z.string().describe(
  'Image media token (required). Obtain from one of:\n' +
  '1. An image block returned by get_feishu_document_blocks: block.image.token (block_type=27)\n' +
  '2. Response of upload_and_bind_image_to_block: fileToken field'
);

// 额外参数定义 - 用于媒体资源下载
export const MediaExtraSchema = z.string().optional().describe(
  'Extra query parameter for the Feishu media download API (optional). Required only for encrypted images; omit for standard image blocks.'
);

// 文件夹Token参数定义（必传）
export const FolderTokenSchema = z.string().describe(
  'Folder token (required). The unique identifier for a folder in Feishu. ' +
  'Format is an alphanumeric string like "FWK2fMleClICfodlHHWc4Mygnhb".'
);

// 文件夹Token参数定义（可选，用于文档创建、获取文件列表等场景）
export const FolderTokenOptionalSchema = z.string().optional().describe(
  'Folder token (optional, for Feishu Drive folder mode). The unique identifier for a folder in Feishu Drive. ' +
  'Format is an alphanumeric string like "FWK2fMleClICfodlHHWc4Mygnhb".'
);

// 文件夹名称参数定义
export const FolderNameSchema = z.string().describe(
  'Folder name (required). The name for the new folder to be created.'
);

// 知识空间ID参数定义
export const SpaceIdSchema = z.string().describe(
  'Space ID. Required when using wikiContext mode. The unique identifier for a wiki space in Feishu. ' +
  'Can be obtained from get_feishu_root_folder_info (wiki_spaces array or my_library.space_id). ' +
  'Format is typically like "74812***88644".'
);

// 父节点Token参数定义
export const ParentNodeTokenSchema = z.string().optional().describe(
  'Parent node token (optional). The token of the parent node in a wiki space. ' +
  'If not provided, retrieves nodes from the root of the wiki space. ' +
  'Format is typically like "PdDWwIHD6****MhcIOY7npg".'
);

// 知识库节点上下文参数定义（包装 spaceId 和 parentNodeToken）
export const WikiSpaceNodeContextSchema = z.object({
  spaceId: SpaceIdSchema,
  parentNodeToken: ParentNodeTokenSchema,
}).optional().describe(
  'Wiki space node context object (optional). Provide this instead of folderToken to operate in wiki space mode. ' +
  'spaceId is required; parentNodeToken is optional (omit to target the wiki root).'
);

// 搜索关键字参数定义
export const SearchKeySchema = z.string().describe(
  'Search keyword (required). The keyword to search for in documents.'
);

// 搜索类型枚举
export const SearchTypeSchema = z.enum(['document', 'wiki', 'both']).optional().default('both').describe(
  'Search type (optional, default: "both"). "document": only documents, "wiki": only wiki nodes, "both": both (default)'
);

// 知识库分页token参数定义
export const PageTokenSchema = z.string().optional().describe(
  'Wiki page token (optional). Token from previous wiki search result for pagination. Only needed when fetching next page of wiki results.'
);

// 文档分页偏移量参数定义
export const OffsetSchema = z.number().optional().describe(
  'Document offset (optional). Offset for document search pagination. Only needed when fetching next page of document results.'
);

// 图片路径或URL参数定义
export const ImagePathOrUrlSchema = z.string().describe(
  'Image path or URL (required).\n' +
  '1. Local absolute path: e.g., "C:\\path\\to\\image.jpg"\n' +
  '2. HTTP/HTTPS URL: e.g., "https://example.com/image.png"'
);

// 图片文件名参数定义
export const ImageFileNameSchema = z.string().optional().describe(
  'Image file name (optional). If not provided, a default name will be generated based on the source. ' +
  'Should include the file extension, e.g., "image.png" or "photo.jpg".'
);


// 批量图片上传绑定参数定义
export const ImagesArraySchema = z.array(z.object({
  blockId: BlockIdSchema,
  imagePathOrUrl: ImagePathOrUrlSchema,
  fileName: ImageFileNameSchema.optional(),
})).describe(
  'Array of image binding objects (required). Each object must include: blockId (target image block ID), imagePathOrUrl (local path or URL of the image), and optionally fileName (image file name, e.g., "image.png").'
);

// 画板ID参数定义
export const WhiteboardIdSchema = z.string().describe(
  'Whiteboard token (required). Found in board.token of a block with block_type=43.\nExample: "EPJKwvY5ghe3pVbKj9RcT2msnBX"'
);

// 画板代码参数定义（支持 PlantUML 和 Mermaid）
export const WhiteboardCodeSchema = z.string().describe(
  'Diagram code (required). The complete diagram code to create in the whiteboard.\n' +
  'Supports both PlantUML and Mermaid formats.\n' +
  'PlantUML example: "@startuml\nAlice -> Bob: Hello\n@enduml"\n' +
  'Mermaid example: "graph TD\nA[Start] --> B[End]"'
);

// 语法类型参数定义
export const SyntaxTypeSchema = z.enum(['plantuml', 'mermaid']).describe(
  'Diagram syntax type (required): "plantuml" or "mermaid".'
);

// 画板内容配置定义（包含画板ID和内容配置）
export const WhiteboardContentSchema = z.object({
  whiteboardId: WhiteboardIdSchema,
  code: WhiteboardCodeSchema,
  syntax_type: SyntaxTypeSchema,
}).describe('Whiteboard fill item: target whiteboard ID, diagram code, and syntax type.');

// 批量填充画板数组定义
export const WhiteboardFillArraySchema = z.array(WhiteboardContentSchema).describe(
  'Array of whiteboard fill items (required).\n' +
  'Example: [{whiteboardId:"token1", code:"@startuml\\nAlice -> Bob: Hi\\n@enduml", syntax_type:"plantuml"}, {whiteboardId:"token2", code:"graph TD\\nA-->B", syntax_type:"mermaid"}]'
);

// 文档标题参数定义
export const DocumentTitleSchema = z.string().describe('Document title (required). This will be displayed in the Feishu document list and document header.');
