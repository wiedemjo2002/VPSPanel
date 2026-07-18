#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run this disposable-host test as root." >&2
  exit 1
fi

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="/tmp/vpspanel-feature.env"

cp /opt/vpspanel/.env "$ENV_FILE"
if ! grep -q '^AGENT_TOKEN=' "$ENV_FILE"; then
  printf 'AGENT_TOKEN=%s\n' "$(openssl rand -hex 32)" >> "$ENV_FILE"
fi

cd "$REPO_ROOT"
echo "=== Feature stack build: $(date -Is) ==="
docker compose --env-file "$ENV_FILE" up -d --build --remove-orphans

echo "=== Feature stack status ==="
docker compose --env-file "$ENV_FILE" ps
docker compose --env-file "$ENV_FILE" exec -T panel node healthcheck.js
docker compose --env-file "$ENV_FILE" exec -T agent node healthcheck.js
curl -fsS http://127.0.0.1:8080/api/health
echo

echo "=== Caddy admin isolation ==="
if docker compose --env-file "$ENV_FILE" exec -T panel node -e "fetch('http://caddy:2019/config/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
  echo "Caddy admin API is reachable from the panel network." >&2
  exit 1
else
  echo "Caddy admin API is isolated as expected."
fi

echo "=== Feature stack test passed: $(date -Is) ==="
