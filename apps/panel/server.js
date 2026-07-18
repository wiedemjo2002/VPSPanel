import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT || 3000);
const publicDirectory = fileURLToPath(new URL("./public", import.meta.url));
const startedAt = new Date().toISOString();

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

async function serveAsset(request, response) {
  const url = new URL(request.url, "http://localhost");
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDirectory, safePath);

  if (!filePath.startsWith(publicDirectory)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": requestedPath === "/index.html" ? "no-cache" : "public, max-age=3600",
    });
    response.end(body);
  } catch {
    const body = await readFile(join(publicDirectory, "index.html"));
    response.writeHead(200, { "Content-Type": contentTypes[".html"], "Cache-Control": "no-cache" });
    response.end(body);
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");

  if (url.pathname === "/api/health") {
    sendJson(response, 200, { status: "ok", service: "vpspanel", startedAt });
    return;
  }

  if (url.pathname === "/api/meta") {
    sendJson(response, 200, {
      publicUrl: process.env.PANEL_PUBLIC_URL || "http://localhost:8080",
      githubConfigured: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
      version: "0.1.0",
    });
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: "API route not found" });
    return;
  }

  await serveAsset(request, response);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`VPSPanel listening on :${port}`);
});
