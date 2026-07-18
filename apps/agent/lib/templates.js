function installLine(manager) {
  if (manager === "pnpm") return "RUN corepack enable && pnpm install --frozen-lockfile";
  if (manager === "yarn") return "RUN corepack enable && yarn install --immutable";
  return "RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi";
}

export function projectDockerfile(input) {
  const install = installLine(input.config.packageManager);
  if (input.framework === "static") {
    return "FROM nginx:1.28.0-alpine\nCOPY . /usr/share/nginx/html\nEXPOSE 80\n";
  }
  if (input.framework === "static-build") {
    return `FROM node:22.17.0-alpine AS build
WORKDIR /app
COPY . .
${install}
RUN ${input.config.buildCommand || "npm run build"}
FROM nginx:1.28.0-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
`;
  }
  if (input.framework === "fastapi") {
    return `FROM python:3.13.5-alpine
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["sh","-c","uvicorn main:app --host 0.0.0.0 --port \${PORT:-8000}"]
`;
  }
  const start = input.config.startCommand || "npm run start";
  const build = input.config.buildCommand ? `RUN ${input.config.buildCommand}\n` : "";
  return `FROM node:22.17.0-alpine
WORKDIR /app
COPY . .
${install}
${build}ENV NODE_ENV=production
EXPOSE ${input.port}
CMD ["sh","-c","${start}"]
`;
}
