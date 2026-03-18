# feishu-mcp-tool CLI 使用文档

## 概述

`feishu-mcp-tool` 是 feishu-mcp 提供的命令行工具，支持直接调用全部 20 个飞书 MCP 工具。设计目标是 **LLM Agent 调用**：参数以 JSON 字符串传入，结果以纯 JSON 输出到 stdout，错误和提示信息输出到 stderr。

## 安装与配置

安装 feishu-mcp 后，`feishu-mcp-tool` 命令自动可用。

在项目根目录配置 `.env` 文件（与 MCP Server 共用）：

```env
FEISHU_APP_ID=cli_xxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxx
FEISHU_AUTH_TYPE=user           # user 或 tenant
FEISHU_USER_KEY=stdio           # CLI 用户标识，默认 stdio
FEISHU_ENABLED_MODULES=all      # 启用的模块
```

## 调用格式

```bash
feishu-mcp-tool <tool-name> '<json-params>'
```

- **stdout**：工具执行结果（JSON）
- **stderr**：日志与认证提示（不污染 stdout）
- **exit 0**：成功；**exit 1**：参数错误或工具不存在

## 首次授权

`user` 模式下首次运行时，若本地无有效 token，会自动触发 OAuth 流程：

1. 在系统默认浏览器打开飞书授权页
2. stderr 输出授权链接（供无头环境手动访问）
3. 完成授权后自动继续执行（最长等待 5 分钟）
4. Token 持久化到 `~/.cache/feishu-mcp/`，后续调用无需重复授权

## 查看帮助

```bash
feishu-mcp-tool --help
# 输出所有支持的工具名称列表（JSON）
```

---

## 工具列表与示例

### 1. `get_feishu_root_folder_info`

获取根文件夹、知识空间列表和我的知识库。

```bash
feishu-mcp-tool get_feishu_root_folder_info
# 无需参数
```

---

### 2. `get_feishu_folder_files`

列出文件夹或知识库节点下的文件。

```bash
feishu-mcp-tool get_feishu_folder_files '{"folderToken":"FWK2xxxxx"}'
# 知识库节点：
feishu-mcp-tool get_feishu_folder_files '{"wikiSpaceId":"7614920810658024396","wikiNodeToken":"xxx"}'
```

**参数**：
| 字段 | 类型 | 说明 |
|------|------|------|
| `folderToken` | string | 文件夹 token（与 wiki 参数二选一）|
| `wikiSpaceId` | string | 知识库空间 ID |
| `wikiNodeToken` | string | 知识库节点 token |

---

### 3. `create_feishu_folder`

在指定文件夹下创建子文件夹。

```bash
feishu-mcp-tool create_feishu_folder '{"folderToken":"FWK2xxxxx","folderName":"新文件夹"}'
```

---

### 4. `create_feishu_document`

在文件夹或知识库中创建文档。

```bash
# 文件夹模式
feishu-mcp-tool create_feishu_document '{"title":"文档标题","folderToken":"FWK2xxxxx"}'

# 知识库模式
feishu-mcp-tool create_feishu_document '{"title":"文档标题","wikiContext":{"spaceId":"7614920810658024396","parentNodeToken":"xxx"}}'
```

---

### 5. `get_feishu_document_info`

获取文档元数据（支持普通文档和知识库文档）。

```bash
feishu-mcp-tool get_feishu_document_info '{"documentId":"Uk6mdN6Hao5umbxC13ccGstonIh"}'
# documentId 可以是 token、URL 或飞书文档链接
```

---

### 6. `get_feishu_document_blocks`

获取文档的块结构（包含图片/白板提示信息）。

```bash
feishu-mcp-tool get_feishu_document_blocks '{"documentId":"Uk6mdN6Hao5umbxC13ccGstonIh"}'
```

---

### 7. `batch_create_feishu_blocks`

在文档中批量创建块（文本、标题、代码、列表、图片、Mermaid、白板）。

```bash
# 创建文本块
feishu-mcp-tool batch_create_feishu_blocks '{
  "documentId": "Uk6mdN6Hao5umbxC13ccGstonIh",
  "parentBlockId": "Uk6mdN6Hao5umbxC13ccGstonIh",
  "index": 0,
  "blocks": [
    {"blockType": "text", "options": {"text": "Hello World", "bold": true}},
    {"blockType": "heading", "options": {"text": "标题", "level": 1}},
    {"blockType": "code", "options": {"text": "console.log(\"test\")", "language": "JavaScript"}}
  ]
}'
```

---

### 8. `batch_update_feishu_block_text`

批量更新块的文本内容和样式。

```bash
feishu-mcp-tool batch_update_feishu_block_text '{
  "documentId": "Uk6mdN6Hao5umbxC13ccGstonIh",
  "updates": [
    {
      "blockId": "doxcnpIWdCpmEg5sUx00hr27lXe",
      "textElements": [{"text": "更新后的文本", "bold": true, "italic": false}]
    }
  ]
}'
```

---

### 9. `delete_feishu_document_blocks`

删除文档中指定范围的块。

```bash
feishu-mcp-tool delete_feishu_document_blocks '{
  "documentId": "Uk6mdN6Hao5umbxC13ccGstonIh",
  "parentBlockId": "Uk6mdN6Hao5umbxC13ccGstonIh",
  "startIndex": 0,
  "endIndex": 1
}'
```

---

### 10. `create_feishu_table`

在文档中创建表格。

```bash
feishu-mcp-tool create_feishu_table '{
  "documentId": "Uk6mdN6Hao5umbxC13ccGstonIh",
  "parentBlockId": "Uk6mdN6Hao5umbxC13ccGstonIh",
  "tableConfig": {"rowSize": 3, "columnSize": 4}
}'
```

---

### 11. `get_feishu_image_resource`

下载图片资源，返回 Buffer（含 base64 数据）。

```bash
feishu-mcp-tool get_feishu_image_resource '{"mediaId":"IN3QbYHQWoijZgxjkOzcpQcPnOB","extra":""}'
# 返回：{"type":"Buffer","data":[137,80,78,...]}
```

---

### 12. `upload_and_bind_image_to_block`

上传本地图片或 URL 图片并绑定到块。

```bash
# URL 图片
feishu-mcp-tool upload_and_bind_image_to_block '{
  "documentId": "Uk6mdN6Hao5umbxC13ccGstonIh",
  "blockId": "doxcnkLUSCAZrcWDz5Cj6oKSbQh",
  "imageSource": "https://example.com/image.png",
  "sourceType": "url"
}'

# 本地文件
feishu-mcp-tool upload_and_bind_image_to_block '{
  "documentId": "Uk6mdN6Hao5umbxC13ccGstonIh",
  "blockId": "doxcnkLUSCAZrcWDz5Cj6oKSbQh",
  "imageSource": "/path/to/image.png",
  "sourceType": "file"
}'
```

---

### 13. `search_feishu_documents`

搜索飞书文档和/或知识库。

```bash
feishu-mcp-tool search_feishu_documents '{"query":"MCP工具","searchType":"both"}'
# searchType: "doc" | "wiki" | "both"
```

---

### 14. `get_feishu_whiteboard_content`

获取白板内容和节点结构。

```bash
feishu-mcp-tool get_feishu_whiteboard_content '{"whiteboardId":"白板ID"}'
```

---

### 15. `fill_whiteboard_with_plantuml`

用 PlantUML 或 Mermaid 图表填充白板。

```bash
feishu-mcp-tool fill_whiteboard_with_plantuml '{
  "whiteboardId": "白板ID",
  "plantumlContent": "@startuml\nA -> B: Hello\n@enduml"
}'
```

---

### 16. `list_feishu_tasks`

列出当前用户负责的任务。

```bash
feishu-mcp-tool list_feishu_tasks '{}'
# 分页
feishu-mcp-tool list_feishu_tasks '{"pageToken":"xxxxx","completed":false}'
```

---

### 17. `create_feishu_task`

批量创建任务（支持嵌套子任务）。

```bash
feishu-mcp-tool create_feishu_task '{
  "tasks": [
    {
      "summary": "主任务",
      "description": "任务描述",
      "dueTimestamp": "1742212800000",
      "assigneeIds": ["ou_xxxx"],
      "subTasks": [
        {"summary": "子任务1"},
        {"summary": "子任务2"}
      ]
    }
  ]
}'
```

---

### 18. `update_feishu_task`

更新任务字段。

```bash
feishu-mcp-tool update_feishu_task '{
  "taskGuid": "4a3e075f-a198-4b1a-8d5e-d98a8a6b6e76",
  "summary": "新标题",
  "completedAt": "1773582350576"
}'
```

---

### 19. `delete_feishu_task`

批量删除任务。

```bash
feishu-mcp-tool delete_feishu_task '{
  "taskGuids": [
    "4a3e075f-a198-4b1a-8d5e-d98a8a6b6e76",
    "aa3a9647-0fdc-4280-906d-ef072c876ba4"
  ]
}'
```

---

### 20. `get_feishu_users`

按名称搜索或按 ID 批量获取用户。

```bash
# 按名称搜索
feishu-mcp-tool get_feishu_users '{"queries":[{"query":"张三"}]}'

# 按 open_id 批量获取
feishu-mcp-tool get_feishu_users '{"userIdsParam":[{"id":"ou_xxxx","idType":"open_id"}]}'
```

---

## 错误输出格式

所有错误统一以 JSON 格式输出到 stdout，exit 1：

```json
{"error": "错误描述信息"}
```

常见错误：
- `未知工具: "xxx"` — 工具名拼写错误
- `参数解析失败` — JSON 格式无效
- `参数校验失败` — 参数不满足 Zod schema 要求
- Feishu API 错误 — 包含 status、code、log_id 等字段

## 在 LLM Agent 中使用

典型用法（Python 示例）：

```python
import subprocess, json

def call_feishu_tool(tool_name: str, params: dict) -> dict:
    result = subprocess.run(
        ["feishu-mcp-tool", tool_name, json.dumps(params)],
        capture_output=True, text=True
    )
    return json.loads(result.stdout)

# 获取根文件夹
root = call_feishu_tool("get_feishu_root_folder_info", {})

# 创建文档
doc = call_feishu_tool("create_feishu_document", {
    "title": "我的文档",
    "folderToken": root["root_folder"]["token"]
})
```
