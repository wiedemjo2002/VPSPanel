import test from "node:test";
import assert from "node:assert/strict";
import { detectUploadedProject, validateArchiveEntries } from "../lib/uploads.js";

test("detects an uploaded Next.js project without Git", () => {
  const result = detectUploadedProject({
    name: "my-app", uploadId: "a".repeat(32), pnpmLock: true, yarnLock: false,
    packageText: JSON.stringify({ scripts: { build: "next build", start: "next start" }, dependencies: { next: "latest", "@prisma/client": "latest" } }),
    requirements: null, envText: "DATABASE_URL=\nAPI_KEY=\n",
  });
  assert.equal(result.framework, "nextjs");
  assert.equal(result.packageManager, "pnpm");
  assert.equal(result.migrationCommand, "npx prisma migrate deploy");
  assert.deepEqual(result.missingVariables, ["API_KEY"]);
  assert.equal(result.sourceType, "upload");
});

test("rejects unsafe ZIP entry paths", () => {
  assert.doesNotThrow(() => validateArchiveEntries(["project/package.json", "project/src/index.js"]));
  assert.throws(() => validateArchiveEntries(["../escape.txt"]), /unsafe path/);
  assert.throws(() => validateArchiveEntries(["C:\\escape.txt"]), /unsafe path/);
  assert.throws(() => validateArchiveEntries(["/absolute.txt"]), /unsafe path/);
});