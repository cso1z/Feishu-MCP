# 版本发布指南

## 发布测试版本

### 方法一：使用预发布版本号（推荐）

预发布版本号格式：`主版本号.次版本号.修订号-标签.序号`

例如：`0.1.9-beta.1`、`0.1.9-alpha.1`、`0.1.9-rc.1`

#### 步骤：

1. **更新版本号**（手动修改 `package.json` 或使用 npm version）：
   ```bash
   # 方式1：手动修改 package.json 中的 version 字段
   # 例如：将 "version": "0.1.8" 改为 "version": "0.1.9-beta.1"
   
   # 方式2：使用 npm version 命令（会自动创建 git tag）
   npm version 0.1.9-beta.1
   # 或
   npm version prerelease --preid=beta
   ```

2. **发布测试版本**：
   ```bash
   # 发布 beta 版本
   pnpm run pub:beta
   
   # 或发布 alpha 版本
   pnpm run pub:alpha
   
   # 或发布 test 版本
   pnpm run pub:test
   ```

3. **用户安装方式**：
   ```bash
   # 默认安装不会安装测试版本
   npm install feishu-mcp
   # 或
   pnpm add feishu-mcp
   
   # 只有明确指定标签才会安装测试版本
   npm install feishu-mcp@beta
   npm install feishu-mcp@alpha
   npm install feishu-mcp@test
   
   # 或指定具体版本号
   npm install feishu-mcp@0.1.9-beta.1
   ```

### 方法二：使用 dist-tag（适用于正常版本号）

如果你想使用正常的版本号（如 `0.1.9`），但通过标签区分测试版本：

1. **更新版本号**：
   ```bash
   npm version 0.1.9
   ```

2. **发布时指定标签**：
   ```bash
   npm publish --tag beta
   ```

3. **用户安装**：
   ```bash
   # 默认不会安装
   npm install feishu-mcp
   
   # 明确指定标签才会安装
   npm install feishu-mcp@beta
   ```

## 发布正式版本

1. **更新版本号**：
   ```bash
   npm version patch   # 0.1.8 -> 0.1.9
   npm version minor   # 0.1.8 -> 0.2.0
   npm version major   # 0.1.8 -> 1.0.0
   ```

2. **发布**：
   ```bash
   pnpm run pub:release
   ```

## 版本标签说明

- **latest**（默认）：正式版本，用户 `npm install` 时默认安装此标签
- **beta**：测试版本，需要明确指定 `@beta` 才会安装
- **alpha**：早期测试版本，需要明确指定 `@alpha` 才会安装
- **test**：测试版本，需要明确指定 `@test` 才会安装

## 查看已发布的版本和标签

```bash
# 查看所有版本
npm view feishu-mcp versions

# 查看所有标签
npm view feishu-mcp dist-tags

# 查看特定标签的版本
npm view feishu-mcp@beta version
```

## 注意事项

1. **预发布版本号优先级**：
   - 预发布版本（如 `0.1.9-beta.1`）不会被 `^0.1.8` 或 `~0.1.8` 这样的版本范围匹配
   - 只有明确指定才会安装

2. **版本号递增**：
   - beta 版本：`0.1.9-beta.1` -> `0.1.9-beta.2` -> `0.1.9-beta.3`
   - 正式版本：`0.1.9-beta.3` -> `0.1.9`（移除预发布标识）

3. **Git 标签**：
   - 使用 `npm version` 命令会自动创建 git tag
   - 记得推送标签：`git push --tags`

4. **发布前检查**：
   - 确保代码已构建：`pnpm run build`
   - 确保测试通过（如果有）
   - 确保版本号正确

## 示例工作流

### 发布第一个测试版本

```bash
# 1. 更新版本号为预发布版本
npm version 0.1.9-beta.1

# 2. 发布 beta 版本
pnpm run pub:beta

# 3. 推送代码和标签
git push
git push --tags
```

### 发布测试版本更新

```bash
# 1. 更新预发布版本号
npm version prerelease --preid=beta

# 2. 发布
pnpm run pub:beta

# 3. 推送
git push
git push --tags
```

### 测试版本转正式版本

```bash
# 1. 将预发布版本转为正式版本
npm version 0.1.9

# 2. 发布正式版本
pnpm run pub:release

# 3. 推送
git push
git push --tags
```
