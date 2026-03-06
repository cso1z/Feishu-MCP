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
  'Insertion position index (required). This index is relative to the children array of the specified parentBlockId block (not the whole document).\n' +
  'If parentBlockId is the document root (i.e., the document ID), index refers to the position among the document content blocks (excluding the title block itself).\n' +
  '0 means to insert as the first content block after the title.\n' +
  'If children is empty or missing, use 0 to insert the first content block.\n' +
  'For nested blocks, index is relative to the parent block\'s children.\n' +
  '**index must satisfy 0 ≤ index ≤ parentBlock.children.length, otherwise the API will return an error.**\n'+
  'Note: The title block itself is not part of the children array and cannot be operated on with index.' +
  'Specifies where the block should be inserted. Use 0 to insert at the beginning. ' +
  'Use get_feishu_document_blocks tool to understand document structure if unsure. ' +
  'For consecutive insertions, calculate next index as previous index + 1.'
);

// 起始插入位置索引参数定义
export const StartIndexSchema = z.number().describe(
  'Starting insertion position index (required). This index is relative to the children array of the specified parentBlockId block.\n' +
  'For the document root, this means the content blocks after the title. For other blocks, it means the sub-blocks under that block.\n' +
  'The index does not include the title block itself.' +
  'Specifies where the first block should be inserted or deleted. Use 0 to insert at the beginning. ' +
  'Use get_feishu_document_blocks tool to understand document structure if unsure.'
);

// 结束位置索引参数定义
export const EndIndexSchema = z.number().describe(
  'Ending position index (required). This index is relative to the children array of the specified parentBlockId block.\n' +
  'For the document root, this means the content blocks after the title. For other blocks, it means the sub-blocks under that block.\n' +
  'The index does not include the title block itself.' +
  'Specifies the end of the range for deletion (exclusive). ' +
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
  "Block type (required). Supports: 'text', 'code', 'heading', 'list', 'image','mermaid','whiteboard',as well as 'heading1' through 'heading9'. " +
  "For headings, we recommend using 'heading' with level property, but 'heading1'-'heading9' are also supported. " +
  "For images, use 'image' to create empty image blocks that can be filled later. " +
  "For whiteboards, use 'whiteboard' to create empty whiteboard blocks that return a token for filling content. " +
  "For text blocks, you can include both regular text and equation elements in the same block."
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
  'Mermaid code (required). The complete Mermaid chart code, e.g. \'graph TD; A-->B;\'. ' +
  'IMPORTANT: When node text contains special characters like parentheses (), brackets [], or arrows -->, ' +
  'wrap the entire text in double quotes to prevent parsing errors. ' +
  'Example: A["finish()/返回键"] instead of A[finish()/返回键].'
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
    z.object({ whiteboard: WhiteboardBlockSchema }).describe("Whiteboard block options. Used when blockType is 'whiteboard'. Creates empty whiteboard blocks that return a token for filling content."),
    z.record(z.any()).describe("Fallback for any other block options")
  ]).describe('Options for the specific block type. Provide the corresponding options object based on blockType.'),
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
    'IMPORTANT: Multiple cells can have the same coordinates (row, column) - when this happens, ' +
    'the content blocks will be added sequentially to the same cell, allowing you to create rich content ' +
    'with multiple blocks (text, code, images, etc.) within a single cell. ' +
    'Example: [{coordinate:{row:0,column:0}, content:{blockType:"text", options:{text:{textStyles:[{text:"Header"}]}}}, ' +
    '{coordinate:{row:0,column:0}, content:{blockType:"code", options:{code:{code:"console.log(\'hello\')", language:30}}}}] ' +
    'will add both a text block and a code block to cell (0,0).'
  )
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

// 文件夹Token参数定义（必传）
export const FolderTokenSchema = z.string().describe(
  'Folder token (required). The unique identifier for a folder in Feishu. ' +
  'Format is an alphanumeric string like "FWK2fMleClICfodlHHWc4Mygnhb".'
);

// 文件夹Token参数定义（可选，用于文档创建、获取文件列表等场景）
export const FolderTokenOptionalSchema = z.string().optional().describe(
  'Folder token (optional, for Feishu Drive folder mode). The unique identifier for a folder in Feishu Drive. ' +
  'Format is an alphanumeric string like "FWK2fMleClICfodlHHWc4Mygnhb". '
);

// 文件夹名称参数定义
export const FolderNameSchema = z.string().describe(
  'Folder name (required). The name for the new folder to be created.'
);

// 知识空间ID参数定义
export const SpaceIdSchema = z.string().describe(
  'Space ID (optional, required for wiki space mode). The unique identifier for a wiki space in Feishu. ' +
  'Can be obtained from get_feishu_root_folder_info (wiki_spaces array or my_library.space_id). ' +
  'Format is typically like "74812***88644".'
);

// 父节点Token参数定义
export const ParentNodeTokenSchema = z.string().optional().describe(
  'Parent node token (optional, used with spaceId). The token of the parent node in a wiki space. ' +
  'If not provided or empty, will retrieve nodes from the root of the wiki space. ' +
  'Format is typically like "PdDWwIHD6****MhcIOY7npg".'
);

// 知识库节点上下文参数定义（包装 spaceId 和 parentNodeToken）
export const WikiSpaceNodeContextSchema = z.object({
  spaceId: SpaceIdSchema.optional(),
  parentNodeToken: ParentNodeTokenSchema,
}).optional().describe(
  'Wiki space node context object. Contains spaceId (required when using this object) and optional parentNodeToken. ' +
  'Used for wiki space operations instead of folderToken.'
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
  'Image path or URL (required). Supports the following formats:\n' +
  '1. Local file absolute path: e.g., "C:\\path\\to\\image.jpg"\n' +
  '2. HTTP/HTTPS URL: e.g., "https://example.com/image.png"\n' +
  'The tool will automatically detect the format and handle accordingly.'
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
  'Whiteboard ID (required). This is the token value from the board.token field when getting document blocks.\n' +
  'When you find a block with block_type: 43, the whiteboard ID is located in board.token field.\n' +
  'Example: "EPJKwvY5ghe3pVbKj9RcT2msnBX"'
);

// 画板代码参数定义（支持 PlantUML 和 Mermaid）
export const WhiteboardCodeSchema = z.string().describe(
  'Diagram code (required). The complete diagram code to create in the whiteboard.\n' +
  'Supports both PlantUML and Mermaid formats.\n' +
  'PlantUML example: "@startuml\nAlice -> Bob: Hello\n@enduml"\n' +
  'Mermaid example: "graph TD\nA[Start] --> B[End]"'
);

// 语法类型参数定义
export const SyntaxTypeSchema = z.number().describe(
  'Syntax type (required). Specifies the diagram syntax format.\n' +
  '1: PlantUML syntax\n' +
  '2: Mermaid syntax'
);

// 画板内容配置定义（包含画板ID和内容配置）
export const WhiteboardContentSchema = z.object({
  whiteboardId: WhiteboardIdSchema,
  code: WhiteboardCodeSchema,
  syntax_type: SyntaxTypeSchema,
}).describe(
  'Whiteboard content configuration. Contains the whiteboard ID, diagram code and syntax type.\n' +
  'whiteboardId: The token value from board.token field when creating whiteboard block (required)\n' +
  'code: The diagram code (PlantUML or Mermaid format) (required)\n' +
  'syntax_type: 1 for PlantUML, 2 for Mermaid (required)'
);

// 批量填充画板数组定义
export const WhiteboardFillArraySchema = z.array(WhiteboardContentSchema).describe(
  'Array of whiteboard fill items (required). Each item must include whiteboardId, code and syntax_type.\n' +
  'Example: [{whiteboardId:"token1", code:"@startuml...", syntax_type:1}, {whiteboardId:"token2", code:"graph TD...", syntax_type:2}]'
);

// 文档标题参数定义
export const DocumentTitleSchema = z.string().describe('Document title (required). This will be displayed in the Feishu document list and document header.');

// ============ 飞书任务相关 Schema ============

// 任务标题参数定义
export const TaskSummarySchema = z.string().describe(
  'Task summary/title (required). The main title of the task, displayed in the task list.'
);

// 任务描述参数定义
export const TaskDescriptionSchema = z.string().optional().describe(
  'Task description (optional). Detailed description of the task content.'
);

// 任务截止时间参数定义
export const TaskDueSchema = z.object({
  timestamp: z.string().describe('Due date timestamp in seconds (required). Unix timestamp string, e.g. "1675454764".'),
  is_all_day: z.boolean().optional().default(false).describe('Whether it is an all-day event (optional). Default is false.'),
}).optional().describe(
  'Task due date (optional). Contains a timestamp and whether it is an all-day event.'
);

// 任务开始时间参数定义
export const TaskStartSchema = z.object({
  timestamp: z.string().describe('Start date timestamp in seconds (required). Unix timestamp string, e.g. "1675454764".'),
  is_all_day: z.boolean().optional().default(false).describe('Whether it is an all-day event (optional). Default is false.'),
}).optional().describe(
  'Task start date (optional). Contains a timestamp and whether it is an all-day event.'
);

// 任务优先级参数定义（自定义模式）
export const TaskOriginSchema = z.object({
  platform_i18n_name: z.string().describe('Platform name in i18n JSON format (required). e.g. \'{"en_us":"MCP","zh_cn":"MCP"}\''),
}).optional().describe(
  'Task origin/source platform information (optional). Identifies where the task was created from.'
);

// 任务额外参数定义
export const TaskExtraSchema = z.string().optional().describe(
  'Extra information for the task (optional). Custom data as a string, max 65536 characters.'
);

// 任务模式参数定义
export const TaskModeSchema = z.number().optional().default(2).describe(
  'Task mode (optional). 1: requires user to manually complete the task. 2: task can be completed when all subtasks are done (default: 2).'
);

// 任务成员参数定义
export const TaskMembersSchema = z.array(z.object({
  id: z.string().describe('Member ID (required). The open_id, user_id or union_id of the user.'),
  type: z.string().optional().default('user').describe('Member type (optional). Default is "user".'),
  role: z.string().optional().default('assignee').describe('Member role (optional). "assignee" for task assignee (default), "follower" for task follower.'),
})).optional().describe(
  'Task members (optional). Array of members to assign to the task. Each member needs an ID and optional role (assignee/follower).'
);

// 任务重复规则参数定义
export const TaskRepeatRuleSchema = z.string().optional().describe(
  'Task repeat rule in RRULE format (optional). e.g. "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR" for weekday repeat.'
);

// 任务自定义完成配置参数定义
export const TaskCustomCompleteSchema = z.object({
  pc: z.object({
    href: z.string().optional().describe('PC completion URL (optional).'),
    tip: z.object({
      en_us: z.string().optional().describe('English tip text'),
      zh_cn: z.string().optional().describe('Chinese tip text'),
    }).optional().describe('Tooltip text (optional).'),
  }).optional().describe('PC platform configuration (optional).'),
  ios: z.object({
    href: z.string().optional().describe('iOS completion URL (optional).'),
    tip: z.object({
      en_us: z.string().optional().describe('English tip text'),
      zh_cn: z.string().optional().describe('Chinese tip text'),
    }).optional().describe('Tooltip text (optional).'),
  }).optional().describe('iOS platform configuration (optional).'),
  android: z.object({
    href: z.string().optional().describe('Android completion URL (optional).'),
    tip: z.object({
      en_us: z.string().optional().describe('English tip text'),
      zh_cn: z.string().optional().describe('Chinese tip text'),
    }).optional().describe('Tooltip text (optional).'),
  }).optional().describe('Android platform configuration (optional).'),
}).optional().describe(
  'Custom complete configuration (optional). Controls how the task is completed on different platforms.'
);

// ============ 飞书日历相关 Schema ============

// 日历事件标题参数定义
export const CalendarEventSummarySchema = z.string().describe(
  'Calendar event summary/title (required). The main title of the event, displayed in the calendar.'
);

// 日历事件描述参数定义
export const CalendarEventDescriptionSchema = z.string().optional().describe(
  'Calendar event description (optional). Detailed description or notes for the event.'
);

// 日历事件时间参数定义
export const CalendarEventTimeSchema = z.object({
  timestamp: z.string().optional().describe(
    'Timestamp in seconds (required for non-all-day events). Unix timestamp string, e.g. "1675454764". ' +
    'Either timestamp or date must be provided.'
  ),
  date: z.string().optional().describe(
    'Date string in "YYYY-MM-DD" format (required for all-day events). e.g. "2025-03-01". ' +
    'Either timestamp or date must be provided.'
  ),
  timezone: z.string().optional().describe(
    'Timezone (optional). e.g. "Asia/Shanghai". If not provided, defaults to the calendar timezone.'
  ),
}).describe(
  'Event time. For all-day events, use "date" field (YYYY-MM-DD). For timed events, use "timestamp" field (Unix seconds).'
);

// 日历事件参与者参数定义
export const CalendarEventAttendeesSchema = z.array(z.object({
  type: z.enum(['user', 'chat', 'resource', 'third_party']).optional().default('user').describe(
    'Attendee type (optional). "user" (default), "chat" (group chat), "resource" (meeting room), "third_party" (external).'
  ),
  user_id: z.string().optional().describe(
    'User ID (required when type is "user"). The open_id, user_id or union_id of the user.'
  ),
  chat_id: z.string().optional().describe(
    'Chat ID (required when type is "chat"). The group chat ID.'
  ),
  room_id: z.string().optional().describe(
    'Room ID (required when type is "resource"). The meeting room ID.'
  ),
  third_party_email: z.string().optional().describe(
    'Third-party email (required when type is "third_party"). External attendee email address.'
  ),
  is_optional: z.boolean().optional().default(false).describe(
    'Whether the attendee is optional (optional). Default is false (required attendee).'
  ),
})).optional().describe(
  'Event attendees (optional). Array of attendees for the event. Each attendee needs a type and corresponding ID.'
);

// 日历事件提醒参数定义
export const CalendarEventRemindersSchema = z.array(z.object({
  minutes: z.number().describe(
    'Reminder minutes before event (required). e.g. 5 for 5 minutes before, 15 for 15 minutes before, 60 for 1 hour before.'
  ),
})).optional().describe(
  'Event reminders (optional). Array of reminder configurations. Each reminder specifies minutes before the event to trigger.'
);

// 日历事件可见性参数定义
export const CalendarEventVisibilitySchema = z.enum(['default', 'public', 'private']).optional().default('default').describe(
  'Event visibility (optional). "default": uses calendar default, "public": visible to all, "private": only visible to attendees. Default is "default".'
);

// 日历事件忙闲状态参数定义
export const CalendarEventFreeBusyStatusSchema = z.enum(['busy', 'free']).optional().default('busy').describe(
  'Free/busy status during the event (optional). "busy": show as busy (default), "free": show as free.'
);

// 日历ID参数定义
export const CalendarIdSchema = z.string().optional().describe(
  'Calendar ID (optional). The ID of the calendar to create the event in. If not provided, the primary calendar will be used. ' +
  'You can obtain calendar IDs from the calendar list.'
);

// 日历事件颜色参数定义
export const CalendarEventColorSchema = z.number().optional().describe(
  'Event color index (optional). Ranges from 0-9, representing different colors for the event in the calendar view.'
);

// 日历事件重复规则参数定义
export const CalendarEventRecurrenceSchema = z.string().optional().describe(
  'Recurrence rule in RRULE format (optional). e.g. "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR" for Monday/Wednesday/Friday weekly repeat. ' +
  '"FREQ=DAILY;COUNT=10" for daily repeat 10 times. "FREQ=MONTHLY;BYMONTHDAY=1" for first day of each month.'
);

// 日历事件地点参数定义
export const CalendarEventLocationSchema = z.object({
  name: z.string().optional().describe('Location name (optional). e.g. "Conference Room A".'),
  address: z.string().optional().describe('Location address (optional). e.g. "Building 1, Floor 3".'),
  latitude: z.number().optional().describe('Latitude (optional).'),
  longitude: z.number().optional().describe('Longitude (optional).'),
}).optional().describe(
  'Event location (optional). Physical or virtual location for the event.'
);

