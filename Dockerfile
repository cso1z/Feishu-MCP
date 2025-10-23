# 使用 Node.js 20 官方镜像作为基础镜像
FROM node:20.17.0-alpine AS builder

# 安装 pnpm
RUN npm install -g pnpm@latest

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 pnpm-lock.yaml
COPY package.json pnpm-lock.yaml* ./

# 安装依赖（跳过 prepare 脚本，因为此时还没有源代码）
RUN pnpm install --frozen-lockfile --ignore-scripts

# 复制源代码
COPY . .

# 构建项目
RUN pnpm run build

# 生产阶段
FROM node:20.17.0-alpine

# 安装 pnpm
RUN npm install -g pnpm@latest

# 设置工作目录
WORKDIR /app

# 从构建阶段复制构建产物和必要文件
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml* ./
COPY --from=builder /app/README.md ./

# 仅安装生产依赖（跳过脚本，因为已经有构建产物）
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3333

# 暴露端口
EXPOSE 3333

# 启动应用
CMD ["node", "dist/index.js"]
