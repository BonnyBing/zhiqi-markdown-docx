# 智启 Markdown→Word API（公司 Docker / 端口直出 8100）
FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY api ./api
COPY src ./src
COPY scripts ./scripts
COPY openapi ./openapi

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8100 \
    LOCAL_STORAGE_DIR=/data

RUN mkdir -p /data

EXPOSE 8100

CMD ["npx", "tsx", "scripts/server.ts"]
