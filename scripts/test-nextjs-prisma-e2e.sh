#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run this end-to-end test as root." >&2
  exit 1
fi

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-/tmp/vpspanel-feature.env}"
DOMAIN="next-prisma-$(date +%s).localhost"
COOKIE_FILE="$(mktemp)"
TOKEN="$(grep '^E2E_SESSION_TOKEN=' "$ENV_FILE" | tail -n1 | cut -d= -f2- || true)"
sed -i '/^E2E_MODE=/d' "$ENV_FILE"
printf 'E2E_MODE=true\n' >> "$ENV_FILE"

if [[ -z "$TOKEN" ]]; then
  TOKEN="$(openssl rand -hex 32)"
  printf 'E2E_SESSION_TOKEN=%s\n' "$TOKEN" >> "$ENV_FILE"
fi

cd "$REPO_ROOT"
docker compose --env-file "$ENV_FILE" up -d --build --wait agent panel
curl -fsS -c "$COOKIE_FILE" -L "http://127.0.0.1:8080/api/e2e/session?token=$TOKEN" >/dev/null

json_field() {
  grep -o "\"$1\":\"[^\"]*\"" | head -n1 | cut -d'"' -f4
}

api() {
  curl -fsS -b "$COOKIE_FILE" -H 'Content-Type: application/json' "$@"
}

poll_online() {
  local project_id="$1" status_json status
  for _ in {1..180}; do
    status_json="$(api "http://127.0.0.1:8080/api/projects/$project_id/status")"
    status="$(printf '%s' "$status_json" | json_field status)"
    printf 'status=%s\n' "$status"
    if [[ "$status" == "online" || "$status" == "healthy" ]]; then
      printf '%s' "$status_json"
      return 0
    fi
    if [[ "$status" == "failed" ]]; then
      printf '%s\n' "$status_json" >&2
      api "http://127.0.0.1:8080/api/projects/$project_id/logs" >&2 || true
      return 1
    fi
    sleep 2
  done
  echo "Deployment timed out." >&2
  return 1
}

echo "=== Repository detection ==="
INSPECTION="$(api -X POST --data '{"owner":"wiedemjo2002","repo":"VPSPanel-TestApp","branch":"e2e-nextjs-prisma-v1"}' http://127.0.0.1:8080/api/inspect)"
echo "$INSPECTION"
grep -q '"framework":"nextjs"' <<<"$INSPECTION"
grep -q '"migrationCommand":"npx prisma migrate deploy"' <<<"$INSPECTION"
grep -q '"missingVariables":\[\]' <<<"$INSPECTION"

echo "=== Initial Next.js + PostgreSQL deployment ==="
CREATE="$(api -X POST --data "{\"owner\":\"wiedemjo2002\",\"repo\":\"VPSPanel-TestApp\",\"branch\":\"e2e-nextjs-prisma-v1\",\"domain\":\"$DOMAIN\",\"database\":true,\"autoDeploy\":false,\"environment\":{}}" http://127.0.0.1:8080/api/projects)"
echo "$CREATE"
PROJECT_ID="$(printf '%s' "$CREATE" | json_field projectId)"
[[ "$PROJECT_ID" =~ ^[a-f0-9]{16}$ ]]
poll_online "$PROJECT_ID" >/tmp/vpspanel-nextjs-v1-status.json

V1_CONTENT="$(curl -kfsS --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/")"
grep -q 'version=v1' <<<"$V1_CONTENT"
grep -q 'database=connected' <<<"$V1_CONTENT"
docker exec "vpspanel-db-$PROJECT_ID" psql -U app -d app -Atc 'SELECT count(*) FROM "DeploymentCheck"' | grep -Eq '^[1-9][0-9]*$'

echo "=== Runtime isolation ==="
docker inspect "vpspanel-app-$PROJECT_ID" --format '{{json .HostConfig.SecurityOpt}} {{.HostConfig.PidsLimit}}' | grep -q 'no-new-privileges:true.*512'
if docker inspect "vpspanel-db-$PROJECT_ID" --format '{{json .NetworkSettings.Ports}}' | grep -Eq 'HostPort|HostIp'; then
  echo "Project database unexpectedly publishes a host port." >&2
  exit 1
fi
docker inspect "vpspanel-db-$PROJECT_ID" --format '{{json .NetworkSettings.Networks}}' | grep -Fq "vpspanel-internal-$PROJECT_ID"

echo "=== Redeploy current project with v2 branch ==="
DB_USER="$(grep '^POSTGRES_USER=' "$ENV_FILE" | tail -n1 | cut -d= -f2- || true)"
docker inspect "vpspanel-db-$PROJECT_ID" --format '{{json .HostConfig.SecurityOpt}} {{.HostConfig.PidsLimit}}' | grep -q 'no-new-privileges:true.*256'
DB_NAME="$(grep '^POSTGRES_DB=' "$ENV_FILE" | tail -n1 | cut -d= -f2- || true)"
DB_USER="${DB_USER:-vpspanel}"
DB_NAME="${DB_NAME:-vpspanel}"
docker compose --env-file "$ENV_FILE" exec -T database psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "UPDATE projects SET branch='e2e-nextjs-prisma-v2' WHERE id='$PROJECT_ID'"
REDEPLOY="$(api -X POST --data '{}' "http://127.0.0.1:8080/api/projects/$PROJECT_ID/deploy")"
echo "$REDEPLOY"
poll_online "$PROJECT_ID" >/tmp/vpspanel-nextjs-v2-status.json
V2_CONTENT="$(curl -kfsS --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/")"
grep -q 'version=v2' <<<"$V2_CONTENT"
grep -q 'database=connected' <<<"$V2_CONTENT"

echo "=== Logs and one-click rollback ==="
LOGS="$(api "http://127.0.0.1:8080/api/projects/$PROJECT_ID/logs")"
grep -Eq 'Next\.js|Ready|Local:' <<<"$LOGS"
ROLLBACK="$(api -X POST --data '{}' "http://127.0.0.1:8080/api/projects/$PROJECT_ID/rollback")"
echo "$ROLLBACK"
poll_online "$PROJECT_ID" >/tmp/vpspanel-nextjs-rollback-status.json
ROLLBACK_CONTENT="$(curl -kfsS --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/")"
grep -q 'version=v1' <<<"$ROLLBACK_CONTENT"
grep -q 'database=connected' <<<"$ROLLBACK_CONTENT"

printf '\nNext.js/Prisma E2E passed.\nProject: %s\nURL: https://%s\n' "$PROJECT_ID" "$DOMAIN"
