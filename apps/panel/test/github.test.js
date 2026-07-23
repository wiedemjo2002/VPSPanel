import test from "node:test";
import assert from "node:assert/strict";
import { createPushWebhook, inspectRepository, parseGitHubRepository } from "../lib/github.js";

function response(value, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return value; } };
}

function content(value) {
  return { content: Buffer.from(value).toString("base64") };
}

async function withRepository(files, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (!parsed.pathname.includes("/contents/")) return response({ default_branch: "main", private: false });
    const path = decodeURIComponent(parsed.pathname.split("/contents/")[1]);
    return path in files ? response(content(files[path])) : response({ message: "Not found" }, 404);
  };
  try { return await callback(); }
  finally { globalThis.fetch = originalFetch; }
}

test("detects Next.js with Prisma and asks only for non-automatic secrets", async () => {
  const result = await withRepository({
    "package.json": JSON.stringify({
      scripts: { build: "next build", start: "next start" },
      dependencies: { next: "16.0.0", "@prisma/client": "6.0.0" },
    }),
    "pnpm-lock.yaml": "lockfileVersion: 9",
    ".env.example": "DATABASE_URL=\nNEXT_PUBLIC_APP_URL=\nSTRIPE_SECRET_KEY=\n",
  }, () => inspectRepository({ owner: "owner", repo: "app", branch: "feature/login" }, "token"));

  assert.equal(result.framework, "nextjs");
  assert.equal(result.packageManager, "pnpm");
  assert.equal(result.port, 3000);
  assert.equal(result.migrationCommand, "npx prisma migrate deploy");
  assert.deepEqual(result.missingVariables, ["STRIPE_SECRET_KEY"]);
});

test("detects a standard Node application", async () => {
  const result = await withRepository({
    "package.json": JSON.stringify({ scripts: { start: "node server.js" }, dependencies: { express: "5.0.0" } }),
    "package-lock.json": "{}",
  }, () => inspectRepository({ owner: "owner", repo: "api", branch: "main" }, ""));
  assert.equal(result.framework, "nodejs");
  assert.equal(result.startCommand, "npm run start");
  assert.equal(result.port, 3000);
});

test("detects FastAPI from requirements", async () => {
  const result = await withRepository({ "requirements.txt": "fastapi==0.116.0\nuvicorn==0.35.0\n" }, () => inspectRepository({ owner: "owner", repo: "api", branch: "main" }, ""));
  assert.equal(result.framework, "fastapi");
  assert.equal(result.startCommand, "uvicorn main:app");
  assert.equal(result.port, 8000);
});

test("falls back to a plain static site", async () => {
  const result = await withRepository({}, () => inspectRepository({ owner: "owner", repo: "site", branch: "main" }, ""));
  assert.equal(result.framework, "static");
  assert.equal(result.port, 80);
});

test("creates a signed push webhook through GitHub", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.github.com/repos/owner/app/hooks");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer token");
    const payload = JSON.parse(options.body);
    assert.deepEqual(payload.events, ["push"]);
    assert.equal(payload.config.url, "https://panel.example.com/api/webhooks/github");
    assert.equal(payload.config.secret, "hook-secret");
    return response({ id: 42 });
  };
  try {
    const result = await createPushWebhook({ owner: "owner", repo: "app", callbackUrl: "https://panel.example.com/api/webhooks/github", secret: "hook-secret" }, "token");
    assert.equal(result.id, 42);
  } finally { globalThis.fetch = originalFetch; }
});
test("parses public GitHub repository URLs", () => {
  assert.deepEqual(parseGitHubRepository("https://github.com/openai/openai-node"), { owner: "openai", repo: "openai-node" });
  assert.deepEqual(parseGitHubRepository("https://github.com/openai/openai-node.git"), { owner: "openai", repo: "openai-node" });
  assert.deepEqual(parseGitHubRepository("openai/openai-node"), { owner: "openai", repo: "openai-node" });
  assert.equal(parseGitHubRepository("https://gitlab.com/openai/openai-node"), null);
  assert.equal(parseGitHubRepository("not-a-repository"), null);
});
