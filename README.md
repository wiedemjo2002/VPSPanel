# VPSPanel

VPSPanel macht aus einem frischen Ubuntu- oder Debian-VPS eine kleine Self-Hosting-Plattform:

> Öffentliche GitHub-URL einfügen, Domain eintragen, online.

Der Installer richtet Docker Engine, Docker Compose, Caddy, PostgreSQL, das Panel und den Deployment-Agenten automatisch ein.

## Installation

Unter Ubuntu 24.04 oder Debian 12:

~~~bash
curl -fsSL https://raw.githubusercontent.com/wiedemjo2002/VPSPanel/main/install.sh | sudo bash
~~~

Deutsch ist die Standardsprache. Für eine englische Installation genügt ein zusätzlicher Parameter:

~~~bash
curl -fsSL https://raw.githubusercontent.com/wiedemjo2002/VPSPanel/main/install.sh | sudo bash -s -- --language en
~~~

Die Installationssprache wird zugleich zum Standard des Dashboards. Der DE/EN-Schalter oben rechts speichert die persönliche Auswahl nur lokal im jeweiligen Browser.

Wenn panel.example.com bereits auf den Server zeigt:

~~~bash
curl -fsSL https://raw.githubusercontent.com/wiedemjo2002/VPSPanel/main/install.sh | sudo bash -s -- --domain panel.example.com
~~~

Der Installer ist idempotent, installiert Docker aus dem offiziellen Docker-Repository, erzeugt starke lokale Secrets und ein lokales Admin-Passwort, öffnet bei aktiver UFW-/firewalld-Firewall die benötigten Ports, startet den Compose-Stack und wartet auf alle Healthchecks. Die Installation liegt standardmäßig unter /opt/vpspanel.

## Optionale GitHub-Verbindung

Öffentliche GitHub-Repositories lassen sich ohne OAuth direkt über ihre URL deployen. Eine GitHub OAuth App ist nur für private Repositories, die komfortable Repository-Auswahl und automatische Push-Webhooks erforderlich.

1. In GitHub unter **Settings → Developer settings → OAuth Apps** eine OAuth App anlegen.
2. Als Homepage die Panel-URL und als Callback `PANEL-URL/api/auth/github/callback` eintragen.
3. Zugangsdaten sicher hinterlegen:

~~~bash
sudo panelctl github setup
sudo panelctl github status
~~~

`panelctl` fragt Client-ID und Client-Secret interaktiv ab; das Secret erscheint nicht in der Shell-History.
## User-Flow

1. Mit dem beim Installieren angezeigten lokalen Admin-Passwort anmelden.
2. Die URL eines öffentlichen GitHub-Repositories einfügen, zum Beispiel `https://github.com/name/projekt`.
3. VPSPanel erkennt statische Sites, Node.js, Next.js und FastAPI sowie fehlende Umgebungsvariablen.
4. Domain eintragen und optional eine eigene PostgreSQL-Datenbank aktivieren.
5. Deployment starten; Download, Build, Container, Healthcheck, Caddy-Route und HTTPS laufen automatisch.
6. Logs ansehen, erneut deployen oder auf die letzte funktionierende Version zurückrollen.
7. Optional GitHub verbinden, um private Repositories auszuwählen und bei jedem Push automatisch neu zu deployen.

Öffentliche Repositories werden ohne GitHub-Zugangsdaten geladen. Dadurch bleibt der schnellste Weg ohne OAuth-Einrichtung nutzbar; automatische Push-Webhooks sind in diesem Modus bewusst deaktiviert.
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
sudo panelctl language de
sudo panelctl language en
sudo panelctl github setup
sudo panelctl uninstall
~~~

Mit VPSPANEL_HOME kann ein abweichendes Installationsverzeichnis verwendet werden.

`panelctl backup` sichert neben Konfiguration und Panel-Datenbank automatisch alle laufenden Projekt-PostgreSQL-Datenbanken, die Caddy-Routen und SHA-256-Prüfsummen. Die Sicherungsdateien sind nur für `root` lesbar.

## Architektur

Das Dashboard trägt ein dezentes „von Johannes Wiedemann“-Branding und bleibt vollständig self-hosted; die Sprachwahl benötigt keinen externen Dienst.

- apps/panel: Weboberfläche, GitHub OAuth, Projekt- und Deployment-API
- apps/agent: allow-listed Deploy-, Log- und Rollback-Aktionen
- docker/Caddyfile: öffentlicher Reverse Proxy und automatische Zertifikate
- database: interne Panel-Metadatenbank ohne veröffentlichten Host-Port
- scripts/panelctl: kleines Werkzeug für den täglichen Betrieb

Projektcontainer hängen nur am Edge-Netzwerk. Optionale Projekt-Datenbanken erhalten ein eigenes internes Docker-Netzwerk und keinen Host-Port. Der Caddy-Admin-Endpunkt ist nur im Caddy-Container erreichbar.

Der Deployment-Agent benötigt den Docker-Socket und ist deshalb ein sicherheitskritischer Bestandteil. Seine HTTP-API ist nicht öffentlich erreichbar, verlangt ein zufälliges Agent-Token und akzeptiert ausschließlich validierte, fest definierte Aktionen; sie stellt keine freie Shell bereit.

Sichere Voreinstellungen sind ohne zusätzliche Einrichtung aktiv: Secrets liegen nur in einer auf den Administrator beschränkten `.env`, Panel und Agent verwenden schreibgeschützte Dateisysteme sowie minimale Linux-Rechte, Anfragen sind in Größe und Dauer begrenzt und das Dashboard liefert restriktive Browser-Sicherheitsheader. Gestartete Projekt-Container erhalten zusätzlich Prozesslimits und dürfen keine neuen Rechte erlangen. Diese Schutzmaßnahmen verändern weder den Ein-Befehl-Installer noch den normalen Ablauf im Dashboard.

## Entwicklung und Tests

~~~bash
cp .env.example .env
# Alle change-me-Werte ersetzen
docker compose up --build
~~~

Öffne danach http://localhost:8080.

Relevante Prüfungen:

~~~bash
cd apps/panel && npm test && npm run check
cd ../agent && npm test && npm run check
sudo bash scripts/test-feature-stack.sh
sudo bash scripts/test-github-flow.sh
sudo bash scripts/test-agent-action.sh
sudo bash scripts/test-agent-database.sh
sudo bash scripts/test-webhook-flow.sh
sudo bash scripts/test-nextjs-prisma-e2e.sh
~~~

Der Linux-Smoke-Test scripts/test-clean-install.sh prüft zusätzlich den veröffentlichten Ein-Befehl-Installer in einer sauberen Umgebung.

Der Next.js-E2E-Test verwendet die öffentlichen Branches `e2e-nextjs-prisma-v1` und `e2e-nextjs-prisma-v2` im Repository `wiedemjo2002/VPSPanel-TestApp`. Er prüft automatische Erkennung, zufällige Datenbankzugangsdaten, Prisma-Migration, HTTPS, Logs, erneutes Deployment, Isolation und Rollback.

## Bewusste MVP-Grenzen

Nicht enthalten sind Mailhosting, DNS-Verwaltung, beliebige Compose-Stacks, Kubernetes, FTP, ein Dateimanager oder ein uneingeschränkter KI-/Root-Shell-Zugang.

## Recht, Haftung und Betrieb in Deutschland

VPSPanel ist Open-Source-Software unter der MIT-Lizenz und wird ohne zusätzliche Garantie bereitgestellt. Gesetzlich zwingende Haftung bleibt unberührt. Weil eine selbst gehostete Instanz technisch und rechtlich vom jeweiligen Betreiber verantwortet wird, enthält das Repository zwei verständliche Leitfäden:

- [Rechtliche Hinweise und Haftung](docs/RECHTLICHE-HINWEISE-DE.md)
- [Betreiber-Checkliste für Deutschland](docs/BETREIBER-CHECKLISTE-DE.md)

Die Checkliste behandelt insbesondere Impressum, Datenschutzinformationen, technisch notwendige Cookies, Verträge, Backups und den hochprivilegierten Docker-Socket. Sie ist eine Orientierung und ersetzt keine Prüfung des konkreten öffentlichen oder gewerblichen Angebots.

## Lizenz

MIT, siehe [LICENSE](LICENSE).
