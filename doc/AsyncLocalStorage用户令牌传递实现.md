# AsyncLocalStorage 用户令牌传递实现

## 概述

本文档描述了使用 AsyncLocalStorage 实现用户访问令牌在异步上下文中传递的功能。这样可以避免在每个方法调用中显式传递用户令牌，让代码更加简洁。

## 实现方案

### 1. 用户上下文管理器 (`src/utils/userContext.ts`)

创建了 `UserContextManager` 单例类，使用 Node.js 的 `AsyncLocalStorage` API 在异步调用链中传递用户上下文信息。

**主要功能：**
- `run(context, callback)`: 在指定上下文中运行回调函数
- `getUserAccessToken()`: 获取当前上下文中的用户访问令牌
- `getUserInfo()`: 获取当前上下文中的用户信息
- `getContext()`: 获取完整的用户上下文
- `hasContext()`: 检查是否存在用户上下文

### 2. 请求处理修改 (`src/server.ts`)

在 `/messages` 端点处理中：
1. 从请求头 `Authorization: Bearer <token>` 中提取用户访问令牌
2. 使用 `UserContextManager.run()` 在异步上下文中存储用户令牌
3. 在该上下文中执行后续的请求处理逻辑

```typescript
// 从请求头中提取用户访问令牌
const authorization = req.headers.authorization;
let userAccessToken: string | undefined;

if (authorization && authorization.startsWith('Bearer ')) {
  userAccessToken = authorization.substring(7); // 移除 "Bearer " 前缀
}

// 使用 UserContextManager 在异步上下文中传递用户令牌
const userContextManager = UserContextManager.getInstance();

await userContextManager.run(
  { 
    accessToken: userAccessToken,
    userInfo: null
  },
  async () => {
    await transport.handlePostMessage(req, res);
  }
);
```

### 3. API 服务修改 (`src/services/feishuApiService.ts`)

修改 `getAccessToken()` 方法：
1. 当 `authType === 'user'` 时，从 AsyncLocalStorage 中读取用户访问令牌
2. 移除了所有方法签名中的 `userKey` 参数，因为现在通过上下文传递
3. 移除了方法调用中多余的 `userKey` 参数

```typescript
if (authType === 'user') {
  // 从 AsyncLocalStorage 中读取用户访问令牌
  const userContextManager = UserContextManager.getInstance();
  const userAccessToken = userContextManager.getUserAccessToken();
  
  if (userAccessToken) {
    Logger.debug('使用用户访问令牌');
    return userAccessToken;
  }
  
  throw new Error('无法获取有效的用户访问令牌，请确保请求头中包含正确的 Authorization Bearer token');
}
```

## 使用流程

1. **客户端请求**: 发送 POST 请求到 `/messages`，在 `Authorization` 头中包含用户访问令牌
2. **令牌提取**: 服务器从请求头中提取 Bearer token
3. **上下文存储**: 使用 AsyncLocalStorage 存储用户令牌到异步上下文中
4. **工具调用**: 在处理 MCP 工具调用时，FeishuApiService 自动从上下文中获取用户令牌
5. **API 请求**: 使用用户令牌调用飞书 API

## 优势

1. **简化代码**: 无需在每个方法调用中显式传递用户令牌
2. **类型安全**: TypeScript 支持，编译时检查
3. **异步友好**: 在整个异步调用链中保持上下文
4. **单例模式**: 全局唯一的上下文管理器
5. **向后兼容**: 不影响现有的应用令牌认证方式

## 注意事项

1. AsyncLocalStorage 只在 Node.js 14+ 中可用
2. 上下文只在 `run()` 方法的回调函数及其异步调用链中有效
3. 需要确保请求头格式正确：`Authorization: Bearer <token>`
4. 如果没有用户令牌或格式不正确，会抛出相应的错误信息

## 测试建议

1. 测试正常的用户令牌传递流程
2. 测试缺少 Authorization 头的情况
3. 测试错误的 Bearer token 格式
4. 测试应用令牌认证模式是否不受影响
5. 测试异步调用链中上下文的正确传递
