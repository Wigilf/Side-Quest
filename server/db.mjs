// ---------------------------------------------------------------------------
// Postgres access — lazy pool + migrations. DB features activate only when
// DATABASE_URL is set, so the server (AI + checkout) still runs without it.
// `pg` is imported dynamically so a local run without the dep still boots.
// ---------------------------------------------------------------------------

let pool = null;

export function dbEnabled() {
  return !!process.env.DATABASE_URL;
}

// Decide SSL from the connection string so any managed provider works
// (Neon/Supabase/Render external all require SSL; localhost and Render's
// internal dotless host do not). Honor an explicit ?sslmode= when present.
function sslConfig(url) {
  try {
    const u = new URL(url);
    const mode = u.searchParams.get("sslmode");
    if (mode === "disable") return false;
    if (mode) return { rejectUnauthorized: false }; // require/prefer/verify-*
    const host = u.hostname;
    if (host === "localhost" || host === "127.0.0.1" || !host.includes(".")) return false;
    return { rejectUnauthorized: false }; // any remote managed host
  } catch {
    return false;
  }
}

export async function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const { default: pg } = await import("pg");
  const ssl = sslConfig(process.env.DATABASE_URL);
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl, max: 5 });
  return pool;
}

export async function query(text, params) {
  const p = await getPool();
  return p.query(text, params);
}

export async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      email text UNIQUE NOT NULL,
      password_hash text NOT NULL,
      display_name text,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token text PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz DEFAULT now(),
      expires_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS decks (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name text,
      theme text,
      event_type text,
      card_count int DEFAULT 0,
      payload jsonb NOT NULL,
      updated_at timestamptz DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS decks_user_idx ON decks(user_id);
    -- Server-side decks with share + async-collaboration support. The row id
    -- doubles as the public share id; collab_token grants edit access via link.
    CREATE TABLE IF NOT EXISTS sq_decks (
      id text PRIMARY KEY,
      owner_token text NOT NULL,
      user_id text REFERENCES users(id) ON DELETE SET NULL,
      collab_token text UNIQUE,
      collab_enabled boolean DEFAULT false,
      name text,
      theme text,
      event_type text,
      card_count int DEFAULT 0,
      payload jsonb NOT NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS sq_decks_owner_idx ON sq_decks(owner_token);
    CREATE INDEX IF NOT EXISTS sq_decks_collab_idx ON sq_decks(collab_token);
    CREATE TABLE IF NOT EXISTS orders (
      id text PRIMARY KEY,
      user_id text,
      stripe_session_id text UNIQUE,
      amount_cents int,
      currency text,
      email text,
      status text DEFAULT 'pending',
      ship_to jsonb,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `);
  // Additive prep for OAuth accounts (safe to run repeatedly).
  await query(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`).catch(() => {});
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub text`).catch(() => {});
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text`).catch(() => {});
}
