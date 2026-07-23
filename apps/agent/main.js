import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { readdir } from "node:fs/promises";
import { configurePanelDomain, deploy, rollback, persist, projectLogs, storedJob, initializeRuntime, dataRoot } from "./lib/deployer.js";
import { validDeploymentConfig } from "./lib/validation.js";

const port = Number(process.env.PORT || 3100);
const token = process.env.AGENT_TOKEN || "";
if (token.length < 32 || token === "change-me") throw new Error("AGENT_TOKEN must contain at least 32 characters");
const jobs = new Map();
const frameworks = new Set(["static", "static-build", "nodejs", "nextjs", "fastapi"]);

function json(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

async function body(request, limit = 256_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const validId = (value, length) => new RegExp(`^[a-f0-9]{${length}}$`).test(value || "");
const validDomain = (value) => /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value || "");
const validRepo = (value) => /^[A-Za-z0-9_.-]{1,100}$/.test(value || "");
const validBranch = (value) => /^(?!\/)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._\/-]{1,200}$/.test(value || "");

function authorized(header) {
  const expected = Buffer.from(`Bearer ${token}`);
  const supplied = Buffer.from(header || "");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

const validPort = (value) => Number.isInteger(value) && value >= 1 && value <= 65535;

function validEnvironment(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= 100 && entries.every(([key, item]) => /^[A-Z][A-Z0-9_]*$/.test(key) && typeof item === "string" && item.length <= 8192 && !/[\r\n]/.test(item));
}

function validDeploy(input) {
  return input && typeof input === "object" &&
    validId(input.projectId, 16) && validId(input.deploymentId, 20) &&
    validRepo(input.owner) && validRepo(input.repo) && validBranch(input.branch) &&
    validDomain(input.domain) && frameworks.has(input.framework) && validPort(input.port) &&
    typeof input.database === "boolean" && validEnvironment(input.environment) && validDeploymentConfig(input.config, input.framework) &&
    typeof input.githubToken === "string" && input.githubToken.length <= 512 && (input.githubToken.length === 0 || input.githubToken.length >= 20);
}

function validRollback(input) {
  if (!input || typeof input !== "object" || !validId(input.projectId, 16)) return false;
  const imagePattern = new RegExp(`^vpspanel-project-${input.projectId}:[a-f0-9]{20}$`);
  return validId(input.deploymentId, 20) &&
    validDomain(input.domain) && frameworks.has(input.framework) && validPort(input.port) && typeof input.database === "boolean" &&
    validEnvironment(input.environment) && imagePattern.test(input.imageTag || "");
}

async function findJob(deploymentId) {
  if (jobs.has(deploymentId)) return jobs.get(deploymentId);
  const directories = await readdir(dataRoot, { withFileTypes: true }).catch(() => []);
  for (const directory of directories.filter((entry) => entry.isDirectory())) {
    const job = await storedJob(directory.name, deploymentId);
    if (job) return job;
  }
  return null;
}

const server = createServer(async (request, response) => {
  try {
    if (!authorized(request.headers.authorization)) return json(response, 401, { error: "Unauthorized" });
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/health") return json(response, 200, { status: "ok", actions: ["deploy", "logs", "rollback", "panel-domain"] });

    if (url.pathname === "/actions/panel-domain" && request.method === "POST") {
      const input = await body(request, 4096);
      if (!validDomain(input.domain)) return json(response, 400, { error: "Invalid panel domain" });
      return json(response, 200, await configurePanelDomain(input.domain.toLowerCase()));
    }

    if (url.pathname === "/actions/deploy" && request.method === "POST") {
      const input = await body(request);
      if (!validDeploy(input)) return json(response, 400, { error: "Invalid deployment request" });
      if ([...jobs.values()].some((job) => job.projectId === input.projectId && job.status === "deploying")) return json(response, 409, { error: "A deployment is already running for this project" });
      const job = { id: input.deploymentId, projectId: input.projectId, status: "deploying", steps: [], createdAt: new Date().toISOString() };
      jobs.set(job.id, job);
      await persist(job);
      void deploy(input, job);
      return json(response, 202, { jobId: job.id });
    }

    if (url.pathname === "/actions/rollback" && request.method === "POST") {
      const input = await body(request);
      if (!validRollback(input)) return json(response, 400, { error: "Invalid rollback request" });
      const job = { id: input.deploymentId, projectId: input.projectId, status: "deploying", steps: [], createdAt: new Date().toISOString() };
      jobs.set(job.id, job);
      await persist(job);
      void rollback(input, job);
      return json(response, 202, { jobId: job.id });
    }

    const jobMatch = url.pathname.match(/^\/jobs\/([a-f0-9]{20})$/);
    if (jobMatch && request.method === "GET") {
      const job = await findJob(jobMatch[1]);
      return job ? json(response, 200, job) : json(response, 404, { error: "Job not found" });
    }

    if (url.pathname === "/actions/logs" && request.method === "GET") {
      const projectId = url.searchParams.get("projectId");
      if (!validId(projectId, 16)) return json(response, 400, { error: "Invalid project" });
      return json(response, 200, { logs: await projectLogs(projectId) });
    }

    return json(response, 404, { error: "Action not found" });
  } catch (error) {
    console.error(error);
    const tooLarge = error.message === "Request body too large";
    json(response, tooLarge ? 413 : 500, { error: tooLarge ? error.message : "Agent action failed" });
  }
});

await initializeRuntime();
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 100;
server.listen(port, "0.0.0.0", () => console.log(`VPSPanel agent listening on :${port}`));
