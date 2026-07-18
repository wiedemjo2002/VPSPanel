# VPSPanel

VPSPanel macht aus einem frischen Ubuntu- oder Debian-VPS eine kleine Self-Hosting-Plattform:

> GitHub-Repository w?hlen, Domain eintragen, online.

Der Installer richtet Docker Engine, Docker Compose, Caddy, PostgreSQL, das Panel und den Deployment-Agenten automatisch ein.

## Installation

Unter Ubuntu 24.04 oder Debian 12:

~~~bash
curl -fsSL https://raw.githubusercontent.com/wiedemjo2002/VPSPanel/main/install.sh | sudo bash
~~~

Wenn panel.example.com bereits auf den Server zeigt:

~~~bash
curl -fsSL https://raw.githubusercontent.com/wiedemjo2002/VPSPanel/main/install.sh | sudo bash -s -- --domain panel.example.com
~~~

Der Installer ist idempotent, installiert Docker aus dem offiziellen Docker-Repository, erzeugt starke lokale Secrets, startet den Compose-Stack und wartet auf alle Healthchecks. Die Installation liegt standardm??ig unter /opt/vpspanel.

## Einmalige GitHub-Einrichtung

1. In GitHub unter **Settings ? Developer settings ? OAuth Apps** eine OAuth App anlegen.
2. Als Homepage die Panel-URL und als Callback PANEL-URL/api/auth/github/callback eintragen.
3. Zugangsdaten sicher hinterlegen:

~~~bash
sudo panelctl github setup
sudo panelctl github status
~~~

panelctl fragt Client-ID und Client-Secret interaktiv ab; das Secret erscheint nicht in der Shell-History. Danach im Browser mit GitHub anmelden.

## User-Flow

1. Mit GitHub anmelden und ein Repository ausw?hlen.
2. VPSPanel erkennt statische Sites, Node.js, Next.js und FastAPI sowie fehlende Umgebungsvariablen.
3. Domain eintragen und optional eine eigene PostgreSQL-Datenbank aktivieren.
4. Deployment starten; Build, Container, Healthcheck, Caddy-Route und HTTPS laufen automatisch.
5. Standardm??ig wird ein signierter GitHub-Webhook angelegt. Jeder Push auf den gew?hlten Branch deployt neu.
6. Logs ansehen oder mit einem Klick auf die letzte funktionierende Version zur?ckrollen.

F?r das automatische Anlegen des Webhooks ben?tigt der angemeldete GitHub-Benutzer Admin-Rechte am Repository. Schl?gt nur die Webhook-Einrichtung fehl, l?uft das erste Deployment trotzdem und das Panel zeigt einen verst?ndlichen Hinweis.

## Betrieb mit panelctl

~~~bash
sudo panelctl status
sudo panelctl doctor
sudo panelctl logs panel
sudo panelctl logs agent
sudo panelctl restart
sudo panelctl backup
sudo panelctl update
sudo panelctl domain panel.example.com
sudo panelctl github setup
sudo panelctl uninstall
~~~

Mit VPSPANEL_HOME kann ein abweichendes Installationsverzeichnis verwendet werden.

## Architektur

- apps/panel: Weboberfl?che, GitHub OAuth, Projekt- und Deployment-API
- apps/agent: allow-listed Deploy-, Log- und Rollback-Aktionen
- docker/Caddyfile: ?ffentlicher Reverse Proxy und automatische Zertifikate
- database: interne Panel-Metadatenbank ohne ver?ffentlichten Host-Port
- scripts/panelctl: kleines Werkzeug f?r den t?glichen Betrieb

Projektcontainer h?ngen nur am Edge-Netzwerk. Optionale Projekt-Datenbanken erhalten ein eigenes internes Docker-Netzwerk und keinen Host-Port. Der Caddy-Admin-Endpunkt ist nur im Caddy-Container erreichbar.

Der Deployment-Agent ben?tigt den Docker-Socket und ist deshalb ein sicherheitskritischer Bestandteil. Seine HTTP-API ist nicht ?ffentlich erreichbar, verlangt ein zuf?lliges Agent-Token und akzeptiert ausschlie?lich validierte, fest definierte Aktionen; sie stellt keine freie Shell bereit.

## Entwicklung und Tests

~~~bash
cp .env.example .env
# Alle change-me-Werte ersetzen
docker compose up --build
~~~

?ffne danach http://localhost:8080.

Relevante Pr?fungen:

~~~bash
cd apps/panel && npm test && npm run check
cd ../agent && npm test && npm run check
sudo bash scripts/test-feature-stack.sh
sudo bash scripts/test-github-flow.sh
sudo bash scripts/test-agent-action.sh
sudo bash scripts/test-agent-database.sh
sudo bash scripts/test-webhook-flow.sh
~~~

Der Linux-Smoke-Test scripts/test-clean-install.sh pr?ft zus?tzlich den ver?ffentlichten Ein-Befehl-Installer in einer sauberen Umgebung.

## Bewusste MVP-Grenzen

Nicht enthalten sind Mailhosting, DNS-Verwaltung, beliebige Compose-Stacks, Kubernetes, FTP, ein Dateimanager oder ein uneingeschr?nkter KI-/Root-Shell-Zugang.

## Lizenz

MIT, siehe [LICENSE](LICENSE).
