# Stdio 模式下日志输出影响分析

## 问题描述

分析 stdio 模式下输出各种 log 日志是否会影响 MCP 协议通信。

## Stdio 模式通信机制

### MCP 协议通信方式

在 stdio 模式下，MCP 协议通过**标准输入输出（stdin/stdout）**进行通信：

```
Cursor (客户端) ←→ stdin/stdout ←→ MCP Server (服务器)
```

- **stdin**: 客户端发送 JSON-RPC 请求
- **stdout**: 服务器发送 JSON-RPC 响应和日志消息
- **stderr**: 通常用于错误输出（但 MCP SDK 可能也使用）

### JSON-RPC 消息格式

MCP 协议使用 JSON-RPC 2.0 格式，通过 stdout 传输：

```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {...}}
{"jsonrpc": "2.0", "id": 1, "result": {...}}
```

**关键点**: stdout 必须**只包含**有效的 JSON-RPC 消息，任何其他输出都会干扰协议解析。

## 当前日志输出情况

### 1. Logger 类的实现

**文件**: `src/utils/logger.ts`

```typescript
public static debug(...args: any[]): void {
  console.debug(...formattedMessage);  // ⚠️ 输出到 stdout
}

public static info(...args: any[]): void {
  console.info(...formattedMessage);  // ⚠️ 输出到 stdout
}

public static log(...args: any[]): void {
  console.log(...formattedMessage);   // ⚠️ 输出到 stdout
}

public static warn(...args: any[]): void {
  console.warn(...formattedMessage);  // ⚠️ 输出到 stderr
}

public static error(...args: any[]): void {
  console.error(...formattedMessage); // ⚠️ 输出到 stderr
}
```

### 2. Stdio 模式下的特殊处理

**文件**: `src/server.ts` (第 51-56 行)

```typescript
Logger.info = (...args: any[]) => {
  server.server.sendLoggingMessage({ level: 'info', data: args });  // ✅ 使用 MCP 协议
};

Logger.error = (...args: any[]) => {
  server.server.sendLoggingMessage({ level: 'error', data: args });  // ✅ 使用 MCP 协议
};
```

**问题**: 只重写了 `Logger.info` 和 `Logger.error`，其他方法（`debug`、`log`、`warn`）仍然使用 `console.*`。

### 3. 直接使用 console.* 的地方

#### 3.1 `src/index.ts` - 启动日志

```typescript
console.log(`isStdioMode:${isStdioMode}`)                    // ⚠️ stdout
console.log(`meta.url:${currentFilePath}...`)                // ⚠️ stdout
console.log(`startServer`)                                    // ⚠️ stdout
console.log(`not startServer`)                               // ⚠️ stdout
console.error("配置验证失败，无法启动服务器")                  // ⚠️ stderr
console.error('Failed to start server:', error)              // ⚠️ stderr
```

#### 3.2 `src/services/callbackService.ts` - Callback 日志

```typescript
console.log(`[callback] query:`, req.query)                  // ⚠️ stdout
console.log('[callback] 缺少code参数')                       // ⚠️ stdout
console.log('[callback] 解析state成功:', {...})              // ⚠️ stdout
console.log('[callback] feishu response:', data)             // ⚠️ stdout
console.log(`[callback] token已缓存到clientKey: ${clientKey}`) // ⚠️ stdout
console.error('[callback] 请求飞书token或用户信息失败:', e)   // ⚠️ stderr
```

#### 3.3 `src/server.ts` - HTTP 服务器日志

```typescript
console.log(`[Callback Server] startCallbackServer`)         // ⚠️ stdout
console.error('Error handling MCP request:', error)          // ⚠️ stderr
console.error('Error handling GET request:', error)          // ⚠️ stderr
console.error('Error handling DELETE request:', error)        // ⚠️ stderr
```

#### 3.4 `src/manager/sseConnectionManager.ts` - SSE 连接日志

```typescript
console.info(`[SSE Connection] Client connected: ${sessionId}`)     // ⚠️ stdout
console.info(`[SSE Connection] Client disconnected: ${sessionId}`) // ⚠️ stdout
```

## 影响分析

### ⚠️ 严重问题：日志输出会干扰 MCP 协议

#### 问题 1: stdout 被污染

**影响**: 
- `console.log/info/debug` 输出到 stdout
- 这些输出会混在 JSON-RPC 消息中
- MCP 客户端无法正确解析 JSON-RPC 消息
- 可能导致协议通信失败

**示例**:
```
[2024-01-01 10:00:00] [INFO] Server connected
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", ...}  ← 被日志污染
[2024-01-01 10:00:01] [DEBUG] Request context - userKey: stdio
{"jsonrpc": "2.0", "id": 1, "result": {...}}  ← 被日志污染
```

#### 问题 2: stderr 可能被使用

**影响**:
- `console.error/warn` 输出到 stderr
- 虽然 MCP SDK 主要使用 stdout，但某些实现可能也读取 stderr
- 错误日志可能干扰协议

#### 问题 3: 启动时的日志

**影响**:
- `src/index.ts` 中的启动日志在 `server.connect()` **之前**执行
- 这些日志会输出到 stdout，干扰初始的协议握手
- 可能导致客户端无法正确初始化连接

#### 问题 4: Callback 服务器的日志

**影响**:
- Callback 服务器是独立的 HTTP 服务器
- 它的日志不应该输出到 MCP 协议的 stdout
- 但当前代码中 `callbackService.ts` 使用 `console.log`，会污染 stdout

## 具体影响场景

### 场景 1: 启动时的日志污染

```typescript
// src/index.ts
console.log(`isStdioMode:${isStdioMode}`)  // ⚠️ 输出到 stdout

// 此时 MCP 客户端正在等待初始化消息
// 但 stdout 中出现了非 JSON-RPC 消息
// 客户端可能无法正确解析协议
```

### 场景 2: 运行时的日志污染

```typescript
// src/services/baseService.ts
Logger.debug(`[BaseService] Request context - userKey: ${userKey}, baseUrl: ${baseUrl}`)
// ⚠️ Logger.debug 使用 console.debug，输出到 stdout

// 此时如果有 MCP 请求正在处理
// 日志输出会混在 JSON-RPC 响应中
// 导致客户端解析失败
```

### 场景 3: Callback 处理时的日志污染

```typescript
// src/services/callbackService.ts
console.log(`[callback] query:`, req.query)  // ⚠️ 输出到 stdout

// Callback 是 HTTP 请求，不应该输出到 MCP 协议的 stdout
// 但如果进程是 stdio 模式，这些日志会污染 stdout
```

## 解决方案

### 方案 1: 在 stdio 模式下禁用所有 console.* 输出（推荐）

**实现**:
```typescript
// src/utils/logger.ts
// 在 stdio 模式下，重定向所有 console.* 到 MCP 协议

if (isStdioMode) {
  // 保存原始方法
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalDebug = console.debug;
  const originalWarn = console.warn;
  const originalError = console.error;
  
  // 重定向到 MCP 协议（如果可用）或静默
  console.log = (...args: any[]) => {
    if (mcpServer) {
      mcpServer.sendLoggingMessage({ level: 'log', data: args });
    }
  };
  
  console.info = (...args: any[]) => {
    if (mcpServer) {
      mcpServer.sendLoggingMessage({ level: 'info', data: args });
    }
  };
  
  // ... 其他方法类似
}
```

### 方案 2: 在 stdio 模式下完全禁用日志输出

**实现**:
```typescript
// src/index.ts
if (isStdioMode) {
  // 禁用所有 console.* 输出
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
  console.warn = () => {};
  console.error = () => {};
  
  // 或者重定向到文件
  const logStream = fs.createWriteStream('mcp-server.log');
  console.log = (...args) => logStream.write(args.join(' ') + '\n');
}
```

### 方案 3: 使用 Logger 统一管理（最佳实践）

**实现**:
1. 将所有 `console.*` 替换为 `Logger.*`
2. 在 stdio 模式下，重写所有 Logger 方法使用 MCP 协议
3. 确保启动日志在 `server.connect()` 之后才输出

**代码修改**:
```typescript
// src/server.ts
async connect(transport: Transport): Promise<void> {
  const server = new FeishuMcp();
  
  // 在连接之前，重写所有 Logger 方法
  if (isStdioMode) {
    Logger.debug = (...args: any[]) => {
      server.server.sendLoggingMessage({ level: 'debug', data: args });
    };
    Logger.log = (...args: any[]) => {
      server.server.sendLoggingMessage({ level: 'log', data: args });
    };
    Logger.warn = (...args: any[]) => {
      server.server.sendLoggingMessage({ level: 'warn', data: args });
    };
    Logger.info = (...args: any[]) => {
      server.server.sendLoggingMessage({ level: 'info', data: args });
    };
    Logger.error = (...args: any[]) => {
      server.server.sendLoggingMessage({ level: 'error', data: args });
    };
  }
  
  await server.connect(transport);
}
```

## 推荐修复方案

### 优先级 1: 修复启动日志

**问题**: `src/index.ts` 中的启动日志在 `server.connect()` 之前执行

**修复**:
```typescript
// src/index.ts
export async function startServer(): Promise<void> {
  const isStdioMode = process.env.NODE_ENV === "cli" || process.argv.includes("--stdio");
  
  // ❌ 删除这些启动日志，或延迟到 connect 之后
  // console.log(`isStdioMode:${isStdioMode}`)
  // console.log(`meta.url:${currentFilePath}...`)
  
  if (isStdioMode) {
    const transport = new StdioServerTransport();
    await server.startCallbackServer(config.server.port);
    await server.connect(transport);
    
    // ✅ 连接后，使用 MCP 协议输出日志
    // Logger.info(`Server started in stdio mode`);
  }
}
```

### 优先级 2: 修复 Logger 类

**问题**: `Logger.debug/log/warn` 仍然使用 `console.*`

**修复**:
```typescript
// src/server.ts
async connect(transport: Transport): Promise<void> {
  const server = new FeishuMcp();
  
  // 重写所有 Logger 方法使用 MCP 协议
  Logger.debug = (...args: any[]) => {
    server.server.sendLoggingMessage({ level: 'debug', data: args });
  };
  Logger.log = (...args: any[]) => {
    server.server.sendLoggingMessage({ level: 'log', data: args });
  };
  Logger.warn = (...args: any[]) => {
    server.server.sendLoggingMessage({ level: 'warn', data: args });
  };
  Logger.info = (...args: any[]) => {
    server.server.sendLoggingMessage({ level: 'info', data: args });
  };
  Logger.error = (...args: any[]) => {
    server.server.sendLoggingMessage({ level: 'error', data: args });
  };
  
  await server.connect(transport);
}
```

### 优先级 3: 替换直接使用 console.* 的代码

**问题**: 多处直接使用 `console.*`，没有经过 Logger

**修复**:
- `src/index.ts`: 删除或使用 Logger
- `src/services/callbackService.ts`: 替换为 Logger
- `src/server.ts`: 替换为 Logger
- `src/manager/sseConnectionManager.ts`: 替换为 Logger

## 测试建议

### 测试 1: 验证 stdout 纯净性

```bash
# 启动 stdio 模式服务器
node scripts/start-mcp-stdio.js > output.log 2>&1

# 检查 output.log，应该只包含 JSON-RPC 消息
# 不应该有 [INFO]、[DEBUG] 等日志前缀
```

### 测试 2: 验证 MCP 协议通信

```bash
# 使用 MCP 客户端连接
# 验证工具调用是否正常工作
# 如果日志污染 stdout，工具调用会失败
```

### 测试 3: 验证日志消息

```bash
# 在 Cursor 中查看 MCP 日志
# 日志应该通过 MCP 协议的 logging 消息传递
# 不应该出现在 stdout 中
```

## 总结

### ⚠️ 当前问题

1. **严重**: `console.log/info/debug` 输出到 stdout，污染 MCP 协议
2. **严重**: 启动日志在 `server.connect()` 之前执行，干扰协议握手
3. **中等**: `Logger.debug/log/warn` 没有重写，仍然使用 `console.*`
4. **中等**: 多处直接使用 `console.*`，没有经过 Logger

### ✅ 修复优先级

1. **高优先级**: 修复启动日志，延迟到 `server.connect()` 之后
2. **高优先级**: 重写所有 Logger 方法使用 MCP 协议
3. **中优先级**: 替换直接使用 `console.*` 的代码为 Logger
4. **低优先级**: 添加日志级别控制，在 stdio 模式下禁用 DEBUG 日志

### 📝 建议

- 在 stdio 模式下，**所有日志都应该通过 MCP 协议的 logging 消息传递**
- **不应该直接输出到 stdout/stderr**
- 启动日志应该在 `server.connect()` **之后**输出
- 使用统一的 Logger 管理所有日志输出
