#!/usr/bin/env bash
# Atualiza o código e reconstrói os containers. Rode no servidor, na pasta do projeto:
#   ./scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# Por padrão atualiza a branch que já está em uso no servidor.
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
COMPOSE="docker compose -f docker-compose.prod.yml"

[ -f .env ] || { echo "Falta o arquivo .env (copie de .env.example e preencha)"; exit 1; }

echo "==> Atualizando código ($BRANCH)"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "==> Construindo e subindo containers"
$COMPOSE up -d --build --remove-orphans

echo "==> Aguardando a API ficar saudável"
for i in $(seq 1 30); do
  status=$($COMPOSE ps --format '{{.Service}} {{.Health}}' | awk '$1=="backend"{print $2}')
  [ "$status" = "healthy" ] && break
  sleep 2
done
$COMPOSE ps
[ "$status" = "healthy" ] || { echo "A API não ficou saudável. Veja: $COMPOSE logs backend"; exit 1; }

docker image prune -f >/dev/null
echo "==> Pronto. Endereço público:"
$COMPOSE exec -T tailscale tailscale serve status || echo "(o Tailscale ainda está conectando; rode de novo: $COMPOSE exec tailscale tailscale serve status)"
