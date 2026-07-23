#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ID="5555555555555555"
DEPLOYMENT_ID="66666666666666666666"
DOMAIN="db-fixture.localhost"
ENV_FILE="/tmp/vpspanel-feature.env"
TOKEN="$(grep '^AGENT_TOKEN=' "$ENV_FILE" | cut -d= -f2-)"
AGENT_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' vpspanel-agent-1)"
AGENT_URL="http://${AGENT_IP}:3100"
DATABASE_URL="postgresql://app:test-only-password@vpspanel-db-${PROJECT_ID}:5432/app"

PAYLOAD="$(printf '{"projectId":"%s","deploymentId":"%s","owner":"wiedemjo2002","repo":"VPSPanel-TestApp","branch":"main","domain":"%s","framework":"static","port":80,"environment":{"DATABASE_URL":"%s"},"database":true,"config":{"packageManager":"npm"},"githubToken":""}' "$PROJECT_ID" "$DEPLOYMENT_ID" "$DOMAIN" "$DATABASE_URL")"
curl -fsS -X POST "$AGENT_URL/actions/deploy" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data "$PAYLOAD"
echo

for _ in {1..90}; do
  JOB="$(curl -fsS "$AGENT_URL/jobs/$DEPLOYMENT_ID" -H "Authorization: Bearer $TOKEN")"
  if grep -q '"status":"healthy"' <<<"$JOB"; then break; fi
  if grep -q '"status":"failed"' <<<"$JOB"; then echo "$JOB" >&2; exit 1; fi
  sleep 1
done

grep -q '"status":"healthy"' <<<"${JOB:-}" || { echo "Database deployment timed out" >&2; exit 1; }
docker exec "vpspanel-db-${PROJECT_ID}" pg_isready -U app -d app
docker inspect "vpspanel-db-${PROJECT_ID}" --format '{{json .NetworkSettings.Networks}}' | grep -Fq "vpspanel-internal-${PROJECT_ID}"
if docker inspect "vpspanel-db-${PROJECT_ID}" --format '{{json .NetworkSettings.Ports}}' | grep -Eq 'HostPort|HostIp'; then
  echo "Project database unexpectedly publishes a host port." >&2
  exit 1
fi

CONTENT="$(curl -ksS --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/")"
grep -Fq 'v2' <<<"$CONTENT"
echo "$JOB"
echo "Verified isolated PostgreSQL project deployment."
