# User Key 兼容性与提示优化设计

## 目标

在 PR #93 合入后，保留 user token 缓存的安全边界，同时降低现有客户端的升级成本。后续补丁需要增加一个由服务管理者控制的严格 user-key 校验开关，并优化缺少 user-key 时的提示信息。

## 问题

PR #93 会阻止 user 认证请求在没有明确用户身份时读取缓存的 user token。这个方向对多用户 HTTP 部署是正确的，但部分 MCP 客户端无法添加自定义 query 参数或 header。如果强校验无条件开启，这些客户端升级后可能不可用。

当前缺少 user-key 时的错误提示也需要更可操作。它应该明确告诉用户支持哪些参数名，以及 stdio/CLI 模式应该如何配置。

## 背景

在 `FEISHU_AUTH_TYPE=user` 模式下，缓存的 user token 通过派生出的 client key 隔离，其中用户身份部分来自 `userKey`。如果请求没有提供真实用户身份，服务端可能 fallback 到 session id、匿名 id，或默认的 stdio key。这些 fallback 值有助于保持旧的单用户场景可用，但它们不能作为多用户 HTTP 服务中的强身份边界。

PR #93 增加了 `isUserKeyProvided`，用于区分显式 user key 和 fallback 身份。这个区分很重要，但如果默认强制要求显式 user key，会破坏无法发送 header 或 query 参数的现有客户端。因此后续补丁需要把“机制”和“策略”拆开：

- 机制：继续追踪 user key 是否由用户显式提供。
- 策略：由服务管理者决定缺少显式 user key 时是否拒绝请求。

用户入口分为两类：

- HTTP/SSE/StreamableHTTP 客户端可以通过 `user-key` 或 `userKey` 按请求或按 session 传递用户身份。
- stdio/CLI 用户没有 HTTP header 或 query 参数。它们的 user key 必须来自本地配置，例如 `FEISHU_USER_KEY`、`feishu-tool config set FEISHU_USER_KEY <value>`，或 `--user-key`。

由于两类入口的设置方式不同，缺少 user-key 时不应该展示一大段通用说明。错误提示应该识别当前模式，并直接告诉用户该模式下的修复方式。

## 方案

增加一个布尔配置项：

```text
FEISHU_REQUIRE_USER_KEY=false
```

默认行为保持兼容。该值为 `true` 时，所有 `authType=user` 的入口在访问 user token 缓存或进入 OAuth 预检前，都必须具备显式 user key。可接受的来源取决于入口类型：

- HTTP/SSE/StreamableHTTP：请求 header `user-key`、query 参数 `userKey`，或已经保存过显式 user key 的 session。
- stdio/CLI：本地配置 `FEISHU_USER_KEY`、`feishu-tool config set FEISHU_USER_KEY <value>`，或启动参数 `--user-key`。

行为矩阵：

```text
authType=tenant
- FEISHU_REQUIRE_USER_KEY 不生效。

authType=user, FEISHU_REQUIRE_USER_KEY=false
- 保持旧版本兼容行为。
- 缺少 user-key 时仍可使用 fallback 身份。
- 记录缓存隔离风险 warning，但需要按进程、session 或 client key 去重/限频，避免重复刷日志。

authType=user, FEISHU_REQUIRE_USER_KEY=true
- HTTP/SSE/StreamableHTTP 必须使用 header `user-key` 或 query `userKey`。
- stdio/CLI 应使用本地配置：`FEISHU_USER_KEY`、`feishu-tool config set FEISHU_USER_KEY <value>`，或 `--user-key`。
- 缺少 user-key 时返回清晰、可操作的错误。
```

## 错误提示

严格校验拒绝请求时，返回按模式区分的提示。如果能确定当前模式，只展示该模式下的说明；如果无法确定模式，再回退到简短的组合提示。

stdio/CLI 示例：

```text
stdio/CLI 模式缺少 user key。

FEISHU_AUTH_TYPE=user 需要稳定的用户标识来隔离 user token 缓存。
请在启动工具前设置以下任一项：

- 环境变量：FEISHU_USER_KEY=<your-user-key>
- CLI 配置命令：feishu-tool config set FEISHU_USER_KEY <your-user-key>
- 启动参数：--user-key <your-user-key>

本次建议使用的 key：
<generated-random-user-key>
```

HTTP/SSE/StreamableHTTP 示例：

```text
HTTP 模式缺少 user-key。

FEISHU_AUTH_TYPE=user 需要稳定的用户标识来隔离 user token 缓存。
请通过以下任一方式传递 user key：

- Header：user-key: <your-user-key>
- Query：?userKey=<your-user-key>

本次建议使用的 key：
<generated-random-user-key>
```

模式识别：

- stdio/CLI 可以复用现有判断：`process.env.NODE_ENV === 'cli' || process.argv.includes('--stdio')`。
- HTTP/SSE/StreamableHTTP 的 handler 已经知道当前处理的是哪个路由或 transport。
- 共享 auth 代码应接收一个轻量的 mode hint，或使用一个 helper 来判断 stdio 与非 stdio，并接受可选的 transport label。
- 提示 helper 应生成一个随机 user key，例如使用 `randomUUID()`，并把具体值放进错误文案中。

实现时应保持提示友好，不要让用户感觉自己做错了事。提示应同时适合 MCP tool 错误和 HTTP 响应。

## 校验位置

严格校验需要发生在 token 缓存访问前，也要发生在那些可能为 fallback 身份启动 OAuth 的流程前。

- `src/services/feishu/FeishuBaseApiService.ts`：在调用 `AuthUtils.generateClientKey()` 和 `getUserAccessToken()` 前执行严格校验。
- `src/cli/dispatcher.ts`：在 `authType=user` 时，先于 `handleAuthRequired(userKey)` 预检执行严格校验。如果当前 key 是默认 fallback，则返回 stdio/CLI 的缺失 user-key 提示，而不是为 `stdio` 启动 OAuth。
- `src/server.ts`：在 session 边界保留显式 user-key 状态。如果 StreamableHTTP 初始化时带了 user-key，同一 session 的后续请求也应继续视为显式提供。如果已有 session 通过新的 user-key 更新，应保存 `isUserKeyProvided=true`。

## 实现说明

PR #93 合入 `main` 后，预计修改这些文件：

- `src/utils/config.ts`：在 `FeishuConfig` 增加 `requireUserKey`，读取 `FEISHU_REQUIRE_USER_KEY`，默认 `false`。
- `.env.example`：说明 `FEISHU_REQUIRE_USER_KEY=false`。
- `README.md`：说明兼容模式和严格模式。
- `src/services/feishu/FeishuBaseApiService.ts`：仅在 `authType === 'user' && requireUserKey === true` 时强制要求 user-key。
- `src/cli/dispatcher.ts`：严格模式开启时，在 CLI auth 预检前检查缺失 user-key。
- `src/server.ts`：StreamableHTTP 后续请求应从已保存的 session 状态继承 `isUserKeyProvided`；已有 session 通过显式 user-key 更新时，应保存 `true`。
- `src/services/baseService.ts` 或一个小 helper：集中维护缺少 user-key 时的提示文案。
- `src/cli/commands/config.ts`：将 `FEISHU_USER_KEY` 加入支持的配置项，并在 `feishu-tool config` 中展示。
- 不要把 `FEISHU_REQUIRE_USER_KEY` 加入 `feishu-tool config set`。严格模式开关应保留为服务管理者级别的环境变量/手动配置，避免普通 CLI 用户误开启。

保持改动小而集中。这个后续补丁不重新设计完整身份模型。

## 测试

增加聚焦测试：

- `FEISHU_REQUIRE_USER_KEY` 默认是 `false`。
- `FEISHU_REQUIRE_USER_KEY=true` 时，`isUserKeyProvided=false` 的 user 认证请求会被拒绝。
- `FEISHU_REQUIRE_USER_KEY=false` 时，`isUserKeyProvided=false` 仍保持兼容行为。
- HTTP 缺少 user-key 的提示包含 `user-key` 和 `userKey`，不包含 stdio 专属说明，并包含服务端生成的随机建议 key。
- stdio/CLI 缺少 user-key 的提示包含 `FEISHU_USER_KEY`、`feishu-tool config set FEISHU_USER_KEY <value>` 和 `--user-key`，不包含 HTTP 专属说明，并包含服务端生成的随机建议 key。
- 未知模式 fallback 提示可以同时包含 HTTP 和 stdio/CLI 的说明。
- StreamableHTTP 初始化时显式提供 user-key 后，只带 `mcp-session-id` 的后续请求仍保留 `isUserKeyProvided=true`。
- StreamableHTTP 已有 session 通过显式 user-key 更新时，应保存 `isUserKeyProvided=true`。
- `feishu-tool config set FEISHU_USER_KEY <value>` 可以写入配置。
- `feishu-tool config set FEISHU_REQUIRE_USER_KEY true` 仍不支持。

## 非目标

- 不改变 tenant 认证行为。
- 默认不要求所有客户端都支持 header 或 query 参数。
- 不在这个补丁中增加新的认证系统。
