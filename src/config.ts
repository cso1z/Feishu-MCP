import { config } from "dotenv";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

// 确保在任何配置读取前加载.env文件
config();

interface ServerConfig {
  port: number;
  feishuAppId?: string;
  feishuAppSecret?: string;
  configSources: {
    port: "cli" | "env" | "default";
    feishuAppId?: "cli" | "env";
    feishuAppSecret?: "cli" | "env";
  };
}

function maskApiKey(key: string): string {
  if (key.length <= 4) return "****";
  return `****${key.slice(-4)}`;
}

interface CliArgs {
  port?: number;
  "feishu-app-id"?: string;
  "feishu-app-secret"?: string;
}

export function getServerConfig(isStdioMode: boolean): ServerConfig {
  // Parse command line arguments
  const argv = yargs(hideBin(process.argv))
    .options({
      port: {
        type: "number",
        description: "Port to run the server on",
      },
      "feishu-app-id": {
        type: "string",
        description: "Feishu App ID",
      },
      "feishu-app-secret": {
        type: "string",
        description: "Feishu App Secret",
      },
    })
    .help()
    .parseSync() as CliArgs;

  const config: ServerConfig = {
    port: 3333,
    configSources: {
      port: "default",
    },
  };

  // Handle PORT
  if (argv.port) {
    config.port = argv.port;
    config.configSources.port = "cli";
  } else if (process.env.PORT) {
    config.port = parseInt(process.env.PORT, 10);
    config.configSources.port = "env";
  }

  // 在加载环境变量之前添加日志
  console.log('开始加载环境变量配置...');
  console.log('当前环境变量 FEISHU_APP_ID:', process.env.FEISHU_APP_ID);
  console.log('当前环境变量 FEISHU_APP_SECRET:', process.env.FEISHU_APP_SECRET);

  // Handle Feishu configuration
  if (argv["feishu-app-id"]) {
    config.feishuAppId = argv["feishu-app-id"];
    config.configSources.feishuAppId = "cli";
    console.log(`飞书应用 ID 来自命令行参数: ${maskApiKey(config.feishuAppId)}`);
  } else if (process.env.FEISHU_APP_ID) {
    config.feishuAppId = process.env.FEISHU_APP_ID;
    config.configSources.feishuAppId = "env";
    console.log(`飞书应用 ID 来自环境变量: ${maskApiKey(config.feishuAppId)}`);
  } else {
    console.log('未提供飞书应用 ID');
  }

  if (argv["feishu-app-secret"]) {
    config.feishuAppSecret = argv["feishu-app-secret"];
    config.configSources.feishuAppSecret = "cli";
    console.log(`飞书应用密钥来自命令行参数: ${maskApiKey(config.feishuAppSecret)}`);
  } else if (process.env.FEISHU_APP_SECRET) {
    config.feishuAppSecret = process.env.FEISHU_APP_SECRET;
    config.configSources.feishuAppSecret = "env";
    console.log(`飞书应用密钥来自环境变量: ${maskApiKey(config.feishuAppSecret)}`);
  } else {
    console.log('未提供飞书应用密钥');
  }

  // 输出飞书配置状态总结
  if (config.feishuAppId && config.feishuAppSecret) {
    console.log('飞书配置已完整提供，服务将被初始化');
  } else if (config.feishuAppId || config.feishuAppSecret) {
    console.log('飞书配置不完整，服务将不会初始化');
  } else {
    console.log('未提供飞书配置，服务将不会初始化');
  }

  // 验证配置
  if (!config.feishuAppId || !config.feishuAppSecret) {
    console.error("FEISHU_APP_ID 和 FEISHU_APP_SECRET 是必需的（通过命令行参数 --feishu-app-id 和 --feishu-app-secret 或 .env 文件）");
    process.exit(1);
  }

  // Log configuration sources
  if (!isStdioMode) {
    console.log("\n配置信息:");
    console.log(`- PORT: ${config.port} (来源: ${config.configSources.port})`);
    if (config.feishuAppId) {
      console.log(`- FEISHU_APP_ID: ${maskApiKey(config.feishuAppId)} (来源: ${config.configSources.feishuAppId})`);
    }
    if (config.feishuAppSecret) {
      console.log(`- FEISHU_APP_SECRET: ${maskApiKey(config.feishuAppSecret)} (来源: ${config.configSources.feishuAppSecret})`);
    }
    console.log(); // 空行，提高可读性
  }

  return config;
}
