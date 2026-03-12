# Stdio 模式下 User 认证分析报告

## 问题描述
分析 stdio 模式下 user 认证是否正确，入口为 `src/index.ts`

## Stdio 模式工作原理说明

### 进程模型
- **一对一关系**: 每个 MCP 客户端（如 Cursor）会启动一个**独立的 MCP 服务器进程**
- **独立通信**: 每个进程有自己独立的 stdin/stdout，通过管道与客户端通信
- **进程隔离**: 每个进程有独立的内存空间和上下文

### 实际场景示例
```
Cursor 窗口 1 → 启动进程 A (PID: 1234) → stdin/stdout 通信
Cursor 窗口 2 → 启动进程 B (PID: 5678) → stdin/stdout 通信
Cursor 窗口 3 → 启动进程 C (PID: 9012) → stdin/stdout 通信
```

**注意**: 不存在"多个客户端连接同一个 stdio 程序"的情况，每个客户端都有自己独立的进程实例。

### Token 缓存共享
虽然每个进程是独立的，但如果它们在**同一个工作目录**下运行，会共享同一个 token 缓存文件：
- 缓存文件路径: `process.cwd()/user_token_cache.json`
- 多个进程读取和写入同一个文件
- 如果都使用 `userKey = 'stdio'`，会生成相同的 `clientKey`，从而共享 token

## 代码流程分析

### 1. Stdio 模式启动流程

**入口文件**: `src/index.ts`

```typescript
if (isStdioMode) {
  const transport = new StdioServerTransport();
  await server.startCallbackServer(config.server.port);
  await server.connect(transport);
}
```

### 2. UserKey 设置

**文件**: `src/server.ts` (第 40-48 行)

```typescript
await this.userContextManager.run(
  {
    userKey: 'stdio',  // ⚠️ 硬编码为 'stdio'
    baseUrl: baseUrl
  },
  async () => {
    await server.connect(transport);
  }
);
```

**问题点**: `userKey` 被硬编码为 `'stdio'`，这意味着所有 stdio 模式的请求都会使用这个固定的 userKey。

### 3. ClientKey 生成逻辑

**文件**: `src/utils/auth/authUtils.ts` (第 16-26 行)

```typescript
public static generateClientKey(userKey?: string | null): string {
  const feishuConfig = Config.getInstance().feishu;
  const userPart = userKey ? `:${userKey}` : '';
  let source = ''
  if (feishuConfig.authType==="tenant"){
    source = `${feishuConfig.appId}:${feishuConfig.appSecret}`;
  }else {
    source = `${feishuConfig.appId}:${feishuConfig.appSecret}${userPart}`;
  }
  return crypto.createHash('sha256').update(source).digest('hex');
}
```

**说明**: 
- 当 `userKey = 'stdio'` 时，`clientKey = sha256(appId:appSecret:stdio)`
- 当 `userKey = null/undefined` 时，`clientKey = sha256(appId:appSecret)`

### 4. OAuth 授权 URL 生成

**文件**: `src/services/baseService.ts` (第 405-413 行)

```typescript
private generateUserAuthUrl(baseUrl: string, userKey: string): string {
  const { appId, appSecret } = Config.getInstance().feishu;
  const clientKey = AuthUtils.generateClientKey(userKey);  // 基于 userKey 生成
  const redirect_uri = `${baseUrl}/callback`;
  const scope = encodeURIComponent('...');
  const state = AuthUtils.encodeState(appId, appSecret, clientKey, redirect_uri);
  
  return `https://accounts.feishu.cn/open-apis/authen/v1/authorize?...&state=${state}`;
}
```

**说明**: 授权 URL 中的 state 参数包含了基于 `userKey` 生成的 `clientKey`。

### 5. Callback 处理

**文件**: `src/services/callbackService.ts` (第 29-115 行)

```typescript
export async function callback(req: Request, res: Response) {
  const { code, state } = req.query;
  
  // 解析 state 参数
  const stateData = AuthUtils.decodeState(state);
  const { appId, appSecret, clientKey, redirectUri } = stateData;
  
  // 获取 token
  const tokenResp = await authService.getUserTokenByCode({...});
  
  // 使用 clientKey 缓存 token
  tokenCacheManager.cacheUserToken(clientKey, data, refreshTtl);
}
```

**说明**: callback 使用 state 中的 `clientKey` 来缓存 token。

### 6. Token 获取流程

**文件**: `src/services/baseService.ts` (第 110-113 行)

```typescript
const userContextManager = UserContextManager.getInstance();
const userKey = userContextManager.getUserKey();  // 从上下文获取 userKey
const clientKey = AuthUtils.generateClientKey(userKey);  // 生成 clientKey
```

**文件**: `src/services/feishuApiService.ts` (第 67-83 行)

```typescript
protected async getAccessToken(userKey?: string): Promise<string> {
  const clientKey = AuthUtils.generateClientKey(userKey);
  // ...
  return await this.authService.getUserAccessToken(clientKey, appId, appSecret);
}
```

## 认证流程验证

### ✅ 正确的流程

1. **Stdio 模式启动** → `userKey = 'stdio'` 被设置到上下文中
2. **需要授权时** → `generateUserAuthUrl('stdio')` → `clientKey = sha256(appId:appSecret:stdio)`
3. **OAuth 回调** → 使用 state 中的 `clientKey` 缓存 token
4. **API 调用** → 从上下文获取 `userKey = 'stdio'` → 生成 `clientKey = sha256(appId:appSecret:stdio)`
5. **Token 获取** → 使用 `clientKey` 从缓存获取 token ✅

### ⚠️ 潜在问题

#### 问题 1: 端口冲突 ⚠️ **重要问题**
- **位置**: `src/server.ts` 第 271-282 行 (`startCallbackServer` 方法)
- **问题**: 
  - 多个 stdio 进程实例都会尝试启动 callback 服务器，监听同一个端口（默认 3333）
  - `app.listen()` 没有错误处理，如果端口被占用会直接抛出错误，导致进程启动失败
- **影响**: 
  - 第一个进程成功启动 callback 服务器
  - 后续进程启动时会因为端口被占用而失败
  - 用户可能看到 "EADDRINUSE: address already in use" 错误
- **解决方案建议**:
  1. 添加端口冲突检测和自动重试机制（尝试其他端口）
  2. 或者使用单例模式，只让第一个进程启动 callback 服务器，其他进程共享使用
  3. 或者添加错误处理，端口被占用时静默失败，因为 callback 服务器已经存在

#### 问题 2: Token 缓存文件并发写入
- **位置**: `src/utils/auth/tokenCacheManager.ts`
- **问题**: 多个进程同时写入同一个 `user_token_cache.json` 文件可能存在竞态条件
- **影响**: 
  - 可能导致文件损坏或数据丢失
  - 虽然概率较低，但在高并发场景下可能出现
- **解决方案建议**:
  - 添加文件锁机制（如使用 `proper-lockfile` 库）
  - 或使用原子写入（先写入临时文件，再重命名）

#### 问题 3: Callback 中缺少 UserContext
- **位置**: `src/services/callbackService.ts`
- **问题**: callback 处理时没有设置 UserContext，无法获取当前的 `userKey`
- **详细说明**:
  - **UserContext 机制**: 使用 `AsyncLocalStorage` 在异步调用链中传递 `userKey` 和 `baseUrl`
  - **当前问题**: callback 函数没有调用 `userContextManager.run()` 设置上下文
  - **影响范围**:
    1. ❌ 无法通过 `UserContextManager.getUserKey()` 获取 `userKey`（返回空字符串）
    2. ⚠️ 日志记录不完整（无法记录 `userKey`，只能记录 `clientKey`）
    3. ⚠️ 代码不一致（与其他接口如 `/messages` 的处理方式不一致）
    4. ⚠️ 未来扩展风险（如果 callback 需要调用依赖 UserContext 的服务，会出现问题）
  - **为什么不影响功能**: callback 使用 state 中的 `clientKey` 缓存 token，不依赖 UserContext
- **严重程度**: 低（不影响核心功能，主要是代码一致性和日志记录的问题）
- **解决方案**: 
  - 在 callback 中设置 UserContext，使用固定的 `userKey: 'stdio'`（stdio 模式）
  - 或从 state 中获取 `userKey`（如果未来 state 中包含 userKey）
- **详细文档**: 参见 `doc/callback-usercontext-issue.md`

## 代码检查

### 检查点 1: 授权 URL 生成调用

**文件**: `src/services/baseService.ts` 第 314 行

```typescript
const authUrl = this.generateUserAuthUrl(baseUrl, userKey);
```

**验证**: ✅ 传入的 `userKey` 来自 `UserContextManager.getUserKey()`，与上下文一致

### 检查点 2: Token 获取时的 ClientKey

**文件**: `src/services/feishuApiService.ts` 第 71 行

```typescript
const clientKey = AuthUtils.generateClientKey(userKey);
```

**验证**: ✅ `userKey` 来自上下文，生成的 `clientKey` 与授权时一致

## 结论

### ✅ 认证流程是正确的

在 stdio 模式下，user 认证流程是**正确的**：

1. ✅ `userKey` 被正确设置为 `'stdio'` 并存储在上下文中
2. ✅ OAuth 授权时，`clientKey` 基于 `userKey = 'stdio'` 生成
3. ✅ Callback 使用正确的 `clientKey` 缓存 token
4. ✅ API 调用时，从上下文获取 `userKey` 并生成匹配的 `clientKey`
5. ✅ Token 缓存和获取使用相同的 `clientKey`

### ⚠️ 改进建议（按优先级排序）

#### 🔴 高优先级：端口冲突处理
**问题**: 多个 stdio 进程实例启动时，端口冲突导致后续进程启动失败

**解决方案**:
```typescript
async startCallbackServer(port: number): Promise<void> {
  const app = express();
  app.get('/callback', callback);

  return new Promise((resolve, reject) => {
    const server = app.listen(port, '0.0.0.0', () => {
      Logger.info(`Callback server listening on port ${port}`);
      resolve();
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // 端口被占用，说明其他进程已经启动了 callback 服务器
        // 这是正常的，静默处理即可
        Logger.warn(`Port ${port} is already in use, callback server may already be running`);
        resolve(); // 不抛出错误，因为 callback 服务器已经存在
      } else {
        reject(err);
      }
    });
  });
}
```

#### 🟡 中优先级：Token 缓存文件并发安全
**问题**: 多个进程同时写入同一个文件可能存在竞态条件

**解决方案**:
- 使用文件锁库（如 `proper-lockfile`）确保文件写入的原子性
- 或使用临时文件 + 原子重命名的方式

#### 🟢 低优先级：其他改进
1. **Callback 中添加 UserContext**（可选）:
   - 虽然 callback 不依赖 UserContext，但添加后可以更好地记录日志和调试

2. **添加验证日志**:
   - 在关键位置添加日志，记录 `userKey`、`clientKey` 和进程 ID，便于调试多进程场景

## 测试建议

1. **验证授权流程**:
   - 在 stdio 模式下触发需要授权的操作
   - 确认授权 URL 中的 state 包含正确的 `clientKey`
   - 完成授权后，确认 token 被正确缓存

2. **验证 Token 使用**:
   - 在授权后，执行 API 调用
   - 确认能够正确获取和使用 token

3. **验证 Token 刷新**:
   - 等待 token 过期或手动触发刷新
   - 确认刷新后的 token 能够正常使用
