# 飞书 MCP 服务器


[![npm version](https://img.shields.io/npm/v/feishu-mcp?color=blue&label=npm)](https://www.npmjs.com/package/feishu-mcp)
[![MIT License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

为 [Cursor](https://cursor.sh/)、[Windsurf](https://codeium.com/windsurf)、[Cline](https://cline.bot/) 和其他 AI 驱动的编码工具提供访问、编辑和结构化处理飞书文档的能力，基于 [Model Context Protocol](https://modelcontextprotocol.io/introduction) 服务器实现。

本项目让 AI 编码工具能够直接获取和理解飞书文档的结构化内容，显著提升文档处理的智能化和效率。

**完整覆盖飞书文档的真实使用流程，助你高效利用文档资源：**
1. **文件夹目录获取**：快速获取和浏览飞书文档文件夹下的所有文档，便于整体管理和查找。
2. **内容获取与理解**：支持结构化、分块、富文本等多维度内容读取，AI 能精准理解文档上下文。
3. **智能创建与编辑**：可自动创建新文档、批量生成和编辑内容，满足多样化写作需求。
4. **高效检索与搜索**：内置关键字搜索，帮助你在大量文档中迅速找到目标信息。

本项目让你在飞书文档的日常使用流程中实现智能获取、编辑和搜索，提升内容处理效率和体验。

### 🎬 使用演示视频

你可以通过以下视频了解 MCP 的实际使用效果和操作流程：

<a href="https://www.bilibili.com/video/BV1z7MdzoEfu/?vd_source=94c14da5a71aeb01f665f159dd3d89c8">
  <img src="image/demo.png" alt="飞书 MCP 使用演示" width="300"/>
</a>

<a href="https://www.bilibili.com/video/BV18z3gzdE1w/?vd_source=94c14da5a71aeb01f665f159dd3d89c8">
  <img src="image/demo_1.png" alt="飞书 MCP 使用演示" width="300"/>
</a>

> ⭐ **Star 本项目，第一时间获取最新功能和重要更新！** 关注项目可以让你不错过任何新特性、修复和优化，助你持续高效使用。你的支持也将帮助我们更好地完善和发展项目。⭐

---

## 🛠️ 工具功能详情

| 功能类别 | 工具名称                                                         | 描述                | 使用场景          | 状态 |
|---------|--------------------------------------------------------------|-------------------|---------------|------|
| **文档管理** | `create_feishu_document`                                     | 创建新的飞书文档          | 从零开始创建文档      | ✅ 已完成 |
| | `get_feishu_document_info`                                   | 获取文档基本信息          | 验证文档存在性和权限    | ✅ 已完成 |
| | `get_feishu_document_blocks`                                 | 获取文档块结构           | 了解文档层级结构      | ✅ 已完成 |
| **内容编辑** | `batch_create_feishu_blocks`                                 | 批量创建多个块           | 高效创建连续内容      | ✅ 已完成 |
| | `update_feishu_block_text`                                   | 更新块文本内容           | 修改现有内容        | ✅ 已完成 |
| | `delete_feishu_document_blocks`                              | 删除文档块             | 清理和重构文档内容     | ✅ 已完成 |
| **文件夹管理** | `get_feishu_folder_files`                                    | 获取文件夹文件列表         | 浏览文件夹内容       | ✅ 已完成 |
| | `create_feishu_folder`                                       | 创建新文件夹            | 组织文档结构        | ✅ 已完成 |
| **搜索功能** | `search_feishu_documents`                                    | 搜索文档              | 查找特定内容        | ✅ 已完成 |
| **工具功能** | `convert_feishu_wiki_to_document_id`                         | Wiki链接转换          | 将Wiki链接转为文档ID | ✅ 已完成 |
| | `get_feishu_image_resource`                                  | 获取图片资源            | 下载文档中的图片      | ✅ 已完成 |
| | `get_feishu_whiteboard_content`                              | 获取画板内容 | 获取画板中的图形元素和结构(流程图、思维导图等) | ✅ 已完成 |
| **高级功能** | `create_feishu_table`                                         | 创建和编辑表格           | 结构化数据展示       | ✅ 已完成 |
| | 流程图插入                                                        | 支持流程图和思维导图        | 流程梳理和可视化      | ✅ 已完成 |
| 图片插入  | `upload_and_bind_image_to_block` | 支持插入本地和远程图片       | 修改文档内容        | ✅ 已完成 |
| | 公式支持                                                         | 支持数学公式            | 学术和技术文档       | ✅ 已完成 |

### 🎨 支持的样式功能（基本支持md所有格式）

- **文本样式**：粗体、斜体、下划线、删除线、行内代码
- **文本颜色**：灰色、棕色、橙色、黄色、绿色、蓝色、紫色
- **对齐方式**：左对齐、居中、右对齐
- **标题级别**：支持1-9级标题
- **代码块**：支持多种编程语言语法高亮
- **列表**：有序列表（编号）、无序列表（项目符号）
- **图片**：支持本地图片和网络图片
- **公式**：在文本块中插入数学公式，支持LaTeX语法
- **mermaid图表**：支持流程图、时序图、思维导图、类图、饼图等等
- **表格**：支持创建多行列表格，单元格可包含文本、标题、列表、代码块等多种内容类型

---

## 📈 一周计划：提升工具效率

- ~~**精简工具集**：21个工具 → 13个工具，移除冗余，聚焦核心功能~~ 0.0.15 ✅
- ~~**优化描述**：7000+ tokens → 3000+ tokens，简化提示，节省请求token~~ 0.0.15 ✅
- ~~**批量增强**：新增批量更新、批量图片上传，单次操作效率提升50%~~ 0.0.15 ✅
- **流程优化**：减少多步调用，实现一键完成复杂任务
- ~~**支持多种凭证类型**：包括 tenant_access_token和 user_access_token，满足不同场景下的认证需求~~  (飞书应用配置发生变更) 0.0.16 ✅。
- ~~**支持cursor用户登录**：方便在cursor平台用户认证   不做了,没必要 ❌~~
- ~~**支持mermaid图表**：流程图、时序图等等，丰富文档内容~~ 0.1.11 ✅
- ~~**支持表格创建**：创建包含各种块类型的复杂表格，支持样式控制~~ 0.1.2 ✅
- ~~**支持飞书多用户user认证**：一人部署，可以多人使用~~ 0.1.3 ✅
- ~~**支持user_access_token自动刷新**：无需频繁授权，提高使用体验~~ 0.1.6 ✅

---

## 🔧 飞书配置教程

**⚠️ 重要提示：在开始使用之前，必须先完成飞书应用配置，否则无法正常使用本工具。**

关于如何创建飞书应用和获取应用凭证的说明可以在[官方教程](https://open.feishu.cn/document/home/develop-a-bot-in-5-minutes/create-an-app)找到。

**详细的飞书应用配置步骤**：有关注册飞书应用、配置权限、添加文档访问权限的详细指南，请参阅 [手把手教程 FEISHU_CONFIG.md](FEISHU_CONFIG.md)。

---

## 🏃‍♂️ 快速开始

### 方式一：使用 NPM 快速运行

```bash
npx feishu-mcp@latest --feishu-app-id=<你的飞书应用ID> --feishu-app-secret=<你的飞书应用密钥> --feishu-auth-type=<tenant/user>
```

### 方式二：本地运行
1. **克隆仓库**
   ```bash
   git clone https://github.com/cso1z/Feishu-MCP.git
   cd Feishu-MCP
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **配置环境变量(复制一份.env.example保存为.env文件)**

4. **编辑 .env 文件**
  在项目根目录下找到并用任意文本编辑器打开 `.env` 文件，填写你的飞书应用凭证：
   ```env
   FEISHU_APP_ID=cli_xxxxx
   FEISHU_APP_SECRET=xxxxx
   PORT=3333
   FEISHU_AUTH_TYPE=tenant/user
   ```

5. **运行服务器**
   ```bash
   pnpm run dev
   ```

## ⚙️ 项目配置

### 环境变量配置

| 变量名 | 必需 | 描述                                                                 | 默认值 |
|--------|------|--------------------------------------------------------------------|-------|
| `FEISHU_APP_ID` | ✅ | 飞书应用 ID                                                            | - |
| `FEISHU_APP_SECRET` | ✅ | 飞书应用密钥                                                             | - |
| `PORT` | ❌ | 服务器端口                                                              | `3333` |
| `FEISHU_AUTH_TYPE` | ❌ | 认证凭证类型，使用 `user`（用户级,使用时是用户的身份操作飞书文档，需OAuth授权），使用 `tenant`（应用级，默认） | `tenant` |

### 配置文件方式（适用于 Cursor、Cline 等）

```json
{
  "mcpServers": {
    "feishu-mcp": {
      "command": "npx",
      "args": ["-y", "feishu-mcp", "--stdio"],
      "env": {
        "FEISHU_APP_ID": "<你的飞书应用ID>",
        "FEISHU_APP_SECRET": "<你的飞书应用密钥>",
        "FEISHU_AUTH_TYPE": "<tenant/user>"
      }
    },
    "feishu_local": {
      "url": "http://localhost:3333/sse?userKey=123456"
    }
  }
}
```
---

## 📝 使用贴士（重要）

1. ### **推荐指定文件夹**：
   新建文档时，建议主动提供飞书文件夹 token（可为具体文件夹或根文件夹），这样可以更高效地定位和管理文档。如果不确定具体的子文件夹，可以让LLM自动在你指定的文件夹下查找最合适的子目录来新建文档。
   
   > **如何获取文件夹 token？**
   > 打开飞书文件夹页面，复制链接（如 `https://.../drive/folder/xxxxxxxxxxxxxxxxxxxxxx`），token 就是链接最后的那一串字符（如 `xxxxxxxxxxxxxxxxxxxxxx`，请勿泄露真实 token）。

2. ### **图片上传路径说明**：
   本地运行 MCP 时，图片路径既支持本地绝对路径，也支持 http/https 网络图片；如在服务器环境，仅支持网络图片链接（由于cursor调用mcp时参数长度限制，暂不支持直接上传图片文件本体，请使用图片路径或链接方式上传）。

3. ### **公式使用说明**：
   在文本块中可以混合使用普通文本和公式元素。公式使用LaTeX语法，如：`1+2=3`、`\frac{a}{b}`、`\sqrt{x}`等。支持在同一文本块中包含多个公式和普通文本。

4. ### **使用飞书user认证**：
   user认证与tenant认证在增加权限时是有区分的，所以**在初次由tenant切换到user时需要注意配置的权限**；为了区分不同的用户需要在配置mcp server服务的url增加query参数：userKey，**该值是用户的唯一标识 所以最好在设置时越随机越好**
---
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

---

## 📚 开发者 Wiki

详细的开发文档和技术指南，为学习者和贡献者提供全面的指导：

- **[Wiki 首页](https://github.com/cso1z/Feishu-MCP/wiki)** - 完整的文档索引和快速导航
- **[架构设计](https://github.com/cso1z/Feishu-MCP/wiki/架构设计)** - 整体架构和技术栈说明
- **[核心模块详解](https://github.com/cso1z/Feishu-MCP/wiki/核心模块详解)** - 各模块的实现细节和代码示例
- **[认证与授权](https://github.com/cso1z/Feishu-MCP/wiki/认证与授权机制)** - Token 管理和多用户支持机制
- **[开发者指南](https://github.com/cso1z/Feishu-MCP/wiki/开发者指南)** - 环境搭建、开发流程、调试技巧
- **[API 参考](https://github.com/cso1z/Feishu-MCP/wiki/API-参考文档)** - 所有工具函数的详细文档
- **[最佳实践](https://github.com/cso1z/Feishu-MCP/wiki/最佳实践)** - 代码规范、性能优化、安全实践
- **[MCP 协议实现](https://github.com/cso1z/Feishu-MCP/wiki/MCP-协议实现)** - MCP 协议详解和传输层实现

---

## 💖 支持项目

如果这个项目帮助到了你，请考虑：

- ⭐ 给项目一个 Star
- 🐛 报告 Bug 和问题
- 💡 提出新功能建议
- 📖 改进文档
- 🔀 提交 Pull Request

你的支持是我们前进的动力！


## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=cso1z/feishu-mcp&type=Timeline)](https://www.star-history.com/#cso1z/feishu-mcp&Timeline)
