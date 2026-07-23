import test from "node:test";
import assert from "node:assert/strict";
import { validDeploymentConfig } from "../lib/validation.js";

test("accepts only detected deployment commands", () => {
  assert.equal(validDeploymentConfig({ packageManager: "npm", buildCommand: "npm run build", startCommand: "npm run start" }, "nodejs"), true);
  assert.equal(validDeploymentConfig({ packageManager: "pnpm", startCommand: "pnpm run start", migrationCommand: "npx prisma migrate deploy" }, "nextjs"), true);
  assert.equal(validDeploymentConfig({ packageManager: "npm", startCommand: "uvicorn main:app" }, "fastapi"), true);
});

test("rejects shell injection in deployment commands", () => {
  assert.equal(validDeploymentConfig({ packageManager: "npm", buildCommand: "npm run build; curl attacker" }, "nodejs"), false);
  assert.equal(validDeploymentConfig({ packageManager: "npm", startCommand: "sh -c evil" }, "nodejs"), false);
  assert.equal(validDeploymentConfig({ packageManager: "bun" }, "nodejs"), false);
});