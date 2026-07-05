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
import { fileURLToPath } from "node:url";

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
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

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
    `Create a trading-card character portrait of the person in the photo, ` +
    `reimagined as "${title}" — ${typeLine}. ` +
    `Art style: ${styleBrief(themeStyle)}. Head-and-shoulders, dramatic lighting, ` +
    `painterly, card-art framing, no text, no border. ${refineNote || ""}`.trim();

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
    model: ANTHROPIC_MODEL,
    imageModel: GEMINI_IMAGE_MODEL,
  }),
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
  const routeKey = `${req.method} ${url.pathname}`;
  const handler = routes[routeKey];
  if (!handler) { send(res, 404, { error: "not_found" }, origin); return; }

  // Guards apply only to the paid, key-spending endpoints.
  if (PAID.has(url.pathname)) {
    if (API_TOKEN) {
      const auth = req.headers.authorization || "";
      if (auth !== `Bearer ${API_TOKEN}`) { send(res, 401, { error: "unauthorized" }, origin); return; }
    }
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "unknown";
    if (rateLimited(ip)) { send(res, 429, { error: "rate_limited — slow down" }, origin); return; }
    if (overDailyCap()) { send(res, 429, { error: "daily generation cap reached" }, origin); return; }
  }

  try {
    const body = req.method === "POST" ? await readBody(req) : {};
    const result = await handler(body);
    send(res, 200, result, origin);
  } catch (e) {
    console.error(routeKey, "failed:", e.message);
    send(res, 500, { error: e.message || "server_error" }, origin);
  }
});

server.listen(PORT, () => {
  console.log(`Side Quest backend on http://localhost:${PORT}`);
  console.log(`  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "set" : "MISSING"}`);
  console.log(`  GOOGLE_API_KEY:    ${process.env.GOOGLE_API_KEY ? "set" : "MISSING"}`);
});
