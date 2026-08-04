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

  await migrateMarketplace();
}

// ---------------------------------------------------------------------------
// MARKETPLACE
// ---------------------------------------------------------------------------
// Two kinds of creator sell here: `artist` (illustration, delivered as uploaded
// files) and `writer` (adventure lore, authored in the builder itself). Both
// sell two ways: `catalog` items, made once and sold many times, and
// `commission` work, made to order for one buyer.
//
// A single order can span both disciplines — hire a writer AND an artist for
// one deck — so lifecycle state lives on order_items, not orders. The order is
// only complete when every item is accepted, and each item pays its own
// creator. That one requirement is why this is item-shaped throughout.
//
// Money never sits on the order row. It lives in `ledger_entries` as immutable
// append-only rows, because "what is this creator owed" and "what did we
// actually pay" must be reconstructible after refunds, disputes and partial
// releases — a mutable balance column cannot survive that.
async function migrateMarketplace() {
  await query(`
    -- A user who sells. Applications are juried rather than open signup:
    -- targeting illustrators of Magic-artist calibre means curation, not
    -- rank-by-volume search.
    CREATE TABLE IF NOT EXISTS mk_creators (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      discipline text NOT NULL CHECK (discipline IN ('artist','writer')),
      display_name text NOT NULL,
      headline text,
      bio text,
      portfolio jsonb NOT NULL DEFAULT '[]'::jsonb,
      links jsonb NOT NULL DEFAULT '{}'::jsonb,
      status text NOT NULL DEFAULT 'applied'
        CHECK (status IN ('applied','approved','rejected','paused')),
      -- Stripe Connect account; null until the creator finishes onboarding.
      -- payouts_enabled mirrors Stripe's own flag: charges may be allowed
      -- before payouts are, and we must not promise money we cannot send.
      stripe_account_id text UNIQUE,
      payouts_enabled boolean NOT NULL DEFAULT false,
      rating_avg numeric(3,2),
      rating_count int NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      -- One profile per discipline per user: the same person may legitimately
      -- sell as both an artist and a writer, with separate ratings.
      UNIQUE (user_id, discipline)
    );
    CREATE INDEX IF NOT EXISTS mk_creator_user_idx ON mk_creators(user_id);
    CREATE INDEX IF NOT EXISTS mk_creator_browse_idx ON mk_creators(status, discipline);

    -- What a creator sells. kind='catalog' is a finished thing sold repeatedly
    -- (a pre-written adventure, an art pack); kind='commission' is an offer to
    -- do bespoke work. price_cents is what the buyer pays; the platform fee is
    -- computed at order time and recorded in the ledger, never here, so
    -- changing the fee cannot rewrite historical orders.
    CREATE TABLE IF NOT EXISTS mk_listings (
      id text PRIMARY KEY,
      creator_id text NOT NULL REFERENCES mk_creators(id) ON DELETE CASCADE,
      discipline text NOT NULL CHECK (discipline IN ('artist','writer')),
      kind text NOT NULL CHECK (kind IN ('catalog','commission')),
      title text NOT NULL,
      summary text,
      description text,
      price_cents int NOT NULL CHECK (price_cents >= 0),
      currency text NOT NULL DEFAULT 'usd',
      -- Commission terms. Null for catalog items.
      delivery_days int,
      revisions_included int NOT NULL DEFAULT 2,
      -- Catalog payload: the actual deliverable for instant purchases, or a
      -- pointer to it in object storage.
      payload jsonb,
      preview_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
      status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','published','paused','removed')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS listings_creator_idx ON mk_listings(creator_id);
    CREATE INDEX IF NOT EXISTS listings_browse_idx ON mk_listings(status, discipline, kind);

    -- The buyer-side container. Holds the money and the deck being worked on;
    -- holds no per-creator state, because it may span two creators.
    CREATE TABLE IF NOT EXISTS mk_orders (
      id text PRIMARY KEY,
      buyer_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      deck_id text,
      status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','awaiting_payment','active','completed','cancelled','refunded')),
      subtotal_cents int NOT NULL DEFAULT 0,
      platform_fee_cents int NOT NULL DEFAULT 0,
      total_cents int NOT NULL DEFAULT 0,
      currency text NOT NULL DEFAULT 'usd',
      stripe_payment_intent_id text UNIQUE,
      paid_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS orders_buyer_idx ON mk_orders(buyer_id, created_at DESC);

    -- One line per creator engaged. This is where the lifecycle actually runs:
    -- a writer can be delivered and accepted while the artist is still drawing.
    -- Funds for an item are released only when that item reaches 'accepted'.
    CREATE TABLE IF NOT EXISTS mk_order_items (
      id text PRIMARY KEY,
      order_id text NOT NULL REFERENCES mk_orders(id) ON DELETE CASCADE,
      listing_id text REFERENCES mk_listings(id) ON DELETE SET NULL,
      creator_id text NOT NULL REFERENCES mk_creators(id) ON DELETE RESTRICT,
      discipline text NOT NULL CHECK (discipline IN ('artist','writer')),
      kind text NOT NULL CHECK (kind IN ('catalog','commission')),
      -- Snapshot of price and terms at purchase time. Deliberately duplicated
      -- from mk_listings: a creator editing their listing must never retroactively
      -- change what a buyer already agreed to pay.
      title text NOT NULL,
      price_cents int NOT NULL CHECK (price_cents >= 0),
      creator_earnings_cents int NOT NULL DEFAULT 0,
      revisions_included int NOT NULL DEFAULT 2,
      revisions_used int NOT NULL DEFAULT 0,
      brief text,
      status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','accepted_by_creator','in_progress','delivered',
                          'revision_requested','accepted','declined','cancelled','disputed')),
      due_at timestamptz,
      delivered_at timestamptz,
      accepted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS order_items_order_idx ON mk_order_items(order_id);
    CREATE INDEX IF NOT EXISTS order_items_creator_idx ON mk_order_items(creator_id, status);

    -- Each delivery attempt, kept as history rather than overwritten, so a
    -- dispute can show what was sent and when. Artists deliver files (URLs into
    -- object storage); writers deliver structured lore authored in the builder.
    CREATE TABLE IF NOT EXISTS mk_deliverables (
      id text PRIMARY KEY,
      order_item_id text NOT NULL REFERENCES mk_order_items(id) ON DELETE CASCADE,
      version int NOT NULL DEFAULT 1,
      kind text NOT NULL CHECK (kind IN ('files','lore','deck')),
      files jsonb NOT NULL DEFAULT '[]'::jsonb,
      lore jsonb,
      note text,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (order_item_id, version)
    );
    CREATE INDEX IF NOT EXISTS deliverables_item_idx ON mk_deliverables(order_item_id);

    -- Buyer <-> creator chat, scoped to an order item so each creator sees only
    -- their own thread. Attachments are preview images in object storage.
    CREATE TABLE IF NOT EXISTS mk_messages (
      id text PRIMARY KEY,
      order_item_id text NOT NULL REFERENCES mk_order_items(id) ON DELETE CASCADE,
      sender_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body text,
      attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      read_at timestamptz
    );
    -- Chat polls "anything since X", so order the index that way.
    CREATE INDEX IF NOT EXISTS messages_thread_idx ON mk_messages(order_item_id, created_at);

    -- Reviews hang off mk_order_items, which is what makes them verified: you
    -- cannot review a creator you never paid. One review per item.
    CREATE TABLE IF NOT EXISTS mk_reviews (
      id text PRIMARY KEY,
      order_item_id text NOT NULL UNIQUE REFERENCES mk_order_items(id) ON DELETE CASCADE,
      creator_id text NOT NULL REFERENCES mk_creators(id) ON DELETE CASCADE,
      buyer_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
      body text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS reviews_creator_idx ON mk_reviews(creator_id, created_at DESC);

    -- Append-only money log. Never UPDATE a row here; post a compensating one.
    -- Every entry is signed from the platform's perspective: what a creator is
    -- owed is the sum of their entries, which stays correct through refunds,
    -- partial releases and disputes in a way a balance column would not.
    CREATE TABLE IF NOT EXISTS mk_ledger (
      id text PRIMARY KEY,
      creator_id text REFERENCES mk_creators(id) ON DELETE SET NULL,
      order_id text REFERENCES mk_orders(id) ON DELETE SET NULL,
      order_item_id text REFERENCES mk_order_items(id) ON DELETE SET NULL,
      kind text NOT NULL CHECK (kind IN ('charge','platform_fee','earning','release','refund','payout','adjustment')),
      amount_cents int NOT NULL,
      currency text NOT NULL DEFAULT 'usd',
      stripe_ref text,
      note text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ledger_creator_idx ON mk_ledger(creator_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS ledger_order_idx ON mk_ledger(order_id);
  `);

  // Decks predate accounts and are owned by an anonymous localStorage token.
  // Adding a nullable user_id lets a deck be claimed on sign-in without
  // breaking anonymous building, which still has to work.
  await query(`ALTER TABLE sq_decks ADD COLUMN IF NOT EXISTS user_id text`).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS sq_decks_user_idx ON sq_decks(user_id)`).catch(() => {});
  // Marketplace-built decks record who made what, for provenance labelling.
  await query(`ALTER TABLE sq_decks ADD COLUMN IF NOT EXISTS order_id text`).catch(() => {});
  await query(`ALTER TABLE sq_decks ADD COLUMN IF NOT EXISTS art_provenance text`).catch(() => {});
}
