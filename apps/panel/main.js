import { createServer } from "node:http";
import { createHmac, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { pool, initializeDatabase, currentUser, getSetting, setSetting } from "./lib/database.js";
import { cookie, decrypt, encrypt, parseCookies, randomToken, safeEqual, setCookieSecurity, sign, tokenHash } from "./lib/security.js";
import { createPushWebhook, github, inspectRepository, parseGitHubRepository } from "./lib/github.js";

const port = Number(process.env.PORT || 3000);
const initialPublicUrl = process.env.PANEL_PUBLIC_URL || "http://localhost:8080";
let panelPublicUrl = initialPublicUrl;
const agentUrl = process.env.AGENT_URL || "http://agent:3100";
const agentToken = process.env.AGENT_TOKEN || "";
if (agentToken.length < 32 || agentToken === "change-me") throw new Error("AGENT_TOKEN must contain at least 32 characters");
const panelLanguage = ["de", "en"].includes(process.env.PANEL_LANGUAGE) ? process.env.PANEL_LANGUAGE : "de";
const adminPassword = process.env.PANEL_ADMIN_PASSWORD || "";
const loginAttempts = { count: 0, resetAt: 0 };
const publicDirectory = fileURLToPath(new URL("./public", import.meta.url));
const startedAt = new Date().toISOString();
const types = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
const securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; connect-src 'self'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
};

function json(response, status, payload, headers = {}) {
  response.writeHead(status, { ...securityHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  response.end(JSON.stringify(payload));
}

function redirect(response, location, headers = {}) {
  response.writeHead(302, { ...securityHeaders, Location: location, "Cache-Control": "no-store", ...headers });
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
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = request.headers.origin;
  if (!origin || origin === new URL(panelPublicUrl).origin) return true;
  const forwardedProtocol = String(request.headers["x-forwarded-proto"] || "http").split(",", 1)[0].trim();
  const host = request.headers.host;
  return ["http", "https"].includes(forwardedProtocol) && Boolean(host) && origin === `${forwardedProtocol}://${host}`;
}

async function agent(path, options = {}) {
  const response = await fetch(`${agentUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${agentToken}`, ...options.headers },
    signal: AbortSignal.timeout(30_000),
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
    const extension = extname(filePath);
    const cacheControl = [".html", ".js", ".css"].includes(extension) ? "no-cache" : "public, max-age=3600";
    response.writeHead(200, { ...securityHeaders, "Content-Type": types[extension] || "application/octet-stream", "Cache-Control": cacheControl });
    response.end(data);
  } catch {
    const data = await readFile(join(publicDirectory, "dashboard.html"));
    response.writeHead(200, { ...securityHeaders, "Content-Type": types[".html"], "Cache-Control": "no-cache" });
    response.end(data);
  }
}

async function authenticated(request) {
  const session = parseCookies(request).vpspanel_session;
  return currentUser(request, session);
}

async function createSession(userId, maxAge = 2_592_000) {
  const sessionToken = randomToken(32);
  await pool.query("DELETE FROM sessions WHERE expires_at<=NOW()");
  await pool.query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,NOW()+($3 * INTERVAL '1 second'))", [tokenHash(sessionToken), userId, maxAge]);
  return cookie("vpspanel_session", sessionToken, { maxAge });
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
  if (url.pathname === "/api/meta") return json(response, 200, { publicUrl: panelPublicUrl, localLoginConfigured: adminPassword.length >= 16, githubConfigured: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET), language: panelLanguage, version: "0.5.0" });
  if (url.pathname === "/api/webhooks/github" && request.method === "POST") return githubWebhook(request, response);
  if (url.pathname === "/api/e2e/session" && request.method === "GET" && process.env.E2E_SESSION_TOKEN) {
    if (!safeEqual(url.searchParams.get("token"), process.env.E2E_SESSION_TOKEN)) return json(response, 404, { error: "Not found" });
    const userResult = await pool.query(`INSERT INTO users (github_id,login,avatar_url,encrypted_token) VALUES (-1,'e2e-user',NULL,$1) ON CONFLICT (github_id) DO UPDATE SET encrypted_token=EXCLUDED.encrypted_token RETURNING id`, [encrypt("")]);
    const sessionToken = randomToken(32);
    await pool.query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,NOW()+INTERVAL '1 hour')", [tokenHash(sessionToken), userResult.rows[0].id]);
    return redirect(response, "/app", { "Set-Cookie": cookie("vpspanel_session", sessionToken, { maxAge: 3600 }) });
  }
  if (url.pathname === "/api/auth/local" && request.method === "POST") {
    if (adminPassword.length < 16) return json(response, 503, { error: "Lokale Anmeldung ist noch nicht eingerichtet." });
    const now = Date.now();
    if (loginAttempts.resetAt <= now) Object.assign(loginAttempts, { count: 0, resetAt: now + 15 * 60_000 });
    if (loginAttempts.count >= 10) return json(response, 429, { error: "Zu viele Anmeldeversuche. Bitte warte 15 Minuten." });
    const input = await body(request, 4096);
    if (typeof input.password !== "string" || !safeEqual(tokenHash(input.password), tokenHash(adminPassword))) {
      loginAttempts.count += 1;
      return json(response, 401, { error: "Admin-Passwort ist nicht korrekt." });
    }
    loginAttempts.count = 0;
    let userResult = await pool.query("SELECT id FROM users WHERE is_admin=TRUE LIMIT 1");
    if (!userResult.rowCount) userResult = await pool.query(`INSERT INTO users (github_id,login,avatar_url,encrypted_token,is_admin) VALUES (0,'admin',NULL,$1,TRUE) RETURNING id`, [encrypt("")]);
    return json(response, 200, { ok: true }, { "Set-Cookie": await createSession(userResult.rows[0].id) });
  }
  if (url.pathname === "/api/auth/github" && request.method === "GET") {
    const linkingUser = await authenticated(request);
    if (!linkingUser?.is_admin) return redirect(response, "/?error=admin_login_required");
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) return redirect(response, "/?error=github_not_configured");
    const state = randomToken();
    const target = new URL("https://github.com/login/oauth/authorize");
    target.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID);
    target.searchParams.set("redirect_uri", `${panelPublicUrl}/api/auth/github/callback`);
    target.searchParams.set("scope", "read:user repo admin:repo_hook");
    target.searchParams.set("state", state);
    return redirect(response, target.toString(), { "Set-Cookie": cookie("vpspanel_oauth", `${state}.${sign(state)}`, { maxAge: 600 }) });
  }

  if (url.pathname === "/api/auth/github/callback" && request.method === "GET") {
    const linkingUser = await authenticated(request);
    if (!linkingUser?.is_admin) return redirect(response, "/?error=admin_login_required");
    const stateCookie = parseCookies(request).vpspanel_oauth || "";
    const [storedState, signature] = stateCookie.split(".");
    if (!storedState || !safeEqual(signature, sign(storedState)) || storedState !== url.searchParams.get("state")) return redirect(response, "/?error=oauth_state");
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "VPSPanel/0.2" },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code: url.searchParams.get("code"), redirect_uri: `${panelPublicUrl}/api/auth/github/callback` }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) return redirect(response, "/?error=oauth_token");
    const profile = await github("/user", tokenData.access_token);
    const existing = await pool.query("SELECT id FROM users WHERE github_id=$1 AND id<>$2 LIMIT 1", [profile.id, linkingUser.id]);
    if (existing.rowCount) return redirect(response, "/app?error=github_account_in_use");
    await pool.query("UPDATE users SET github_id=$1,login=$2,avatar_url=$3,encrypted_token=$4 WHERE id=$5 AND is_admin=TRUE", [profile.id, profile.login, profile.avatar_url, encrypt(tokenData.access_token), linkingUser.id]);
    return redirect(response, "/app", { "Set-Cookie": cookie("vpspanel_oauth", "", { maxAge: 0 }) });
  }

  const user = await authenticated(request);
  if (!user?.is_admin) return json(response, 401, { error: "Bitte zuerst als Administrator am Panel anmelden." });
  const githubToken = decrypt(user.encrypted_token);

  if (url.pathname === "/api/settings" && request.method === "GET") {
    return json(response, 200, { publicUrl: panelPublicUrl, httpsEnabled: panelPublicUrl.startsWith("https://") });
  }
  if (url.pathname === "/api/settings/domain" && request.method === "POST") {
    const input = await body(request, 4096);
    const domain = String(input.domain || "").trim().toLowerCase();
    if (!validDomain(domain)) return json(response, 400, { error: "Bitte gib eine gültige Domain ein." });
    const conflict = await pool.query("SELECT 1 FROM projects WHERE lower(domain)=lower($1) LIMIT 1", [domain]);
    if (conflict.rowCount) return json(response, 409, { error: "Diese Domain wird bereits von einem Projekt verwendet." });
    const configured = await agent("/actions/panel-domain", { method: "POST", body: JSON.stringify({ domain }) });
    await setSetting("panel_public_url", configured.publicUrl);
    panelPublicUrl = configured.publicUrl;
    setCookieSecurity(true);
    return json(response, 200, { publicUrl: panelPublicUrl, httpsEnabled: true });
  }
  if (url.pathname === "/api/me" && request.method === "GET") return json(response, 200, { login: user.login, avatarUrl: user.avatar_url, githubConnected: Number(user.github_id) > 0 && Boolean(githubToken) });
  if (url.pathname === "/api/logout" && request.method === "POST") {
    const sessionToken = parseCookies(request).vpspanel_session;
    if (sessionToken) await pool.query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash(sessionToken)]);
    return json(response, 200, { ok: true }, { "Set-Cookie": cookie("vpspanel_session", "", { maxAge: 0 }) });
  }
  if (url.pathname === "/api/github/repos" && request.method === "GET") {
    if (!githubToken) return json(response, 409, { error: "GitHub ist für dieses Konto nicht verbunden." });
    const repos = await github("/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member", githubToken);
    return json(response, 200, repos.map((repo) => ({ owner: repo.owner.login, name: repo.name, fullName: repo.full_name, private: repo.private, defaultBranch: repo.default_branch, updatedAt: repo.updated_at })));
  }
  if (url.pathname === "/api/inspect" && request.method === "POST") {
    const input = await body(request);
    const parsed = input.repositoryUrl ? parseGitHubRepository(input.repositoryUrl) : { owner: input.owner, repo: input.repo };
    if (!parsed || !validRepoPart(parsed.owner) || !validRepoPart(parsed.repo) || (input.branch && !validBranch(input.branch))) return json(response, 400, { error: "Bitte gib eine gültige öffentliche GitHub-Repository-URL ein." });
    return json(response, 200, await inspectRepository({ ...parsed, branch: input.branch }, githubToken));
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
    const autoDeploy = Boolean(githubToken) && input.autoDeploy !== false;
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
        await createPushWebhook({ owner: input.owner, repo: input.repo, callbackUrl: `${panelPublicUrl}/api/webhooks/github`, secret: webhookSecret }, githubToken);
      } catch {
        webhookWarning = "Das erste Deployment l?uft, aber der GitHub-Push-Webhook konnte nicht eingerichtet werden. Pr?fe die Admin-Berechtigung f?r das Repository.";
        config.autoDeploy = false;
        config.webhookSecret = null;
        await pool.query("UPDATE projects SET config=$1 WHERE id=$2", [config, projectId]);
      }
    }
    return json(response, 202, { projectId, deploymentId, webhookWarning });
  }

  const match = url.pathname.match(/^\/api\/projects\/([a-f0-9]{16})(?:\/(status|logs|deploy|rollback))?$/);
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
    if (action === "deploy" && request.method === "POST") {
      if (["queued", "deploying"].includes(project.status)) return json(response, 409, { error: "Ein Deployment läuft bereits." });
      const deploymentId = await startDeployment(project, githubToken);
      return json(response, 202, { deploymentId });
    }

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
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 100;

await initializeDatabase();
panelPublicUrl = (await getSetting("panel_public_url")) || initialPublicUrl;
setCookieSecurity(panelPublicUrl.startsWith("https://"));
server.listen(port, "0.0.0.0", () => console.log(`VPSPanel listening on :${port}`));
