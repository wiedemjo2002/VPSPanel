export async function github(path, token, options = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "VPSPanel/0.2",
    "X-GitHub-Api-Version": "2022-11-28",
    ...options.headers,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`https://api.github.com${path}`, { ...options, headers });
  if (!response.ok) throw new Error(`GitHub request failed (${response.status})`);
  return response.json();
}

export function parseGitHubRepository(value) {
  const trimmed = String(value || "").trim();
  const match = trimmed.match(/^(?:https?:\/\/github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export async function createPushWebhook({ owner, repo, callbackUrl, secret }, token) {
  return github("/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/hooks", token, {
    method: "POST",
    body: JSON.stringify({
      name: "web",
      active: true,
      events: ["push"],
      config: { url: callbackUrl, content_type: "json", secret, insecure_ssl: "0" },
    }),
  });
}

async function file(owner, repo, path, branch, token) {
  try {
    const data = await github(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}?ref=${encodeURIComponent(branch)}`, token);
    return Buffer.from(data.content || "", "base64").toString("utf8");
  } catch { return null; }
}

function envNames(source) {
  if (!source) return [];
  return [...new Set(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line)).map((line) => line.split("=", 1)[0]))];
}

export async function inspectRepository({ owner, repo, branch }, token) {
  const repoData = await github(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, token);
  const resolvedBranch = branch || repoData.default_branch;
  const [packageText, requirements, envText, pnpmLock, yarnLock] = await Promise.all([
    file(owner, repo, "package.json", resolvedBranch, token), file(owner, repo, "requirements.txt", resolvedBranch, token),
    file(owner, repo, ".env.example", resolvedBranch, token), file(owner, repo, "pnpm-lock.yaml", resolvedBranch, token),
    file(owner, repo, "yarn.lock", resolvedBranch, token),
  ]);
  let framework = "static", buildCommand = null, startCommand = null, port = 80, migrationCommand = null;
  const packageManager = pnpmLock ? "pnpm" : yarnLock ? "yarn" : "npm";
  if (packageText) {
    const packageJson = JSON.parse(packageText);
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    if (dependencies.next) framework = "nextjs";
    else if (dependencies.express || dependencies["@nestjs/core"] || packageJson.scripts?.start) framework = "nodejs";
    else if (dependencies.vite || dependencies.astro || packageJson.scripts?.build) framework = "static-build";
    buildCommand = packageJson.scripts?.build ? `${packageManager} run build` : null;
    startCommand = framework === "nextjs" ? `${packageManager} run start` : packageJson.scripts?.start ? `${packageManager} run start` : null;
    port = ["nextjs", "nodejs"].includes(framework) ? 3000 : 80;
    if (dependencies.prisma || dependencies["@prisma/client"]) migrationCommand = "npx prisma migrate deploy";
  } else if (requirements && /fastapi/i.test(requirements)) {
    framework = "fastapi"; startCommand = "uvicorn main:app"; port = 8000;
  }
  const automatic = new Set(["DATABASE_URL", "NODE_ENV", "PORT", "NEXT_PUBLIC_APP_URL"]);
  return {
    owner, repo, branch: resolvedBranch, framework, packageManager, buildCommand, startCommand, port, migrationCommand,
    defaultBranch: repoData.default_branch, private: repoData.private,
    missingVariables: envNames(envText).filter((name) => !automatic.has(name)),
  };
}
