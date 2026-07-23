#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="/tmp/vpspanel-feature.env"

sed -i '/^E2E_MODE=/d; /^E2E_SESSION_TOKEN=/d' "$ENV_FILE"
TOKEN="${E2E_SESSION_TOKEN_OVERRIDE:-$(openssl rand -hex 32)}"
printf 'E2E_MODE=true\nE2E_SESSION_TOKEN=%s\n' "$TOKEN" >> "$ENV_FILE"
cd "$REPO_ROOT"
docker compose --env-file "$ENV_FILE" up -d --build --force-recreate --wait panel
curl -fsS http://127.0.0.1:8080/api/health
echo "Browser test URL: http://127.0.0.1:8080/api/e2e/session?token=$TOKEN"
echo
