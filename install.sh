#!/usr/bin/env bash
set -Eeuo pipefail

readonly DEFAULT_INSTALL_DIR="/opt/vpspanel"
readonly DEFAULT_REPOSITORY="https://github.com/wiedemjo2002/VPSPanel.git"

INSTALL_DIR="${VPSPANEL_HOME:-$DEFAULT_INSTALL_DIR}"
REPOSITORY="${VPSPANEL_REPO_URL:-$DEFAULT_REPOSITORY}"
PANEL_DOMAIN=""
PANEL_LANG="${VPSPANEL_LANGUAGE:-de}"
LANGUAGE_EXPLICIT=0
SOURCE_DIR=""

log() { printf '\033[1;36m→\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }
say() { if [[ "$PANEL_LANG" == "en" ]]; then printf '%s' "$2"; else printf '%s' "$1"; fi; }

usage() {
  if [[ "$PANEL_LANG" == "en" ]]; then
    cat <<'EOF'
Install VPSPanel on Ubuntu 24.04 or Debian 12.

Usage: sudo ./install.sh [options]
  --language de|en            Installation language (default: de)
  --domain panel.example.com  Enable automatic HTTPS immediately
  --install-dir PATH          Installation directory (default: /opt/vpspanel)
  --repo URL                  Public Git repository used by curl installations
  -h, --help                  Show this help
EOF
  else
    cat <<'EOF'
VPSPanel auf Ubuntu 24.04 oder Debian 12 installieren.

Aufruf: sudo ./install.sh [Optionen]
  --language de|en            Installationssprache (Standard: de)
  --domain panel.example.com  Automatisches HTTPS sofort aktivieren
  --install-dir PFAD          Installationsordner (Standard: /opt/vpspanel)
  --repo URL                  Öffentliches Git-Repository für curl-Installationen
  -h, --help                  Diese Hilfe anzeigen
EOF
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --language)
      PANEL_LANG="${2:-}"
      [[ "$PANEL_LANG" == "de" || "$PANEL_LANG" == "en" ]] || die "Unsupported language: ${PANEL_LANG:-<empty>} (use de or en)."
      LANGUAGE_EXPLICIT=1
      shift 2
      ;;
    --domain) PANEL_DOMAIN="${2:-}"; shift 2 ;;
    --install-dir) INSTALL_DIR="${2:-}"; shift 2 ;;
    --repo) REPOSITORY="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "$(say "Unbekannte Option" "Unknown option"): $1" ;;
  esac
done
[[ "$PANEL_LANG" == "de" || "$PANEL_LANG" == "en" ]] || die "Unsupported language: $PANEL_LANG (use de or en)."

[[ $EUID -eq 0 ]] || die "$(say "Starte den Installer mit sudo." "Run the installer with sudo.")"
[[ -r /etc/os-release ]] || die "$(say "Das Betriebssystem konnte nicht erkannt werden." "Cannot identify this operating system.")"
# shellcheck disable=SC1091
source /etc/os-release
case "${ID:-}:${VERSION_ID:-}" in
  ubuntu:24.04|debian:12) ;;
  *) die "VPSPanel currently supports Ubuntu 24.04 and Debian 12 (found ${PRETTY_NAME:-unknown})." ;;
esac

if [[ -n "$PANEL_DOMAIN" ]] && [[ ! "$PANEL_DOMAIN" =~ ^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$ ]]; then
  die "$(say "Ungültige Domain" "Invalid domain"): $PANEL_DOMAIN"
fi

export DEBIAN_FRONTEND=noninteractive
log "$(say "Benötigte Systempakete werden installiert" "Installing required system packages")"
apt-get update -qq
apt-get install -y -qq ca-certificates curl git openssl >/dev/null

if ! command -v docker >/dev/null 2>&1 || ! systemctl cat docker.service >/dev/null 2>&1; then
  log "$(say "Docker Engine wird aus dem offiziellen Docker-Repository installiert" "Installing Docker Engine from Docker's official repository")"
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
docker info >/dev/null 2>&1 || die "$(say "Docker Engine wurde installiert, läuft aber nicht." "Docker Engine was installed but is not running.")"
docker compose version >/dev/null 2>&1 || die "$(say "Docker Compose v2 ist nicht verfügbar." "Docker Compose v2 is not available.")"
ok "$(say "Docker und Docker Compose sind bereit" "Docker and Docker Compose are ready")"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/docker-compose.yml" && -d "$SCRIPT_DIR/apps" ]]; then
  SOURCE_DIR="$SCRIPT_DIR"
else
  SOURCE_DIR="$(mktemp -d)"
  trap 'rm -rf "$SOURCE_DIR"' EXIT
  log "$(say "VPSPanel wird heruntergeladen" "Downloading VPSPanel")"
  git clone --depth 1 "$REPOSITORY" "$SOURCE_DIR" >/dev/null
fi

if [[ "$SOURCE_DIR" != "$INSTALL_DIR" ]]; then
  log "$(say "Dateien werden installiert unter" "Installing files in") $INSTALL_DIR"
  install -d -m 0755 "$INSTALL_DIR"
  tar -C "$SOURCE_DIR" --exclude='.env' --exclude='data' --exclude='backups' -cf - . | tar -C "$INSTALL_DIR" -xf -
fi

cd "$INSTALL_DIR"
if [[ ! -f .env ]]; then
  DB_PASSWORD="$(openssl rand -hex 24)"
  SESSION_SECRET="$(openssl rand -hex 32)"
  AGENT_TOKEN="$(openssl rand -hex 32)"
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
VPSPANEL_VERSION=0.2.0
PANEL_LANGUAGE=$PANEL_LANG
PANEL_SITE_ADDRESS=$SITE_ADDRESS
PANEL_PUBLIC_URL=$PUBLIC_URL
POSTGRES_DB=vpspanel
POSTGRES_USER=vpspanel
POSTGRES_PASSWORD=$DB_PASSWORD
SESSION_SECRET=$SESSION_SECRET
AGENT_TOKEN=$AGENT_TOKEN
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
EOF
elif grep -q '^PANEL_LANGUAGE=' .env; then
  if (( LANGUAGE_EXPLICIT )); then
    sed -i "s/^PANEL_LANGUAGE=.*/PANEL_LANGUAGE=$PANEL_LANG/" .env
  else
    SAVED_LANGUAGE="$(grep '^PANEL_LANGUAGE=' .env | tail -n1 | cut -d= -f2-)"
    if [[ "$SAVED_LANGUAGE" == "de" || "$SAVED_LANGUAGE" == "en" ]]; then PANEL_LANG="$SAVED_LANGUAGE"; fi
  fi
else
  printf 'PANEL_LANGUAGE=%s\n' "$PANEL_LANG" >> .env
fi
chmod 0600 .env

install -m 0755 scripts/panelctl /usr/local/bin/panelctl
log "$(say "VPSPanel wird gebaut und gestartet" "Building and starting VPSPanel")"
docker compose up -d --build --remove-orphans

for _ in {1..30}; do
  if docker compose exec -T panel node healthcheck.js >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker compose exec -T panel node healthcheck.js >/dev/null 2>&1 || die "$(say "Das Panel wurde nicht fehlerfrei gestartet. Befehl: panelctl logs" "The panel did not become healthy. Run: panelctl logs")"

ok "$(say "Panel wurde gestartet" "Panel started")"
ok "$(say "PostgreSQL ist bereit" "PostgreSQL is healthy")"
ok "$(say "Caddy ist bereit" "Caddy is ready")"
printf '\n\033[1m%s\033[0m\n%s\n\n' "$(say "VPSPanel ist bereit:" "VPSPanel is ready:")" "$(grep '^PANEL_PUBLIC_URL=' .env | cut -d= -f2-)"
printf '%s\n' "$(say "Nächster Schritt: Adresse öffnen und GitHub verbinden." "Next step: open the address and connect GitHub.")"
