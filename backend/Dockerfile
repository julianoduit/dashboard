# ---- build: compila o TypeScript ----
FROM node:22.23.4-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime: só o necessário para rodar ----
FROM node:22.23.4-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY migrations ./migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
# Aplica migrations pendentes e sobe a API (com o agendador do sync).
CMD ["sh", "-c", "node node_modules/node-pg-migrate/bin/node-pg-migrate.js -m migrations up && exec node dist/server.js"]
