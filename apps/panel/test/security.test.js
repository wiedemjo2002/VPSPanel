import test from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET = "test-secret-".padEnd(64, "x");
process.env.PANEL_PUBLIC_URL = "https://panel.example.com";

const { cookie, decrypt, encrypt, parseCookies, safeEqual } = await import("../lib/security.js");

test("encrypts sensitive values with authenticated encryption", () => {
  const value = { token: "github-token", nested: [1, 2, 3] };
  const encrypted = encrypt(value);
  assert.notEqual(encrypted, JSON.stringify(value));
  assert.deepEqual(decrypt(encrypted), value);
});

test("compares signatures safely", () => {
  assert.equal(safeEqual("same", "same"), true);
  assert.equal(safeEqual("same", "different"), false);
});

test("ignores malformed cookies instead of failing the request", () => {
  const request = { headers: { cookie: "valid=hello%20world; broken; bad=%E0%A4%A" } };
  assert.deepEqual(parseCookies(request), { valid: "hello world" });
});

test("creates secure browser session cookies on HTTPS", () => {
  const value = cookie("session", "secret", { maxAge: 3600 });
  assert.match(value, /HttpOnly/);
  assert.match(value, /Secure/);
  assert.match(value, /SameSite=Lax/);
});
