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
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
// Nano Banana Pro (Gemini 3 Pro Image, GA June 2026): top of the current lineup —
// best identity preservation and prompt control, $0.134/image. Override with
// GEMINI_IMAGE_MODEL (e.g. gemini-3.1-flash-image for the ~3x cheaper Nano Banana 2,
// or gemini-3.1-flash-lite-image for the fastest/cheapest tier).
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image";

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

// ---- Anthropic (lore) -----------------------------------------------------

async function callClaude(prompt, { json = false, maxTokens = 1200 } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set on the server");
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
      messages: [{ role: "user", content: (sys ? sys + "\n\n" : "") + prompt }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${detail.slice(0, 300)}`);
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

// photoDataUrl: "data:image/jpeg;base64,...."; returns a data URL of generated art.
async function generatePortrait({ photoDataUrl, themeStyle, lore, refineNote }) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GOOGLE_API_KEY is not set on the server");
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

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=` +
    encodeURIComponent(key);
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: mimeType, data } }, { text: prompt }] }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini image error ${res.status}: ${detail.slice(0, 300)}`);
  }
  const body = await res.json();
  const parts = body?.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inline_data || p.inlineData);
  const inline = img?.inline_data || img?.inlineData;
  if (!inline?.data) throw new Error("Gemini returned no image (content may have been declined)");
  const outMime = inline.mime_type || inline.mimeType || "image/png";
  return `data:${outMime};base64,${inline.data}`;
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
  if (!res.ok) throw new Error(`Stripe error ${res.status}: ${data?.error?.message || "unknown"}`);
  return { checkoutUrl: data.url };
}

function verifyStripeSig(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = Object.fromEntries(sigHeader.split(",").map((kv) => kv.split("=")));
  if (!parts.t || !parts.v1) return false;
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

// ---- HTTP plumbing --------------------------------------------------------

function corsHeaders(origin) {
  const h = {
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "POST, GET, OPTIONS",
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
const PAID = new Set(["/api/generate-lore", "/api/regenerate-lore", "/api/generate-art"]);
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
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limitBytes) { reject(new Error("payload too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch (e) { reject(new Error("invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

const routes = {
  "GET /api/health": async () => ({
    ok: true,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    google: !!process.env.GOOGLE_API_KEY,
    stripe: !!process.env.STRIPE_SECRET_KEY,
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
  "POST /api/generate-art": async (b) => ({
    image: await generatePortrait({
      photoDataUrl: b.photoBase64,
      themeStyle: b.themeStyle,
      lore: b.lore,
      refineNote: b.refineNote,
    }),
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
  const rateLimitedPath = PAID.has(p) || p === "/api/checkout" || p === "/api/auth/login" || p === "/api/auth/signup";
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
    const body = req.method === "POST" ? await readBody(req) : {};

    // /api/decks/:id — GET (open) / DELETE
    const deckMatch = p.match(/^\/api\/decks\/([^/]+)$/);
    let result;
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
