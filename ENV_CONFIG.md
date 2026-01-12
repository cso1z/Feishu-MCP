# 环境变量配置说明

## 基础配置

### 必需配置项

```bash
# 飞书应用配置
FEISHU_APP_ID=cli_xxxxx          # 飞书应用 ID（必需）
FEISHU_APP_SECRET=xxxxx          # 飞书应用密钥（必需）
```

### 可选配置项

```bash
# 服务器配置
PORT=3333                        # 服务器端口（默认：3333）

# 认证类型配置
FEISHU_AUTH_TYPE=tenant          # 认证类型（默认：tenant）
                                 # tenant: 应用级认证
                                 # user: 用户级认证（需要 OAuth 授权）
```

## Stdio 模式下的特殊配置

### 问题说明

在 **stdio 模式**下使用 **user 认证类型**时，系统无法从 HTTP 请求中获取 `baseUrl`，导致无法生成正确的 OAuth 授权链接。

### 解决方案

添加 `FEISHU_CALLBACK_URL` 环境变量来指定 OAuth 回调地址：

```bash
# OAuth 回调 URL（在 stdio 模式下使用 user 认证时必需）
FEISHU_CALLBACK_URL=http://localhost:3333/callback
```

**重要说明：**
1. 此配置仅在 **stdio 模式** + **user 认证** 时必需
2. 回调 URL 必须与飞书应用后台配置的 `redirect_uri` **完全一致**
3. 如果不配置，系统会使用默认值 `http://localhost:3333/callback`
4. 建议同时运行一个 HTTP 服务器来处理回调

### 使用场景对比

| 运行模式 | 认证类型 | 是否需要 FEISHU_CALLBACK_URL | 说明 |
|---------|---------|----------------------------|------|
| HTTP (SSE) | tenant | ❌ 不需要 | 应用级认证，无需 OAuth |
| HTTP (SSE) | user | ❌ 不需要 | 可从 HTTP 请求中获取 baseUrl |
| Stdio | tenant | ❌ 不需要 | 应用级认证，无需 OAuth |
| Stdio | user | ✅ **必需** | 无法从请求中获取 baseUrl |

## 完整配置示例

### 示例 1：Stdio 模式 + User 认证

```bash
# .env 文件
FEISHU_APP_ID=cli_xxxxx
FEISHU_APP_SECRET=xxxxx
FEISHU_AUTH_TYPE=user
FEISHU_CALLBACK_URL=http://localhost:3333/callback
```

对应的 Cursor 配置：

```json
{
  "mcpServers": {
    "feishu": {
      "command": "npx",
      "args": ["-y", "feishu-mcp", "--stdio"],
      "env": {
        "FEISHU_APP_ID": "cli_xxxxx",
        "FEISHU_APP_SECRET": "xxxxx",
        "FEISHU_AUTH_TYPE": "user",
        "FEISHU_CALLBACK_URL": "http://localhost:3333/callback"
      }
    }
  }
}
```

### 示例 2：HTTP 模式 + User 认证

```bash
# .env 文件
FEISHU_APP_ID=cli_xxxxx
FEISHU_APP_SECRET=xxxxx
PORT=3333
FEISHU_AUTH_TYPE=user
# 不需要配置 FEISHU_CALLBACK_URL
```

对应的 Cursor 配置：

```json
{
  "mcpServers": {
    "feishu": {
      "url": "http://localhost:3333/sse?userKey=123456"
    }
  }
}
```

### 示例 3：Stdio 模式 + Tenant 认证

```bash
# .env 文件
FEISHU_APP_ID=cli_xxxxx
FEISHU_APP_SECRET=xxxxx
FEISHU_AUTH_TYPE=tenant
# 不需要配置 FEISHU_CALLBACK_URL
```

对应的 Cursor 配置：

```json
{
  "mcpServers": {
    "feishu": {
      "command": "npx",
      "args": ["-y", "feishu-mcp", "--stdio"],
      "env": {
        "FEISHU_APP_ID": "cli_xxxxx",
        "FEISHU_APP_SECRET": "xxxxx",
        "FEISHU_AUTH_TYPE": "tenant"
      }
    }
  }
}
```

## 其他可选配置

```bash
# 日志配置
LOG_LEVEL=info                   # 日志级别（debug, info, log, warn, error, none）
LOG_SHOW_TIMESTAMP=true          # 是否显示时间戳
LOG_SHOW_LEVEL=true              # 是否显示日志级别

# 缓存配置
CACHE_ENABLED=true               # 是否启用缓存
CACHE_TTL=300                    # 缓存生存时间（秒）
CACHE_MAX_SIZE=100               # 最大缓存条目数
```

## 命令行参数

除了环境变量，也可以使用命令行参数：

```bash
npx feishu-mcp \
  --feishu-app-id=cli_xxxxx \
  --feishu-app-secret=xxxxx \
  --feishu-auth-type=user \
  --feishu-callback-url=http://localhost:3333/callback \
  --port=3333
```

命令行参数优先级高于环境变量。

## 故障排查

### 问题：在 stdio 模式下收到授权错误

**错误信息：**
```
请在浏览器打开以下链接进行授权：
[点击授权](https://accounts.feishu.cn/open-apis/authen/v1/authorize?client_id=...&redirect_uri=undefined/callback...)
```

**原因：** `baseUrl` 为空，导致 `redirect_uri` 为 `undefined/callback`

**解决方案：** 添加 `FEISHU_CALLBACK_URL` 环境变量

### 问题：授权后回调失败

**可能原因：**
1. `FEISHU_CALLBACK_URL` 与飞书应用后台配置的 `redirect_uri` 不一致
2. 没有运行 HTTP 服务器来处理回调
3. 回调地址无法访问（网络问题、防火墙等）

**解决方案：**
1. 确保 `FEISHU_CALLBACK_URL` 与飞书应用后台配置完全一致
2. 启动一个 HTTP 服务器：`npx feishu-mcp`（不加 --stdio）
3. 检查网络连接和防火墙设置

