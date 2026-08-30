FROM node:22-slim AS runtime-source
WORKDIR /source
COPY . .
RUN node scripts/assemble-2d-runtime.mjs /runtime

FROM node:22-slim AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=runtime-source /runtime/package*.json ./
RUN npm ci --omit=dev

FROM node:22-slim
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=runtime-source /runtime ./
RUN mkdir -p data && chown -R node:node /app
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||'8080')+'/healthz').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
