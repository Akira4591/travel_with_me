FROM node:22-alpine AS runtime-source
WORKDIR /source
COPY . .
RUN node scripts/assemble-2d-runtime.mjs /runtime

FROM node:22-alpine
WORKDIR /app

COPY --from=runtime-source /runtime/package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=runtime-source /runtime ./

# 容器内监听 8080，Zeabur 公网访问那边也填 8080
EXPOSE 8080
CMD ["node", "server/index.js"]
