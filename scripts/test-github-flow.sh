#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="/tmp/vpspanel-feature.env"
BACKUP="/tmp/vpspanel-feature.env.github-test-backup"

cd "$REPO_ROOT"
cp "$ENV_FILE" "$BACKUP"
restore() {
  cp "$BACKUP" "$ENV_FILE"
  docker compose --env-file "$ENV_FILE" up -d --force-recreate --wait panel >/dev/null
}
trap restore EXIT

echo "=== Public repository detection ==="
DETECTION="$(docker compose --env-file "$ENV_FILE" exec -T panel node --input-type=module -e "import { inspectRepository } from './lib/github.js'; console.log(JSON.stringify(await inspectRepository({owner:'wiedemjo2002',repo:'VPSPanel-TestApp',branch:'main'},'')))")"
echo "$DETECTION"
grep -q '"framework":"static"' <<<"$DETECTION"
grep -q '"defaultBranch":"main"' <<<"$DETECTION"

sed -i 's/^GITHUB_CLIENT_ID=.*/GITHUB_CLIENT_ID=Ov23liFAKECLIENT123/' "$ENV_FILE"
sed -i 's/^GITHUB_CLIENT_SECRET=.*/GITHUB_CLIENT_SECRET=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/' "$ENV_FILE"
docker compose --env-file "$ENV_FILE" up -d --force-recreate --wait panel >/dev/null

echo "=== OAuth authorization start ==="
HEADERS="$(mktemp)"
curl -sS -D "$HEADERS" -o /dev/null http://127.0.0.1:8080/api/auth/github
grep -Eqi '^HTTP/.* 302' "$HEADERS"
grep -Eqi '^location: https://github.com/login/oauth/authorize' "$HEADERS"
grep -Eqi '^set-cookie: vpspanel_oauth=' "$HEADERS"
grep -Eqi 'client_id=Ov23liFAKECLIENT123' "$HEADERS"
cat "$HEADERS"

echo "=== Invalid OAuth callback rejection ==="
CALLBACK_HEADERS="$(mktemp)"
curl -sS -D "$CALLBACK_HEADERS" -o /dev/null 'http://127.0.0.1:8080/api/auth/github/callback?state=invalid&code=invalid'
grep -Eqi '^HTTP/.* 302' "$CALLBACK_HEADERS"
grep -Eqi '^location: /\?error=oauth_state' "$CALLBACK_HEADERS"

echo "=== GitHub flow test passed ==="
