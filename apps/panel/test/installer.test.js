import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const installer = await readFile(new URL("../../../install.sh", import.meta.url), "utf8");
const compose = await readFile(new URL("../../../docker-compose.yml", import.meta.url), "utf8");
const panel = await readFile(new URL("../main.js", import.meta.url), "utf8");
const database = await readFile(new URL("../lib/database.js", import.meta.url), "utf8");

test("creates and exposes a local admin password", () => {
  assert.match(installer, /PANEL_ADMIN_PASSWORD=\$ADMIN_PASSWORD/);
  assert.match(installer, /openssl rand -hex 12/);
  assert.match(compose, /PANEL_ADMIN_PASSWORD: \$\{PANEL_ADMIN_PASSWORD:-\}/);
  assert.match(installer, /local ports=\(80 443 8080\)/);
  assert.match(panel, /url\.pathname === "\/api\/auth\/local"/);
});

test("disables push webhooks when no GitHub token exists", () => {
  assert.match(panel, /const autoDeploy = Boolean\(githubToken\)/);
});
test("persists the HTTPS panel address", () => {
  assert.match(database, /CREATE TABLE IF NOT EXISTS settings/);
  assert.match(panel, /setSetting\("panel_public_url"/);
  assert.match(panel, /"\/actions\/panel-domain"/);
  assert.match(panel, /linkingUser\?\.is_admin/);
});
