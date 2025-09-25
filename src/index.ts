import { FeishuMcpServer } from "./server.js";
import { z } from "zod";

// 配置 schema（可根据实际需要扩展）
export const configSchema = z.object({
  feishuAppId: z.string().optional(),
  feishuAppSecret: z.string().optional(),
  port: z.number().default(3333).optional(),
});

export default function createServer({ config }: { config: z.infer<typeof configSchema> }) {
  const server = new FeishuMcpServer();
  // 这里可根据 config 进行初始化
  return server;
}
