import { createServer } from "node:http";
import { createHmac, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { pool, initializeDatabase, currentUser } from "./lib/database.js";
import { cookie, decrypt, encrypt, parseCookies, randomToken, safeEqual, sign, tokenHash } from "./lib/security.js";
import { createPushWebhook, github, inspectRepository } from "./lib/github.js";

const port = Number(process.env.PORT || 3000);
const publicUrl = process.env.PANEL_PUBLIC_URL || "http://localhost:8080";
const agentUrl = process.env.AGENT_URL || "http://agent:3100";
const agentToken = process.env.AGENT_TOKEN || "";
const publicDirectory = fileURLToPath(new URL("./public", import.meta.url));
const startedAt = new Date().toISOString();
const types = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };

function json(response, status, payload, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  response.end(JSON.stringify(payload));
}

function redirect(response, location, headers = {}) {
  response.writeHead(302, { Location: location, "Cache-Control": "no-store", ...headers });
  response.end();
}

async function rawBody(request, limit = 128_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function body(request, limit = 128_000) { return JSON.parse((await rawBody(request, limit)).toString("utf8") || "{}"); }

function validDomain(value) { return /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value || ""); }
function validRepoPart(value) { return /^[A-Za-z0-9_.-]{1,100}$/.test(value || ""); }
function validBranch(value) { return /^(?!\/)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._\/-]{1,200}$/.test(value || ""); }
function newId(bytes = 8) { return randomBytes(bytes).toString("hex"); }

function checkWriteOrigin(request) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return true;
  const origin = request.headers.origin;
  return !origin || origin === new URL(publicUrl).origin;
}

async function agent(path, options = {}) {
  const response = await fetch(`${agentUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${agentToken}`, ...options.headers },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Agent request failed (${response.status})`);
  return result;
}

async function asset(request, response) {
  const url = new URL(request.url, "http://localhost");
  const requested = url.pathname === "/" || url.pathname === "/app" ? "/dashboard.html" : url.pathname;
  const safe = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDirectory, safe);
  if (!filePath.startsWith(publicDirectory)) return json(response, 403, { error: "Forbidden" });
  try {
    const data = await readFile(filePath);
    response.writeHead(200, { "Content-Type": types[extname(filePath)] || "application/octet-stream", "Cache-Control": requested === "/dashboard.html" ? "no-cache" : "public, max-age=3600" });
    response.end(data);
  } catch {
    const data = await readFile(join(publicDirectory, "dashboard.html"));
    response.writeHead(200, { "Content-Type": types[".html"], "Cache-Control": "no-cache" });
    response.end(data);
  }
}

async function authenticated(request) {
  const session = parseCookies(request).vpspanel_session;
  return currentUser(request, session);
}

async function syncDeployment(project) {
  if (!project.current_deployment || !["queued", "deploying"].includes(project.status)) return null;
  try {
    const job = await agent(`/jobs/${project.current_deployment}`);
    if (["healthy", "failed"].includes(job.status)) {
      const panelStatus = job.status === "healthy" ? "online" : "failed";
      await pool.query("UPDATE projects SET status=$1,updated_at=NOW() WHERE id=$2", [panelStatus, project.id]);
      await pool.query("UPDATE deployments SET status=$1,image_tag=$2,commit_sha=$3,finished_at=NOW() WHERE id=$4", [job.status, job.imageTag || null, job.commitSha || null, project.current_deployment]);
    }
    return job;
  } catch { return null; }
}


async function startDeployment(project, githubToken, deploymentId = newId(10)) {
  const environment = decrypt(project.encrypted_env);
  await pool.query("INSERT INTO deployments (id,project_id,status) VALUES ($1,$2,'queued')", [deploymentId, project.id]);
  await pool.query("UPDATE projects SET current_deployment=$1,status='deploying',updated_at=NOW() WHERE id=$2", [deploymentId, project.id]);
  try {
    await agent("/actions/deploy", { method: "POST", body: JSON.stringify({
      projectId: project.id, deploymentId, owner: project.owner, repo: project.repo, branch: project.branch,
      domain: project.domain, framework: project.framework, port: project.port, environment,
      database: Boolean(project.config.database), config: project.config, githubToken,
    }) });
  } catch (error) {
    await pool.query("UPDATE projects SET status='failed',updated_at=NOW() WHERE id=$1", [project.id]);
    await pool.query("UPDATE deployments SET status='failed',finished_at=NOW() WHERE id=$1", [deploymentId]);
    throw error;
  }
  return deploymentId;
}

async function githubWebhook(request, response) {
  const raw = await rawBody(request, 1_000_000);
  let payload;
  try { payload = JSON.parse(raw.toString("utf8")); } catch { return json(response, 400, { error: "Invalid JSON" }); }
  const fullName = payload.repository?.full_name;
  if (!fullName || !payload.ref) return json(response, 202, { ignored: true });
  const [owner, repo] = fullName.split("/");
  const candidates = await pool.query(`SELECT p.*,u.encrypted_token FROM projects p JOIN users u ON u.id=p.user_id WHERE lower(p.owner)=lower($1) AND lower(p.repo)=lower($2) AND p.branch=$3`, [owner, repo, payload.ref.replace(/^refs\/heads\//, "")]);
  const signature = request.headers["x-hub-signature-256"] || "";
  const project = candidates.rows.find((candidate) => {
    if (!candidate.config.autoDeploy || !candidate.config.webhookSecret) return false;
    const expected = `sha256=${createHmac("sha256", decrypt(candidate.config.webhookSecret)).update(raw).digest("hex")}`;
    return safeEqual(signature, expected);
  });
  if (!project) return json(response, 401, { error: "Invalid webhook signature" });
  if (request.headers["x-github-event"] !== "push" || payload.deleted) return json(response, 202, { ignored: true });
  if (["queued", "deploying"].includes(project.status)) {
    const job = await syncDeployment(project);
    if (!["healthy", "failed"].includes(job?.status)) return json(response, 202, { ignored: true, reason: "deployment_in_progress" });
  }
  const deploymentId = await startDeployment(project, decrypt(project.encrypted_token));
  return json(response, 202, { deploymentId });
}
async function api(request, response, url) {
  if (!checkWriteOrigin(request)) return json(response, 403, { error: "Ungültiger Ursprung." });
  if (url.pathname === "/api/health") {
    await pool.query("SELECT 1");
    return json(response, 200, { status: "ok", service: "vpspanel", startedAt });
  }
  if (url.pathname === "/api/meta") return json(response, 200, { publicUrl, githubConfigured: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET), version: "0.2.0" });
  if (url.pathname === "/api/webhooks/github" && request.method === "POST") return githubWebhook(request, response);
  if (url.pathname === "/api/e2e/session" && request.method === "GET" && process.env.E2E_SESSION_TOKEN) {
    if (!safeEqual(url.searchParams.get("token"), process.env.E2E_SESSION_TOKEN)) return json(response, 404, { error: "Not found" });
    const userResult = await pool.query(`INSERT INTO users (github_id,login,avatar_url,encrypted_token) VALUES (-1,'e2e-user',NULL,$1) ON CONFLICT (github_id) DO UPDATE SET encrypted_token=EXCLUDED.encrypted_token RETURNING id`, [encrypt("")]);
    const sessionToken = randomToken(32);
    await pool.query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,NOW()+INTERVAL '1 hour')", [tokenHash(sessionToken), userResult.rows[0].id]);
    return redirect(response, "/app", { "Set-Cookie": cookie("vpspanel_session", sessionToken, { maxAge: 3600 }) });
  }
  if (url.pathname === "/api/auth/github" && request.method === "GET") {
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) return redirect(response, "/?error=github_not_configured");
    const state = randomToken();
    const target = new URL("https://github.com/login/oauth/authorize");
    target.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID);
    target.searchParams.set("redirect_uri", `${publicUrl}/api/auth/github/callback`);
    target.searchParams.set("scope", "read:user repo admin:repo_hook");
    target.searchParams.set("state", state);
    return redirect(response, target.toString(), { "Set-Cookie": cookie("vpspanel_oauth", `${state}.${sign(state)}`, { maxAge: 600 }) });
  }

  if (url.pathname === "/api/auth/github/callback" && request.method === "GET") {
    const stateCookie = parseCookies(request).vpspanel_oauth || "";
    const [storedState, signature] = stateCookie.split(".");
    if (!storedState || !safeEqual(signature, sign(storedState)) || storedState !== url.searchParams.get("state")) return redirect(response, "/?error=oauth_state");
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "VPSPanel/0.2" },
      body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code: url.searchParams.get("code"), redirect_uri: `${publicUrl}/api/auth/github/callback` }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) return redirect(response, "/?error=oauth_token");
    const profile = await github("/user", tokenData.access_token);
    const userResult = await pool.query(`INSERT INTO users (github_id,login,avatar_url,encrypted_token) VALUES ($1,$2,$3,$4) ON CONFLICT (github_id) DO UPDATE SET login=EXCLUDED.login,avatar_url=EXCLUDED.avatar_url,encrypted_token=EXCLUDED.encrypted_token RETURNING id`, [profile.id, profile.login, profile.avatar_url, encrypt(tokenData.access_token)]);
    const sessionToken = randomToken(32);
    await pool.query("DELETE FROM sessions WHERE expires_at<=NOW()");
    await pool.query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,NOW()+INTERVAL '30 days')", [tokenHash(sessionToken), userResult.rows[0].id]);
    return redirect(response, "/app", { "Set-Cookie": [cookie("vpspanel_session", sessionToken, { maxAge: 2_592_000 }), cookie("vpspanel_oauth", "", { maxAge: 0 })] });
  }

  const user = await authenticated(request);
  if (!user) return json(response, 401, { error: "Bitte zuerst mit GitHub anmelden." });
  const githubToken = decrypt(user.encrypted_token);

  if (url.pathname === "/api/me" && request.method === "GET") return json(response, 200, { login: user.login, avatarUrl: user.avatar_url });
  if (url.pathname === "/api/logout" && request.method === "POST") {
    const sessionToken = parseCookies(request).vpspanel_session;
    if (sessionToken) await pool.query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash(sessionToken)]);
    return json(response, 200, { ok: true }, { "Set-Cookie": cookie("vpspanel_session", "", { maxAge: 0 }) });
  }
  if (url.pathname === "/api/github/repos" && request.method === "GET") {
    const repos = await github("/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member", githubToken);
    return json(response, 200, repos.map((repo) => ({ owner: repo.owner.login, name: repo.name, fullName: repo.full_name, private: repo.private, defaultBranch: repo.default_branch, updatedAt: repo.updated_at })));
  }
  if (url.pathname === "/api/inspect" && request.method === "POST") {
    const input = await body(request);
    if (!validRepoPart(input.owner) || !validRepoPart(input.repo) || !validBranch(input.branch)) return json(response, 400, { error: "Ungültiges Repository." });
    return json(response, 200, await inspectRepository(input, githubToken));
  }
  if (url.pathname === "/api/projects" && request.method === "GET") {
    const result = await pool.query("SELECT id,name,domain,framework,status,current_deployment,created_at,updated_at FROM projects WHERE user_id=$1 ORDER BY created_at DESC", [user.id]);
    await Promise.all(result.rows.map(syncDeployment));
    const refreshed = await pool.query("SELECT id,name,domain,framework,status,current_deployment,created_at,updated_at FROM projects WHERE user_id=$1 ORDER BY created_at DESC", [user.id]);
    return json(response, 200, refreshed.rows);
  }
  if (url.pathname === "/api/projects" && request.method === "POST") {
    const input = await body(request);
    if (!validRepoPart(input.owner) || !validRepoPart(input.repo) || !validBranch(input.branch) || !validDomain(input.domain)) return json(response, 400, { error: "Repository oder Domain ist ungültig." });
    const inspection = await inspectRepository(input, githubToken);
    const supplied = input.environment && typeof input.environment === "object" ? input.environment : {};
    for (const [key, value] of Object.entries(supplied)) if (!/^[A-Z][A-Z0-9_]*$/.test(key) || typeof value !== "string" || value.length > 8192 || /[\r\n]/.test(value)) return json(response, 400, { error: `Ungültige Variable: ${key}` });
    const missing = inspection.missingVariables.filter((name) => !supplied[name]);
    if (missing.length) return json(response, 400, { error: `Noch fehlend: ${missing.join(", ")}`, missingVariables: missing });
    const projectId = newId();
    const deploymentId = newId(10);
    const database = Boolean(input.database);
    const environment = { ...supplied, NODE_ENV: "production", PORT: String(inspection.port), NEXT_PUBLIC_APP_URL: `https://${input.domain}` };
    if (database) {
      const password = newId(24);
      environment.DATABASE_URL = `postgresql://app:${password}@vpspanel-db-${projectId}:5432/app`;
    }
    const autoDeploy = input.autoDeploy !== false;
    const webhookSecret = autoDeploy ? randomToken(32) : null;
    const config = { database, buildCommand: inspection.buildCommand, startCommand: inspection.startCommand, migrationCommand: inspection.migrationCommand, packageManager: inspection.packageManager, autoDeploy, webhookSecret: webhookSecret ? encrypt(webhookSecret) : null };
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO projects (id,user_id,owner,repo,branch,name,domain,framework,port,status,config,encrypted_env,current_deployment) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'queued',$10,$11,$12)`, [projectId, user.id, input.owner, input.repo, input.branch, input.repo, input.domain.toLowerCase(), inspection.framework, inspection.port, config, encrypt(environment), deploymentId]);
      await client.query("INSERT INTO deployments (id,project_id,status) VALUES ($1,$2,'queued')", [deploymentId, projectId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505") return json(response, 409, { error: "Diese Domain wird bereits verwendet." });
      throw error;
    } finally { client.release(); }
    try {
      await agent("/actions/deploy", { method: "POST", body: JSON.stringify({ projectId, deploymentId, owner: input.owner, repo: input.repo, branch: input.branch, domain: input.domain.toLowerCase(), framework: inspection.framework, port: inspection.port, environment, database, config, githubToken }) });
      await pool.query("UPDATE projects SET status='deploying',updated_at=NOW() WHERE id=$1", [projectId]);
      await pool.query("UPDATE deployments SET status='deploying' WHERE id=$1", [deploymentId]);
    } catch (error) {
      await pool.query("UPDATE projects SET status='failed',updated_at=NOW() WHERE id=$1", [projectId]);
      await pool.query("UPDATE deployments SET status='failed',finished_at=NOW() WHERE id=$1", [deploymentId]);
      throw error;
    }
    let webhookWarning = null;
    if (autoDeploy) {
      try {
        await createPushWebhook({ owner: input.owner, repo: input.repo, callbackUrl: `${publicUrl}/api/webhooks/github`, secret: webhookSecret }, githubToken);
      } catch {
        webhookWarning = "Das erste Deployment l?uft, aber der GitHub-Push-Webhook konnte nicht eingerichtet werden. Pr?fe die Admin-Berechtigung f?r das Repository.";
        config.autoDeploy = false;
        config.webhookSecret = null;
        await pool.query("UPDATE projects SET config=$1 WHERE id=$2", [config, projectId]);
      }
    }
    return json(response, 202, { projectId, deploymentId, webhookWarning });
  }

  const match = url.pathname.match(/^\/api\/projects\/([a-f0-9]{16})(?:\/(status|logs|rollback))?$/);
  if (match) {
    const result = await pool.query("SELECT * FROM projects WHERE id=$1 AND user_id=$2", [match[1], user.id]);
    const project = result.rows[0];
    if (!project) return json(response, 404, { error: "Projekt nicht gefunden." });
    const action = match[2];
    if ((!action || action === "status") && request.method === "GET") {
      const job = await syncDeployment(project);
      return json(response, 200, { id: project.id, name: project.name, domain: project.domain, framework: project.framework, status: job?.status === "healthy" ? "online" : job?.status || project.status, deploymentId: project.current_deployment, steps: job?.steps || [] });
    }
    if (action === "logs" && request.method === "GET") return json(response, 200, await agent(`/actions/logs?projectId=${project.id}`));
    if (action === "rollback" && request.method === "POST") {
      const deployments = await pool.query("SELECT id,image_tag FROM deployments WHERE project_id=$1 AND status='healthy' AND image_tag IS NOT NULL ORDER BY created_at DESC LIMIT 5", [project.id]);
      const target = deployments.rows.find((deployment) => deployment.id !== project.current_deployment);
      if (!target) return json(response, 409, { error: "Keine vorherige funktionierende Version vorhanden." });
      const deploymentId = newId(10);
      await pool.query("INSERT INTO deployments (id,project_id,status,image_tag) VALUES ($1,$2,'deploying',$3)", [deploymentId, project.id, target.image_tag]);
      await pool.query("UPDATE projects SET current_deployment=$1,status='deploying',updated_at=NOW() WHERE id=$2", [deploymentId, project.id]);
      await agent("/actions/rollback", { method: "POST", body: JSON.stringify({ projectId: project.id, deploymentId, imageTag: target.image_tag, domain: project.domain, port: project.port, environment: decrypt(project.encrypted_env), database: project.config.database }) });
      return json(response, 202, { deploymentId });
    }
  }
  return json(response, 404, { error: "API route not found" });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) return await api(request, response, url);
    await asset(request, response);
  } catch (error) {
    console.error(error);
    json(response, 500, { error: error.message?.startsWith("GitHub request") ? "GitHub konnte nicht erreicht werden." : "Die Aktion konnte nicht abgeschlossen werden." });
  }
});

await initializeDatabase();
server.listen(port, "0.0.0.0", () => console.log(`VPSPanel listening on :${port}`));
