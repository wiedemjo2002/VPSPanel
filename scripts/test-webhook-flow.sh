#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="/tmp/vpspanel-feature.env"
PROJECT_ID="1111111111111111"
SECRET="vpspanel-webhook-e2e-secret"

cd "$REPO_ROOT"
docker compose --env-file "$ENV_FILE" exec -T panel node --input-type=module <<'NODE'
import { pool } from './lib/database.js';
import { encrypt } from './lib/security.js';
const addition = JSON.stringify({ autoDeploy: true, webhookSecret: encrypt('vpspanel-webhook-e2e-secret') });
await pool.query("UPDATE projects SET status='online',config=config || $1::jsonb,encrypted_env=$2 WHERE id=$3", [addition, encrypt({ NODE_ENV: 'production', PORT: '80' }), '1111111111111111']);
await pool.end();
NODE

PAYLOAD='{"ref":"refs/heads/main","repository":{"full_name":"wiedemjo2002/VPSPanel-TestApp"}}'
SIGNATURE="sha256=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')"

echo "=== Invalid webhook signature ==="
STATUS="$(curl -sS -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -H 'X-GitHub-Event: push' -H 'X-Hub-Signature-256: sha256=invalid' --data "$PAYLOAD" http://127.0.0.1:8080/api/webhooks/github)"
[[ "$STATUS" == "401" ]]

echo "=== Signed push webhook ==="
RESPONSE="$(curl -fsS -H 'Content-Type: application/json' -H 'X-GitHub-Event: push' -H "X-Hub-Signature-256: $SIGNATURE" --data "$PAYLOAD" http://127.0.0.1:8080/api/webhooks/github)"
echo "$RESPONSE"
DEPLOYMENT_ID="$(sed -n 's/.*"deploymentId":"\([a-f0-9]*\)".*/\1/p' <<<"$RESPONSE")"
[[ "$DEPLOYMENT_ID" =~ ^[a-f0-9]{20}$ ]]

AGENT_TOKEN="$(sed -n 's/^AGENT_TOKEN=//p' "$ENV_FILE")"
for _ in {1..90}; do
  JOB="$(docker compose --env-file "$ENV_FILE" exec -T agent wget -qO- --header "Authorization: Bearer $AGENT_TOKEN" "http://127.0.0.1:3100/jobs/$DEPLOYMENT_ID")"
  if grep -q '"status":"healthy"' <<<"$JOB"; then
    echo "$JOB"
    echo "=== Webhook deployment passed ==="
    exit 0
  fi
  if grep -q '"status":"failed"' <<<"$JOB"; then echo "$JOB" >&2; exit 1; fi
  sleep 1
done

echo "Webhook deployment timed out" >&2
exit 1
