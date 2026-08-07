// ---------------------------------------------------------------------------
// Cloudflare R2 object storage — S3-compatible, signed with SigV4 by hand.
// ---------------------------------------------------------------------------
// No SDK. `@aws-sdk/client-s3` is ~20MB of dependency to issue three request
// shapes, and this codebase already signs Stripe by hand for the same reason
// (see the Stripe section of index.mjs). node:crypto has everything needed.
//
// R2 uses path-style addressing against a per-account host:
//   https://<account>.r2.cloudflarestorage.com/<bucket>/<key>
// with region "auto" and service "s3".
//
// Uploads go to the authenticated endpoint above; reads are served from a
// separate public URL (pub-*.r2.dev or a custom domain). Confusing the two is
// the easy mistake — the S3 endpoint 401s a plain browser <img> request.

import crypto from "node:crypto";

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const BUCKET = process.env.R2_BUCKET || "";
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
// Trailing slash stripped so callers can always join with a single "/".
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

const REGION = "auto";
const SERVICE = "s3";
// Override the endpoint to point at any S3-compatible server. Exists so the
// signing path can be exercised against a local MinIO before it ever touches
// the real bucket — the alternative is debugging SigV4 against production.
const ENDPOINT = (process.env.R2_ENDPOINT || "").replace(/\/+$/, "");

function endpoint() {
  return ENDPOINT || `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

export function r2Enabled() {
  return !!(ACCOUNT_ID && BUCKET && ACCESS_KEY_ID && SECRET_ACCESS_KEY && PUBLIC_URL);
}

// Reports which pieces are missing, so a misconfiguration says what to fix
// rather than just failing. Mirrors the Stripe key-shape check.
export function r2Config() {
  const missing = [];
  if (!ACCOUNT_ID) missing.push("R2_ACCOUNT_ID");
  if (!BUCKET) missing.push("R2_BUCKET");
  if (!ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
  if (!SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
  if (!PUBLIC_URL) missing.push("R2_PUBLIC_URL");
  // A public URL pointing at the S3 API endpoint is a silent killer: uploads
  // succeed and every <img> 401s. Catch it at config time.
  const publicLooksLikeApi = /r2\.cloudflarestorage\.com/.test(PUBLIC_URL);
  return { configured: missing.length === 0, missing, publicLooksLikeApi, bucket: BUCKET, publicUrl: PUBLIC_URL };
}

const sha256hex = (data) => crypto.createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

// Each path segment is URI-encoded, but "/" separators are preserved. S3's
// canonical URI requires this exact encoding or the signature won't match.
function encodeKey(key) {
  return String(key).split("/").map((s) => encodeURIComponent(s)).join("/");
}

function signingKey(dateStamp) {
  const kDate = hmac(`AWS4${SECRET_ACCESS_KEY}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

// Build a signed request for the R2 S3 endpoint. `body` is a Buffer or "".
function signedRequest(method, key, body, extraHeaders = {}) {
  const base = new URL(endpoint());
  // Signed host must include a non-default port, or the signature won't match.
  const host = base.port ? `${base.hostname}:${base.port}` : base.hostname;
  const canonicalUri = `/${BUCKET}${key ? "/" + encodeKey(key) : ""}`;
  const payloadHash = sha256hex(body || "");
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);

  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...extraHeaders,
  };
  // Canonical headers must be lowercase, sorted, and trimmed.
  const sortedNames = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const canonicalHeaders = sortedNames
    .map((n) => `${n}:${String(headers[Object.keys(headers).find((k) => k.toLowerCase() === n)]).trim()}\n`)
    .join("");
  const signedHeaders = sortedNames.join(";");

  const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest)].join("\n");
  const signature = crypto.createHmac("sha256", signingKey(dateStamp)).update(stringToSign).digest("hex");

  headers.Authorization =
    `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { url: `${base.origin}${canonicalUri}`, headers };
}

async function send(method, key, body, extraHeaders, timeoutMs = 30_000) {
  const { url, headers } = signedRequest(method, key, body, extraHeaders);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, headers, body: body || undefined, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

/** Upload bytes and return the public URL they'll be served from. */
export async function r2Put(key, buffer, contentType) {
  if (!r2Enabled()) throw new Error("R2 is not configured");
  const res = await send("PUT", key, buffer, {
    "content-type": contentType || "application/octet-stream",
    "content-length": String(buffer.length),
    // Immutable: keys are content-addressed, so a given key never changes.
    "cache-control": "public, max-age=31536000, immutable",
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`R2 upload failed (${res.status}): ${detail}`);
  }
  return `${PUBLIC_URL}/${encodeKey(key)}`;
}

export async function r2Delete(key) {
  if (!r2Enabled()) return false;
  const res = await send("DELETE", key, "");
  return res.ok || res.status === 404;
}

/**
 * Prove the credentials actually work, rather than merely being present.
 * HEADs the bucket: 200 means signed correctly, 403 means bad keys, 404 means
 * the bucket name is wrong. That distinction is the whole point — "the value
 * is set" told us nothing useful when the Stripe key was wrong.
 */
export async function r2Check() {
  if (!r2Enabled()) return { ok: false, reason: "not_configured", ...r2Config() };
  try {
    const res = await send("HEAD", "", "", {}, 10_000);
    if (res.ok) return { ok: true, status: res.status };
    if (res.status === 403) return { ok: false, reason: "bad_credentials", status: 403 };
    if (res.status === 404) return { ok: false, reason: "bucket_not_found", status: 404 };
    return { ok: false, reason: `http_${res.status}`, status: res.status };
  } catch (e) {
    return { ok: false, reason: e.name === "AbortError" ? "timeout" : e.message };
  }
}

/**
 * Content-addressed key for generated art: identical bytes reuse the same
 * object instead of duplicating, and the immutable cache header stays honest.
 */
export function artKey(buffer, ext = "jpg") {
  return `art/${sha256hex(buffer).slice(0, 32)}.${ext}`;
}
