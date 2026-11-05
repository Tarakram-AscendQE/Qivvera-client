# Preparation only: Docker build is NOT verified in checkpoint 0.
# This intentionally exposes only process health, not a product or assurance API.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
COPY test ./test
COPY scripts ./scripts
COPY server ./server
COPY web ./web
RUN npm run check

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/scripts/health-server.mjs ./scripts/health-server.mjs
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 3000
CMD ["node", "scripts/health-server.mjs"]
