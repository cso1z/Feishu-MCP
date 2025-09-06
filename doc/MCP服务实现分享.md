# 飞书 MCP 服务实现分享

## 1. MCP 协议简介

MCP（Model Context Protocol）是一种用于AI模型与外部系统交互的协议，它允许AI模型（如Cursor、Windsurf、Cline等）能够访问和操作外部系统的数据，从而提供更智能、更精准的服务。

### 1.1 MCP 的核心理念

- **上下文扩展**：允许AI模型获取更多的上下文信息，超越用户输入的限制
- **工具调用**：使AI模型能够通过定义好的接口调用外部系统的功能
- **双向通信**：在AI模型和外部系统之间建立双向通信通道

### 1.2 MCP 的优势

- 提高AI模型的理解准确性
- 减少用户手动复制粘贴的需求
- 简化复杂任务的处理流程
- 保护敏感信息，只提供必要的数据

## 2. 飞书 MCP 服务器架构

### 2.1 整体架构

飞书 MCP 服务器是基于 MCP 协议实现的一个中间层服务，它连接了AI编码工具（如Cursor）和飞书文档系统，使AI工具能够直接访问和操作飞书文档。

```
+----------------+       +------------------+       +----------------+
|                |       |                  |       |                |
|  AI编码工具     | <===> |  飞书 MCP 服务器  | <===> |  飞书API       |
| (Cursor等)     |       |                  |       |                |
+----------------+       +------------------+       +----------------+
```

### 2.2 核心组件

- **McpServer**：基于@modelcontextprotocol/sdk实现的MCP服务器核心
- **FeishuService**：负责与飞书API交互的服务层
- **Transport层**：支持多种通信方式（HTTP/SSE和标准输入输出）

## 3. 技术实现细节

### 3.1 服务器初始化流程

1. 加载环境配置（.env文件和命令行参数）
2. 初始化配置管理器（Config）
3. 初始化飞书服务（FeishuApiService）
4. 创建MCP服务器实例（FeishuMcpServer）
5. 注册工具函数（Tools）
6. 根据运行模式选择通信方式（HTTP或标准输入输出）

```typescript
// 服务器启动流程示例
export async function startServer(): Promise<void> {
  try {
    // 检查是否为标准输入输出模式
    const isStdioMode = process.env.NODE_ENV === "cli" || process.argv.includes("--stdio");
    
    // 初始化日志
    Logger.initialize();
    Logger.info('飞书MCP服务器启动中...');
    
    // 创建MCP服务器实例
    const server = new FeishuMcpServer();
    
    // 根据模式选择通信方式
    if (isStdioMode) {
      Logger.info('使用标准输入输出模式');
      const transport = new StdioServerTransport();
      await server.connect(transport);
    } else {
      // 获取配置
      const config = Config.getInstance();
      const port = config.server.port;
      
      Logger.info(`使用HTTP模式，端口: ${port}`);
      await server.startHttpServer(port);
    }
  } catch (error) {
    Logger.error('服务器启动失败:', error);
    process.exit(1);
  }
}
```

特别注意的是，FeishuApiService采用了单例模式实现，确保整个应用中只有一个实例：

```typescript
export class FeishuApiService extends BaseApiService {
  private static instance: FeishuApiService;
  
  // 私有构造函数，防止外部直接创建实例
  private constructor() {
    super();
    this.cacheManager = CacheManager.getInstance();
    this.blockFactory = BlockFactory.getInstance();
    this.config = Config.getInstance();
  }
  
  // 获取实例的静态方法
  public static getInstance(): FeishuApiService {
    if (!FeishuApiService.instance) {
      FeishuApiService.instance = new FeishuApiService();
    }
    return FeishuApiService.instance;
  }
  
  // 其他方法...
}
```

此单例模式确保了整个应用生命周期内只存在一个飞书服务实例，有效管理资源和共享状态。

### 3.2 飞书API交互

飞书MCP服务器通过FeishuService与飞书API进行交互，主要功能包括：

1. **认证管理**：获取和刷新飞书访问令牌
2. **文档操作**：创建、读取和修改飞书文档
3. **文档块操作**：获取和创建文档块（文本块、代码块等）

```typescript
// 飞书服务示例代码
export class FeishuService {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly baseUrl = "https://open.feishu.cn/open-apis";
  private accessToken: string | null = null;
  private tokenExpireTime: number | null = null;

  constructor(appId: string, appSecret: string) {
    this.appId = appId;
    this.appSecret = appSecret;
  }

  // 获取访问令牌
  private async getAccessToken(): Promise<string> {
    // 检查令牌是否过期
    if (this.accessToken && !this.isTokenExpired()) {
      return this.accessToken;
    }

    // 获取新的访问令牌
    const response = await axios.post(`${this.baseUrl}/auth/v3/tenant_access_token/internal`, {
      app_id: this.appId,
      app_secret: this.appSecret,
    });

    this.accessToken = response.data.tenant_access_token;
    this.tokenExpireTime = Date.now() + response.data.expire * 1000;
    return this.accessToken;
  }

  // 其他API方法...
}
```

### 3.3 MCP工具实现

飞书MCP服务器通过注册一系列工具函数，使AI模型能够执行特定的操作：

1. **创建文档**：`create_feishu_document`
2. **获取文档信息**：`get_feishu_document_info`
3. **获取文档内容**：`get_feishu_document_content`
4. **获取文档块**：`get_feishu_document_blocks`
5. **获取块内容**：`get_feishu_block_content`
6. **创建文本块**：`create_feishu_text_block`
7. **创建代码块**：`create_feishu_code_block`
8. **创建标题块**：`create_feishu_heading_block`
9. **创建列表块**：`create_feishu_list_block`
10. **Wiki链接转换**：`convert_feishu_wiki_to_document_id`

```typescript
// 工具注册示例
private registerTools(): void {
  // 添加创建飞书文档工具
  this.server.tool(
    "create_feishu_document",
    "Creates a new Feishu document and returns its information.",
    {
      title: z.string().describe("Document title (required). This will be displayed in the Feishu document list and document header."),
      folderToken: z.string().describe("Folder token (required). Specifies where to create the document.")
    },
    async ({ title, folderToken }) => {
      try {
        const newDoc = await this.feishuService?.createDocument(title, folderToken);
        if (!newDoc) {
          throw new Error('创建文档失败，未返回文档信息');
        }
        return {
          content: [{ type: "text", text: JSON.stringify(newDoc, null, 2) }],
        };
      } catch (error) {
        const errorMessage = formatErrorMessage(error);
        return {
          content: [{ type: "text", text: `创建飞书文档失败: ${errorMessage}` }],
        };
      }
    }
  );

  // 其他工具注册...
}
```

每个工具函数都经过精心设计，提供了详细的描述和参数验证，确保AI模型能够正确理解和使用这些功能。同时，使用Zod库进行参数验证，提高了API的稳定性和安全性。

### 3.4 通信协议实现

飞书MCP服务器支持两种通信方式：

1. **HTTP/SSE模式**：通过HTTP服务器和Server-Sent Events实现与AI工具的通信
2. **标准输入输出模式**：通过进程的标准输入和输出流实现通信，适用于CLI环境

```typescript
// HTTP服务器启动方法
async startHttpServer(port: number): Promise<void> {
  const app = express();
  app.use(express.json());

  // 简单的健康检查端点
  app.get("/", (_req: Request, res: Response) => {
    res.send("Feishu MCP Server is running");
  });

  // MCP通信端点
  app.get("/mcp", (req: IncomingMessage, res: ServerResponse) => {
    Logger.info('收到新的MCP连接请求');
    this.sseTransport = new SSEServerTransport();
    this.sseTransport.handleRequest(req, res);
    this.server.connect(this.sseTransport);
  });

  // 启动HTTP服务器
  app.listen(port, () => {
    Logger.info(`飞书MCP服务器已启动，监听端口 ${port}`);
  });
}

// 标准输入输出连接方法
async connect(transport: Transport): Promise<void> {
  try {
    Logger.info('正在连接传输层...');
    await this.server.connect(transport);
    Logger.info('传输层连接成功');
  } catch (error) {
    Logger.error('传输层连接失败:', error);
    throw error;
  }
}
```

#### 3.4.1 SSE(Server-Sent Events)通信

服务器使用Server-Sent Events技术实现与客户端的实时通信，这是一种基于HTTP的单向通信技术，适合服务器向客户端推送消息的场景。主要特点包括：

- **长连接**：建立一次HTTP连接后保持打开状态
- **单向通信**：服务器向客户端推送数据，客户端通过其他HTTP请求发送响应
- **自动重连**：客户端断开连接后会自动尝试重新连接
- **标准化格式**：遵循EventSource API规范，易于客户端处理

#### 3.4.2 标准输入输出通信

标准输入输出模式主要用于命令行环境，特别是在集成到其他应用时更为便捷。它的主要特点包括：

- **无需网络端口**：不占用网络端口，避免端口冲突
- **进程间通信**：通过进程标准输入输出流进行数据交换
- **简单集成**：容易嵌入到其他命令行工具或脚本中
- **低开销**：通信开销小，适合嵌入式环境

通过支持这两种通信方式，飞书MCP服务器能够适应不同的使用场景，既可以作为独立服务部署，也可以作为命令行工具或嵌入式组件使用。

## 4. 工作流程

### 4.1 用户使用流程

1. 在Cursor的Agent模式下打开编辑器
2. 粘贴飞书文档的链接
3. 要求Cursor基于飞书文档执行操作（分析内容、创建代码等）
4. Cursor通过MCP服务器从飞书获取文档内容
5. Cursor使用获取的内容辅助编写代码

### 4.2 数据流转过程

```
+----------------+                  +------------------+                  +----------------+
|                |  1.请求文档内容   |                  |  2.API认证请求   |                |
|  Cursor        | ---------------> |  飞书 MCP 服务器  | ---------------> |  飞书API       |
|                |                  |                  |                  |                |
|                |  4.返回处理后的   |                  |  3.返回原始数据   |                |
|                | <--------------- |                  | <--------------- |                |
+----------------+     文档内容     +------------------+                  +----------------+
```

## 5. 优化与特性

### 5.1 数据优化

飞书MCP服务器在处理飞书API返回的数据时，会进行以下优化：

- **数据简化**：移除不必要的元数据，减少传输给AI模型的数据量
- **格式转换**：将复杂的API响应转换为更易于AI模型理解的格式
- **内容提取**：从文档块中提取关键内容，忽略样式等次要信息

### 5.2 特色功能

- **Markdown语法支持**：自动将Markdown语法转换为飞书文档的样式属性
- **文档块管理**：精细化控制文档结构，支持在特定位置插入内容
- **多种认证方式**：支持通过环境变量和命令行参数配置认证信息

### 5.3 缓存管理系统

为了提高性能和减少API请求次数，飞书MCP服务器实现了一套完善的缓存管理系统：

#### 5.3.1 令牌缓存

```typescript
// 缓存令牌
public cacheToken(token: string, expireSeconds: number): void {
  this.tokenCache.token = token;
  this.tokenCache.expireTime = Date.now() + (expireSeconds * 1000);
  
  Logger.debug(`令牌已缓存，过期时间: ${new Date(this.tokenCache.expireTime).toISOString()}`);
}

// 获取缓存的令牌
public getToken(): string | null {
  if (!this.tokenCache.token || !this.tokenCache.expireTime) {
    return null;
  }
  
  // 检查令牌是否过期（提前30秒认为过期）
  const now = Date.now();
  const safeExpireTime = this.tokenCache.expireTime - (30 * 1000);
  
  if (now >= safeExpireTime) {
    Logger.debug('缓存的令牌已过期或即将过期');
    return null;
  }
  
  return this.tokenCache.token;
}
```

#### 5.3.2 缓存策略

飞书MCP服务器采用了多层次的缓存策略：

1. **内存缓存**：将访问令牌等频繁使用的数据存储在内存中
2. **过期控制**：自动管理缓存项的过期时间，避免使用过期数据
3. **提前刷新**：在令牌即将过期前提前刷新，减少请求失败的可能性
4. **缓存失效**：提供机制清除无效的缓存数据

#### 5.3.3 缓存优势

- **提高响应速度**：减少重复的API请求，特别是获取访问令牌的请求
- **减轻服务器负担**：减少对飞书API服务器的请求次数
- **增强稳定性**：当飞书API暂时不可用时，仍可使用缓存数据提供服务
- **避免速率限制**：控制API请求频率，避免触发飞书API的速率限制

通过缓存管理系统，飞书MCP服务器在保持数据新鲜度的同时，显著提高了性能和可靠性。

## 6. 部署与配置

### 6.1 环境要求

- Node.js v20.17.0或更高版本
- 飞书开放平台应用（需要获取AppID和AppSecret）

### 6.2 配置方式

1. **环境变量配置**：通过.env文件设置
   ```
   PORT=3000
   FEISHU_APP_ID=your_app_id
   FEISHU_APP_SECRET=your_app_secret
   ```

2. **命令行参数配置**：
   ```bash
   feishu-mcp --port 3000 --feishu-app-id your_app_id --feishu-app-secret your_app_secret
   ```

### 6.3 启动方式

1. **HTTP模式**：
   ```bash
   npm start
   # 或
   npm run start:http
   ```

2. **CLI模式**：
   ```bash
   npm run start:cli
   ```

## 7. 应用场景

### 7.1 开发场景

- **需求分析**：AI工具可以直接读取飞书文档中的需求说明，进行分析并生成代码
- **文档生成**：根据代码自动生成技术文档并保存到飞书
- **代码审查**：将代码审查意见直接写入飞书文档

#### 7.1.1 需求分析实例

以下是一个开发者使用Cursor编码工具与飞书MCP服务器进行需求分析的实际对话示例：

```
用户: 请帮我阅读这个飞书文档，并生成代码实现其中描述的功能：https://xxx.feishu.cn/docx/xxxx

Cursor: 我会帮你查看这个飞书文档并生成代码。让我先查看文档内容。

[Cursor 通过MCP服务器获取飞书文档内容]

文档内容已获取。这是一个用户管理API的需求文档，它要求实现以下功能：
1. 用户注册
2. 用户登录
3. 密码重置
4. 用户资料更新

以下是基于需求的代码实现：

// 用户模型
interface User {
  id: string;
  username: string;
  email: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
}

// 用户控制器
class UserController {
  // 用户注册
  async register(req, res) {
    // 实现代码...
  }
  
  // 用户登录
  async login(req, res) {
    // 实现代码...
  }
  
  // 密码重置
  async resetPassword(req, res) {
    // 实现代码...
  }
  
  // 更新用户资料
  async updateProfile(req, res) {
    // 实现代码...
  }
}
```

### 7.2 协作场景

- **团队协作**：多人共同编辑的飞书文档可以被AI工具实时访问
- **知识库集成**：将团队知识库与AI编码工具连接，提高开发效率

#### 7.2.1 团队协作示例

团队在飞书文档中协作编辑API规范，然后使用Cursor通过MCP服务器访问这些规范并生成代码：

```
用户: 请根据我们团队的飞书API规范文档，为新的订单管理模块生成API接口代码：https://xxx.feishu.cn/docx/yyyy

Cursor: 我会根据您团队的API规范文档生成订单管理模块的接口代码。让我先获取文档内容。

[Cursor 通过MCP服务器获取飞书文档内容]

我已获取您团队的API规范文档。根据文档，新的订单管理模块需要遵循RESTful API设计原则，并包含以下接口：

1. 创建订单
2. 获取订单列表
3. 获取订单详情
4. 更新订单状态
5. 取消订单

以下是符合您团队API规范的代码实现：

```typescript
// 订单控制器
import { Router } from 'express';
import { OrderService } from '../services/OrderService';
import { authenticate } from '../middlewares/auth';
import { validateOrderInput } from '../validators/order';

const router = Router();
const orderService = new OrderService();

// 创建订单
router.post('/', authenticate, validateOrderInput, async (req, res) => {
  try {
    const order = await orderService.createOrder(req.body, req.user.id);
    return res.status(201).json({
      success: true,
      data: order
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 其他API路由...

export default router;
```

### 7.3 实时交互流程

在实际使用中，飞书MCP服务器、AI工具和用户之间的交互流程如下：

1. **服务启动**：用户启动飞书MCP服务器（HTTP或CLI模式）
2. **AI工具连接**：AI工具（如Cursor）通过MCP协议连接到服务器
3. **用户输入**：用户在AI工具中提供飞书文档链接或直接要求访问飞书文档
4. **文档获取**：AI工具通过MCP服务器从飞书获取文档内容
5. **内容处理**：AI模型分析文档内容并执行用户要求的任务
6. **结果返回**：AI工具向用户展示处理结果
7. **后续交互**：用户可以进一步要求AI工具基于文档内容执行其他操作

这种无缝的交互过程极大地提高了开发效率，使AI工具能够直接访问团队的知识库和文档，减少了信息传递的障碍。

## 8. 未来展望

- **支持更多飞书文档类型**：表格、思维导图等
- **双向实时同步**：AI工具的输出可以实时同步到飞书文档
- **多平台集成**：支持更多AI编码工具和文档平台
- **高级权限管理**：细粒度的访问控制和安全策略

## 9. 项目目录结构

### 9.1 主要目录结构

```
feishu-mcp/
├── src/                    # 源代码
│   ├── index.ts            # 应用程序入口点
│   ├── cli.ts              # CLI模式入口
│   ├── server.ts           # 主服务器实现
│   ├── services/           # 服务层实现
│   │   ├── baseService.ts  # 基础服务抽象类
│   │   ├── feishuApiService.ts # 飞书API服务实现
│   │   └── blockFactory.ts # 文档块工厂类
│   ├── types/              # 类型定义
│   │   └── feishuSchema.ts # 飞书API相关Schema定义
│   └── utils/              # 工具类
│       ├── cache.ts        # 缓存管理
│       ├── config.ts       # 配置管理
│       ├── document.ts     # 文档处理工具
│       ├── error.ts        # 错误处理
│       ├── logger.ts       # 日志工具
│       └── paramUtils.ts   # 参数处理工具
├── dist/                   # 编译后的代码
├── doc/                    # 文档
├── .env.example            # 环境变量示例
├── .env                    # 环境变量配置
├── package.json            # 项目依赖配置
└── tsconfig.json           # TypeScript配置
```

### 9.2 核心模块说明

#### 9.2.1 服务器模块 (server.ts)

服务器模块是整个应用的核心，它实现了MCP协议的服务器端，负责处理来自AI工具的请求，并注册各种工具函数供AI模型调用。主要功能包括：

- MCP服务器初始化
- 工具函数注册
- 通信传输层管理（HTTP/SSE或标准输入输出）
- 请求路由和处理

#### 9.2.2 飞书API服务 (services/feishuApiService.ts)

飞书API服务是与飞书平台交互的核心组件，负责处理所有与飞书API相关的操作。主要功能包括：

- 访问令牌获取和管理
- 文档创建和读取
- 文档块查询和操作
- API错误处理和重试

#### 9.2.3 文档块工厂 (services/blockFactory.ts)

文档块工厂提供了创建各种飞书文档块的统一接口，支持创建不同类型的块内容。主要功能包括：

- 文本块创建
- 代码块创建
- 标题块创建
- 列表块创建
- 混合块批量创建

#### 9.2.4 配置管理 (utils/config.ts)

配置管理模块负责加载和管理应用的配置信息，支持从环境变量和命令行参数中读取配置。主要功能包括：

- 环境变量加载
- 命令行参数解析
- 配置校验和默认值处理

#### 9.2.5 缓存管理 (utils/cache.ts)

缓存管理模块提供了内存缓存功能，用于存储访问令牌等需要重复使用的数据。主要功能包括：

- 令牌缓存
- 缓存过期管理
- 缓存清理

## 10. 总结

飞书MCP服务器通过实现Model Context Protocol，成功地将飞书文档系统与AI编码工具连接起来，使AI工具能够直接访问和操作飞书文档。这种集成极大地提高了开发效率，减少了上下文切换，使AI工具能够更准确地理解和处理文档内容。

通过模块化的设计和灵活的配置选项，飞书MCP服务器可以适应各种使用场景，为开发者提供更智能、更高效的编码体验。