// ---------------------------------------------------------------------------
// Side Quest — generation backend (MVP slice of docs/SideQuest_Backend_Spec.md)
// ---------------------------------------------------------------------------
// Holds the API keys server-side and proxies the two AI capabilities the client
// asks for: lore (Anthropic) and face->character art ("nano-banana" / Gemini).
// Dependency-free: Node 18+ built-in http + global fetch. No npm install.
//
//   ANTHROPIC_API_KEY  — required for /api/generate-lore + /api/regenerate-lore
//   GOOGLE_API_KEY     — required for /api/generate-art
//   PORT               — default 8787
//   ALLOW_ORIGIN       — CORS allow-origin, default "*" (lock down in prod)
//
// Run: `node server/index.mjs` (or `npm run server`). Reads .env if present.
// ---------------------------------------------------------------------------

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { query, migrate, dbEnabled } from "./db.mjs";
import { r2Enabled, r2Config, r2Check, r2Put, artKey } from "./r2.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (avoids a dotenv dependency).
(function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
})();

const PORT = Number(process.env.PORT || 8787);
// Sonnet 5: near-Opus quality at Sonnet speed/cost ($2/$10 per 1M intro through
// 2026-08-31). Thinking is disabled below to keep lore generation snappy — Sonnet 5
// turns adaptive thinking on by default, which would add latency to a user-facing call.
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
// Nano Banana 2 (Gemini 3.1 Flash Image, GA): $0.045/image — best quality/price for
// card-sized art. Side-by-side vs Nano Banana Pro (gemini-3-pro-image, $0.134) showed
// only a modest edge at card display size; set GEMINI_IMAGE_MODEL=gemini-3-pro-image
// to upgrade (e.g. for a premium tier), or gemini-3.1-flash-lite-image for cheapest.
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";

// Cards are portrait; without this Gemini returns landscape (1408x768) and the
// card crops it with object-fit: cover, discarding ~45% of the pixels we paid
// for and off-centering the subject.
const ART_ASPECT = process.env.ART_ASPECT || "3:4";
// Gemini hands back a ~900KB maximum-quality JPEG. That art is stored inline in
// the deck payload, so its size is the deck's size. Re-encoding costs ~5x less
// at visually indistinguishable quality. Resolution is deliberately preserved:
// a printed 2.5x3.5in card at 300dpi needs ~750x1050, so downscaling for screen
// would quietly ruin the print path. mozjpeg matches webp's ratio here without
// the format-support risk, so it stays the default.
const ART_FORMAT = (process.env.ART_FORMAT || "jpeg").toLowerCase(); // jpeg | webp | off
const ART_QUALITY = Number(process.env.ART_QUALITY || 82);

// --- Abuse / cost controls (these endpoints spend real money) --------------
// ALLOW_ORIGIN: comma-separated allowlist, or "*". A browser request whose
// Origin isn't listed gets no CORS header and is blocked by the browser.
const ALLOW_ORIGINS = (process.env.ALLOW_ORIGIN || "*").split(",").map((s) => s.trim()).filter(Boolean);
const ALLOW_ALL_ORIGINS = ALLOW_ORIGINS.includes("*");
// Optional shared secret. If set, paid endpoints require `Authorization: Bearer <token>`.
const API_TOKEN = process.env.SIDEQUEST_API_TOKEN || "";
// Per-IP sliding-window rate limit.
const RATE_MAX = Number(process.env.RATE_MAX || 30);
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 60_000);
// Hard global ceiling on paid generations per rolling 24h — bounds worst-case spend.
const MAX_GENERATIONS_PER_DAY = Number(process.env.MAX_GENERATIONS_PER_DAY || 500);
// Abort upstream calls that hang.
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 60_000);
// Image generation is much slower than text — observed 14s on a warm path, but
// variable enough that a 60s budget aborts calls that would have succeeded.
const IMAGE_TIMEOUT_MS = Number(process.env.IMAGE_TIMEOUT_MS || 120_000);

async function fetchWithTimeout(url, opts = {}, ms = UPSTREAM_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (e.name === "AbortError") throw new Error(`upstream timeout after ${ms}ms`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

// ---- Accounts (DB-backed) -------------------------------------------------

function httpErr(status, msg) { const e = new Error(msg); e.status = status; return e; }
function requireDb() { if (!dbEnabled()) throw httpErr(503, "accounts unavailable — DATABASE_URL not configured"); }
function requireUser(ctx) { if (!ctx.userId) throw httpErr(401, "sign in required"); }

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(pw, stored) {
  const [salt, hash] = (stored || "").split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64).toString("hex");
  try { return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(test)); } catch { return false; }
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  await query("INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, now() + interval '30 days')", [token, userId]);
  return token;
}

// Resolve the signed-in user (if any) from the Authorization: Bearer <token> header.
async function resolveAuth(req) {
  const m = (req.headers.authorization || "").match(/^Bearer\s+(.+)$/);
  if (!m || !dbEnabled()) return { userId: null, token: null };
  try {
    const r = await query("SELECT user_id FROM sessions WHERE token = $1 AND expires_at > now()", [m[1]]);
    return { userId: r.rows[0]?.user_id || null, token: m[1] };
  } catch { return { userId: null, token: null }; }
}

async function authSignup({ email, password, displayName }) {
  requireDb();
  email = (email || "").trim().toLowerCase();
  if (!email.includes("@") || !password || password.length < 8) throw httpErr(422, "valid email and password (min 8 chars) required");
  if ((await query("SELECT 1 FROM users WHERE email = $1", [email])).rows.length) throw httpErr(409, "email already registered");
  const id = crypto.randomUUID();
  await query("INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, $3, $4)", [id, email, hashPassword(password), displayName || null]);
  return { user: { id, email, displayName: displayName || null }, token: await createSession(id) };
}

async function authLogin({ email, password }) {
  requireDb();
  email = (email || "").trim().toLowerCase();
  const r = await query("SELECT id, email, password_hash, display_name FROM users WHERE email = $1", [email]);
  const u = r.rows[0];
  if (!u || !verifyPassword(password, u.password_hash)) throw httpErr(401, "invalid email or password");
  return { user: { id: u.id, email: u.email, displayName: u.display_name }, token: await createSession(u.id) };
}

// ---- Marketplace: creators + listings -------------------------------------
// Supply side only; no money moves here. Two disciplines sell: `artist`
// (illustration, delivered as uploaded files) and `writer` (adventure lore,
// authored in the builder). Each sells `catalog` items made once and sold many
// times, and `commission` work made to order.
//
// Onboarding is juried, not open: creators start at 'applied' and only an
// approved creator can publish. Targeting illustrators of Magic-artist calibre
// means curation rather than rank-by-volume search, and an open signup that
// anyone can list on is the thing that makes a marketplace feel like Fiverr.

// Below roughly $10 the fixed $0.30 of card processing eats most of the take,
// so a floor keeps trivial listings from being value-destroying.
const MIN_LISTING_PRICE_CENTS = Number(process.env.MIN_LISTING_PRICE_CENTS || 1500);
const DISCIPLINES = new Set(["artist", "writer"]);
const LISTING_KINDS = new Set(["catalog", "commission"]);

function creatorRow(r) {
  return {
    id: r.id, discipline: r.discipline, displayName: r.display_name,
    headline: r.headline, bio: r.bio, portfolio: r.portfolio || [], links: r.links || {},
    status: r.status, payoutsEnabled: r.payouts_enabled,
    ratingAvg: r.rating_avg == null ? null : Number(r.rating_avg), ratingCount: r.rating_count,
    createdAt: msOf(r.created_at),
  };
}

function listingRow(r) {
  return {
    id: r.id, creatorId: r.creator_id, discipline: r.discipline, kind: r.kind,
    title: r.title, summary: r.summary, description: r.description,
    priceCents: r.price_cents, currency: r.currency,
    deliveryDays: r.delivery_days, revisionsIncluded: r.revisions_included,
    previewUrls: r.preview_urls || [], status: r.status,
    createdAt: msOf(r.created_at), updatedAt: msOf(r.updated_at),
    ...(r.creator_name ? { creator: { id: r.creator_id, displayName: r.creator_name, ratingAvg: r.rating_avg == null ? null : Number(r.rating_avg), ratingCount: r.rating_count } } : {}),
  };
}

async function creatorApply(body, ctx) {
  requireDb(); requireUser(ctx);
  const discipline = String(body?.discipline || "").toLowerCase();
  if (!DISCIPLINES.has(discipline)) throw httpErr(422, "discipline must be 'artist' or 'writer'");
  const displayName = String(body?.displayName || "").trim();
  if (!displayName) throw httpErr(422, "displayName required");
  const id = crypto.randomUUID();
  try {
    const r = await query(
      `INSERT INTO mk_creators (id, user_id, discipline, display_name, headline, bio, portfolio, links)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, ctx.userId, discipline, displayName, body?.headline || null, body?.bio || null,
       JSON.stringify(body?.portfolio || []), JSON.stringify(body?.links || {})]
    );
    return { creator: creatorRow(r.rows[0]) };
  } catch (e) {
    // UNIQUE (user_id, discipline): the same person may sell as both an artist
    // and a writer, but not hold two profiles in one discipline.
    if (String(e.message).includes("mk_creators_user_id_discipline_key")) {
      throw httpErr(409, `you already have a ${discipline} profile`);
    }
    throw e;
  }
}

async function creatorMine(ctx) {
  requireDb(); requireUser(ctx);
  const r = await query("SELECT * FROM mk_creators WHERE user_id = $1 ORDER BY created_at", [ctx.userId]);
  return { creators: r.rows.map(creatorRow) };
}

async function creatorUpdate(id, body, ctx) {
  requireDb(); requireUser(ctx);
  const own = (await query("SELECT * FROM mk_creators WHERE id = $1 AND user_id = $2", [id, ctx.userId])).rows[0];
  if (!own) throw httpErr(404, "not found");
  const r = await query(
    `UPDATE mk_creators SET
       display_name = COALESCE($2, display_name), headline = COALESCE($3, headline),
       bio = COALESCE($4, bio), portfolio = COALESCE($5, portfolio), links = COALESCE($6, links),
       updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, body?.displayName ?? null, body?.headline ?? null, body?.bio ?? null,
     body?.portfolio ? JSON.stringify(body.portfolio) : null,
     body?.links ? JSON.stringify(body.links) : null]
  );
  return { creator: creatorRow(r.rows[0]) };
}

// Public browse. Only approved creators are discoverable — an application is
// not a storefront.
async function creatorBrowse(q) {
  requireDb();
  const discipline = q.get("discipline");
  const limit = Math.min(60, Math.max(1, Number(q.get("limit")) || 24));
  const r = await query(
    `SELECT * FROM mk_creators
      WHERE status = 'approved' AND ($1::text IS NULL OR discipline = $1)
      ORDER BY rating_count DESC, created_at DESC LIMIT $2`,
    [DISCIPLINES.has(discipline) ? discipline : null, limit]
  );
  return { creators: r.rows.map(creatorRow) };
}

async function creatorPublic(id) {
  requireDb();
  const c = (await query("SELECT * FROM mk_creators WHERE id = $1 AND status = 'approved'", [id])).rows[0];
  if (!c) throw httpErr(404, "not found");
  const l = await query("SELECT * FROM mk_listings WHERE creator_id = $1 AND status = 'published' ORDER BY created_at DESC", [id]);
  return { creator: creatorRow(c), listings: l.rows.map(listingRow) };
}

// Resolve a creator profile the caller actually owns, for listing mutations.
async function ownedCreator(creatorId, ctx) {
  const c = (await query("SELECT * FROM mk_creators WHERE id = $1 AND user_id = $2", [creatorId, ctx.userId])).rows[0];
  if (!c) throw httpErr(403, "not your creator profile");
  return c;
}

function validateListing(body, creator, { partial = false } = {}) {
  const out = {};
  if (!partial || body.kind !== undefined) {
    const kind = String(body?.kind || "").toLowerCase();
    if (!LISTING_KINDS.has(kind)) throw httpErr(422, "kind must be 'catalog' or 'commission'");
    out.kind = kind;
  }
  if (!partial || body.title !== undefined) {
    const title = String(body?.title || "").trim();
    if (title.length < 3) throw httpErr(422, "title required");
    out.title = title;
  }
  if (!partial || body.priceCents !== undefined) {
    const price = Math.round(Number(body?.priceCents));
    if (!Number.isFinite(price) || price < MIN_LISTING_PRICE_CENTS) {
      throw httpErr(422, `price must be at least ${MIN_LISTING_PRICE_CENTS} cents`);
    }
    out.priceCents = price;
  }
  // A commission is a promise about time, so it needs one.
  const kind = out.kind || body?.kind;
  if (kind === "commission" && (!partial || body.deliveryDays !== undefined)) {
    const days = Math.round(Number(body?.deliveryDays));
    if (!Number.isFinite(days) || days < 1 || days > 365) throw httpErr(422, "commission listings need deliveryDays (1-365)");
    out.deliveryDays = days;
  }
  return out;
}

async function listingCreate(body, ctx) {
  requireDb(); requireUser(ctx);
  const creator = await ownedCreator(String(body?.creatorId || ""), ctx);
  const v = validateListing(body || {}, creator);
  const id = crypto.randomUUID();
  const r = await query(
    `INSERT INTO mk_listings (id, creator_id, discipline, kind, title, summary, description,
        price_cents, delivery_days, revisions_included, preview_urls, payload, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft') RETURNING *`,
    [id, creator.id, creator.discipline, v.kind, v.title, body?.summary || null, body?.description || null,
     v.priceCents, v.deliveryDays ?? null, Number.isFinite(Number(body?.revisionsIncluded)) ? Number(body.revisionsIncluded) : 2,
     JSON.stringify(body?.previewUrls || []), body?.payload ? JSON.stringify(body.payload) : null]
  );
  return { listing: listingRow(r.rows[0]) };
}

async function listingUpdate(id, body, ctx) {
  requireDb(); requireUser(ctx);
  const existing = (await query(
    `SELECT l.* FROM mk_listings l JOIN mk_creators c ON c.id = l.creator_id
      WHERE l.id = $1 AND c.user_id = $2`, [id, ctx.userId])).rows[0];
  if (!existing) throw httpErr(404, "not found");
  const creator = await ownedCreator(existing.creator_id, ctx);
  const v = validateListing({ ...body, kind: body?.kind ?? existing.kind }, creator, { partial: true });

  // Publishing is the gate curation actually enforces.
  let status = existing.status;
  if (body?.status !== undefined) {
    const want = String(body.status);
    if (!["draft", "published", "paused", "removed"].includes(want)) throw httpErr(422, "bad status");
    if (want === "published" && creator.status !== "approved") {
      throw httpErr(403, "your creator profile is not approved yet");
    }
    status = want;
  }
  const r = await query(
    `UPDATE mk_listings SET
       title = COALESCE($2,title), summary = COALESCE($3,summary), description = COALESCE($4,description),
       price_cents = COALESCE($5,price_cents), delivery_days = COALESCE($6,delivery_days),
       revisions_included = COALESCE($7,revisions_included), preview_urls = COALESCE($8,preview_urls),
       status = $9, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, v.title ?? null, body?.summary ?? null, body?.description ?? null,
     v.priceCents ?? null, v.deliveryDays ?? null,
     body?.revisionsIncluded ?? null, body?.previewUrls ? JSON.stringify(body.previewUrls) : null, status]
  );
  return { listing: listingRow(r.rows[0]) };
}

async function listingMine(ctx) {
  requireDb(); requireUser(ctx);
  const r = await query(
    `SELECT l.* FROM mk_listings l JOIN mk_creators c ON c.id = l.creator_id
      WHERE c.user_id = $1 AND l.status <> 'removed' ORDER BY l.updated_at DESC`, [ctx.userId]);
  return { listings: r.rows.map(listingRow) };
}

async function listingBrowse(q) {
  requireDb();
  const discipline = q.get("discipline");
  const kind = q.get("kind");
  const limit = Math.min(60, Math.max(1, Number(q.get("limit")) || 24));
  const r = await query(
    `SELECT l.*, c.display_name AS creator_name, c.rating_avg, c.rating_count
       FROM mk_listings l JOIN mk_creators c ON c.id = l.creator_id
      WHERE l.status = 'published' AND c.status = 'approved'
        AND ($1::text IS NULL OR l.discipline = $1)
        AND ($2::text IS NULL OR l.kind = $2)
      ORDER BY c.rating_count DESC, l.created_at DESC LIMIT $3`,
    [DISCIPLINES.has(discipline) ? discipline : null, LISTING_KINDS.has(kind) ? kind : null, limit]
  );
  return { listings: r.rows.map(listingRow) };
}

async function listingPublic(id) {
  requireDb();
  const r = await query(
    `SELECT l.*, c.display_name AS creator_name, c.rating_avg, c.rating_count
       FROM mk_listings l JOIN mk_creators c ON c.id = l.creator_id
      WHERE l.id = $1 AND l.status = 'published' AND c.status = 'approved'`, [id]);
  if (!r.rows[0]) throw httpErr(404, "not found");
  return { listing: listingRow(r.rows[0]) };
}

// ---- Deck persistence (replaces the client's localStorage shim) ------------

async function decksList(ctx) {
  requireUser(ctx);
  const r = await query("SELECT id, name, theme, event_type, card_count, updated_at FROM decks WHERE user_id = $1 ORDER BY updated_at DESC", [ctx.userId]);
  return { decks: r.rows.map((d) => ({ id: d.id, name: d.name, theme: d.theme, eventType: d.event_type, count: d.card_count, updatedAt: new Date(d.updated_at).getTime() })) };
}

async function deckSave(ctx, body) {
  requireUser(ctx);
  const payload = body && body.payload ? body.payload : body;
  const id = String(payload.id || crypto.randomUUID());
  const name = payload.name || "Untitled deck";
  await query(
    `INSERT INTO decks (id, user_id, name, theme, event_type, card_count, payload, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (id) DO UPDATE SET name = $3, theme = $4, event_type = $5, card_count = $6, payload = $7, updated_at = now()
     WHERE decks.user_id = $2`,
    [id, ctx.userId, name, payload.theme || null, payload.eventType || null, (payload.cards || []).length, payload]
  );
  return { id };
}

async function deckGet(ctx, id) {
  requireUser(ctx);
  const r = await query("SELECT payload FROM decks WHERE id = $1 AND user_id = $2", [id, ctx.userId]);
  if (!r.rows.length) throw httpErr(404, "deck not found");
  return { deck: r.rows[0].payload };
}

async function deckDelete(ctx, id) {
  requireUser(ctx);
  await query("DELETE FROM decks WHERE id = $1 AND user_id = $2", [id, ctx.userId]);
  return { ok: true };
}

// ---- Server-side decks: save / list / share / async collaboration ----------
// A deck's `id` is its public share id (client-supplied UUID, unguessable).
// `collab_token` is a separate secret that grants add/edit access via link.
const randToken = () => crypto.randomBytes(12).toString("hex");
const msOf = (ts) => new Date(ts).getTime();
function deckIndexRow(d) {
  return { id: d.id, name: d.name, theme: d.theme, eventType: d.event_type, count: d.card_count, updatedAt: msOf(d.updated_at), collabToken: d.collab_token || null, collabEnabled: !!d.collab_enabled };
}

// Anonymous building still has to work, so ownerToken remains the primary key
// of ownership. Signing in additionally stamps user_id, which is what lets a
// deck follow you to another browser — an anonymous token never can.
async function sqSave({ ownerToken, deck }, ctx) {
  requireDb();
  if (!ownerToken) throw httpErr(400, "ownerToken required");
  if (!deck || !deck.id) throw httpErr(400, "deck.id required");
  const id = String(deck.id);
  const existing = (await query("SELECT owner_token, collab_token FROM sq_decks WHERE id = $1", [id])).rows[0];
  if (existing && existing.owner_token !== ownerToken) throw httpErr(403, "not your deck");
  const collabToken = existing?.collab_token || randToken();
  const cardCount = (deck.cards || []).length;
  const userId = ctx?.userId || null;
  await query(
    `INSERT INTO sq_decks (id, owner_token, collab_token, name, theme, event_type, card_count, payload, user_id, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
     ON CONFLICT (id) DO UPDATE SET name=$4, theme=$5, event_type=$6, card_count=$7, payload=$8,
       -- COALESCE, not assignment: a deck already claimed by an account must
       -- not be un-claimed by a later anonymous save from the same browser.
       user_id = COALESCE(sq_decks.user_id, $9), updated_at=now()
     WHERE sq_decks.owner_token = $2`,
    [id, ownerToken, collabToken, deck.name || "Untitled deck", deck.theme || null, deck.eventType || null, cardCount, deck, userId]
  );
  const row = (await query("SELECT updated_at FROM sq_decks WHERE id = $1", [id])).rows[0];
  return { id, collabToken, updatedAt: row ? msOf(row.updated_at) : Date.now() };
}

async function sqList({ ownerToken }, ctx) {
  requireDb();
  const userId = ctx?.userId || null;
  if (!ownerToken && !userId) throw httpErr(400, "ownerToken required");
  // Union of "this browser's decks" and "this account's decks", so signing in
  // adds your other devices' decks without hiding the ones you made anonymously.
  const r = await query(
    `SELECT id, name, theme, event_type, card_count, updated_at, collab_token, collab_enabled
       FROM sq_decks
      WHERE owner_token = $1 OR ($2::text IS NOT NULL AND user_id = $2)
      ORDER BY updated_at DESC`,
    [ownerToken || "", userId]
  );
  return { decks: r.rows.map(deckIndexRow) };
}

async function sqDelete({ id, ownerToken }, ctx) {
  requireDb();
  const userId = ctx?.userId || null;
  await query(
    `DELETE FROM sq_decks WHERE id = $1 AND (owner_token = $2 OR ($3::text IS NOT NULL AND user_id = $3))`,
    [id, ownerToken || "", userId]
  );
  return { ok: true };
}

// Claim the decks this browser made anonymously. Called right after sign-in so
// work done before making an account isn't stranded. Only claims unclaimed
// decks, so it can never steal one already belonging to another account.
async function sqAdopt({ ownerToken }, ctx) {
  requireDb();
  requireUser(ctx);
  if (!ownerToken) throw httpErr(400, "ownerToken required");
  const r = await query(
    `UPDATE sq_decks SET user_id = $1 WHERE owner_token = $2 AND user_id IS NULL RETURNING id`,
    [ctx.userId, ownerToken]
  );
  return { adopted: r.rowCount };
}

// Public read by share id (view / clone).
async function sqGet(id) {
  requireDb();
  const r = await query("SELECT id, name, payload, updated_at FROM sq_decks WHERE id = $1", [id]);
  if (!r.rows.length) throw httpErr(404, "deck not found");
  const d = r.rows[0];
  return { id: d.id, name: d.name, updatedAt: msOf(d.updated_at), deck: d.payload };
}

// Owner enables collaboration and gets the collab link token.
async function sqCollabEnable({ id, ownerToken }) {
  requireDb();
  const row = (await query("SELECT collab_token, owner_token FROM sq_decks WHERE id = $1", [id])).rows[0];
  if (!row) throw httpErr(404, "deck not found");
  if (row.owner_token !== ownerToken) throw httpErr(403, "not your deck");
  const token = row.collab_token || randToken();
  await query("UPDATE sq_decks SET collab_enabled = true, collab_token = $2 WHERE id = $1", [id, token]);
  return { collabToken: token };
}

// Contributor reads a deck via the collab token.
async function sqCollabGet(token) {
  requireDb();
  const d = (await query("SELECT id, name, payload, updated_at, collab_enabled FROM sq_decks WHERE collab_token = $1", [token])).rows[0];
  if (!d || !d.collab_enabled) throw httpErr(404, "collab deck not found");
  return { id: d.id, name: d.name, updatedAt: msOf(d.updated_at), deck: d.payload };
}

// Poll: did the deck change since a timestamp?
async function sqCollabPoll(token, sinceMs) {
  requireDb();
  const d = (await query("SELECT updated_at, card_count FROM sq_decks WHERE collab_token = $1 AND collab_enabled = true", [token])).rows[0];
  if (!d) throw httpErr(404, "collab deck not found");
  const updatedAt = msOf(d.updated_at);
  return { changed: updatedAt > (Number(sinceMs) || 0), updatedAt, count: d.card_count };
}

// Contributor adds/updates ONE card (merged into payload.cards by uid). Append-only for new uids.
async function sqCollabUpsertCard({ token, card, byName, art }) {
  requireDb();
  if (!card || !card.uid) throw httpErr(400, "card.uid required");
  const row = (await query("SELECT payload FROM sq_decks WHERE collab_token = $1 AND collab_enabled = true", [token])).rows[0];
  if (!row) throw httpErr(404, "collab deck not found");
  const payload = row.payload || {};
  const cards = Array.isArray(payload.cards) ? payload.cards.slice() : [];
  const idx = cards.findIndex((c) => c.uid === card.uid);
  const merged = { ...(idx >= 0 ? cards[idx] : {}), ...card, addedBy: (idx >= 0 ? cards[idx].addedBy : null) || card.addedBy || byName || "Guest" };
  if (idx >= 0) cards[idx] = merged; else cards.push(merged);
  payload.cards = cards;
  if (art && typeof art === "string") { payload.arts = payload.arts || {}; payload.arts[card.uid] = art; }
  await query("UPDATE sq_decks SET payload = $2, card_count = $3, updated_at = now() WHERE collab_token = $1", [token, payload, cards.length]);
  const upd = (await query("SELECT updated_at FROM sq_decks WHERE collab_token = $1", [token])).rows[0];
  return { ok: true, updatedAt: msOf(upd.updated_at) };
}

// Contributor removes a card by uid.
async function sqCollabRemoveCard({ token, uid }) {
  requireDb();
  const row = (await query("SELECT payload FROM sq_decks WHERE collab_token = $1 AND collab_enabled = true", [token])).rows[0];
  if (!row) throw httpErr(404, "collab deck not found");
  const payload = row.payload || {};
  payload.cards = (payload.cards || []).filter((c) => c.uid !== uid);
  if (payload.arts) delete payload.arts[uid];
  await query("UPDATE sq_decks SET payload = $2, card_count = $3, updated_at = now() WHERE collab_token = $1", [token, payload, payload.cards.length]);
  return { ok: true };
}

// ---- Anthropic (lore) -----------------------------------------------------

async function callClaude(prompt, { json = false, maxTokens = 1200 } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Lore service is not configured");
  const sys = json
    ? "You respond ONLY with valid minified JSON. No markdown, no code fences, no preamble."
    : "";
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      thinking: { type: "disabled" }, // keep latency low for user-facing lore gen
      messages: [{ role: "user", content: (sys ? sys + "\n\n" : "") + prompt }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("lore upstream error", res.status, detail.slice(0, 300));
    throw new Error(`Lore service error (${res.status})`);
  }
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!json) return text.trim();
  const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  return JSON.parse(clean);
}

// ---- Gemini "nano-banana" (face -> character art) -------------------------

function styleBrief(t) {
  return {
    fantasy: "high-fantasy oil painting, gold filigree, warm torchlight",
    cyber: "neon cyberpunk, rim lighting, holographic accents",
    arcane: "arcane academia, candlelit, deep violet and gold",
    adventure: "swashbuckling sea-adventure, bold ink lines, sunset palette",
    scifi: "sleek sci-fi, cool blue, starfield bokeh",
    noir: "1940s noir, high-contrast monochrome with a gold spotlight",
  }[t] || "cinematic painterly portrait";
}

// Re-encode generated art down to a sane size to store. `sharp` is imported
// lazily and treated as optional — the same pattern db.mjs uses for `pg` — so a
// checkout without it still boots and serves, just with the original oversized
// image. Returns null whenever the original should be kept as-is.
async function shrinkArt(raw) {
  if (ART_FORMAT === "off") return null;
  let sharp;
  try { ({ default: sharp } = await import("sharp")); }
  catch { return null; } // not installed — not an error, just no re-encoding
  try {
    const img = sharp(raw);
    const out = ART_FORMAT === "webp"
      ? await img.webp({ quality: ART_QUALITY }).toBuffer()
      : await img.jpeg({ quality: ART_QUALITY, mozjpeg: true }).toBuffer();
    // A re-encode that grew the file is not worth taking.
    if (out.length >= raw.length) return null;
    return { buf: out, mime: ART_FORMAT === "webp" ? "image/webp" : "image/jpeg" };
  } catch (e) {
    console.warn("art re-encode failed, keeping original:", e.message);
    return null;
  }
}

// Turn an upstream Gemini failure into a message that names what to fix. The
// two 429s look identical but mean opposite things: `limit: 0` is "this model
// has no free-tier allocation, the project needs billing", NOT "slow down".
function artUpstreamErr(status, upstream) {
  let msg;
  if (status === 429 && /limit:\s*0/.test(upstream)) {
    msg = `Art model ${GEMINI_IMAGE_MODEL} has no quota on this Google API key — ` +
      `it has no free tier, so the key's project needs billing enabled.`;
  } else if (status === 429) {
    msg = "Art service is rate-limited right now — retry in a few seconds.";
  } else if (status === 401 || status === 403) {
    msg = "Art service rejected the Google API key (invalid, or lacking permission for this model).";
  } else {
    msg = `Art service error (${status})`;
  }
  if (upstream) msg += ` [upstream: ${upstream.slice(0, 200)}]`;
  return httpErr(status === 429 ? 429 : 502, msg);
}

// Shared Gemini image call. `parts` is the generateContent parts array (a text
// part, optionally preceded by an inline_data image). Returns a data URL.
async function callGeminiImage(parts) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("Art service is not configured");
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=` +
    encodeURIComponent(key);
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { imageConfig: { aspectRatio: ART_ASPECT } },
    }),
  }, IMAGE_TIMEOUT_MS);
  if (!res.ok) {
    let detail = await res.text().catch(() => "");
    // The key rides in the query string; make sure it can't ride back out in an
    // error body that we now forward to the browser.
    if (key) detail = detail.split(key).join("[redacted]");
    console.error("art upstream error", res.status, detail.slice(0, 500));
    let upstream = "";
    try { upstream = JSON.parse(detail)?.error?.message || ""; } catch { /* not JSON */ }
    throw artUpstreamErr(res.status, upstream);
  }
  const body = await res.json();
  const outParts = body?.candidates?.[0]?.content?.parts || [];
  const img = outParts.find((p) => p.inline_data || p.inlineData);
  const inline = img?.inline_data || img?.inlineData;
  if (!inline?.data) throw new Error("Art service returned no image (content may have been declined)");
  const outMime = inline.mime_type || inline.mimeType || "image/png";
  const raw = Buffer.from(inline.data, "base64");
  const small = await shrinkArt(raw);
  const bytes = small ? small.buf : raw;
  const mime = small ? small.mime : outMime;
  if (small) console.log(`art re-encoded: ${(raw.length / 1024).toFixed(0)}KB -> ${(bytes.length / 1024).toFixed(0)}KB ${mime}`);

  // With object storage configured, hand back a URL instead of a data URL.
  // This is what keeps images out of sq_decks.payload: the deck stores a ~90
  // character link rather than ~250,000 characters of base64, which is the
  // difference between a 12MB deck and a 3KB one.
  //
  // Falling back to a data URL when R2 is unavailable is deliberate: art
  // generation is the product, and it should not fail because a bucket is
  // misconfigured. The deck is merely large, as it was before.
  if (r2Enabled()) {
    try {
      const ext = mime === "image/webp" ? "webp" : mime === "image/png" ? "png" : "jpg";
      const url = await r2Put(artKey(bytes, ext), bytes, mime);
      return url;
    } catch (e) {
      console.warn("R2 upload failed, falling back to inline data URL:", e.message);
    }
  }
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

// Character portrait from a real face (photoDataUrl: "data:image/jpeg;base64,…").
async function generatePortrait({ photoDataUrl, themeStyle, lore, refineNote }) {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(photoDataUrl || "");
  if (!m) throw new Error("photoBase64 must be a data URL (data:image/...;base64,...)");
  const mimeType = m[1];
  const data = m[2];

  const title = lore?.title || "a legendary hero";
  const typeLine = lore?.typeLine || "Legendary Creature";
  const prompt =
    `Paint an ORIGINAL trading-card character illustration. Use the face in the photo ` +
    `ONLY as a likeness reference — reimagine this person as the character "${title}" ` +
    `(${typeLine}), fully in costume and in-world. Fully painted/illustrated — NOT a ` +
    `photograph and NOT a plain headshot. Style: ${styleBrief(themeStyle)}. Heroic ` +
    `head-and-shoulders hero framing, dramatic lighting, rich thematic background. ` +
    `Keep their recognizable likeness. No text, no card border, no watermark. ` +
    `${refineNote ? "Art direction: " + refineNote : ""}`.trim();

  return callGeminiImage([{ inline_data: { mime_type: mimeType, data }, }, { text: prompt }]);
}

// Text-to-image for NON-character cards (artifacts, spells, NPCs, locations…) —
// no face reference. The type line decides what kind of subject to paint so an
// artifact reads as the item itself, not a person holding it.
async function generateObjectArt({ themeStyle, lore, refineNote, category }) {
  const title = lore?.title || "a mysterious relic";
  const typeLine = lore?.typeLine || category || "Artifact";
  const hay = `${typeLine} ${category || ""}`.toLowerCase();
  let subject;
  if (/artifact|equipment|relic|item|weapon|treasure/.test(hay)) {
    subject = `Center the composition on the ITEM/ARTIFACT itself as the hero subject, displayed prominently and iconically. Do NOT feature a person — no human figure holding or using it (a distant, tiny background figure is acceptable at most).`;
  } else if (/land|location|place|site|realm|region|domain/.test(hay)) {
    subject = `Depict the PLACE/LANDSCAPE itself as an establishing environment shot. Do NOT feature a dominant human figure; the location is the subject.`;
  } else if (/sorcery|instant|spell|enchant|ritual|hex|charm|incantation/.test(hay)) {
    subject = `Depict the MAGICAL EFFECT/PHENOMENON itself in action — energy, force, transformation — as the subject. Avoid a dominant human figure.`;
  } else {
    subject = `Depict an ENTIRELY ORIGINAL character/creature (invent it — do NOT depict any real, specific, or recognizable person), head-and-shoulders or heroic framing.`;
  }
  const prompt =
    `Paint an ORIGINAL trading-card illustration for "${title}" — a ${typeLine}. ${subject} ` +
    `Fully painted/illustrated — NOT a photograph. Style: ${styleBrief(themeStyle)}. Iconic ` +
    `centered composition, dramatic lighting, rich thematic background. No text, no card ` +
    `border, no watermark. ${refineNote ? "Art direction: " + refineNote : ""}`.trim();

  return callGeminiImage([{ text: prompt }]);
}

// ---- Stripe checkout (dependency-free: raw REST + HMAC) -------------------
// Uses Stripe Checkout (hosted page): Stripe collects the card AND the shipping
// address, so we never touch payment or address data. Price is computed here,
// server-side — the client never sends a price. Fulfillment (print-on-demand)
// and order persistence need the DB slice; this covers taking the payment.

const CURRENCY = process.env.CURRENCY || "usd";
const DECK_PRICE_CENTS = Number(process.env.DECK_PRICE_CENTS || 3900); // $39
const SHIPPING_CENTS = Number(process.env.SHIPPING_CENTS || 700);      // $7
const SITE_URL = process.env.SITE_URL || "https://wigilf.github.io/Side-Quest/";

// ---- Marketplace take rate ------------------------------------------------
// Basis points rather than a percentage so the rate can be tuned without ever
// touching floating point. 1200 = 12%.
//
// Charged to the CREATOR ONLY — the buyer pays exactly the listed price, with
// nothing added at checkout. That is deliberate positioning: Fiverr takes 20%
// from the seller plus 5.5% from the buyer plus a small-order fee, roughly 25%
// of the transaction taken from both sides, and the opacity of that is what
// illustrators object to loudest. "You keep 88%, your price is the price they
// pay" is the recruiting argument, so resist adding a buyer-side fee later.
const PLATFORM_FEE_BPS = Number(process.env.PLATFORM_FEE_BPS || 1200);

// Split a listing price into the creator's earnings and our fee. The fee is
// rounded and the creator takes the remainder, so the two always sum back to
// the price exactly — rounding can never lose or invent a cent, which matters
// because these numbers are written to an append-only ledger and must balance.
function splitPrice(priceCents, bps = PLATFORM_FEE_BPS) {
  const price = Math.max(0, Math.round(Number(priceCents) || 0));
  const platformFeeCents = Math.round((price * bps) / 10000);
  return { priceCents: price, platformFeeCents, creatorEarningsCents: price - platformFeeCents };
}
const SHIP_COUNTRIES = (process.env.SHIP_COUNTRIES || "US,CA,GB,IE,FR,DE,ES,IT,NL,PT,AU,NZ")
  .split(",").map((s) => s.trim()).filter(Boolean);

// Flatten a nested object into Stripe's form-encoded key[...] pairs.
function toForm(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item && typeof item === "object") toForm(item, `${key}[${i}]`, out);
        else out.push([`${key}[${i}]`, String(item)]);
      });
    } else if (typeof v === "object") {
      toForm(v, key, out);
    } else {
      out.push([key, String(v)]);
    }
  }
  return out;
}

async function stripeCreateCheckoutSession({ deckName, cardCount, quantity }, ctx) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set on the server");
  const qty = Math.max(1, Math.min(20, Number(quantity) || 1));
  const params = {
    mode: "payment",
    success_url: `${SITE_URL}?checkout=success`,
    cancel_url: `${SITE_URL}?checkout=cancel`,
    ...(ctx && ctx.userId ? { client_reference_id: ctx.userId } : {}),
    line_items: [{
      quantity: qty,
      price_data: {
        currency: CURRENCY,
        unit_amount: DECK_PRICE_CENTS, // server-computed; client never sends price
        product_data: {
          name: (deckName || "Side Quest custom deck").slice(0, 120),
          description: `${Number(cardCount) || 0}-card custom deck`,
        },
      },
    }],
    shipping_address_collection: { allowed_countries: SHIP_COUNTRIES },
    shipping_options: [{
      shipping_rate_data: {
        type: "fixed_amount",
        fixed_amount: { amount: SHIPPING_CENTS, currency: CURRENCY },
        display_name: "Standard shipping",
      },
    }],
  };
  const res = await fetchWithTimeout("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(toForm(params)).toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    // Stripe echoes the offending key back in auth errors (middle-redacted, but
    // still). This message reaches the browser, so strip anything key-shaped
    // before forwarding — same reason the art path scrubs the Google key.
    const msg = String(data?.error?.message || "unknown")
      .replace(/\b(sk|rk|pk|whsec|mk)_[A-Za-z0-9_*]+/g, "[redacted]");
    // A 401 here is our misconfiguration, not the caller's fault.
    throw httpErr(res.status === 401 || res.status === 403 ? 502 : res.status, `Stripe error ${res.status}: ${msg}`);
  }
  return { checkoutUrl: data.url };
}

// `stripe: !!STRIPE_SECRET_KEY` reported healthy while every checkout failed
// 401 on a malformed key, which is worse than reporting nothing. Check the
// shape so the flag means "plausibly usable" rather than "someone set a string".
function stripeKeyInfo() {
  const k = process.env.STRIPE_SECRET_KEY || "";
  if (!k) return { configured: false, mode: null, malformed: false };
  const m = /^(sk|rk)_(test|live)_/.exec(k);
  return { configured: !!m, mode: m ? m[2] : null, malformed: !m };
}

// Stripe's own libraries reject events whose timestamp is outside a tolerance,
// and so must we: a signature stays valid forever otherwise, so anyone who ever
// captures one signed webhook can replay it indefinitely.
const STRIPE_SIG_TOLERANCE_S = Number(process.env.STRIPE_SIG_TOLERANCE_S || 300);

function verifyStripeSig(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = Object.fromEntries(sigHeader.split(",").map((kv) => kv.split("=")));
  if (!parts.t || !parts.v1) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(parts.t));
  if (!Number.isFinite(age) || age > STRIPE_SIG_TOLERANCE_S) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected)); }
  catch { return false; }
}

async function handleStripeEvent(event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      console.log(`✅ PAID: session=${s.id} total=${s.amount_total} ${s.currency} email=${s.customer_details?.email || "?"}`);
      if (dbEnabled()) {
        // Idempotent on stripe_session_id — Stripe may deliver this more than once.
        await query(
          `INSERT INTO orders (id, user_id, stripe_session_id, amount_cents, currency, email, status, ship_to)
           VALUES ($1, $2, $3, $4, $5, $6, 'paid', $7)
           ON CONFLICT (stripe_session_id) DO NOTHING`,
          [crypto.randomUUID(), s.client_reference_id || null, s.id, s.amount_total, s.currency,
           s.customer_details?.email || null, s.shipping_details || s.customer_details?.address || null]
        );
      }
      break;
    }
    case "checkout.session.expired":
    case "payment_intent.payment_failed":
      console.log(`✖ checkout not completed: ${event.type}`);
      break;
    default:
      break;
  }
}

// ---- Lore prompts (ported verbatim from the client) -----------------------

function loreDeckPrompt({ eventType, theme, questPrompt, participants }) {
  const names = (participants || []).map((p) => p.name || "Unnamed").join(", ");
  return `You are the loremaster for "Side Quest", which turns real events into playable card-game quests in the style of Magic: The Gathering cards.

EVENT TYPE: ${eventType}
THEME / FEELING: ${theme}
ORGANIZER'S QUEST GOAL: "${questPrompt}"
PARTICIPANTS (use these exact real names): ${names}

For EACH participant invent a playable character card matching the theme's tone. Fun, a little roasty but warm, PG-13. Each card needs:
- "realName": exact participant name
- "title": epic character title fitting the theme
- "typeLine": MTG-style type line (e.g. "Legendary Creature — Reveler Rogue")
- "cost": 1-7 integer
- "power": 0-9 integer
- "toughness": 0-9 integer
- "ability": one short rules-style ability tied to the EVENT (1 sentence)
- "flavor": one flavor quote, max 18 words, personal and funny
- "frame": one of "gold","azure","crimson","verdant","violet"

ALSO invent ONE overarching "questCard": {"title","typeLine":"Quest","ability"(2 sentences, the group win condition),"flavor"}.

Return ONLY JSON: {"questCard":{...},"cards":[{...}]}. cards length MUST equal participant count, same order.`;
}

function loreOnePrompt({ eventType, theme, questPrompt, card }) {
  return `Reinvent ONE Side Quest character card with a fresh, different take. Event: ${eventType}. Theme: ${theme}. Group goal: "${questPrompt}". Keep realName="${card.realName}" exactly. JSON shape: {"realName","title","typeLine","cost","power","toughness","ability","flavor","frame"}. Make it noticeably different from previous: title "${card.title}", ability "${card.ability}". Return ONLY the JSON object.`;
}

// Suggest a batch of NON-character cards (artifacts, spells, NPCs, locations…)
// for one user-defined category, tailored to the quest lore. Starting points the
// user then edits — not the guests/heroes.
function suggestCardsPrompt({ eventType, theme, questPrompt, category, count }) {
  const n = Math.max(1, Math.min(6, Number(count) || 3));
  return `You are the loremaster for "Side Quest", turning real events into playable Magic: The Gathering–style card decks.

EVENT TYPE: ${eventType}
THEME / FEELING: ${theme}
ORGANIZER'S QUEST GOAL: "${questPrompt}"
CARD CATEGORY TO DESIGN: "${category}"

Invent ${n} playable "${category}" cards that enrich THIS quest's world and tone — fun, a little roasty but warm, PG-13. These are NOT the human guests/heroes; they are ${category} that support the story. Each card needs:
- "title": evocative name fitting the theme and the "${category}" category
- "typeLine": MTG-style type line appropriate to a ${category} (artifacts → "Artifact — Relic"; spells → "Sorcery" or "Instant"; NPCs → "Legendary Creature — …"; locations → "Land — …")
- "cost": 0-7 integer
- "power": 0-9 integer (use 0 for non-creatures such as spells, artifacts, and locations)
- "toughness": 0-9 integer (use 0 for non-creatures)
- "ability": one short rules-style ability tied to the EVENT/quest (1 sentence)
- "flavor": one flavor quote, max 18 words
- "frame": one of "gold","azure","crimson","verdant","violet"

Return ONLY JSON: {"cards":[{...}]} with exactly ${n} cards.`;
}

// ---- HTTP plumbing --------------------------------------------------------

function corsHeaders(origin) {
  const h = {
    "access-control-allow-headers": "content-type, authorization",
    // DELETE was already routed (deck delete) but never advertised here, so the
    // browser's preflight rejected it before the server ever saw the request.
    // PATCH joins it for marketplace edits.
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    vary: "Origin",
  };
  if (ALLOW_ALL_ORIGINS) h["access-control-allow-origin"] = "*";
  else if (origin && ALLOW_ORIGINS.includes(origin)) h["access-control-allow-origin"] = origin;
  return h;
}

function send(res, status, obj, origin) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "content-type": "application/json", ...corsHeaders(origin) });
  res.end(body);
}

// --- in-memory rate limiter + daily generation cap ------------------------
const PAID = new Set(["/api/generate-lore", "/api/regenerate-lore", "/api/generate-art", "/api/suggest-cards"]);
const hits = new Map(); // ip -> number[] (recent request timestamps, monotonic ms)
let dayCount = 0;
let dayStart = 0;

function nowMs() { return Number(process.hrtime.bigint() / 1_000_000n); }

function rateLimited(ip) {
  const t = nowMs();
  const arr = (hits.get(ip) || []).filter((ts) => t - ts < RATE_WINDOW_MS);
  arr.push(t);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear(); // crude memory bound
  return arr.length > RATE_MAX;
}

function overDailyCap() {
  const t = nowMs();
  if (t - dayStart > 24 * 60 * 60 * 1000) { dayStart = t; dayCount = 0; }
  if (dayCount >= MAX_GENERATIONS_PER_DAY) return true;
  dayCount++;
  return false;
}

function readBody(req, limitBytes = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let over = false;
    const chunks = [];
    req.on("data", (c) => {
      if (over) return; // already rejected — drain the rest and discard it
      size += c.length;
      // 413, not a bare 500: this is reachable in normal use, because card art
      // is stored inline in the deck payload (~180KB/card after re-encoding,
      // ~1.2MB before). The client shows this message, so it says what to do.
      //
      // Deliberately NOT destroying the socket here. Doing so races the error
      // response and the client sees a dropped connection instead of the 413
      // that explains the problem. Dropping chunks bounds memory just as well.
      if (size > limitBytes) {
        over = true;
        chunks.length = 0;
        reject(httpErr(413, `Deck is too large to save (over ${Math.round(limitBytes / 1024 / 1024)}MB). Try removing a few cards.`));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (over) return; // already rejected with a 413
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch (e) { reject(httpErr(400, "invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

const routes = {
  "GET /api/health": async () => ({
    ok: true,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    google: !!process.env.GOOGLE_API_KEY,
    stripe: stripeKeyInfo().configured,
    stripeMode: stripeKeyInfo().mode,
    ...(stripeKeyInfo().malformed ? { stripeKeyMalformed: true } : {}),
    // Actually signs a request against the bucket rather than checking that
    // five strings are non-empty — "the value is set" is what made the bad
    // Stripe key look healthy for an hour.
    r2: await (async () => {
      const c = r2Config();
      if (!c.configured) return { ok: false, missing: c.missing };
      const chk = await r2Check();
      return { ok: chk.ok, ...(chk.ok ? {} : { reason: chk.reason }), ...(c.publicLooksLikeApi ? { publicUrlIsApiEndpoint: true } : {}) };
    })(),
    db: dbEnabled(),
    model: ANTHROPIC_MODEL,
    imageModel: GEMINI_IMAGE_MODEL,
  }),
  "POST /api/checkout": async (b, ctx) => stripeCreateCheckoutSession(b, ctx),
  "POST /api/auth/signup": async (b) => authSignup(b),
  "POST /api/auth/login": async (b) => authLogin(b),
  "POST /api/auth/logout": async (b, ctx) => { if (ctx.token) await query("DELETE FROM sessions WHERE token = $1", [ctx.token]); return { ok: true }; },
  "GET /api/auth/me": async (b, ctx) => {
    requireUser(ctx);
    const r = await query("SELECT id, email, display_name FROM users WHERE id = $1", [ctx.userId]);
    if (!r.rows.length) throw httpErr(401, "sign in required");
    return { user: { id: r.rows[0].id, email: r.rows[0].email, displayName: r.rows[0].display_name } };
  },
  "GET /api/decks": async (b, ctx) => decksList(ctx),
  "POST /api/decks": async (b, ctx) => deckSave(ctx, b),
  "POST /api/generate-lore": async (b) => {
    const lore = await callClaude(loreDeckPrompt(b), { json: true, maxTokens: 2500 });
    if (!lore || !Array.isArray(lore.cards) || lore.cards.length === 0) throw new Error("empty lore");
    return lore;
  },
  "POST /api/regenerate-lore": async (b) => callClaude(loreOnePrompt(b), { json: true, maxTokens: 700 }),
  "POST /api/suggest-cards": async (b) => {
    const out = await callClaude(suggestCardsPrompt(b), { json: true, maxTokens: 1400 });
    if (!out || !Array.isArray(out.cards) || out.cards.length === 0) throw new Error("empty suggestions");
    return out;
  },
  "POST /api/generate-art": async (b) => ({
    image: b.photoBase64
      ? await generatePortrait({ photoDataUrl: b.photoBase64, themeStyle: b.themeStyle, lore: b.lore, refineNote: b.refineNote })
      : await generateObjectArt({ themeStyle: b.themeStyle, lore: b.lore, refineNote: b.refineNote, category: b.category }),
  }),
};

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (req.method === "OPTIONS") { send(res, 204, {}, origin); return; }
  const url = new URL(req.url, "http://localhost");

  // Stripe webhook: needs the RAW body for signature verification, and is called
  // server-to-server by Stripe (no CORS / token / rate-limit).
  if (req.method === "POST" && url.pathname === "/api/webhooks/stripe") {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 1_000_000) req.destroy(); });
    req.on("end", () => {
      if (!verifyStripeSig(raw, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET)) {
        res.writeHead(400); res.end("signature verification failed"); return;
      }
      let event;
      try { event = JSON.parse(raw); } catch { res.writeHead(400); res.end("bad json"); return; }
      // Return 200 immediately; do the DB write in the background (spec §C3).
      handleStripeEvent(event).catch((e) => console.error("stripe event handler:", e.message));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ received: true }));
    });
    return;
  }

  const p = url.pathname;
  const routeKey = `${req.method} ${p}`;

  // Rate-limit money/key-spending + auth endpoints (blunt brute-force/abuse).
  const sqWrite = p.startsWith("/api/sq/") && (req.method === "POST" || req.method === "DELETE");
  // Marketplace writes are cheap but spammable — listings and profiles are
  // public surface, so they get the same per-IP ceiling as deck writes.
  const mkWrite = p.startsWith("/api/mk/") && req.method !== "GET";
  const rateLimitedPath = PAID.has(p) || sqWrite || mkWrite || p === "/api/checkout" || p === "/api/auth/login" || p === "/api/auth/signup";
  if (rateLimitedPath) {
    if (PAID.has(p) && API_TOKEN) {
      const auth = req.headers.authorization || "";
      if (auth !== `Bearer ${API_TOKEN}`) { send(res, 401, { error: "unauthorized" }, origin); return; }
    }
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "unknown";
    if (rateLimited(ip)) { send(res, 429, { error: "rate_limited — slow down" }, origin); return; }
    if (PAID.has(p) && overDailyCap()) { send(res, 429, { error: "daily generation cap reached" }, origin); return; }
  }

  try {
    const ctx = await resolveAuth(req);
    // PATCH/PUT carry bodies too. Reading only POST meant every update silently
    // received {} and became a no-op that still returned 200 — the worst
    // possible failure shape, since the caller is told it worked.
    const body = (req.method === "POST" || req.method === "PATCH" || req.method === "PUT")
      ? await readBody(req) : {};

    const q = url.searchParams;
    let result, m;
    // Marketplace: creator profiles + listings.
    if (p.startsWith("/api/mk/")) {
      if (req.method === "POST" && p === "/api/mk/creators") result = await creatorApply(body, ctx);
      else if (req.method === "GET" && p === "/api/mk/creators/me") result = await creatorMine(ctx);
      else if (req.method === "GET" && p === "/api/mk/creators") result = await creatorBrowse(q);
      else if (req.method === "PATCH" && (m = p.match(/^\/api\/mk\/creators\/([^/]+)$/))) result = await creatorUpdate(decodeURIComponent(m[1]), body, ctx);
      else if (req.method === "GET" && (m = p.match(/^\/api\/mk\/creators\/([^/]+)$/))) result = await creatorPublic(decodeURIComponent(m[1]));
      else if (req.method === "POST" && p === "/api/mk/listings") result = await listingCreate(body, ctx);
      else if (req.method === "GET" && p === "/api/mk/listings/mine") result = await listingMine(ctx);
      else if (req.method === "GET" && p === "/api/mk/listings") result = await listingBrowse(q);
      else if (req.method === "PATCH" && (m = p.match(/^\/api\/mk\/listings\/([^/]+)$/))) result = await listingUpdate(decodeURIComponent(m[1]), body, ctx);
      else if (req.method === "GET" && (m = p.match(/^\/api\/mk\/listings\/([^/]+)$/))) result = await listingPublic(decodeURIComponent(m[1]));
      else { send(res, 404, { error: "not_found" }, origin); return; }
      send(res, 200, result, origin);
      return;
    }
    // Server-side deck storage + share + async collaboration.
    if (p.startsWith("/api/sq/")) {
      if (req.method === "POST" && p === "/api/sq/save") result = await sqSave(body, ctx);
      else if (req.method === "POST" && p === "/api/sq/adopt") result = await sqAdopt(body, ctx);
      else if (req.method === "GET" && p === "/api/sq/list") result = await sqList({ ownerToken: q.get("ownerToken") }, ctx);
      else if (req.method === "GET" && (m = p.match(/^\/api\/sq\/deck\/([^/]+)$/))) result = await sqGet(decodeURIComponent(m[1]));
      else if (req.method === "DELETE" && (m = p.match(/^\/api\/sq\/deck\/([^/]+)$/))) result = await sqDelete({ id: decodeURIComponent(m[1]), ownerToken: q.get("ownerToken") }, ctx);
      else if (req.method === "POST" && (m = p.match(/^\/api\/sq\/deck\/([^/]+)\/collab$/))) result = await sqCollabEnable({ id: decodeURIComponent(m[1]), ownerToken: body.ownerToken });
      else if (req.method === "GET" && (m = p.match(/^\/api\/sq\/collab\/([^/]+)\/poll$/))) result = await sqCollabPoll(decodeURIComponent(m[1]), q.get("since"));
      else if (req.method === "POST" && (m = p.match(/^\/api\/sq\/collab\/([^/]+)\/card$/))) result = await sqCollabUpsertCard({ token: decodeURIComponent(m[1]), ...body });
      else if (req.method === "POST" && (m = p.match(/^\/api\/sq\/collab\/([^/]+)\/remove$/))) result = await sqCollabRemoveCard({ token: decodeURIComponent(m[1]), uid: body.uid });
      else if (req.method === "GET" && (m = p.match(/^\/api\/sq\/collab\/([^/]+)$/))) result = await sqCollabGet(decodeURIComponent(m[1]));
      else { send(res, 404, { error: "not_found" }, origin); return; }
      send(res, 200, result, origin);
      return;
    }
    // /api/decks/:id — GET (open) / DELETE  (legacy account-based)
    const deckMatch = p.match(/^\/api\/decks\/([^/]+)$/);
    if (deckMatch) {
      const id = decodeURIComponent(deckMatch[1]);
      if (req.method === "GET") result = await deckGet(ctx, id);
      else if (req.method === "DELETE") result = await deckDelete(ctx, id);
      else throw httpErr(404, "not_found");
    } else {
      const handler = routes[routeKey];
      if (!handler) { send(res, 404, { error: "not_found" }, origin); return; }
      result = await handler(body, ctx);
    }
    send(res, 200, result, origin);
  } catch (e) {
    console.error(routeKey, "failed:", e.message);
    send(res, e.status || 500, { error: e.message || "server_error" }, origin);
  }
});

server.listen(PORT, () => {
  console.log(`Side Quest backend on http://localhost:${PORT}`);
  console.log(`  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "set" : "MISSING"}`);
  console.log(`  GOOGLE_API_KEY:    ${process.env.GOOGLE_API_KEY ? "set" : "MISSING"}`);
  console.log(`  STRIPE_SECRET_KEY: ${process.env.STRIPE_SECRET_KEY ? "set" : "MISSING"}`);
  console.log(`  DATABASE_URL:      ${process.env.DATABASE_URL ? "set" : "MISSING"}`);
  if (dbEnabled()) {
    migrate()
      .then(() => console.log("  DB migrations: OK"))
      .catch((e) => console.error("  DB migrations FAILED:", e.message));
  }
});
