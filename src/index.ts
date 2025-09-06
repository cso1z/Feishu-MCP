import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FeishuMcpServer } from "./server.js";
import { Config } from "./utils/config.js";
import { fileURLToPath } from 'url';
import { resolve } from 'path';

export async function startServer(): Promise<void> {
  // Check if we're running in stdio mode (e.g., via CLI)
  const isStdioMode = process.env.NODE_ENV === "cli" || process.argv.includes("--stdio");

  // 获取配置实例
  const config = Config.getInstance();
  
  // 打印配置信息
  config.printConfig(isStdioMode);
  
  // 验证配置
  if (!config.validate()) {
    console.error("配置验证失败，无法启动服务器");
    process.exit(1);
  }

  // 创建MCP服务器
  const server = new FeishuMcpServer();

  console.log(`isStdioMode:${isStdioMode}`)

  if (isStdioMode) {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } else {
    console.log(`Initializing Feishu MCP Server in HTTP mode on port ${config.server.port}...`);
    await server.startHttpServer(config.server.port);
  }
}

// 跨平台兼容的方式检查是否直接运行
const currentFilePath = fileURLToPath(import.meta.url);
const executedFilePath = resolve(process.argv[1]);

console.log(`meta.url:${currentFilePath}  argv:${executedFilePath}` );

if (currentFilePath === executedFilePath) {
  console.log(`startServer`);
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
} else {
  console.log(`not startServer`);
}
