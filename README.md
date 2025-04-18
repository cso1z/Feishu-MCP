# 飞书 MCP 服务器
[![smithery badge](https://smithery.ai/badge/@cso1z/feishu-mcp)](https://smithery.ai/server/@cso1z/feishu-mcp)

为 [Cursor](https://cursor.sh/)、[Windsurf](https://codeium.com/windsurf)、[Cline](https://cline.bot/) 和其他 AI 驱动的编码工具提供访问飞书文档的能力，基于 [Model Context Protocol](https://modelcontextprotocol.io/introduction) 服务器实现。

当 Cursor 能够访问飞书文档数据时，它可以更准确地理解和处理文档内容，比其他方法（如复制粘贴文本）更加高效。

## 核心功能

### 文档管理
- **创建飞书文档**：支持在指定文件夹中创建新的飞书文档

### 文档内容操作
- **获取文档信息**：
  - 获取文档基本信息（标题、版本等）
  - 获取文档区块结构和层级
  - 获取特定区块的详细内容
- **获取文档纯文本内容**：支持提取文档的完整纯文本内容，便于分析和处理
- **编辑文档内容**：
  - **文本块操作**：
    - 创建和更新带有丰富样式的文本块（粗体、斜体、下划线、删除线、行内代码）
    - 支持文本颜色设置（灰色、棕色、橙色、黄色、绿色、蓝色、紫色）
    - 支持文本对齐方式调整（左对齐、居中、右对齐）
  - **标题块操作**：创建从一级到九级的不同级别标题
  - **代码块操作**：
    - 创建多种编程语言的代码块
    - 支持代码语法高亮
    - 支持自动换行设置
  - **列表操作**：
    - 创建有序列表（编号列表）
    - 创建无序列表（项目符号列表）
  - **批量内容创建**：支持在单次操作中创建多个不同类型的内容块

### 计划中的功能
- **高级内容插入**：
  - 表格插入：支持行列结构化数据
  - 插入图表：支持各类数据可视化图表
  - 插入流程图：支持流程图和思维导图
  - 插入公式：支持数学公式和科学符号
- 图表、流程图的内容识别和解析

快速开始，详见[配置](#配置)部分：

```bash
npx feishu-mcp --feishu-app-id=<你的飞书应用ID> --feishu-app-secret=<你的飞书应用密钥>
```

## 工作原理

1. 在 Cursor 的 Agent 模式下打开编辑器。
2. 粘贴飞书文档的链接。
3. 要求 Cursor 基于飞书文档执行操作——例如，分析文档内容或创建相关代码。
4. Cursor 将从飞书获取相关元数据并使用它来辅助编写代码。

这个 MCP 服务器专为 Cursor 设计。在响应来自[飞书 API](https://open.feishu.cn/document/home/introduction-to-lark-open-platform/overview) 的内容之前，它会简化和转换响应，确保只向模型提供最相关的文档信息。
## 安装

### 使用 NPM 快速运行服务器

你可以使用 NPM 快速运行服务器，无需安装或构建仓库：

```bash
npx feishu-mcp --feishu-app-id=<你的飞书应用ID> --feishu-app-secret=<你的飞书应用密钥>

# 或
pnpx feishu-mcp --feishu-app-id=<你的飞书应用ID> --feishu-app-secret=<你的飞书应用密钥>

# 或
yarn dlx feishu-mcp --feishu-app-id=<你的飞书应用ID> --feishu-app-secret=<你的飞书应用密钥>

# 或
bunx feishu-mcp --feishu-app-id=<你的飞书应用ID> --feishu-app-secret=<你的飞书应用密钥>
```

**已发布到smithery平台，可访问:https://smithery.ai/server/@cso1z/feishu-mcp**


关于如何创建飞书应用和获取应用凭证的说明可以在[这里](https://open.feishu.cn/document/home/develop-a-bot-in-5-minutes/create-an-app)找到。

### 使用配置文件的工具的 JSON 配置

许多工具如 Windsurf、Cline 和 [Claude Desktop](https://claude.ai/download) 使用配置文件来启动服务器。

`feishu-mcp` 服务器可以通过在配置文件中添加以下内容来配置：

```json
{
  "mcpServers": {
    "feishu-mcp": {
      "command": "npx",
      "args": ["-y", "feishu-mcp", "--stdio"],
      "env": {
        "FEISHU_APP_ID": "<你的飞书应用ID>",
        "FEISHU_APP_SECRET": "<你的飞书应用密钥>"
      }
    }
  }
}
```

### 从本地源代码运行服务器

1. 克隆仓库
2. 使用 `pnpm install` 安装依赖
3. 复制 `.env.example` 到 `.env` 并填入你的[飞书应用凭证](https://open.feishu.cn/document/home/develop-a-bot-in-5-minutes/create-an-app)。
4. 使用 `pnpm run dev` 运行服务器，可以使用[命令行参数](#命令行参数)部分的任何标志。

## 配置

服务器可以使用环境变量（通过 `.env` 文件）或命令行参数进行配置。命令行参数优先于环境变量。

### 环境变量

- `FEISHU_APP_ID`：你的[飞书应用 ID](https://open.feishu.cn/document/home/develop-a-bot-in-5-minutes/create-an-app)（必需）
- `FEISHU_APP_SECRET`：你的[飞书应用密钥](https://open.feishu.cn/document/home/develop-a-bot-in-5-minutes/create-an-app)（必需）
- `PORT`：运行服务器的端口（默认：3333）

### 命令行参数

- `--version`：显示版本号
- `--feishu-app-id`：你的飞书应用 ID
- `--feishu-app-secret`：你的飞书应用密钥
- `--port`：运行服务器的端口
- `--stdio`：在命令模式下运行服务器，而不是默认的 HTTP/SSE
- `--help`：显示帮助菜单

## 连接到 Cursor

### 配置 Cursor

1. 打开 Cursor 设置
2. 导航到 `Settings > AI > MCP Servers`
3. 添加新服务器，URL 为 `http://localhost:3333`（或你配置的端口）
4. 点击 "Verify Connection" 确保连接成功

## 使用方法

1. 在 Cursor 中，打开 AI 面板（默认快捷键 `Cmd+K` 或 `Ctrl+K`）
2. 如果需要新建一个飞书文档编辑信息，应该明确制定一个folderToken,可以打开一个飞书文档目录如：`https://vq5xxxxx7bc.feishu.cn/drive/folder/FPKvfjdxxxxx706RnOc查找`
2. 如果需要修改飞书文档内容应该明确告知飞书文档链接，例如：`https://vq5ixxxx7bc.feishu.cn/docx/J6T0d6exxxxxxxDdc1zqwnph`
3. 询问关于文档的问题或请求基于文档内容执行操作
4. 创建编辑文档都需要权限，可以到飞书开放平台对账号进行测试`https://open.feishu.cn/api-explorer/cli_a75a8ca0ac79100c?apiName=tenant_access_token_internal&from=op_doc&project=auth&resource=auth&version=v3`

## 文档权限与故障排查

### 权限类型
权限分为两种：机器人权限、文档访问权限

### 权限验证与排查
1. 获取token：[https://open.feishu.cn/api-explorer/cli_a7582508c93ad00d?apiName=tenant_access_token_internal&project=auth&resource=auth&version=v3](https://open.feishu.cn/api-explorer/cli_a7582508c93ad00d?apiName=tenant_access_token_internal&project=auth&resource=auth&version=v3)
2. 使用第1步获取的token，验证是否有权限访问该文档：[https://open.feishu.cn/api-explorer/cli_a7582508c93ad00d?apiName=get&project=docx&resource=document&version=v1](https://open.feishu.cn/api-explorer/cli_a7582508c93ad00d?apiName=get&project=docx&resource=document&version=v1)

### 排查方法
在飞书开发平台测试权限正常（在开放平台调试，失败时会有充足提示信息和指导）

### 文档授权
如遇到权限问题，请参考[云文档常见问题](https://open.feishu.cn/document/ukTMukTMukTM/uczNzUjL3czM14yN3MTN)、[知识库常见问题](https://open.feishu.cn/document/server-docs/docs/wiki-v2/wiki-qa)，特别关注如何为应用或用户开通文档权限。

## 许可证

MIT
