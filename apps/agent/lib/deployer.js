import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { command, containerExists } from "./runner.js";
import { projectDockerfile } from "./templates.js";

const dataRoot = process.env.PROJECTS_ROOT || "/data/projects";
const edgeNetwork = process.env.EDGE_NETWORK || "vpspanel_edge";
const caddyConfigPath = process.env.CADDY_CONFIG_PATH || "/caddy/Caddyfile";
const caddyRegistryPath = process.env.CADDY_REGISTRY_PATH || join(dirname(caddyConfigPath), "caddy-projects.json");
const panelAddressPath = process.env.PANEL_ADDRESS_PATH || join(dirname(caddyConfigPath), "panel-address");
const defaultPanelAddress = process.env.PANEL_SITE_ADDRESS || ":8080";
const caddyContainer = process.env.CADDY_CONTAINER || "vpspanel-caddy-1";

const appName = (id) => `vpspanel-app-${id}`;
const dbName = (id) => `vpspanel-db-${id}`;
const internalNetwork = (id) => `vpspanel-internal-${id}`;
const imageName = (projectId, deploymentId) => `vpspanel-project-${projectId}:${deploymentId}`;
const maxSourceBytes = 250 * 1024 * 1024;
const panelRoute = (address) => `${address} {
\tencode zstd gzip
\treverse_proxy panel:3000
\theader {
\t\tStrict-Transport-Security "max-age=31536000"
\t\tX-Content-Type-Options nosniff
\t\tX-Frame-Options DENY
\t\tReferrer-Policy strict-origin-when-cross-origin
\t\tPermissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
\t\t-Server
\t}
}`;

async function limitedResponseBuffer(response, limit = maxSourceBytes) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > limit) throw new Error("Repository archive is too large");
  if (!response.body) throw new Error("Repository download returned no body");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new Error("Repository archive is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function renderCaddy(registry, panelAddress) {
  const routes = Object.values(registry).map((route) => `${route.domain} {\n\tencode zstd gzip\n\treverse_proxy ${route.target}:${route.port}\n\theader {\n\t\tStrict-Transport-Security "max-age=31536000"\n\t\tX-Content-Type-Options nosniff\n\t\tReferrer-Policy strict-origin-when-cross-origin\n\t\tPermissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()"\n\t\t-Server\n\t}\n}`).join("\n\n");
  return `{\n\tadmin localhost:2019\n}\n\n${panelRoute(panelAddress)}${routes ? `\n\n${routes}` : ""}\n`;
}

async function readPanelAddress() {
  try { return (await readFile(panelAddressPath, "utf8")).trim() || defaultPanelAddress; }
  catch { return defaultPanelAddress; }
}

async function writeCaddy(registry) {
  await writeFile(caddyConfigPath, renderCaddy(registry, await readPanelAddress()));
}

export async function initializeRuntime() {
  await mkdir(dirname(caddyConfigPath), { recursive: true });
  const registry = await readRegistry();
  await writeFile(caddyRegistryPath, JSON.stringify(registry, null, 2), { mode: 0o600 });
  await writeCaddy(registry);
  await command("docker", ["exec", caddyContainer, "caddy", "reload", "--config", "/runtime/Caddyfile", "--adapter", "caddyfile"]).catch(() => {});
}
export async function persist(job) {
  const directory = join(dataRoot, job.projectId, "jobs");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `${job.id}.json`), JSON.stringify(job, null, 2), { mode: 0o600 });
}

async function setStep(job, name, status, detail) {
  const existing = job.steps.find((item) => item.name === name);
  if (existing) Object.assign(existing, { status, ...(detail ? { detail } : {}) });
  else job.steps.push({ name, status, ...(detail ? { detail } : {}) });
  await persist(job);
}

async function downloadSource(input, sourceDirectory) {
  const archive = join(sourceDirectory, "source.tar.gz");
  const appDirectory = join(sourceDirectory, "app");
  await mkdir(appDirectory, { recursive: true });
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "VPSPanel-Agent/0.2",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (input.githubToken) headers.Authorization = `Bearer ${input.githubToken}`;
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/tarball/${encodeURIComponent(input.branch)}`, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`Repository download failed (${response.status})`);
  await writeFile(archive, await limitedResponseBuffer(response), { mode: 0o600 });
  await command("tar", ["-xzf", archive, "-C", appDirectory, "--strip-components=1"]);
  await rm(archive, { force: true });
  return { appDirectory, commitSha: response.headers.get("etag")?.replaceAll('"', "") || null };
}

async function writeEnvironment(projectDirectory, environment) {
  const lines = Object.entries(environment).map(([key, value]) => {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || typeof value !== "string" || /[\r\n]/.test(value)) throw new Error(`Invalid environment variable: ${key}`);
    return `${key}=${value}`;
  });
  await mkdir(projectDirectory, { recursive: true });
  const path = join(projectDirectory, "runtime.env");
  await writeFile(path, `${lines.join("\n")}\n`, { mode: 0o600 });
  return path;
}

async function ensureDatabase(input) {
  if (!input.database) return;
  const databaseUrl = new URL(input.environment.DATABASE_URL);
  const network = internalNetwork(input.projectId);
  try { await command("docker", ["network", "create", "--internal", network]); } catch {}
  if (!(await containerExists(dbName(input.projectId)))) {
    await command("docker", ["volume", "create", `${dbName(input.projectId)}-data`]);
    await command("docker", [
      "run", "-d", "--name", dbName(input.projectId), "--restart", "unless-stopped", "--pids-limit", "256",
      "--security-opt", "no-new-privileges:true", "--network", network,
      "-e", `POSTGRES_DB=${databaseUrl.pathname.slice(1)}`,
      "-e", `POSTGRES_USER=${decodeURIComponent(databaseUrl.username)}`,
      "-e", `POSTGRES_PASSWORD=${decodeURIComponent(databaseUrl.password)}`,
      "-v", `${dbName(input.projectId)}-data:/var/lib/postgresql/data`, "postgres:17.5-alpine",
    ]);
  } else {
    try { await command("docker", ["start", dbName(input.projectId)]); } catch {}
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await command("docker", ["exec", dbName(input.projectId), "pg_isready", "-U", decodeURIComponent(databaseUrl.username), "-d", databaseUrl.pathname.slice(1)]);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("Database did not become healthy");
}

async function replaceApp(input, imageTag, envFile) {
  const name = appName(input.projectId);
  const previous = `${name}-previous-${Date.now()}`;
  const hadPrevious = await containerExists(name);
  if (hadPrevious) {
    await command("docker", ["stop", name]);
    await command("docker", ["rename", name, previous]);
  }
  try {
    await command("docker", ["run", "-d", "--name", name, "--restart", "unless-stopped", "--init", "--pids-limit", "512", "--security-opt", "no-new-privileges:true", "--network", edgeNetwork, "--env-file", envFile, imageTag]);
    if (input.database) await command("docker", ["network", "connect", internalNetwork(input.projectId), name]);
    if (input.config?.migrationCommand === "npx prisma migrate deploy") await command("docker", ["exec", name, "npx", "prisma", "migrate", "deploy"]);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const response = await fetch(`http://${name}:${input.port}/`, { redirect: "manual" });
        if (response.status < 500) break;
      } catch {}
      if (attempt === 39) throw new Error("Application health check failed");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (hadPrevious) await command("docker", ["rm", "-f", previous]);
  } catch (error) {
    if (await containerExists(name)) await command("docker", ["rm", "-f", name]).catch(() => {});
    if (hadPrevious && await containerExists(previous)) {
      await command("docker", ["rename", previous, name]);
      await command("docker", ["start", name]);
    }
    throw error;
  }
}

async function readRegistry() {
  for (const path of [caddyRegistryPath, join(dataRoot, "caddy-projects.json")]) {
    try {
      const registry = JSON.parse(await readFile(path, "utf8"));
      if (registry && typeof registry === "object" && !Array.isArray(registry)) return registry;
    } catch {}
  }
  return {};
}

async function configureCaddy(input) {
  const registry = await readRegistry();
  registry[input.projectId] = { domain: input.domain, target: appName(input.projectId), port: input.port };
  await writeFile(caddyRegistryPath, JSON.stringify(registry, null, 2), { mode: 0o600 });
  await writeCaddy(registry);
  await command("docker", ["exec", caddyContainer, "caddy", "reload", "--config", "/runtime/Caddyfile", "--adapter", "caddyfile"]);
}

export async function configurePanelDomain(domain) {
  await writeFile(panelAddressPath, `${domain}\n`, { mode: 0o600 });
  await writeCaddy(await readRegistry());
  await command("docker", ["exec", caddyContainer, "caddy", "reload", "--config", "/runtime/Caddyfile", "--adapter", "caddyfile"]);
  return { domain, publicUrl: `https://${domain}` };
}

export async function deploy(input, job) {
  const projectDirectory = join(dataRoot, input.projectId);
  const sourceDirectory = join(projectDirectory, "deployments", input.deploymentId);
  try {
    await setStep(job, "Repository wird geladen", "running");
    const source = await downloadSource(input, sourceDirectory);
    job.commitSha = source.commitSha;
    await setStep(job, "Repository wird geladen", "done");
    await setStep(job, "Datenbank wird erstellt", input.database ? "running" : "skipped");
    await ensureDatabase(input);
    if (input.database) await setStep(job, "Datenbank wird erstellt", "done");
    await setStep(job, "App wird gebaut", "running");
    const dockerfile = join(source.appDirectory, ".vpspanel.Dockerfile");
    await writeFile(dockerfile, projectDockerfile(input));
    const imageTag = imageName(input.projectId, input.deploymentId);
    await command("docker", ["build", "-f", dockerfile, "-t", imageTag, source.appDirectory]);
    job.imageTag = imageTag;
    await setStep(job, "App wird gebaut", "done");
    await setStep(job, "App wird gestartet", "running");
    const envFile = await writeEnvironment(projectDirectory, input.environment);
    await replaceApp(input, imageTag, envFile);
    await setStep(job, "App wird gestartet", "done");
    await setStep(job, "Domain und HTTPS werden verbunden", "running");
    await configureCaddy(input);
    await setStep(job, "Domain und HTTPS werden verbunden", "done");
    await setStep(job, "App wird geprüft", "done");
    job.status = "healthy";
  } catch (error) {
    job.status = "failed";
    job.error = error.message.slice(0, 1000);
    const running = job.steps.find((item) => item.status === "running");
    if (running) Object.assign(running, { status: "failed", detail: job.error });
  }
  await persist(job);
}

export async function rollback(input, job) {
  try {
    await setStep(job, "Vorherige Version wird gestartet", "running");
    const envFile = await writeEnvironment(join(dataRoot, input.projectId), input.environment);
    await replaceApp({ ...input, config: {} }, input.imageTag, envFile);
    await configureCaddy(input);
    job.imageTag = input.imageTag;
    job.status = "healthy";
    await setStep(job, "Vorherige Version wird gestartet", "done");
  } catch (error) {
    job.status = "failed";
    job.error = error.message.slice(0, 1000);
    await setStep(job, "Vorherige Version wird gestartet", "failed", job.error);
  }
  await persist(job);
}

export async function storedJob(projectId, deploymentId) {
  try { return JSON.parse(await readFile(join(dataRoot, projectId, "jobs", `${deploymentId}.json`), "utf8")); }
  catch { return null; }
}

export async function projectLogs(projectId) {
  try { return await command("docker", ["logs", "--tail", "250", appName(projectId)]); }
  catch (error) { return error.message; }
}

export { dataRoot, renderCaddy };
