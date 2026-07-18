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
  assert.match(html, /dashboard\.css\?v=0\.3\.0/);
  assert.match(html, /dashboard\.js\?v=0\.3\.0/);
});
