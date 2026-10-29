
FROM node:26-alpine

WORKDIR /app
RUN npm i pnpm -g

# 先复制依赖清单，利用 Docker 构建缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm i
# 复制项目代码
COPY . .

EXPOSE 5173

CMD ["pnpm", "dev", "--", "--host", "0.0.0.0"]
