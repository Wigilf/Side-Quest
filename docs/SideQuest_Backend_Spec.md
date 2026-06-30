# Side Quest — Backend Specification (v1)

**Purpose:** Turn the current front-end-only MVP into a functional product by adding three backend capabilities: **AI face-art generation (nano-banana)**, **user accounts**, and **checkout + physical fulfillment**. This document is build-ready: it specifies architecture, data models, every endpoint with request/response shapes, third-party integrations, security, and the exact client-side edits needed to swap today's stubs (the SVG art placeholder and `window.storage` local persistence) for real API calls.

It is written so an engineer can implement it without further design work. Where a real decision is still open, it is flagged as **DECISION**.

---

## 1. Architecture at a glance

The current artifact is a single React client that calls the Anthropic API directly and fakes everything else. The target architecture inserts one backend service between the client and all third parties, so that **no secret key ever touches the browser**.

```
  Browser (React app)
        │  HTTPS + session cookie / JWT
        ▼
  Side Quest API  (Node/TS or Python — your choice)
        ├── Auth & sessions ............ Postgres (users, sessions)
        ├── Decks & cards .............. Postgres (decks, cards, participants)
        ├── Lore generation ............ Anthropic API   (server-side key)
        ├── Face-art generation ........ Google Gemini 2.5 Flash Image ("nano-banana")
        ├── Object storage ............. S3 / R2 / GCS  (photos, generated art, print PDFs)
        ├── Async job queue ............ Redis + worker  (art + print render jobs)
        ├── Payments ................... Stripe  (Checkout + webhooks)
        └── Fulfillment ................ Print-on-demand API  (card printing + shipping)
```

Three rules drive the whole design:

1. **Keys live only on the server.** The Anthropic key (already exposed by being called from the client today) and the Google key must move server-side. The client authenticates to *your* API; your API authenticates to third parties.
2. **Slow work is async.** Generating art for 8 participants and rendering a print-ready PDF takes tens of seconds. These run as background jobs the client polls, not as blocking HTTP requests.
3. **The deck is the core object.** Everything — lore, art, order — hangs off a `deck` row owned by a `user`.

**DECISION — stack:** This spec is language-agnostic but assumes a REST/JSON API with cookie or bearer-token auth. A Node + TypeScript service (Fastify or Express) with Prisma over Postgres maps cleanly to the existing front end; substitute Python/FastAPI if preferred.

---

## 2. Data model

Postgres tables. Types shown are conceptual; adapt to your ORM.

### users
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| email | text unique | login identity |
| password_hash | text null | null if OAuth-only |
| display_name | text | |
| auth_provider | text | `password` \| `google` \| `apple` |
| created_at | timestamptz | |

### sessions
| column | type | notes |
|---|---|---|
| id | uuid (pk) | session token id |
| user_id | uuid (fk users) | |
| expires_at | timestamptz | |
| created_at | timestamptz | |

(Use this table for opaque session tokens, or skip it and issue stateless JWTs with short expiry + refresh tokens. **DECISION**.)

### decks
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| user_id | uuid (fk users) | owner |
| name | text | derived from quest prompt |
| event_type | text | `bachelor`, `trip`, etc. |
| theme | text | `lotr`, `cyber`, etc. |
| quest_prompt | text | organizer's free-text goal |
| quest_card | jsonb | the overarching quest card lore |
| status | text | `draft` \| `generating` \| `ready` \| `ordered` |
| created_at / updated_at | timestamptz | |

### participants
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| deck_id | uuid (fk decks) | |
| name | text | real name on the card |
| photo_key | text null | object-storage key of uploaded photo |
| sort_order | int | preserves deck order |

### cards
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| deck_id | uuid (fk decks) | |
| participant_id | uuid (fk participants) | |
| lore | jsonb | `{title,typeLine,cost,power,toughness,ability,flavor,frame}` |
| art_key | text null | object-storage key of generated art |
| art_status | text | `pending` \| `generating` \| `ready` \| `failed` |

### orders
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| deck_id | uuid (fk decks) | |
| user_id | uuid (fk users) | |
| stripe_session_id | text | |
| stripe_payment_intent | text null | |
| amount_cents | int | |
| status | text | `pending` \| `paid` \| `in_production` \| `shipped` \| `delivered` \| `refunded` |
| ship_to | jsonb | name, address, country |
| pod_order_id | text null | print-on-demand provider's order id |
| tracking_url | text null | |
| created_at / updated_at | timestamptz | |

### jobs
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| type | text | `generate_art` \| `render_print_pdf` |
| deck_id | uuid (fk decks) | |
| status | text | `queued` \| `running` \| `done` \| `failed` |
| progress | int | 0–100, for the client progress bar |
| error | text null | |

---

## 3. Authentication & accounts

Replaces today's throwaway name/email fields and `window.storage`. Decks become server-owned and sync across devices.

**DECISION — auth method.** Recommended: email+password *plus* Google OAuth (most of the target users will expect "Sign in with Google"). Apple sign-in is advisable if you ship an iOS app later.

### Endpoints

```
POST /api/auth/signup
  body:    { email, password, displayName }
  returns: 201 { user: {id,email,displayName}, token }
  errors:  409 email_taken, 422 weak_password

POST /api/auth/login
  body:    { email, password }
  returns: 200 { user, token }
  errors:  401 invalid_credentials

POST /api/auth/oauth/google
  body:    { idToken }            // Google ID token from client SDK
  returns: 200 { user, token }    // creates user on first sign-in

POST /api/auth/logout
  auth:    required
  returns: 204

GET  /api/auth/me
  auth:    required
  returns: 200 { user }
```

### Security requirements
- Passwords hashed with **argon2id** (or bcrypt cost ≥ 12). Never store plaintext.
- Tokens: httpOnly, Secure, SameSite=Lax cookie **or** Authorization: Bearer JWT. Pick one and be consistent.
- Rate-limit `login` and `signup` (e.g. 10/min/IP) to blunt credential stuffing.
- Email verification before first order is recommended, not required for MVP.

---

## 4. Decks & cards (CRUD + sync)

This is the layer that replaces `window.storage`. The client's existing `savedDecks` / `openDeck` / `saveCurrentDeck` logic maps almost 1:1 onto these endpoints.

```
GET  /api/decks
  auth:    required
  returns: 200 { decks: [{ id, name, theme, eventType, count, status, updatedAt }] }
           // the lightweight index — matches today's deckIndex shape

POST /api/decks
  auth:    required
  body:    { eventType, theme, questPrompt, participants:[{name, sortOrder}] }
  returns: 201 { deck: {...}, participants:[{id,name,...}] }
           // creates a draft deck BEFORE generation

GET  /api/decks/:id
  auth:    required (must own)
  returns: 200 { deck, participants, cards }   // full payload to rehydrate the UI
  errors:  403 not_owner, 404 not_found

PATCH /api/decks/:id
  auth:    required (must own)
  body:    { name?, questPrompt?, ... }
  returns: 200 { deck }

DELETE /api/decks/:id
  auth:    required (must own)
  returns: 204
```

**Ownership check is mandatory on every `:id` route.** A user must never read or mutate another user's deck. This is the single most important authorization rule in the system.

---

## 5. Photo upload

Photos are uploaded to object storage via short-lived presigned URLs, so large image bytes never pass through the API server.

```
POST /api/decks/:id/participants/:pid/photo-url
  auth:    required (must own)
  body:    { contentType: "image/jpeg", contentLength }
  returns: 200 { uploadUrl, photoKey }   // presigned PUT URL, expires in ~5 min
  errors:  413 too_large (enforce a max, e.g. 8 MB)

  // client then PUTs the file bytes directly to uploadUrl,
  // then PATCHes the participant (or the server records photoKey here).
```

Validation: accept only `image/jpeg` and `image/png`; cap dimensions/size; strip EXIF on the server-side copy. See §9 for the consent requirements that attach to these photos.

---

## 6. Lore generation (Anthropic — move server-side)

Today the browser calls `api.anthropic.com` directly with the key effectively exposed. Move it behind your API unchanged in behavior.

```
POST /api/decks/:id/generate-lore
  auth:    required (must own)
  returns: 202 { jobId }      // async; or 200 with lore if you keep it synchronous
```

Server-side, this runs the *exact prompt the client uses today* (`generateDeckLore`) against the Anthropic Messages API, parses the JSON, writes `quest_card` to the deck and one `cards` row per participant, then sets `deck.status = 'ready'` (lore-ready). Keep the per-card regeneration too:

```
POST /api/decks/:id/cards/:cardId/regenerate-lore
  auth:    required (must own)
  returns: 200 { card }       // re-rolls one card's lore (fast enough to be sync)
```

**Why move it:** the key, cost control, prompt-injection hardening, and rate-limiting all belong server-side. The client should never hold the Anthropic key in production.

---

## 7. Face-art generation (nano-banana) — the big one

This replaces `generateCardArt()` in the client, which currently returns a procedural SVG placeholder. In production, art generation is a **server-side async job** that calls **Google Gemini 2.5 Flash Image** ("nano-banana") with the participant's photo plus a themed prompt, and writes the result to object storage.

### Flow
1. Client calls `POST /api/decks/:id/generate-art`.
2. Server enqueues one `generate_art` job covering all cards (or one job per card — **DECISION**, per-card gives finer progress).
3. A worker, for each card: builds a themed prompt, calls Gemini with the photo as input, stores the returned image in object storage, sets `card.art_key` and `art_status = 'ready'`, updates `job.progress`.
4. Client polls `GET /api/jobs/:jobId` and swaps each card's art in as it completes (mirrors today's staggered reveal).

### Endpoints
```
POST /api/decks/:id/generate-art
  auth:    required (must own)
  returns: 202 { jobId }

GET  /api/jobs/:jobId
  auth:    required (must own underlying deck)
  returns: 200 { id, type, status, progress, cards:[{cardId, artStatus, artUrl?}] }

POST /api/decks/:id/cards/:cardId/regenerate-art
  auth:    required (must own)
  body:    { refineNote? }    // optional steer, e.g. "more heroic, less goofy"
  returns: 202 { jobId }      // single-card re-roll
```

### The actual nano-banana call (worker, server-side)
Gemini 2.5 Flash Image accepts text + image inputs and returns generated image bytes. Conceptual call (Node, using Google's GenAI SDK — verify exact method names against current SDK docs at build time):

```javascript
// SERVER-SIDE WORKER — never in the browser
import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

async function generatePortrait({ photoBytes, photoMime, themeStyle, lore, refineNote }) {
  const prompt =
    `Create a trading-card character portrait of the person in the photo, ` +
    `reimagined as "${lore.title}" — ${lore.typeLine}. ` +
    `Art style: ${styleBrief(themeStyle)}. Head-and-shoulders, dramatic lighting, ` +
    `painterly, card-art framing, no text, no border. ${refineNote ?? ""}`;

  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",          // confirm current model id
    contents: [
      { role: "user", parts: [
        { inlineData: { mimeType: photoMime, data: photoBytes.toString("base64") } },
        { text: prompt },
      ]},
    ],
  });

  // Pull the image part out of the response and return its bytes.
  const part = res.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!part) throw new Error("no image returned");
  return Buffer.from(part.inlineData.data, "base64");
}

function styleBrief(t) {
  return {
    fantasy:  "high-fantasy oil painting, gold filigree, warm torchlight",
    cyber:    "neon cyberpunk, rim lighting, holographic accents",
    arcane:   "arcane academia, candlelit, deep violet and gold",
    adventure:"swashbuckling sea-adventure, bold ink lines, sunset palette",
    scifi:    "sleek sci-fi, cool blue, starfield bokeh",
    noir:     "1940s noir, high-contrast monochrome with gold spotlight",
  }[t] ?? "cinematic painterly portrait";
}
```

### Operational notes
- **Cost & latency:** budget per-image generation time and price; an 8-person deck = 8 calls. Generate concurrently with a sensible cap (e.g. 3 at a time) to balance speed against rate limits.
- **Retries:** wrap each call with 2–3 retries on transient errors; on final failure set `art_status='failed'` and let the client offer a re-roll rather than blocking the whole deck.
- **Content safety:** Gemini may refuse some inputs. Surface a friendly "couldn't generate this one — try another photo" rather than a raw error.
- **Caching/idempotency:** key generated art by (photo hash + prompt hash) so re-runs don't double-bill.

---

## 8. Checkout & fulfillment

Replaces the `alert()` behind today's "Order deck" button. Two integrations: **Stripe** for payment, a **print-on-demand (POD) provider** for manufacturing and shipping the physical deck.

**DECISION — POD provider.** Options range from custom card printers (e.g. services that print custom playing-card / TCG-style decks) to general print brokers. Choose one with an API that accepts a print-ready PDF and a shipping address and returns an order id + tracking. The spec below treats it as a generic `POD` client.

### Print-ready asset
Before or during checkout, render a **print PDF** (bleed, crop marks, correct card dimensions and DPI ≥ 300) from the deck's cards. This is a second async job type (`render_print_pdf`). Keep the print renderer server-side and authoritative — never trust a client-rendered file for manufacturing.

### Flow
1. Client calls `POST /api/decks/:id/checkout` with shipping address.
2. Server creates an `orders` row (`status=pending`), creates a **Stripe Checkout Session**, returns its URL.
3. Client redirects to Stripe; user pays on Stripe-hosted page.
4. Stripe calls your **webhook**; on `checkout.session.completed` you mark the order `paid`, enqueue `render_print_pdf`, then submit the rendered PDF + address to the POD provider and store `pod_order_id`.
5. POD status updates (via their webhook or polling) advance the order through `in_production → shipped → delivered`, storing `tracking_url`.

### Endpoints
```
POST /api/decks/:id/checkout
  auth:    required (must own)
  body:    { shipTo: { name, line1, line2?, city, region, postal, country }, quantity }
  returns: 200 { checkoutUrl }     // Stripe-hosted checkout
  errors:  409 deck_not_ready (art still generating), 422 invalid_address

POST /api/webhooks/stripe
  auth:    Stripe signature verification (NOT user auth)
  body:    Stripe event
  returns: 200
  // handle checkout.session.completed, payment_intent.payment_failed, charge.refunded

GET  /api/orders
  auth:    required
  returns: 200 { orders:[{ id, deckId, status, amountCents, trackingUrl?, createdAt }] }

GET  /api/orders/:id
  auth:    required (must own)
  returns: 200 { order }

POST /api/webhooks/pod
  auth:    provider signature verification
  body:    provider status event
  returns: 200
  // advance status, store tracking_url
```

### Payment security requirements
- **Never trust client-sent prices.** Compute `amount_cents` server-side from deck size × unit price + shipping. The client's job is only to display it.
- **Verify the Stripe webhook signature** with the signing secret; reject unsigned/forged events. Order fulfillment must be driven by the webhook, not by the client returning from checkout (the client can lie or drop off).
- **Idempotency:** Stripe may deliver a webhook more than once; make `checkout.session.completed` handling idempotent on `stripe_session_id`.

---

## 9. Privacy, consent & legal (do not skip)

This product generates AI likenesses of real people from uploaded photos and sells a physical product. That carries real obligations:

- **Consent at upload.** The uploader must affirm they have permission from each person whose photo they upload. Capture this explicitly (a checkbox tied to the upload step) and log it. This matters most for the guest-of-honor and anyone not personally operating the app.
- **Biometric/likeness law.** Several jurisdictions (e.g. Illinois BIPA in the US, and GDPR for EU subjects) regulate biometric data and likenesses. Get legal review before launch; at minimum publish a privacy policy describing what you collect, why, how long you keep it, and how to request deletion.
- **Deletion.** Provide a real "delete my account & data" path that purges photos and generated art from object storage, not just the DB rows.
- **Theme/IP.** Themes are deliberately styled as *vibes* ("high-fantasy-ish") rather than named franchises. Keep generated art and copy clear of trademarked characters, logos, and names — both in prompts and in any marketing — to avoid IP claims on a commercial product.
- **Minors.** If photos of minors are foreseeable (e.g. weddings), decide a policy; the safest MVP stance is adults only, stated in terms of service.

---

## 10. Exact client changes (swap stubs → real API)

The current artifact already has the right *shape*; these are the concrete swaps. References are to the existing `SideQuest.jsx`.

1. **Auth gate.** Add a real sign-in screen calling `/api/auth/*`. Store the returned token (httpOnly cookie preferred). Replace the demo `user` state with `/api/auth/me`.

2. **Replace `window.storage` with the decks API.**
   - `loadDeckIndex` (on mount) → `GET /api/decks`.
   - `saveCurrentDeck` / `autoSave` → `POST /api/decks` (create draft) then the generate calls; persistence is now server-side, so drop the `deck:`/`deckIndex` storage keys entirely.
   - `openDeck(id)` → `GET /api/decks/:id`.
   - `deleteDeck(id)` → `DELETE /api/decks/:id`.

3. **Replace the direct Anthropic call.** `callClaude` / `generateDeckLore` → `POST /api/decks/:id/generate-lore`. Remove `api.anthropic.com` and the key from the client. Per-card → `.../regenerate-lore`.

4. **Replace `generateCardArt()` (the SVG stub).** Call `POST /api/decks/:id/generate-art`, then poll `GET /api/jobs/:jobId`, swapping each card's `art` to the returned `artUrl` as `artStatus` flips to `ready`. The staggered-flip reveal stays — it just keys off real job progress now. Per-card re-roll → `.../regenerate-art`.

5. **Replace the `alert()` order handler.** Add a shipping-address form, call `POST /api/decks/:id/checkout`, redirect to `checkoutUrl`. Add an "Orders" view backed by `GET /api/orders`.

6. **Remove demo-only crutches for production:** the "skip to a sample deck" shortcut and the wifi fallback deck are demo aids — gate them behind a dev flag or remove them in the real product.

---

## 11. Suggested build order

1. **Auth + decks API + DB.** Stand up Postgres, the `users`/`decks`/`participants`/`cards` tables, auth, and CRUD. Point the existing UI at it (replace `window.storage`). *Now it's a real multi-device product with login.*
2. **Move lore server-side.** Swap the direct Anthropic call for `/generate-lore`. Removes the exposed key. *Low risk, high security win.*
3. **Face-art (nano-banana) + job queue + object storage.** The highest-impact feature; do it once the data plumbing exists. *This is the "wow" that the whole product promises.*
4. **Checkout + fulfillment.** Stripe, print PDF renderer, POD integration. *Turns it into a business that takes money.*
5. **Privacy/consent + account deletion.** Land before any public launch.

---

*Companion to the Side Quest front-end MVP. Lore generation is genuinely live in the current client; the art engine and persistence described here are the stubs this spec replaces.*
