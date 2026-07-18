import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const publicUrl = process.env.PANEL_PUBLIC_URL || "http://localhost:8080";
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32 || sessionSecret === "change-me") throw new Error("SESSION_SECRET must contain at least 32 characters");
const key = createHash("sha256").update(sessionSecret).digest();

export function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decrypt(value) {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
}

export function randomToken(bytes = 24) { return randomBytes(bytes).toString("base64url"); }
export function tokenHash(token) { return createHash("sha256").update(token).digest("hex"); }
export function sign(value) { return createHmac("sha256", key).update(value).digest("base64url"); }
export function safeEqual(a, b) {
  const left = Buffer.from(a || "");
  const right = Buffer.from(b || "");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie || "").split(";").filter(Boolean).map((item) => {
    const index = item.indexOf("=");
    return [item.slice(0, index).trim(), decodeURIComponent(item.slice(index + 1))];
  }));
}

export function cookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", `SameSite=${options.sameSite || "Lax"}`];
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (publicUrl.startsWith("https://")) parts.push("Secure");
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join("; ");
}
