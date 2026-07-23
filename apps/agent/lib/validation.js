export function validDeploymentConfig(value, framework) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const packageManagers = new Set(["npm", "pnpm", "yarn"]);
  if (!packageManagers.has(value.packageManager)) return false;
  const buildCommand = `${value.packageManager} run build`;
  const startCommand = framework === "fastapi" ? "uvicorn main:app" : `${value.packageManager} run start`;
  return [undefined, null, buildCommand].includes(value.buildCommand) &&
    [undefined, null, startCommand].includes(value.startCommand) &&
    [undefined, null, "npx prisma migrate deploy"].includes(value.migrationCommand);
}