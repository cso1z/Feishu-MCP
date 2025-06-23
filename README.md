# 飞书 MCP 服务器


[![npm version](https://img.shields.io/npm/v/feishu-mcp?color=blue&label=npm)](https://www.npmjs.com/package/feishu-mcp)
[![smithery badge](https://smithery.ai/badge/@cso1z/feishu-mcp)](https://smithery.ai/server/@cso1z/feishu-mcp)
[![wechat](https://img.shields.io/badge/交流群-wechat-brightgreen?logo=wechat)](#group-qr)
[![MIT License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

为 [Cursor](https://cursor.sh/)、[Windsurf](https://codeium.com/windsurf)、[Cline](https://cline.bot/) 和其他 AI 驱动的编码工具提供访问飞书文档的能力，基于 [Model Context Protocol](https://modelcontextprotocol.io/introduction) 服务器实现。

本项目让 AI 编码工具能够直接获取和理解飞书文档的结构化内容，显著提升文档处理的智能化和效率。

**完整覆盖飞书文档的真实使用流程，助你高效利用文档资源：**
1. **文件夹目录获取**：快速获取和浏览飞书文档文件夹下的所有文档，便于整体管理和查找。
2. **内容获取与理解**：支持结构化、分块、富文本等多维度内容读取，AI 能精准理解文档上下文。
3. **智能创建与编辑**：可自动创建新文档、批量生成和编辑内容，满足多样化写作需求。
4. **高效检索与搜索**：内置关键字搜索，帮助你在大量文档中迅速找到目标信息。

本项目让你在飞书文档的日常使用流程中实现智能获取、编辑和搜索，极大提升内容处理效率和体验。

> ⭐ **Star 本项目，第一时间获取最新功能和重要更新！** 关注项目可以让你不错过任何新特性、修复和优化，助你持续高效使用。你的支持也将帮助我们更好地完善和发展项目。⭐


## 🛠️ 工具功能详情

| 功能类别 | 工具名称                                 | 描述          | 使用场景          | 状态 |
|---------|--------------------------------------|-------------|---------------|------|
| **文档管理** | `create_feishu_document`             | 创建新的飞书文档    | 从零开始创建文档      | ✅ 已完成 |
| | `get_feishu_document_info`           | 获取文档基本信息    | 验证文档存在性和权限    | ✅ 已完成 |
| | `get_feishu_document_content`        | 获取文档纯文本内容   | 内容分析和处理       | ✅ 已完成 |
| | `get_feishu_document_blocks`         | 获取文档块结构     | 了解文档层级结构      | ✅ 已完成 |
| | `get_feishu_block_content`           | 获取特定块内容     | 检查块属性和格式      | ✅ 已完成 |
| **内容编辑** | `batch_create_feishu_blocks`         | 批量创建多个块     | 高效创建连续内容      | ✅ 已完成 |
| | `update_feishu_block_text`           | 更新块文本内容     | 修改现有内容        | ✅ 已完成 |
| | `create_feishu_text_block`           | 创建单个文本块     | 精确样式控制的文本创建   | ✅ 已完成 |
| | `create_feishu_code_block`           | 创建代码块       | 技术文档和代码示例     | ✅ 已完成 |
| | `create_feishu_heading_block`        | 创建标题块       | 章节标题和层级结构     | ✅ 已完成 |
| | `create_feishu_list_block`           | 创建列表块       | 有序和无序列表创建     | ✅ 已完成 |
| | `delete_feishu_document_blocks`      | 删除文档块       | 清理和重构文档内容     | ✅ 已完成 |
| **文件夹管理** | `get_feishu_root_folder_info`        | 获取根文件夹信息    | 获取基础文件夹信息     | ✅ 已完成 |
| | `get_feishu_folder_files`            | 获取文件夹文件列表   | 浏览文件夹内容       | ✅ 已完成 |
| | `create_feishu_folder`               | 创建新文件夹      | 组织文档结构        | ✅ 已完成 |
| **搜索功能** | `search_feishu_documents`            | 搜索文档        | 查找特定内容        | ✅ 已完成 |
| **工具功能** | `convert_feishu_wiki_to_document_id` | Wiki链接转换    | 将Wiki链接转为文档ID | ✅ 已完成 |
| | `get_feishu_image_resource`          | 获取图片资源      | 下载文档中的图片      | ✅ 已完成 |
| **高级功能** | 表格操作                                 | 创建和编辑表格     | 结构化数据展示       | 🚧 计划中 |
| | 图表插入                                 | 支持各类数据可视化图表 | 数据展示和分析       | 🚧 计划中 |
| | 流程图                                  | 支持流程图和思维导图  | 流程梳理和可视化      | 🚧 计划中 |
| | 图片插入                                 | 支持插入各种类型图片  | 修改文档内容        | 🚧 计划中 |
| | 公式支持                                 | 支持数学公式和科学符号 | 学术和技术文档       | 🚧 计划中 |

### 🎨 支持的样式功能

- **文本样式**：粗体、斜体、下划线、删除线、行内代码
- **文本颜色**：灰色、棕色、橙色、黄色、绿色、蓝色、紫色
- **对齐方式**：左对齐、居中、右对齐
- **标题级别**：支持1-9级标题
- **代码块**：支持多种编程语言语法高亮
- **列表**：有序列表（编号）、无序列表（项目符号）

## 🔧 飞书配置教程

**⚠️ 重要提示：在开始使用之前，必须先完成飞书应用配置，否则无法正常使用本工具。**

关于如何创建飞书应用和获取应用凭证的说明可以在[官方教程](https://open.feishu.cn/document/home/develop-a-bot-in-5-minutes/create-an-app)找到。

**详细的飞书应用配置步骤**：有关注册飞书应用、配置权限、添加文档访问权限的详细指南，请参阅 [手把手教程 FEISHU_CONFIG.md](FEISHU_CONFIG.md)。


## 🏃‍♂️ 快速开始

### 方式一：使用 NPM 快速运行

```bash
npx feishu-mcp@latest --feishu-app-id=<你的飞书应用ID> --feishu-app-secret=<你的飞书应用密钥>
```

### 方式二：使用 Smithery 平台

**已发布到 Smithery 平台，可访问：** https://smithery.ai/server/@cso1z/feishu-mcp

### 方式三：本地运行

1. **克隆仓库**
   ```bash
   git clone https://github.com/cso1z/Feishu-MCP.git
   cd Feishu-MCP
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **配置环境变量**
   
   **macOS/Linux:**
   ```bash
   cp .env.example .env
   ```
   
   **Windows:**
   ```cmd
   copy .env.example .env
   ```

4. **编辑 .env 文件**
   
   你可以通过以下任一方式编辑 .env 文件：
   
   **方式一：使用文件管理器**
   - 在项目文件夹中找到 `.env` 文件
   - 双击打开（系统会自动选择文本编辑器）
   - 或右键选择"打开方式" → 选择文本编辑器
   
   **方式二：使用 VS Code**
   ```bash
   code .env
   ```
   
   **方式三：使用命令行编辑器**
   ```bash
   # macOS/Linux
   nano .env
   
   # Windows
   notepad .env
   ```
   
   填入你的飞书应用凭证：
   ```env
   FEISHU_APP_ID=cli_xxxxx
   FEISHU_APP_SECRET=xxxxx
   PORT=3333
   ```

5. **运行服务器**
   ```bash
   pnpm run dev
   ```

## ⚙️ 项目配置

### 环境变量配置

| 适用场景 | 变量名 | 必需 | 描述 | 默认值 |
|--------|--------|------|------|-------|
| 单用户 | `FEISHU_APP_ID` | 二选一 | 飞书应用 ID | - |
|  | `FEISHU_APP_SECRET` |  | 飞书应用密钥 | - |
| 多用户 | `FEISHU_TOKEN_SERVICE_URL` | 二选一 | 自定义token服务地址，支持userKey换token | - |
| - | `PORT` | ❌ | 服务器端口 | `3333` |


本项目支持单一机器人、企业多账号、SaaS多租户等多种飞书接入场景，用户可根据实际需求灵活选择配置方式。

> **注意：** 上表中 `FEISHU_APP_ID`+`FEISHU_APP_SECRET` 与 `FEISHU_TOKEN_SERVICE_URL` 只需配置任意一组即可，二者都配置时优先使用 `FEISHU_TOKEN_SERVICE_URL`。

> "单用户"指所有请求共用同一身份（适合个人/团队机器人）；"多用户"指支持多账号/多租户token分发（适合SaaS、企业多账号等）。

> **配置使用场景说明：**
>
> - **仅配置 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`**：适用于单一应用/机器人场景，所有请求共用同一飞书身份。
> - **仅配置 `FEISHU_TOKEN_SERVICE_URL`**：适用于多用户、多身份、需自定义token分发的场景（如SaaS、企业多账号、按用户授权等）。服务端需实现token分发接口。
> - **两者都配置时**：优先使用 `FEISHU_TOKEN_SERVICE_URL`，仅当该服务未配置或userKey为空时才回退到应用ID/密钥。
>
> **推荐：**
> - 普通个人/团队机器人建议直接用 `FEISHU_APP_ID` + `FEISHU_APP_SECRET`。
> - 需要支持多用户隔离、按用户授权的高级场景建议实现并配置 `FEISHU_TOKEN_SERVICE_URL`。

### 自定义 Token 服务接口(FEISHU_TOKEN_SERVICE_URL)说明

- **请求类型**: `POST`
- **请求参数格式**:
  ```json
  { "userKey": "string" }
  ```
- **返回数据格式**:
  ```json
  { "token": "string", "expire": 3600 }
  ```
  - `token`：飞书访问令牌（必填）
  - `expire`：令牌有效期（可选，单位：秒，默认3600）

### 命令行参数

| 参数 | 描述 | 默认值 |
|------|------|-------|
| `--port` | 服务器监听端口 | `3333` |
| `--log-level` | 日志级别 (debug/info/log/warn/error/none) | `info` |
| `--feishu-app-id` | 飞书应用 ID | - |
| `--feishu-app-secret` | 飞书应用密钥 | - |
| `--feishu-base-url` | 飞书API基础URL | `https://open.feishu.cn/open-apis` |
| `--cache-enabled` | 是否启用缓存 | `true` |
| `--cache-ttl` | 缓存生存时间（秒） | `3600` |
| `--stdio` | 命令模式运行 | - |
| `--help` | 显示帮助菜单 | - |
| `--version` | 显示版本号 | - |

### 配置文件方式（适用于 Cursor、Cline 等）

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
  },
   "feishu_local": {
      "url": "http://localhost:3333/sse"
   }
}
```

## 🚨 故障排查

### 权限问题排查
先对照配置问题查看： [手把手教程 FEISHU_CONFIG.md](FEISHU_CONFIG.md)。

#### 问题确认
1. **检查应用权限**：确保应用已获得必要的文档访问权限
2. **验证文档授权**：确认目标文档已授权给应用或应用所在的群组
3. **检查可用范围**：确保应用发布版本的可用范围包含文档所有者

#### 权限验证与排查
1. 获取token：[自建应用获取 app_access_token](https://open.feishu.cn/api-explorer?apiName=app_access_token_internal&project=auth&resource=auth&version=v3)
2. 使用第1步获取的token，验证是否有权限访问该文档：[获取文档基本信息](https://open.feishu.cn/api-explorer?apiName=get&project=docx&resource=document&version=v1)


### 常见问题

- **找不到应用**：检查应用是否已发布且可用范围配置正确
- **权限不足**：参考[云文档常见问题](https://open.feishu.cn/document/ukTMukTMukTM/uczNzUjL3czM14yN3MTN)
- **知识库访问问题**：参考[知识库常见问题](https://open.feishu.cn/document/server-docs/docs/wiki-v2/wiki-qa)


## 💖 支持项目

如果这个项目帮助到了你，请考虑：

- ⭐ 给项目一个 Star
- 🐛 报告 Bug 和问题
- 💡 提出新功能建议
- 📖 改进文档
- 🔀 提交 Pull Request

你的支持是我们前进的动力！

**<span id="group-qr">欢迎加入我们的交流群，与更多小伙伴一起交流：</span>**

<img src="./image/group_qr.jpg" alt="飞书MCP交流群二维码" width="300" />

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！如果你在使用过程中遇到问题或有改进建议，也欢迎随时告诉我们。

## 📄 许可证

MIT License

