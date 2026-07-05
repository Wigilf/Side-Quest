// ---------------------------------------------------------------------------
// Postgres access — lazy pool + migrations. DB features activate only when
// DATABASE_URL is set, so the server (AI + checkout) still runs without it.
// `pg` is imported dynamically so a local run without the dep still boots.
// ---------------------------------------------------------------------------

let pool = null;

export function dbEnabled() {
  return !!process.env.DATABASE_URL;
}

export async function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const { default: pg } = await import("pg");
  // Render's external host needs SSL; the internal host does not.
  const ssl = process.env.DATABASE_URL.includes(".render.com") ? { rejectUnauthorized: false } : false;
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
}
