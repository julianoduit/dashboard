# ---- build: gera os arquivos estáticos do React ----
FROM node:22.23.4-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime: Caddy serve o front e encaminha /api para o backend ----
FROM caddy:2.11.7-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80
