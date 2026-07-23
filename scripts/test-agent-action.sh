#!/usr/bin/env bash
set -Eeuo pipefail

MODE="${MODE:-deploy}"
PROJECT_ID="${PROJECT_ID:-1111111111111111}"
DEPLOYMENT_ID="${DEPLOYMENT_ID:?Set a 20-character hexadecimal DEPLOYMENT_ID}"
EXPECTED_TEXT="${EXPECTED_TEXT:?Set EXPECTED_TEXT}"
ENV_FILE="${ENV_FILE:-/tmp/vpspanel-feature.env}"

TOKEN="$(grep '^AGENT_TOKEN=' "$ENV_FILE" | cut -d= -f2-)"
AGENT_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' vpspanel-agent-1)"
AGENT_URL="http://${AGENT_IP}:3100"

if [[ "$MODE" == "deploy" ]]; then
  PAYLOAD="$(printf '{"projectId":"%s","deploymentId":"%s","owner":"wiedemjo2002","repo":"VPSPanel-TestApp","branch":"main","domain":"fixture.localhost","framework":"static","port":80,"environment":{},"database":false,"config":{"packageManager":"npm"},"githubToken":""}' "$PROJECT_ID" "$DEPLOYMENT_ID")"
  curl -fsS -X POST "$AGENT_URL/actions/deploy" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data "$PAYLOAD"
else
  IMAGE_TAG="${IMAGE_TAG:?Set IMAGE_TAG for rollback}"
  PAYLOAD="$(printf '{"projectId":"%s","deploymentId":"%s","imageTag":"%s","domain":"fixture.localhost","framework":"static","port":80,"environment":{},"database":false}' "$PROJECT_ID" "$DEPLOYMENT_ID" "$IMAGE_TAG")"
  curl -fsS -X POST "$AGENT_URL/actions/rollback" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data "$PAYLOAD"
fi
echo

for _ in {1..90}; do
  JOB="$(curl -fsS "$AGENT_URL/jobs/$DEPLOYMENT_ID" -H "Authorization: Bearer $TOKEN")"
  if grep -q '"status":"healthy"' <<<"$JOB"; then
    echo "$JOB"
    break
  fi
  if grep -q '"status":"failed"' <<<"$JOB"; then
    echo "$JOB" >&2
    exit 1
  fi
  sleep 1
done

grep -q '"status":"healthy"' <<<"${JOB:-}" || { echo "Agent job timed out" >&2; exit 1; }

CONTENT="$(curl -ksS --resolve fixture.localhost:443:127.0.0.1 https://fixture.localhost/)"
grep -Fq "$EXPECTED_TEXT" <<<"$CONTENT" || { echo "Unexpected application response: $CONTENT" >&2; exit 1; }
echo "Verified application content: $EXPECTED_TEXT"

LOGS="$(curl -fsS "$AGENT_URL/actions/logs?projectId=$PROJECT_ID" -H "Authorization: Bearer $TOKEN")"
grep -q 'GET /' <<<"$LOGS" || { echo "Expected access log not found: $LOGS" >&2; exit 1; }
echo "Verified project logs."
