import test from "node:test";
import assert from "node:assert/strict";
import { projectDockerfile } from "../lib/templates.js";
import { renderCaddy } from "../lib/deployer.js";
import { readFile } from "node:fs/promises";

const deployer = await readFile(new URL("../lib/deployer.js", import.meta.url), "utf8");

test("creates a pinned static runtime image", () => {
  const dockerfile = projectDockerfile({ framework: "static", config: {}, port: 80 });
  assert.match(dockerfile, /^FROM nginx:1\.28\.0-alpine/m);
  assert.match(dockerfile, /EXPOSE 80/);
});

test("creates a reproducible pnpm Next.js build", () => {
  const dockerfile = projectDockerfile({
    framework: "nextjs", port: 3000,
    config: { packageManager: "pnpm", buildCommand: "pnpm run build", startCommand: "pnpm run start" },
  });
  assert.match(dockerfile, /pnpm install --frozen-lockfile/);
  assert.match(dockerfile, /RUN pnpm run build/);
  assert.match(dockerfile, /EXPOSE 3000/);
});

test("creates a pinned FastAPI image", () => {
  const dockerfile = projectDockerfile({ framework: "fastapi", config: {}, port: 8000 });
  assert.match(dockerfile, /^FROM python:3\.13\.5-alpine/m);
  assert.match(dockerfile, /uvicorn main:app/);
});
test("renders a persisted HTTPS panel domain", () => {
  const config = renderCaddy({}, "panel.example.com");
  assert.match(config, /panel\.example\.com \{/);
  assert.match(config, /reverse_proxy panel:3000/);
});
test("limits project and database containers", () => {
  assert.match(deployer, /"--memory", "1g"/);
  assert.match(deployer, /"--memory", "768m"/);
  assert.match(deployer, /"--cpus", "1\.5"/);
  assert.match(deployer, /--no-same-owner/);
});