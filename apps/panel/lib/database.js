import pg from "pg";
import { tokenHash } from "./security.js";

const { Pool } = pg;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY, github_id BIGINT UNIQUE NOT NULL, login TEXT NOT NULL,
      avatar_url TEXT, encrypted_token TEXT NOT NULL, is_admin BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
    UPDATE users SET is_admin=TRUE WHERE github_id=0;
    CREATE UNIQUE INDEX IF NOT EXISTS users_single_admin ON users ((is_admin)) WHERE is_admin=TRUE;
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS login_attempts (
      identity_hash TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0,
      reset_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      owner TEXT NOT NULL, repo TEXT NOT NULL, branch TEXT NOT NULL, name TEXT NOT NULL,
      domain TEXT UNIQUE NOT NULL, framework TEXT NOT NULL, port INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued', config JSONB NOT NULL DEFAULT '{}'::jsonb,
      encrypted_env TEXT NOT NULL, current_deployment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      status TEXT NOT NULL, image_tag TEXT, commit_sha TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), finished_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS deployments_project_idx ON deployments(project_id, created_at DESC);
  `);
}

export async function currentUser(request, sessionToken) {
  if (!sessionToken) return null;
  const result = await pool.query(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()`, [tokenHash(sessionToken)]);
  return result.rows[0] || null;
}
export async function getSetting(key) {
  const result = await pool.query("SELECT value FROM settings WHERE key=$1", [key]);
  return result.rows[0]?.value || null;
}

export async function setSetting(key, value) {
  await pool.query("INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()", [key, value]);
}
export async function loginAttemptCount(identityHash) {
  await pool.query("DELETE FROM login_attempts WHERE reset_at<=NOW()");
  const result = await pool.query("SELECT attempts FROM login_attempts WHERE identity_hash=$1", [identityHash]);
  return Number(result.rows[0]?.attempts || 0);
}

export async function recordFailedLogin(identityHash) {
  await pool.query("INSERT INTO login_attempts (identity_hash,attempts,reset_at) VALUES ($1,1,NOW()+INTERVAL '15 minutes') ON CONFLICT (identity_hash) DO UPDATE SET attempts=login_attempts.attempts+1", [identityHash]);
}

export async function clearLoginAttempts(identityHash) {
  await pool.query("DELETE FROM login_attempts WHERE identity_hash=$1", [identityHash]);
}
