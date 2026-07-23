import { randomBytes } from "node:crypto";
import { access, cp, lstat, mkdir, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { command } from "./runner.js";

const uploadsRoot = process.env.UPLOADS_ROOT || join(process.env.PROJECTS_ROOT || "/data/projects", ".uploads");
const maxArchiveBytes = 100 * 1024 * 1024;
const maxExtractedBytes = 250 * 1024 * 1024;
const maxFiles = 5_000;
const validUploadId = (value) => /^[a-f0-9]{32}$/.test(value || "");

function projectName(filename) {
  const raw = basename(decodeURIComponent(filename || "project.zip")).replace(/\.zip$/i, "");
  return raw.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^[._-]+|[._-]+$/g, "").slice(0, 80) || "zip-project";
}

export function validateArchiveEntries(entries) {
  if (!entries.length || entries.length > maxFiles) throw new Error("ZIP project contains too many files");
  for (const entry of entries) {
    const normalized = entry.replaceAll("\\", "/");
    if (normalized.includes("\0") || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || normalized.split("/").includes("..")) throw new Error("ZIP archive contains an unsafe path");
  }
}

function envNames(source) {
  if (!source) return [];
  return [...new Set(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line)).map((line) => line.split("=", 1)[0]))];
}

async function fileExists(root, name) {
  try { await access(join(root, name)); return true; }
  catch { return false; }
}

async function optionalText(root, name, limit = 1_000_000) {
  try {
    const value = await readFile(join(root, name), "utf8");
    if (Buffer.byteLength(value) > limit) throw new Error(`${name} is too large`);
    return value;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export function detectUploadedProject({ packageText, requirements, envText, pnpmLock, yarnLock, name, uploadId }) {
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
    owner: "upload", repo: name, branch: "zip", sourceType: "upload", uploadId,
    framework, packageManager, buildCommand, startCommand, port, migrationCommand,
    defaultBranch: "zip", private: true, missingVariables: envNames(envText).filter((item) => !automatic.has(item)),
  };
}

async function scanExtracted(root) {
  let files = 0;
  let bytes = 0;
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const stat = await lstat(path);
      if (stat.isSymbolicLink()) throw new Error("ZIP archives containing symbolic links are not supported");
      if (stat.isDirectory()) await walk(path);
      else {
        files += 1;
        bytes += stat.size;
        if (files > maxFiles || bytes > maxExtractedBytes) throw new Error("ZIP project exceeds the extraction safety limits");
      }
    }
  }
  await walk(root);
}

async function projectRoot(extractRoot) {
  const entries = (await readdir(extractRoot, { withFileTypes: true })).filter((entry) => entry.name !== "__MACOSX" && entry.name !== ".DS_Store");
  return entries.length === 1 && entries[0].isDirectory() ? join(extractRoot, entries[0].name) : extractRoot;
}

export async function receiveUpload(request, encodedFilename) {
  const declared = Number(request.headers["content-length"] || 0);
  if (declared > maxArchiveBytes) throw new Error("Die ZIP-Datei darf maximal 100 MB groß sein.");
  const uploadId = randomBytes(16).toString("hex");
  const directory = join(uploadsRoot, uploadId);
  const archive = join(directory, "source.zip");
  const extractRoot = join(directory, "extracted");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  let size = 0;
  const file = await open(archive, "wx", 0o600);
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > maxArchiveBytes) throw new Error("Die ZIP-Datei darf maximal 100 MB groß sein.");
      await file.write(chunk);
    }
  } catch (error) {
    await file.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  await file.close();
  try {
    const signatureFile = await open(archive, "r");
    const signatureBuffer = Buffer.alloc(4);
    await signatureFile.read(signatureBuffer, 0, 4, 0);
    await signatureFile.close();
    const signature = signatureBuffer.toString("hex");
    if (!["504b0304", "504b0506", "504b0708"].includes(signature)) throw new Error("Die Datei ist kein gültiges ZIP-Archiv.");
    const names = await command("unzip", ["-Z1", archive], { maxOutputBytes: 2_000_000 });
    const entries = names.split("\n").filter(Boolean);
    validateArchiveEntries(entries);

    const listing = await command("unzip", ["-l", archive], { maxOutputBytes: 2_000_000 });
    const totals = listing.match(/(\d+)\s+(\d+)\s+files?\s*$/i);
    if (!totals || Number(totals[1]) > maxExtractedBytes || Number(totals[2]) > maxFiles) throw new Error("ZIP project exceeds the extraction safety limits");
    const attributes = await command("unzip", ["-Z", "-l", archive], { maxOutputBytes: 2_000_000 });
    if (/^l[^\n]*/m.test(attributes)) throw new Error("ZIP archives containing symbolic links are not supported");
    await mkdir(extractRoot, { recursive: true, mode: 0o700 });
    await command("unzip", ["-q", archive, "-d", extractRoot], { maxOutputBytes: 128_000 });
    await scanExtracted(extractRoot);
    const root = await projectRoot(extractRoot);
    const name = projectName(encodedFilename);
    const inspection = detectUploadedProject({
      packageText: await optionalText(root, "package.json"), requirements: await optionalText(root, "requirements.txt"),
      envText: await optionalText(root, ".env.example"), pnpmLock: await fileExists(root, "pnpm-lock.yaml"),
      yarnLock: await fileExists(root, "yarn.lock"), name, uploadId,
    });
    await writeFile(join(directory, "inspection.json"), JSON.stringify({ ...inspection, root: root.slice(extractRoot.length + 1) }), { mode: 0o600 });
    return inspection;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function uploadInspection(uploadId) {
  if (!validUploadId(uploadId)) return null;
  try {
    const stored = JSON.parse(await readFile(join(uploadsRoot, uploadId, "inspection.json"), "utf8"));
    const { root: _root, ...inspection } = stored;
    return inspection;
  } catch { return null; }
}

export async function copyUploadedSource(uploadId, destination) {
  if (!validUploadId(uploadId)) throw new Error("Invalid ZIP upload");
  const stored = JSON.parse(await readFile(join(uploadsRoot, uploadId, "inspection.json"), "utf8"));
  const source = join(uploadsRoot, uploadId, "extracted", stored.root || "");
  await cp(source, destination, { recursive: true, errorOnExist: true });
}
export async function removeUpload(uploadId) {
  if (validUploadId(uploadId)) await rm(join(uploadsRoot, uploadId), { recursive: true, force: true });
}

export async function cleanupExpiredUploads(maxAgeMs = 24 * 60 * 60 * 1000) {
  const entries = await readdir(uploadsRoot, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries.filter((entry) => entry.isDirectory() && validUploadId(entry.name)).map(async (entry) => {
    const info = await stat(join(uploadsRoot, entry.name)).catch(() => null);
    if (info && Date.now() - info.mtimeMs > maxAgeMs) await removeUpload(entry.name);
  }));
}