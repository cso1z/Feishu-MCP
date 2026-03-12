# 将 create_feishu_table 合入 batch_create_feishu_blocks 可行性分析报告

## 1. 目标

将 `create_feishu_table` 的能力合并到 `batch_create_feishu_blocks`，使「一个工具」统一处理所有块类型（文本、代码、标题、列表、图片、Mermaid、画板、**表格**），减少工具数量与调用方心智负担。

---

## 2. 现状对比

| 维度 | batch_create_feishu_blocks | create_feishu_table |
|------|---------------------------|----------------------|
| **飞书 API** | `POST .../blocks/{parentBlockId}/children` | `POST .../blocks/{parentBlockId}/descendant` |
| **请求体** | `{ children: blockContents[], index }` | `{ children_id: [tableId], descendants: descendants[], index }` |
| **块语义** | 多个**并列**的直接子块，每个块为单层结构 | **一个**表格块 + 其**整棵子树**（表格 → 单元格 → 单元格内块） |
| **块来源** | 每项由 `createBlockContent(blockType, options)` 得到单块 | `blockFactory.createTableBlock(config)` 得到 `children_id` + `descendants` + `imageBlocks` |
| **响应后处理** | 从 `response.children` 取 block_type=27/43 做图片/画板提示 | 从 `response.block_id_relations` 解析图片块真实 block_id，供后续 upload_and_bind_image_to_block |
| **index 语义** | 所有块在同一 index 起连续插入 | 表格整体占父块的一个 index 位置 |

结论：**表格与普通块使用不同的 Docx 接口（children vs descendant）和不同的 payload 结构，无法用「同一次 API 调用」既创建多个普通块又创建表格。**

---

## 3. 是否可以实现

**可以实现**，但只能是**工具层/流程层合并**，而不是「一次请求里同时发普通块+表格」。

实现方式：在 `batch_create_feishu_blocks` 的 `blocks` 数组中支持 `blockType: "table"`，当遇到表格项时：

- **不**把表格当作 `children` 里的一项发往 `/children`；
- 对该表格**单独**调 `feishuService.createTableBlock(...)`（即走 `/descendant`）；
- 其余非 table 的块仍按现有逻辑攒成 `children` 调 `createDocumentBlocks`。

因此一次工具调用可能对应**多次** HTTP 请求（例如：一段普通块用 1 次 children，中间 1 个表格用 1 次 descendant，再一段普通块再用 1 次 children），且需要**严格按顺序**执行并维护正确的 `index`。

---

## 4. 实现要点（若合并）

### 4.1 Schema 与参数

- **BlockTypeEnum**：增加 `'table'`（或保持当前为开放 string，在描述中说明支持 table）。
- **BlockConfigSchema.options**：增加 table 的 options 形态。  
  建议：`blockType: "table"` 时，`options` 为 `TableCreateSchema` 的等价结构（即 `table: { columnSize, rowSize, cells? }`），与现有 `create_feishu_table` 的 `tableConfig` 一致，便于复用。
- **blocks 数组**：允许出现 `{ blockType: "table", options: { table: { columnSize, rowSize, cells } } }`；同一批次中可混合 text/code/heading/…/table。

### 4.2 执行逻辑（核心风险区）

- **顺序与 index**：  
  - 按 `blocks` 顺序依次处理；每创建一个「逻辑块」（一个普通块或一整张表），当前插入位置 `currentIndex` 加 1（表格整体占 1 个 index）。  
  - 普通块：累积到缓冲区，凑成一批后调用 `createDocumentBlocks(..., buffer, currentIndex)`，成功后 `currentIndex += buffer.length`。  
  - 表格：先若有未刷写的普通块缓冲区，先 `createDocumentBlocks` 再 `createTableBlock(..., currentIndex)`，然后 `currentIndex += 1`。  
- **分批（>50 块）**：  
  - 「块」计数方式需约定：普通块 1 个元素 = 1 块；表格 = 1 块（不论其内部多少 cell）。  
  - 超过 50 时，按「逻辑块」分批，每批内仍可能包含多次 API 调用（children + 若干 descendant），需保证顺序与 index 递增一致。

### 4.3 响应与后处理

- **表格的 imageTokens**：  
  `createTableBlock` 已返回 `imageTokens`，需合并进批量创建的返回结果（例如 `imageBlocksInfo` / 新字段 `tableImageTokens`），并保留「需使用 upload_and_bind_image_to_block」的提示。
- **whiteboardBlocksInfo**：逻辑不变，仅来自普通块中的画板。
- **nextIndex**：最后 `currentIndex` 即下一次插入的起始位置。

### 4.4 兼容与废弃策略

- 保留 `create_feishu_table` 一段时间，在文档中标记为「可由 batch_create_feishu_blocks 的 blockType: table 替代」，再在后续版本移除，可降低对现有调用方的影响。

---

## 5. 风险分析

| 风险 | 级别 | 说明与缓解 |
|------|------|------------|
| **index 错位** | 高 | 混合普通块与表格时，若顺序或 currentIndex 更新错误，会导致插入位置错乱。缓解：单测覆盖「仅表」「仅普通」「表在中间/两端」及多表场景；明确「表格占 1 个 index」的文档与注释。 |
| **API 调用次数与原子性** | 中 | 一次工具调用变为多轮请求，若中间某次失败，前半部分已写入文档，无法自动回滚。缓解：与现有「>50 分批」行为一致，在错误信息中返回已创建数量与建议的 nextIndex，便于重试或人工修正。 |
| **响应结构复杂化** | 中 | 返回需同时表达「children 返回的块」「表格的 block_id_relations / imageTokens」。缓解：定义清晰结构（如 `tableResults: [{ index, tableBlockId, imageTokens }]`），文档与类型写清。 |
| **Schema 与校验** | 中 | `BlockConfigSchema` 的 options 为 union，加入 table 后 union 变复杂；若用 z.record(z.any()) 兜底，易掩盖错误配置。缓解：为 table 提供独立 schema，并在工具层做明确校验与错误提示。 |
| **分批逻辑** | 中 | 当前按「50 个块」分批，合并后「块」= 普通块个数 + 表格个数。若单次请求中表格很多，可能某批只有表格、或表格与大量普通块混合，实现与测试成本增加。缓解：先实现「不跨批混合」的简单策略（例如一批内只一种类型），或明确「每批最多 50 个逻辑块」的语义。 |
| **文档与 LLM 使用** | 低 | 工具描述变长，LLM 可能更易漏用或误用 table 的 options 格式。缓解：在描述中给 table 的完整示例；保留 create_feishu_table 的独立文档链接直至废弃。 |

---

## 6. 结论与建议

- **可实现**：通过「在 batch 中识别 table，按顺序拆成多次 API 调用（children / descendant），并统一维护 index 与返回结构」即可在一个工具内支持表格与所有现有块类型。
- **代价**：实现与测试成本中等；index 与分批逻辑容易出 bug，需充分单测与文档。
- **建议**：
  - 若希望「一个方法处理所有块」且接受「一次工具调用对应多次请求」：**推荐合并**，并在实现时严格处理顺序与 index，并做好 table 的 imageTokens 与错误提示。
  - 若希望保持实现简单、表格使用频率不高：可**暂不合并**，保留两个工具，在文档中说明「批量块用 batch_create_feishu_blocks，表格用 create_feishu_table」。
  - 若合并，建议在合并完成后保留 `create_feishu_table` 至少一个版本并标记 deprecated，再在下一大版本移除。

---

## 7. 涉及文件（若实施合并）

| 文件 | 变更概要 |
|------|----------|
| `src/types/feishuSchema.ts` | BlockTypeEnum 描述增加 table；BlockConfigSchema.options 的 union 增加 table 选项（或复用 TableCreateSchema）。 |
| `src/services/blockFactory.ts` | 可选：增加 BlockType.TABLE 枚举值；createTableBlock 已存在，可复用。 |
| `src/services/feishuApiService.ts` | createBlockContent 增加 table 分支（或 table 不经过 createBlockContent，由上层直接 createTableBlock）；无其它必须改动的 API。 |
| `src/mcp/tools/blockTools.ts` | batch_create_feishu_blocks：遍历 blocks 时识别 table，拆分「普通块缓冲区」与「表格」；按顺序调用 createDocumentBlocks / createTableBlock；合并 imageTokens 与 table 相关结果；更新 nextIndex。可选：将 create_feishu_table 标记为 deprecated 或移除。 |

以上为将 `create_feishu_table` 合入 `batch_create_feishu_blocks` 的可行性、实现要点与风险分析报告。
