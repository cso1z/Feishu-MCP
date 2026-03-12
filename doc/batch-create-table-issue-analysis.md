# batch_create_feishu_blocks 创建表格问题分析

## 1. 正确的表格创建参数格式（用户提供）

```json
{
  "index": 0,
  "children": [
    {
      "block_type": 31,
      "table": {
        "property": {
          "row_size": 1,
          "column_size": 1,
          "header_row": true,
          "header_column": true
        }
      }
    }
  ]
}
```

该格式对应飞书 Docx API 的 `POST .../blocks/{parentBlockId}/children` 接口。

---

## 2. 当前实现的数据流

```
MCP 输入: { blockType: "table", options: { table: { rowSize, columnSize, headerRow, headerColumn } } }
    ↓
feishuApiService.createBlockContent()
    → blockConfig.options = { rowSize, columnSize, headerRow, headerColumn }  (camelCase)
    ↓
blockFactory.createBlock(BlockType.TABLE, options)
    → createSimpleTableBlock(options)
    ↓
输出: { block_type: 31, table: { property: { row_size, column_size, header_row, header_column } } }  (snake_case)
    ↓
createDocumentBlocks() → POST .../blocks/{parentBlockId}/children
    payload: { children: [上述输出], index }
```

---

## 3. 参数格式对比

| 维度 | 用户提供的正确格式 | 当前 createSimpleTableBlock 输出 |
|------|-------------------|-----------------------------------|
| block_type | 31 | 31 ✓ |
| table.property | ✓ | ✓ |
| row_size | snake_case | snake_case ✓ |
| column_size | snake_case | snake_case ✓ |
| header_row | snake_case | snake_case ✓ |
| header_column | snake_case | snake_case ✓ |

**结论**：参数格式一致，`blockFactory.createSimpleTableBlock` 的输出与正确格式相符。

---

## 4. 潜在问题分析

### 4.1 API 端点与 payload 结构差异（核心风险）

根据 `doc/merge-table-into-batch-blocks-analysis.md`：

| 能力 | batch_create_feishu_blocks | create_feishu_table |
|------|---------------------------|---------------------|
| **API** | `POST .../blocks/{id}/children` | `POST .../blocks/{id}/descendant` |
| **Payload** | `{ children: [...], index }` | `{ children_id: [tableId], descendants: [...], index }` |
| **表格结构** | 仅表格「壳」（block_type 31 + property） | 完整树：table + 所有 table_cell + 单元格内块 |

- 若飞书 **children** 接口支持创建「仅 property 的表格壳」（由服务端自动生成 table_cell），则当前实现理论上可行。
- 若表格**必须**通过 **descendant** 接口创建（提交完整树），则 `children` 收到的 table 块会报错（如 1770001 invalid param）。

需要查证：飞书文档中 `children` 是否明确支持 `block_type: 31` 的表格创建。

### 4.2 表格的两种创建路径

| 路径 | 方法 | 端点 | 表格内容 |
|------|------|------|----------|
| 当前实现 | createSimpleTableBlock | /children | 仅 table.property，无 table_cell |
| 独立表格工具 | createTableBlock | /descendant | table + 所有 table_cell + 单元格内文本块 |

`createTableBlock` 会生成 `children_id` 和 `descendants`，并通过 `/descendant` 提交完整表格树；`createSimpleTableBlock` 只生成单块，通过 `/children` 提交。

### 4.3 错误码 1770001 的可能原因

- **端点不匹配**：表格块被发到 `/children` 而非 `/descendant`。
- **parentBlockId 限制**：某些父块类型（如 document 根、page）可能不允许插入表格。
- **行/列数限制**：飞书可能有列数/行数上限（如 1770010/1770011），需确认实际限制。
- **参数校验**：如 `header_row`/`header_column` 与 `row_size`/`column_size` 的合法性组合等。

### 4.4 createBlockContent 对 table 的 options 传递

```ts
// feishuApiService.ts createBlockContent - TABLE 分支
case BlockType.TABLE:
  if ('table' in options && options.table) {
    const tableOptions = options.table;
    blockConfig.options = {
      rowSize: tableOptions.rowSize,
      columnSize: tableOptions.columnSize,
      headerRow: tableOptions.headerRow ?? false,
      headerColumn: tableOptions.headerColumn ?? false,
    };
  }
```

传入为 `options.table.rowSize` 等 camelCase，输出为 `property.row_size` 等 snake_case，传递链正确。

---

## 5. 修复建议

### 5.1 若 children 不支持表格（需走 descendant）

在 `batch_create_feishu_blocks` 中识别 `blockType: "table"`，对该项**单独**调用 `feishuService.createTableBlock()`（即走 `/descendant`），而不是混入 `children` 数组：

```ts
// 伪代码
for (const blockConfig of blocks) {
  if (blockConfig.blockType === 'table') {
    // 先刷写之前的普通块
    if (buffer.length > 0) {
      await createDocumentBlocks(..., buffer, currentIndex);
      currentIndex += buffer.length;
      buffer = [];
    }
    // 表格走 createTableBlock (descendant)
    await createTableBlock(..., { rowSize, columnSize, cells: [] }, currentIndex);
    currentIndex += 1;
  } else {
    buffer.push(createBlockContent(...));
  }
}
```

这样表格始终通过 `createTableBlock` 使用 `/descendant` 创建。

### 5.2 若 children 支持表格（当前实现路径可行）

则问题更可能在：

1. **parentBlockId**：确认插入位置是否合法（如使用文档根 vs 某段落块）。
2. **row_size/column_size**：先用 1x1 或 2x2 验证，再逐步增大。
3. **飞书权限与文档类型**：Wiki 文档与普通 Docx 行为是否一致。

### 5.3 建议的验证步骤

1. 用 1x1 表格（与用户示例一致）通过当前 `batch_create_feishu_blocks` 调用，确认是否仍报 1770001。
2. 对比 `createTableBlock`（descendant）是否能成功创建同尺寸表格。
3. 查阅飞书开放平台文档，确认 `children` 是否支持 `block_type: 31`。

---

## 6. 涉及文件

| 文件 | 说明 |
|------|------|
| `src/services/blockFactory.ts` | createSimpleTableBlock 输出格式正确 |
| `src/services/feishuApiService.ts` | createBlockContent TABLE 分支、createTableBlock、createDocumentBlocks |
| `src/mcp/tools/blockTools.ts` | batch_create_feishu_blocks 统一走 createDocumentBlocks（children） |
