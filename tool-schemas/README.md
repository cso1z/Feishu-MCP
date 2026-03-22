# tool-schemas

此目录存放每个 MCP 工具的 JSON Schema 定义文件，由 MCP 客户端（如 Cursor）连接本服务后自动生成。

## 文件来源

1. 启动 MCP server（`feishu-mcp`）
2. 在 Cursor / 其他 MCP 客户端中连接该 server
3. 客户端根据 MCP 协议自动解析工具定义并生成 JSON
4. 将生成的文件复制到本目录

## 用途

- `feishu-tool help <tool-name>` 命令读取此目录向 LLM 提供工具的详细说明
- 作为工具参数 schema 的对外文档参考

## 更新时机

当 `src/modules/` 下的工具定义（描述、参数）发生变更后，重新从客户端生成并替换对应文件。