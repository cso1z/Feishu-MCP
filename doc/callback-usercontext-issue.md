# Callback 中缺少 UserContext 问题详解

## 问题概述

**问题**: `callback` 处理函数没有设置 `UserContext`，导致无法通过 `UserContextManager.getUserKey()` 获取 `userKey`。

**严重程度**: 低（不影响核心功能，但影响日志记录和代码一致性）

## UserContext 机制说明

### 什么是 UserContext？

`UserContext` 是一个使用 Node.js `AsyncLocalStorage` 实现的上下文传递机制，用于在异步调用链中传递用户信息：

```typescript
interface UserContext {
  userKey: string;  // 用户标识
  baseUrl: string;  // 基础URL
}
```

### UserContext 的工作原理

`AsyncLocalStorage` 是 Node.js 提供的 API，可以在异步调用链中存储和传递数据：

```typescript
// 设置上下文
userContextManager.run(
  { userKey: 'stdio', baseUrl: 'http://localhost:3333' },
  async () => {
    // 在这个回调函数及其所有异步子调用中，都可以通过 getUserKey() 获取 'stdio'
    const userKey = userContextManager.getUserKey(); // 返回 'stdio'
  }
);

// 在上下文外部
const userKey = userContextManager.getUserKey(); // 返回 ''（空字符串）
```

### UserContext 的使用场景

在代码中，`UserContext` 主要用于：

1. **API 请求时获取 userKey** (`src/services/baseService.ts`):
   ```typescript
   protected async request(...) {
     const userContextManager = UserContextManager.getInstance();
     const userKey = userContextManager.getUserKey();  // 从上下文获取
     const clientKey = AuthUtils.generateClientKey(userKey);
     // ...
   }
   ```

2. **SSE 消息处理时设置上下文** (`src/server.ts`):
   ```typescript
   app.post('/messages', async (req, res) => {
     const userKey = this.userAuthManager.getUserKeyBySessionId(sessionId);
     
     // 在用户上下文中执行
     this.userContextManager.run(
       { userKey: userKey || '', baseUrl: baseUrl },
       async () => {
         await transport.handlePostMessage(req, res);
       }
     );
   });
   ```

3. **Stdio 模式启动时设置上下文** (`src/server.ts`):
   ```typescript
   await this.userContextManager.run(
     { userKey: 'stdio', baseUrl: baseUrl },
     async () => {
       await server.connect(transport);
     }
   );
   ```

## 当前 Callback 的问题

### 代码现状

**文件**: `src/services/callbackService.ts`

```typescript
export async function callback(req: Request, res: Response) {
  // ❌ 没有设置 UserContext
  // ❌ 无法通过 UserContextManager.getUserKey() 获取 userKey
  
  const { code, state } = req.query;
  const stateData = AuthUtils.decodeState(state);
  const { appId, appSecret, clientKey, redirectUri } = stateData;
  
  // ✅ 从 state 中获取 clientKey，不依赖 UserContext
  tokenCacheManager.cacheUserToken(clientKey, data, refreshTtl);
}
```

### 问题分析

#### 1. 无法获取 userKey

在 callback 函数中，如果尝试获取 userKey：

```typescript
export async function callback(req: Request, res: Response) {
  const userContextManager = UserContextManager.getInstance();
  const userKey = userContextManager.getUserKey();  // ❌ 返回 ''（空字符串）
  
  // 因为 callback 没有设置 UserContext，所以 getUserKey() 返回空字符串
}
```

#### 2. 日志记录不完整

如果 callback 中需要记录日志，无法获取 userKey：

```typescript
export async function callback(req: Request, res: Response) {
  // 当前代码
  console.log(`[callback] token已缓存到clientKey: ${clientKey}`);
  
  // 理想情况（如果有 UserContext）
  const userKey = userContextManager.getUserKey();
  console.log(`[callback] userKey: ${userKey}, clientKey: ${clientKey}, token已缓存`);
}
```

#### 3. 调用其他服务时的潜在问题

如果 callback 内部调用其他服务，那些服务可能会尝试从 UserContext 获取 userKey：

```typescript
export async function callback(req: Request, res: Response) {
  // 假设 callback 内部调用某个服务
  await someService.doSomething();
  
  // 如果 someService.doSomething() 内部调用了 baseService.request()
  // baseService.request() 会尝试从 UserContext 获取 userKey
  // 此时会返回空字符串，可能导致问题
}
```

**注意**: 当前 callback 实现中，没有调用依赖 UserContext 的服务，所以这个问题暂时不会出现。

## 具体影响

### ✅ 不影响的功能

1. **Token 缓存**: callback 使用 state 中的 `clientKey` 缓存 token，不依赖 UserContext ✅
2. **OAuth 流程**: 整个 OAuth 授权流程正常工作 ✅
3. **核心功能**: 认证功能完全正常 ✅

### ⚠️ 受影响的功能

1. **日志记录**: 无法在日志中记录 `userKey`，只能记录 `clientKey`
2. **代码一致性**: 与其他接口（如 `/messages`）的处理方式不一致
3. **未来扩展**: 如果未来 callback 需要调用依赖 UserContext 的服务，会出现问题

## 解决方案

### 方案 1: 从 state 中恢复 userKey（推荐）

由于 state 中包含 `clientKey`，而 `clientKey` 是基于 `userKey` 生成的，理论上可以反向推导。但这不是最佳方案，因为：

- `clientKey = sha256(appId:appSecret:userKey)` 是单向哈希，无法反向推导
- 需要额外的映射关系

### 方案 2: 在 state 中添加 userKey（最佳方案）

修改 `AuthUtils.encodeState` 和 `decodeState`，在 state 中包含 `userKey`：

```typescript
// 修改 encodeState
public static encodeState(
  appId: string, 
  appSecret: string, 
  clientKey: string, 
  userKey: string,  // 新增参数
  redirectUri?: string
): string {
  const stateData = {
    appId,
    appSecret,
    clientKey,
    userKey,  // 新增
    redirectUri,
    timestamp: this.timestamp()
  };
  return Buffer.from(JSON.stringify(stateData)).toString('base64');
}

// 修改 callback
export async function callback(req: Request, res: Response) {
  const stateData = AuthUtils.decodeState(state);
  const { appId, appSecret, clientKey, userKey, redirectUri } = stateData;
  
  // 设置 UserContext
  const userContextManager = UserContextManager.getInstance();
  const baseUrl = getBaseUrl(req);
  
  return userContextManager.run(
    { userKey: userKey || 'stdio', baseUrl },
    async () => {
      // callback 处理逻辑
      // ...
    }
  );
}
```

### 方案 3: 在 callback 中设置默认 UserContext（简单方案）

对于 stdio 模式，可以设置默认的 userKey：

```typescript
export async function callback(req: Request, res: Response) {
  const userContextManager = UserContextManager.getInstance();
  const baseUrl = getBaseUrl(req);
  
  // 设置默认 UserContext（stdio 模式）
  return userContextManager.run(
    { userKey: 'stdio', baseUrl },
    async () => {
      // callback 处理逻辑
      const { code, state } = req.query;
      // ...
    }
  );
}
```

**注意**: 这个方案假设所有 callback 都是 stdio 模式的，如果未来需要支持 HTTP 模式的多用户场景，需要从 state 中获取 userKey。

## 推荐实现

### 当前最佳实践

考虑到当前代码的实际情况：

1. **Callback 不依赖 UserContext**: callback 使用 state 中的 `clientKey`，不依赖 UserContext
2. **Stdio 模式固定 userKey**: stdio 模式下，userKey 固定为 `'stdio'`
3. **保持代码一致性**: 为了代码一致性和未来扩展性，建议添加 UserContext

### 推荐代码修改

```typescript
// src/services/callbackService.ts
import { UserContextManager, getBaseUrl } from '../utils/auth/index.js';

export async function callback(req: Request, res: Response) {
  const userContextManager = UserContextManager.getInstance();
  const baseUrl = getBaseUrl(req);
  
  // 设置 UserContext（stdio 模式使用固定值 'stdio'）
  // 注意：如果未来需要支持多用户，应该从 state 中获取 userKey
  return userContextManager.run(
    { userKey: 'stdio', baseUrl },
    async () => {
      const code = req.query.code as string;
      const state = req.query.state as string;
      // ... 原有的 callback 逻辑
    }
  );
}
```

## 总结

### 问题本质

- **技术层面**: callback 没有设置 UserContext，导致无法通过 `getUserKey()` 获取 userKey
- **功能层面**: 不影响核心功能，因为 callback 不依赖 UserContext
- **代码质量**: 影响代码一致性和日志完整性

### 修复优先级

- **优先级**: 低
- **原因**: 不影响核心功能，主要是代码一致性和日志记录的问题
- **建议**: 可以在代码重构或优化时一并修复

### 修复建议

1. **短期**: 保持现状，因为不影响功能
2. **中期**: 如果需要在 callback 中添加日志或调用其他服务，考虑添加 UserContext
3. **长期**: 如果未来需要支持多用户场景，需要从 state 中获取 userKey 并设置到 UserContext
