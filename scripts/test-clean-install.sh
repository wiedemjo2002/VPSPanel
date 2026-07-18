#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_URL="${VPSPANEL_INSTALL_URL:-https://raw.githubusercontent.com/wiedemjo2002/VPSPanel/main/install.sh}"

if [[ $EUID -ne 0 ]]; then
  echo "Run this disposable-host test as root." >&2
  exit 1
fi

echo "=== VPSPanel clean install: $(date -Is) ==="
curl -fsSL "$INSTALL_URL" | bash

echo "=== Service status ==="
panelctl status

echo "=== Doctor ==="
panelctl doctor

echo "=== HTTP health ==="
curl -fsS http://127.0.0.1:8080/api/health
echo

echo "=== Clean install test passed: $(date -Is) ==="
