#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="/tmp/vpspanel-feature.env"

sed -i '/^E2E_SESSION_TOKEN=/d' "$ENV_FILE"
cd "$REPO_ROOT"
docker exec vpspanel-database-1 psql -U vpspanel -d vpspanel -c "DELETE FROM users WHERE github_id=-1" >/dev/null
docker compose --env-file "$ENV_FILE" up -d --force-recreate --wait panel >/dev/null
echo "Browser test access disabled."
