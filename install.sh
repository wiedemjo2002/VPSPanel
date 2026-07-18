#!/usr/bin/env bash
set -Eeuo pipefail

readonly DEFAULT_INSTALL_DIR="/opt/vpspanel"
readonly DEFAULT_REPOSITORY="https://github.com/wiedemjo2002/VPSPanel.git"

INSTALL_DIR="${VPSPANEL_HOME:-$DEFAULT_INSTALL_DIR}"
REPOSITORY="${VPSPANEL_REPO_URL:-$DEFAULT_REPOSITORY}"
PANEL_DOMAIN=""
SOURCE_DIR=""

log() { printf '\033[1;36m→\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Install VPSPanel on Ubuntu 24.04 or Debian 12.

Usage: sudo ./install.sh [options]
  --domain panel.example.com  Enable automatic HTTPS immediately
  --install-dir PATH          Installation directory (default: /opt/vpspanel)
  --repo URL                  Public Git repository used by curl installations
  -h, --help                  Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) PANEL_DOMAIN="${2:-}"; shift 2 ;;
    --install-dir) INSTALL_DIR="${2:-}"; shift 2 ;;
    --repo) REPOSITORY="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "Run the installer with sudo."
[[ -r /etc/os-release ]] || die "Cannot identify this operating system."
# shellcheck disable=SC1091
source /etc/os-release
case "${ID:-}:${VERSION_ID:-}" in
  ubuntu:24.04|debian:12) ;;
  *) die "VPSPanel currently supports Ubuntu 24.04 and Debian 12 (found ${PRETTY_NAME:-unknown})." ;;
esac

if [[ -n "$PANEL_DOMAIN" ]] && [[ ! "$PANEL_DOMAIN" =~ ^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$ ]]; then
  die "Invalid domain: $PANEL_DOMAIN"
fi

export DEBIAN_FRONTEND=noninteractive
log "Installing required system packages"
apt-get update -qq
apt-get install -y -qq ca-certificates curl git openssl >/dev/null

if ! command -v docker >/dev/null 2>&1 || ! systemctl cat docker.service >/dev/null 2>&1; then
  log "Installing Docker Engine from Docker's official repository"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  ARCH="$(dpkg --print-architecture)"
  CODENAME="${VERSION_CODENAME}"
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable\n' "$ARCH" "$ID" "$CODENAME" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
fi

systemctl enable --now docker >/dev/null
docker info >/dev/null 2>&1 || die "Docker Engine was installed but is not running."
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is not available."
ok "Docker and Docker Compose are ready"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/docker-compose.yml" && -d "$SCRIPT_DIR/apps" ]]; then
  SOURCE_DIR="$SCRIPT_DIR"
else
  SOURCE_DIR="$(mktemp -d)"
  trap 'rm -rf "$SOURCE_DIR"' EXIT
  log "Downloading VPSPanel"
  git clone --depth 1 "$REPOSITORY" "$SOURCE_DIR" >/dev/null
fi

if [[ "$SOURCE_DIR" != "$INSTALL_DIR" ]]; then
  log "Installing files in $INSTALL_DIR"
  install -d -m 0755 "$INSTALL_DIR"
  tar -C "$SOURCE_DIR" --exclude='.env' --exclude='data' --exclude='backups' -cf - . | tar -C "$INSTALL_DIR" -xf -
fi

cd "$INSTALL_DIR"
if [[ ! -f .env ]]; then
  DB_PASSWORD="$(openssl rand -hex 24)"
  SESSION_SECRET="$(openssl rand -hex 32)"
  if [[ -n "$PANEL_DOMAIN" ]]; then
    SITE_ADDRESS="$PANEL_DOMAIN"
    PUBLIC_URL="https://$PANEL_DOMAIN"
  else
    SITE_ADDRESS=":8080"
    SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    PUBLIC_URL="http://${SERVER_IP:-localhost}:8080"
  fi
  umask 077
  cat > .env <<EOF
VPSPANEL_VERSION=0.1.0
PANEL_SITE_ADDRESS=$SITE_ADDRESS
PANEL_PUBLIC_URL=$PUBLIC_URL
POSTGRES_DB=vpspanel
POSTGRES_USER=vpspanel
POSTGRES_PASSWORD=$DB_PASSWORD
SESSION_SECRET=$SESSION_SECRET
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
EOF
fi

install -m 0755 scripts/panelctl /usr/local/bin/panelctl
log "Building and starting VPSPanel"
docker compose up -d --build --remove-orphans

for _ in {1..30}; do
  if docker compose exec -T panel node healthcheck.js >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker compose exec -T panel node healthcheck.js >/dev/null 2>&1 || die "The panel did not become healthy. Run: panelctl logs"

ok "Panel started"
ok "PostgreSQL is healthy"
ok "Caddy is ready"
printf '\n\033[1mVPSPanel is ready:\033[0m\n%s\n\n' "$(grep '^PANEL_PUBLIC_URL=' .env | cut -d= -f2-)"
printf 'Next step: open the address and connect GitHub.\n'
