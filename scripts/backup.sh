#!/usr/bin/env bash
# Backup do Postgres em backups/AAAA-MM-DD_HHMM.sql.gz, mantendo os últimos 14 dias.
# Agende no crontab do servidor (todo dia às 04:10):
#   10 4 * * * /caminho/do/projeto/scripts/backup.sh >> /caminho/do/projeto/backups/backup.log 2>&1
# Copie a pasta backups/ para fora do servidor (Google Drive, outro computador): se o disco
# do servidor morrer, o backup morre junto.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

mkdir -p backups
arquivo="backups/$(date +%F_%H%M).sql.gz"
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --clean --if-exists | gzip > "$arquivo"
find backups -name '*.sql.gz' -mtime +14 -delete
echo "$(date '+%F %T') backup ok: $arquivo ($(du -h "$arquivo" | cut -f1))"
