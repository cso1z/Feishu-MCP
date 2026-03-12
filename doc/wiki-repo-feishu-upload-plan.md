# Wiki 文档上传飞书知识库 - 方案说明

## 1. 目标知识库

- **链接**：https://vq5iayk07bc.feishu.cn/wiki/A40pwlfCAiTfFZkmNy3cJxj1nP4
- **space_id**：授权后通过「获取文档信息」该 Wiki 链接可得（用于在知识库下创建节点）。

## 2. 目录结构设计

在知识库中按「分类 → 文档」两级组织，与 SUMMARY.md / Home.md 一致：

```
知识库根 (space)
├── 首页                    ← Home.md
├── 核心架构（目录节点）
│   ├── 架构设计            ← 架构设计.md
│   ├── 核心模块详解        ← 核心模块详解.md
│   └── 认证与授权机制      ← 认证与授权机制.md
├── 开发指南（目录节点）
│   ├── 开发者指南          ← 开发者指南.md
│   ├── API 参考文档        ← API-参考文档.md
│   └── 最佳实践            ← 最佳实践.md
├── 技术深入（目录节点）
│   └── MCP 协议实现        ← MCP-协议实现.md
└── 使用与工具（目录节点）
    ├── Wiki 文档说明       ← README.md
    ├── 子模块使用指南      ← SUBMODULE_GUIDE.md
    ├── GitHub Wiki 设置指南 ← GITHUB_WIKI_SETUP.md
    └── 文档结构总结        ← SUMMARY.md
```

实现方式：先用 `create_feishu_document` 在 space 下创建「首页」及四个分类节点（标题为上述名称、内容可为简要说明或留空），再在各自 `parentNodeToken` 下创建子文档并写入对应 Markdown 转成的块。

## 3. 飞书格式兼容要点

### 3.1 块类型与 Markdown 对应

| Markdown | 飞书 blockType | 说明 |
|----------|----------------|------|
| `#`–`######` | heading1–heading9 或 heading + level | 标题层级保持 |
| 普通段落 | text | textStyles: [{ text: "..." }] |
| **粗体** / *斜体* / `代码` | text + style: bold/italic/inline_code | 用 textStyles 多段拼 |
| ```lang ... ``` | code | code.code + code.language（见下表） |
| - / 1. 列表项 | list | isOrdered: false/true |
| \| 表格 \| | create_feishu_table | 按行列填 cells |
| [文字](url) | text（或飞书链接块若支持） | 可先保留为 "文字 (url)" |

### 3.2 代码块语言码（常用）

- PlainText: 1  
- Bash/Shell: 7, 60  
- JSON: 28  
- TypeScript: 63  
- JavaScript: 30  
- 其他见飞书文档 block 语言枚举。

### 3.3 注意事项

- 单次 `batch_create_feishu_blocks` 有数量上限（如 50），长文档需按段分批插入，`index` 递增。
- 表格需单独调用 `create_feishu_table` 或拆成「表头 + 多行文本」视情况选择。
- 内部链接（如 `[架构设计](架构设计)`）上传后改为「文档标题 + 说明」或后续在飞书内改为文档链接。
- 文件编码统一 UTF-8，避免中文乱码。

## 4. 上传顺序建议

1. 获取知识库 space_id（get_feishu_document_info 传入 Wiki URL）。
2. 创建「首页」并写入 Home.md 内容。
3. 创建四个分类节点（核心架构、开发指南、技术深入、使用与工具）。
4. 按上表顺序在各分类下创建子节点并写入对应 .md 内容（可先做 1～2 篇验证格式再批量）。

## 5. 前置条件

- 飞书应用已配置，且 MCP 已连接。
- **用户已在浏览器完成 OAuth 授权**（当前未授权会提示「请在浏览器打开以下链接进行授权」）。
- 授权完成后，再执行创建节点与 `batch_create_feishu_blocks` 即可完成上传。
