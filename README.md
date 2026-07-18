# VPSPanel

VPSPanel turns a fresh Linux VPS into a small self-hosted deployment platform. The product goal is deliberately simple:

> Choose a GitHub repository. Enter a domain. We handle the server work.

The first MVP focuses on one excellent happy path for web applications instead of becoming another general-purpose server control panel.

## Install

On Ubuntu 24.04 or Debian 12:

```bash
git clone https://github.com/wiedemjo2002/VPSPanel.git
cd VPSPanel
sudo ./install.sh
```

With a panel domain already pointing to the server:

```bash
sudo ./install.sh --domain panel.example.com
```

For a one-command installation from the public repository:

```bash
curl -fsSL https://raw.githubusercontent.com/wiedemjo2002/VPSPanel/main/install.sh | sudo bash
```

For a reviewable installation, download the script first:

```bash
curl -fsSL https://raw.githubusercontent.com/wiedemjo2002/VPSPanel/main/install.sh -o install.sh
less install.sh
sudo bash install.sh
```

The installer checks the operating system, installs Docker from its official apt repository, creates strong local secrets, starts the Compose stack, waits for health checks, and prints the browser URL.

## Daily operations

```bash
sudo panelctl status
sudo panelctl logs panel
sudo panelctl restart
sudo panelctl backup
sudo panelctl update
sudo panelctl doctor
sudo panelctl domain panel.example.com
sudo panelctl uninstall
```

The installation lives in `/opt/vpspanel`. Set `VPSPANEL_HOME` when using a different location.

## MVP boundary

The finished MVP should support:

- GitHub sign-in and repository selection
- automatic detection for static sites, Node.js, Next.js, and FastAPI
- domain and HTTPS through Caddy
- optional PostgreSQL per project
- only genuinely missing environment variables
- understandable deployment progress and errors
- health checks, logs, push deployments, and one-click rollback
- AI-assisted planning and diagnosis through defined actions, never an unrestricted root shell

Not in the first MVP: mail hosting, DNS administration, arbitrary Compose stacks, Kubernetes, multi-cloud orchestration, FTP, or a classic file manager.

## Architecture

- `apps/panel`: lightweight web entry point and API foundation
- `docker/Caddyfile`: the only public reverse proxy
- `database`: panel metadata on an internal-only network
- `install.sh`: idempotent host bootstrap
- `scripts/panelctl`: small operational CLI

User applications and the restricted deployment agent will be added as separate services. Docker, networks, ports, and Caddy configuration remain implementation details unless the user opens an expert view.

## Development

```bash
cp .env.example .env
# Replace both change-me values in .env
docker compose up --build
```

Open <http://localhost:8080>. Check the resolved configuration with `docker compose config`.

## Security principles

- pinned container versions rather than uncontrolled `latest` tags
- no telemetry by default
- secrets stay out of Git and are stored with restrictive permissions
- PostgreSQL is not published on the host
- project operations will be exposed as allow-listed actions
- backups precede updates
- public releases should provide signed tags and SHA256 checksums

## License

MIT. See [LICENSE](LICENSE).
