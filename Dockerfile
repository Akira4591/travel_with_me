FROM node:22-alpine
WORKDIR /app

# 先复制依赖描述、装依赖：这一层会被 docker 缓存，
# 只改业务代码时不会重装 npm 包
COPY package*.json ./
RUN npm ci --omit=dev

# 再复制其余源码
COPY . .

# 容器内监听 8080，Zeabur 公网访问那边也填 8080
EXPOSE 8080
CMD ["node", "server/index.js"]
