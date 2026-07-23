import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const dashboard = await readFile(new URL("../public/dashboard.js", import.meta.url), "utf8");
const html = await readFile(new URL("../public/dashboard.html", import.meta.url), "utf8");

test("keeps redeploy and rollback as separate top-level UI actions", () => {
  assert.match(dashboard, /async function redeployProject[\s\S]*?\n}\n\nasync function rollbackProject/);
  assert.match(dashboard, /actions\.append\(redeploy, logs, rollback\)/);
});

test("cache-busts dashboard assets for immediate updates", () => {
  assert.match(html, /dashboard\.css\?v=0\.6\.0/);
  assert.match(html, /dashboard\.js\?v=0\.6\.0/);
});
test("offers password login and public repository quick deploy", () => {
  assert.match(html, /id="adminLoginForm"/);
  assert.match(html, /id="repositoryUrlInput"/);
  assert.match(html, /id="projectZipInput"/);
  assert.match(dashboard, /"\/api\/uploads\/inspect"/);
  assert.match(dashboard, /selectedUploadId/);
  assert.match(html, /id="accountDialog"/);
  assert.match(dashboard, /"\/api\/settings\/domain"/);
  assert.match(dashboard, /repositoryUrl \? \{ repositoryUrl, branch \}/);
  assert.match(dashboard, /githubConnected = Boolean\(me\.githubConnected\)/);
});
