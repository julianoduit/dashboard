#!/usr/bin/env bash
# Atualiza o código e reconstrói os containers. Rode no servidor, na pasta do projeto:
#   ./scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# Por padrão atualiza a branch que já está em uso no servidor.
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
COMPOSE="docker compose -f docker-compose.prod.yml"

[ -f .env ] || { echo "Falta o arquivo .env (copie de .env.example e preencha)"; exit 1; }

if [ -z "${DEPLOY_JA_ATUALIZADO:-}" ]; then
  echo "==> Atualizando código ($BRANCH)"
  antes=$(git hash-object "$0")
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
  # O bash continua lendo a versão antiga deste arquivo: se o pull trouxe uma versão nova
  # do deploy.sh, reinicia com ela (sem repetir o pull).
  if [ "$(git hash-object "$0")" != "$antes" ]; then
    echo "==> deploy.sh mudou; reiniciando com a versão nova"
    DEPLOY_JA_ATUALIZADO=1 exec "$0" "$@"
  fi
fi

# Rede compartilhada com o KiipitADS (API interna do dashboard).
docker network inspect duit-interno >/dev/null 2>&1 || docker network create duit-interno >/dev/null

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
