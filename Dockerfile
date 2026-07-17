FROM node:22-slim AS build
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-slim AS runtime
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY . .
RUN mkdir -p data
EXPOSE 8080
CMD ["node", "server/index.js"]
