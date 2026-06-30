# BUILD.md — Side Quest Platform Build Instructions

**Audience:** Claude Code, working in this repository on the user's laptop.
**Purpose:** A single source of truth for building Side Quest from its current front-end MVP into a launchable two-sided platform. Read this in full before starting work. Then work one phase at a time, in order.

---

## 0. Read this section first

### What Side Quest is

Side Quest turns any real-world event (bachelor parties, group trips, house parties, drinking games, weddings, team offsites) into a playable card-game quest. The finished deck is printed and shipped as a physical product. The vision: *"turn any event into a playable event."*

Side Quest is a **two-sided platform**:

- **The build flow (B2C):** end users create custom decks starring their actual crew — each participant becomes a character card with AI-written lore and an AI-generated portrait, themed to a world they choose.
- **The marketplace (creator-driven):** independent creators publish decks and experiences other users can buy. Some are **fixed decks** (finished card art the buyer prints as-is — e.g. "Generic Bachelor Party in Vegas," "Office Holiday Party Pack"). Others are **template decks** (the creator designs the structure, theme, lore voice, and quest goal; the buyer fills in their crew with names and photos, and the platform generates personalized cards on top of the creator's template).

Both deck types coexist on the same marketplace and share the same physical-fulfillment pipeline.

### What you're working with right now

A Vite + React front-end MVP. One main component file, full clickable flow for the **build flow only** (no marketplace yet), theme-adaptive card styles, staggered card-flip reveal, live Claude lore generation, local deck persistence. Card art is a procedural placeholder. There is no backend, no real auth, no payments, no fulfillment, no creator system.

For the full current state, read `docs/PROJECT_CONTEXT.md`. For the backend design, read `docs/SideQuest_Backend_Spec.md`. For the payment/fulfillment flow, read `docs/SideQuest_Checkout_Flow.md`. **Those three documents are the authoritative reference for the build flow; this BUILD.md is the execution plan that uses them and extends them with the marketplace.** Where this doc and the spec docs diverge on marketplace specifics, this doc wins.

### How to work through this document

The build is divided into eight phases. Each phase has: a goal, prerequisites, the work to do, and an explicit **Definition of Done** that must hold before the next phase begins. Don't skip ahead — later phases depend on infrastructure earlier ones establish. If a phase reveals that an earlier decision needs revisiting, surface it to the user rather than silently improvising.

The marketplace is not bolted on at the end. It's threaded through phases 3 (creator role in data model), 4 (template-deck personalization), 6 (split payments via Stripe Connect), and 7 (legal/privacy for a marketplace). A dedicated Phase 5 builds the marketplace UI itself: discovery, listing, creator dashboard.

### Rules of engagement (apply to every phase)

1. **No secrets in client code, ever.** The current direct-to-Anthropic call from the browser is a demo crutch and must be removed in Phase 2. API keys live on the backend only.
2. **Server-computed money.** Prices, totals, creator-payout splits, and shipping are always computed on the server from authoritative data. The client displays; it never proposes.
3. **Idempotency on money paths.** Any operation that takes payment, splits to creators, or submits fulfillment must be idempotent — Stripe and POD providers retry, and your code must handle that without duplicating charges, payouts, or orders.
4. **Slow work is async.** Art generation and print-PDF rendering are background jobs the client polls. They do not block HTTP requests.
5. **Confirm before destructive or irreversible work** (deleting data, sending money, submitting print orders, paying out creators, mass-emailing users). Ask the user, don't assume.
6. **Match the existing style** unless asked to refactor. The current code uses inline styles and a single-component layout; preserve that approach when extending it, but feel free to split into multiple files as the codebase grows.
7. **When in doubt about a spec detail, the spec docs win over your assumptions.** When the spec docs themselves are silent or ambiguous, ask the user.
8. **Marketplace integrity matters.** Creator content is shown to other users; this is a content-moderation surface from day one. Don't ship a public marketplace without at least basic abuse handling (Phase 8).

---

## Phase 1 — Foundation: project hygiene, type safety, structure

**Goal:** Make the codebase comfortable to work in as it grows. Today everything is in one `.jsx` file; this is fine for an MVP but won't scale through seven more phases.

**Prerequisites:** Project runs locally (`npm run dev`).

**Do:**
1. Add **TypeScript**. Convert `src/SideQuest.jsx` and `src/main.jsx` to `.tsx`. Add a minimal `tsconfig.json` configured for React + Vite. Don't over-type: aim for ergonomic, not exhaustive — `any` is acceptable where the cost of precision exceeds the value.
2. Add **ESLint and Prettier** with sensible React + TypeScript defaults. Wire up `npm run lint` and `npm run format`.
3. **Split `SideQuest.tsx`** into a small set of modules: `components/` (reusable UI: GameCard, FloatingCards, Panel, Stepper, etc.), `lib/` (API-shaped helpers: `callClaude`, `generateCardArt`, `generateDeckLore`), `data/` (static content: EVENT_TYPES, THEMES, CARD_FRAMES, FALLBACK), `App.tsx` (top-level component with the routing/step state machine). One component per file.
4. Add a `README` section under "Development" covering: lint, format, type-check, build.

**Definition of Done:**
- `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck` all pass with no errors.
- The app behaves identically to before — same flow, same look, same behaviors. (Verify by clicking through landing → demo deck → flip cards.)
- No component file exceeds ~300 lines; no function exceeds ~80.
- `git status` is clean; commit the refactor as one or two well-described commits.

**Heads-up:** It's tempting to also add testing here. Don't — testing comes in Phase 8. Tests against a structure you're about to change in Phase 2 are throwaway work.

---

## Phase 2 — Move the Anthropic call server-side

**Goal:** Eliminate the exposed Anthropic key in the browser. Stand up a minimal backend whose only job today is proxying lore generation. This is the smallest possible "real backend" — it establishes the pattern everything else hangs off.

**Prerequisites:** Phase 1 complete.

**Do:**
1. Create a `server/` directory at the project root with its own `package.json`. Use **Node 20+ with TypeScript**, and either **Fastify** or **Express** (Fastify is the recommended default for built-in schema validation and lower overhead, but either is fine — confirm with the user if uncertain).
2. Implement two endpoints:
   - `POST /api/lore/generate` → body `{ eventType, theme, questPrompt, participants: [{ name }] }` → returns the same JSON shape the front end expects today.
   - `POST /api/lore/regenerate-card` → body `{ eventType, theme, questPrompt, card }` → returns one fresh card.
   Both call Anthropic server-side using `process.env.ANTHROPIC_API_KEY`. Copy the existing prompt verbatim so behavior doesn't change.
3. Add **input validation** (length caps on the prompt, participant count cap, theme/event from a fixed allow-list). Reject anything that doesn't match with 400. The server must not trust client input.
4. Add a **per-IP rate limit** on `/api/lore/*` (10/min in dev is fine). Anthropic calls cost money; an exposed endpoint without rate limiting is a way to get billed by a stranger.
5. Configure **CORS** to allow only the front-end's dev origin (`http://localhost:5173`) and, later, the production origin.
6. Add a `concurrently` setup so `npm run dev` from the root starts both the Vite front end and the API server (different ports). Document in README.
7. Update the front end: replace the two `callClaude`-shaped calls in `lib/claude.ts` with `fetch('/api/lore/generate')` and `fetch('/api/lore/regenerate-card')`. Configure Vite's dev proxy so `/api/*` from the front end routes to the API server. **Remove every trace of the Anthropic API key, the model string, and the `api.anthropic.com` URL from the front-end bundle** — grep to be sure.
8. Update `.env.example` to reflect the new key location.

**Definition of Done:**
- Generating a deck still works end to end from the UI.
- The browser network tab shows requests to `/api/lore/*`, not to `api.anthropic.com`.
- A search of the built front-end bundle (`dist/` after `npm run build`) for `ANTHROPIC` or `api.anthropic` returns nothing.
- Invalid requests (oversized prompt, unknown theme) return 400.
- Hitting `/api/lore/generate` 11 times in a minute from one IP returns 429 on the 11th.
- The fallback deck logic in the front end still works if the server is unreachable.

---

## Phase 3 — Database, accounts, creators, deck persistence

**Goal:** Replace the localStorage shim with real server-side persistence and real user accounts. **Crucially, build the user-and-creator model from day one** — adding a creator role later means a painful data migration. A user can be both a buyer and a creator on the same account; there's no separate "creator account."

**Prerequisites:** Phase 2 complete.

**Reference:** `docs/SideQuest_Backend_Spec.md` §§2–4 for the build-flow data model and endpoints. This phase extends that model with creator and marketplace fields.

**Do:**

### 3a. Database, accounts, and deck CRUD (build-flow parity)
1. Stand up **PostgreSQL** locally — recommend Docker Compose (`docker-compose.yml` with a `postgres:16` service). Fall back to Postgres.app (macOS) or the official installer if no Docker.
2. Add **Prisma** as the ORM. Create `schema.prisma` with the spec's `users`, `sessions`, `decks`, `participants`, `cards` tables. Run an initial migration.
3. Implement authentication. **Email + password** with argon2id hashing, plus **Google OAuth** as a second option. Issue **httpOnly secure SameSite=Lax cookies**. Use a vetted auth library (e.g. `lucia-auth`, `better-auth`) rather than rolling your own — confirm with the user first.
4. Implement the build-flow deck CRUD endpoints from spec §4. **Every `:id` route enforces ownership** — a user can only read or mutate their own decks. This is the single most important authorization rule.

### 3b. Creator model and marketplace data
5. Extend the schema to support creators:
   - `users` gets `creator_status` enum: `none` | `pending` | `approved` | `suspended`. Default `none`. (Promoting a user to creator is opt-in; they apply, you approve in Phase 5.)
   - `users` gets `stripe_connect_account_id` text nullable (populated in Phase 7).
   - New table `listings`:
     - `id`, `creator_id` (fk users), `slug` (URL-friendly), `title`, `description`, `cover_image_key`, `theme`, `event_type`, `kind` enum (`fixed` | `template`), `price_cents`, `currency`, `status` enum (`draft` | `published` | `unlisted` | `removed`), `created_at`, `updated_at`, `published_at`.
     - Editorial fields: `featured_at` nullable, `category` (browse facet), `tags` text[].
   - **Listing payload depends on kind:**
     - `kind='fixed'`: holds a complete pre-generated set of card lore + finished art keys + a pre-rendered print PDF key. Buying it copies the listing into a new buyer-owned `order` and goes straight to fulfillment (no personalization step).
     - `kind='template'`: holds the *structural* recipe — theme, lore voice/prompt skeleton, character archetypes (with rules for how participant data fills them), card-back design. Buying it opens a personalization flow where the buyer adds participants, and the platform generates final lore + art on top of the template before fulfillment.
   - Encode kind-specific payload as a `payload` jsonb column on `listings`, plus a `template_cards` table for structural archetypes when kind is `template` (parent fk to `listings`).
6. New table `purchases`, distinct from `orders`: when a user buys a listing, record the buyer→listing relationship and any personalization input separately from physical-fulfillment. This separates "what the user bought" from "what's being printed." Fields: `id`, `buyer_id`, `listing_id`, `kind` (snapshot of listing kind at purchase time), `personalization_data` jsonb nullable (the buyer's participants + uploads for template purchases), `deck_id` nullable (the resulting personalized deck for template purchases — null for fixed), `created_at`. Each `purchases` row links to exactly one `orders` row from Phase 7.
7. Add ownership-style authorization helpers that work for both `decks` and `listings`: `assertOwnsDeck(userId, deckId)` and `assertOwnsListing(userId, listingId)`. Same shape, same strictness.

### 3c. Front-end auth
8. Update the front end:
   - Add a sign-up / sign-in screen with both email and "Sign in with Google."
   - Replace `window.storage` (and the localStorage shim) entirely. Calls become real API calls.
   - Gate the build flow behind login; redirect signed-out users to the auth screen.
   - The "skip to a sample deck" demo link can stay, but it now creates a real draft deck on the server (logged-in users only).

**Definition of Done:**
- A new user can sign up, log in, build a deck, log out, log back in on a different browser, and see their deck.
- A user cannot access another user's deck by guessing its ID (verify with two test accounts).
- Passwords are stored as argon2id hashes; no plaintext anywhere in the DB.
- `docker compose up` (or the documented alternative) is the only setup step the user needs after `npm install`.
- The `listings` and `purchases` tables exist with the kind discriminator working correctly — verify by inserting one fixed and one template listing directly via Prisma Studio and confirming the shape.
- The localStorage shim in `src/main.tsx` is deleted (or only used as a transient cache, not the source of truth).

**Heads-up:** Resist the urge to build any creator-facing UI in this phase. We're just laying the data foundation so Phase 5 has somewhere to land. Building creator UI before the build-flow data plumbing is solid means rework.

---

## Phase 4 — Face-art via nano-banana, with template-deck support

**Goal:** Replace the procedural SVG placeholder with real AI portraits via Google Gemini 2.5 Flash Image. This is the feature most users will judge the product on — and it powers both the personal build flow AND the template-deck personalization path from the marketplace.

**Prerequisites:** Phase 3 complete.

**Reference:** `docs/SideQuest_Backend_Spec.md` §7 for endpoints and worker code sketch; `docs/SideQuest_Checkout_Flow.md` §2.3 for partial-failure handling.

**Do:**

### 4a. Storage and job queue
1. Add **object storage**. Local dev: MinIO in Docker (S3-compatible, free). Production: S3 or R2. Write all storage access through a thin `storage.ts` wrapper so swapping providers is trivial. Photos, generated art, listing covers, and print PDFs all live here.
2. **Photo upload via presigned URLs** per spec §5. The API issues a short-lived signed PUT URL; the browser uploads directly; the server records the resulting key. Limits: ≤8MB, jpeg/png only, strip EXIF on the server-side copy.
3. **Job queue**: BullMQ backed by Redis (also in Docker Compose). Job types: `generate_art`, `regenerate_card_art`, and (Phase 6) `render_print_pdf`.

### 4b. Deck state machine and art generation
4. Add `cards.art_key`, `cards.art_status` (`pending`/`generating`/`ready`/`failed`), and `decks.status` (`draft`/`lore_ready`/`rendering_art`/`art_partial_fail`/`art_ready`/...) per `docs/SideQuest_Checkout_Flow.md` §1. **Implement the state machine as a server-enforced rule**, not a convention.
5. Implement the endpoints from spec §7:
   - `POST /api/decks/:id/generate-art` → enqueues jobs, transitions deck to `rendering_art`.
   - `GET /api/jobs/:jobId` → status + per-card progress.
   - `POST /api/decks/:id/cards/:cardId/regenerate-art` → single-card re-roll.
6. Implement the **worker** that calls Gemini 2.5 Flash Image. Use the code sketch in spec §7 as a starting point but verify against current Google GenAI SDK docs — model IDs and method names drift. Prompt combines theme style + lore (title, type line) into a clear instruction. Save returned images to object storage; update `art_status`.
7. Concurrency: cap at 3 simultaneous Gemini calls per deck. 2–3 retries on transient failures. On final failure mark one card `failed` — never fail the whole deck.

### 4c. Template-deck personalization (the marketplace path)
8. Implement `POST /api/listings/:id/purchase` (the "buy this template" entry point). For `kind='template'` listings:
   - Validates the buyer is logged in.
   - Creates a `purchases` row with `personalization_data` empty initially.
   - Returns the buyer to a **personalization flow** that mirrors the build flow's "Cast" step: add participants (name + photo) to fill the template's archetypes.
   - On submit, the server creates a buyer-owned `decks` row whose theme/eventType/questPrompt are inherited from the listing, with `cards` pre-seeded from the listing's `template_cards` archetypes (lore voice baked in, character titles slotted to participant names).
   - Triggers the same `generate_art` job as the build flow — the buyer gets personalized art on top of the creator's template structure.
   - Links the resulting `decks.id` back to the `purchases` row.
9. For `kind='fixed'` listings, `POST /api/listings/:id/purchase` is simpler: no personalization, no art generation. It records the purchase and routes straight to Phase 7's checkout against the listing's pre-rendered print PDF. Surface this to buyers as a feature: fixed-deck buying is considerably faster and cheaper than custom.
10. Ownership rule: a deck created from a template purchase is owned by the **buyer**, not the creator. The creator can never read or modify it. The creator only sees aggregate sales analytics on the listing itself (Phase 5).

### 4d. Front-end
11. Reveal step: poll `/api/jobs/:jobId` every ~1 second, swap each card's art in as it flips to `ready`. Existing staggered-flip animation keys off real per-card state.
12. When the deck reaches `art_partial_fail`, show affected card(s) with a "regenerate" CTA. Order button stays disabled until `art_ready`.
13. Per-card "↻ Art" button calls the regenerate endpoint.

**Definition of Done:**
- An end-to-end build-flow run produces a deck with real Gemini-generated portraits, blended from uploaded photo + themed prompt.
- A template-listing purchase walks through personalization, generates art, and lands the buyer on the same `art_ready` deck experience as a fully custom build.
- A fixed-listing purchase skips art generation entirely and goes straight toward checkout (Phase 7).
- A deliberately-broken photo on one card marks only that card `failed`; the rest succeed; the buyer can re-roll the failed one.
- Without re-rolling the failed card, the Order button stays disabled.
- Generated art and uploaded photos are in object storage, not Postgres.

**Heads-up — validate Gemini quality first.** Before building all the worker plumbing, run 5–10 real bachelor-party photos through Gemini manually (Google AI Studio is fine) with the prompts you plan to use. If the output doesn't look good enough to charge for, the rest of the platform doesn't matter. Surface this to the user before sinking time into worker code.

**Heads-up — template lore consistency.** Template-deck personalization needs care: the creator's voice and the platform's per-card lore generation must compose well. Recommend an approach where the template's `template_cards` provide a *partial* card (theme, archetype, ability template with placeholders for the participant's name and one detail), and Phase 2's lore endpoint fills in the personalized bits. Validate this with one real template before generalizing.

---

## Phase 5 — Marketplace surface: discovery, listings, creator dashboard

**Goal:** The marketplace's user-facing surface. Buyers can browse, search, and purchase deck listings. Creators can apply, manage their listings, and see their dashboard. Payment doesn't actually flow yet — that's Phase 7.

**Prerequisites:** Phase 4 complete.

**Do:**

### 5a. Discovery (buyer side)
1. Add a `/marketplace` route with discovery: search by keyword, filter by event type, theme, and kind (fixed vs. template), sort by newest / popular / featured. Use the existing visual language — theme swatches, card-style preview tiles.
2. Add a `/marketplace/:slug` listing detail page: cover image, description, sample cards (the creator's preview), price, creator profile snippet, clear "Buy" CTA that branches on kind:
   - **Fixed** → straight to checkout (Phase 7).
   - **Template** → into the personalization flow built in Phase 4.
3. Add a creator profile page at `/creator/:handle`: their published listings + a short bio.
4. Add the marketplace entry point to the main app: a new top-level nav choice on the landing alongside "Build your deck" — something like **"Browse experiences."** Buyers can do both.

### 5b. Creator dashboard
5. Add `/studio` (working title — confirm naming) as the creator-side route, accessible only to users with `creator_status='approved'`.
6. Implement creator onboarding: non-creator user clicks "Become a creator" from their account menu → fills a short form (display name, bio, sample work) → submits → status becomes `pending` until you (the operator) approve them in admin. **Approval is manual in this phase** — a marketplace's quality bar in its first 100 listings sets its long-term reputation. Automated open signup comes later.
7. Implement the listing editor — this is the meat of the creator side. It supports both kinds:
   - Common fields: title, description, cover image, theme, event type, category, tags, price.
   - For `kind='fixed'`: an upload flow for the complete deck the creator built externally (or a "Use the build flow to make this listing" path — the creator builds a deck themselves and then promotes it to a listing).
   - For `kind='template'`: a structured editor for character archetypes — for each archetype, the creator writes the title pattern, type-line pattern, ability template (with placeholders like `{name}` or `{personal_detail}`), flavor template, and visual frame. The creator sets `min_participants` and `max_participants`. They can preview what a buyer will see by entering test participant data.
8. Listing lifecycle endpoints:
   - `POST /api/listings` (create draft)
   - `PATCH /api/listings/:id` (update; only when status is `draft`)
   - `POST /api/listings/:id/publish` (transition `draft → published`; requires creator approval AND completed Stripe Connect onboarding from Phase 7 — until then publishing is blocked)
   - `POST /api/listings/:id/unlist` (`published → unlisted`; doesn't delete, just hides)
   - `GET /api/me/listings` (creator's own listings)
   - `GET /api/listings` (public, with search/filter)

### 5c. Admin surface
9. Build a minimal admin panel (`/admin`, accessible only to users with an `is_admin` boolean — set manually in DB initially):
   - Pending creator applications: approve / reject.
   - All listings: ability to remove a listing that violates policy (sets status to `removed`).
   - Recent purchases: read-only.
   Defer richer admin tooling — moderation queues, automated flags — until you actually have volume.

**Definition of Done:**
- A user can apply to be a creator, get approved (via admin), and reach `/studio`.
- A creator can draft and edit a fixed listing and a template listing. Both can be previewed before publishing.
- Publishing is blocked with a clear error if the creator hasn't completed Stripe Connect onboarding (which they can't yet, until Phase 7 — confirm the block is correctly in place).
- Once published, a listing appears in `/marketplace`, and the corresponding detail page renders correctly for both kinds.
- A buyer can purchase a listing — the request flows through `POST /api/listings/:id/purchase`, creates a `purchases` row, and routes to the right next step per kind (Phase 4 personalization, or directly to Phase 7 checkout once that's built). For now, payment is stubbed; the goal is the data flow.
- An admin can remove a listing. Buyers who already purchased it keep their derived deck/order (their data is theirs).

**Heads-up — manual approval is a feature, not a bug.** Resist building automated creator approval here. The first 50 creators set the marketplace's tone; vet them by hand. Automate when you have a backlog you can't handle.

**Heads-up — slugs.** Listing slugs are public URLs. Validate: lowercase, alphanumeric + hyphens, no profanity (small wordlist check is plenty for this phase), uniqueness enforced. Reserve a list of system slugs (`admin`, `studio`, `marketplace`, `api`, etc.) creators can't claim.

---

## Phase 6 — Print-PDF rendering

**Goal:** Generate the print-ready PDF that the print-on-demand provider will print from. For build-flow decks and template-deck purchases, the PDF is rendered after art completes. For fixed-deck listings, the PDF was rendered once by the creator at publish time and is reused for every purchase.

**Prerequisites:** Phase 5 complete.

**Reference:** `docs/SideQuest_Checkout_Flow.md` §3 (the print-ready asset — POD providers download from URLs, so the PDF must live at a signed URL before checkout, not be uploaded inline).

**Do:**
1. Add a job type `render_print_pdf`. Triggered automatically:
   - When a build-flow or template-purchase deck enters `art_ready` (eager rendering surfaces problems before payment).
   - When a creator publishes a fixed listing (the PDF is bound to the listing and stored on `listings.print_pdf_key`, reused for every buyer).
2. Implement the renderer. Recommend [`pdf-lib`](https://pdf-lib.js.org) — the standard pure-JS PDF library. Each card composed at:
   - **2.5" × 3.5"** trim (poker size, standard for custom card decks)
   - **300+ DPI** for raster content
   - **~3mm bleed** all sides (verify exact requirement against chosen POD provider's template)
   - safe text margins inside the trim line
3. Match the POD provider's downloadable template exactly. Don't invent a layout. Card back matches the deck's theme.
4. On success: upload PDF to object storage; record the appropriate key (`decks.print_pdf_key` for build/template, `listings.print_pdf_key` for fixed). On failure: keep the deck/listing flagged internally — do NOT advance to a state that allows checkout/publish.
5. **Fixed-listing flow specifics:** when a creator publishes a fixed listing, the render must succeed before status flips to `published`. If it fails, the listing stays in `draft` with an internal error visible to the creator.

**Definition of Done:**
- A build-flow deck produces a print PDF automatically as art completes.
- A template-deck purchase produces a print PDF after personalization.
- A creator publishing a fixed listing produces a print PDF, and the same PDF is served to every buyer of that listing (verify by inspecting two purchase orders — they should reference the same `print_pdf_key`).
- PDFs open cleanly in Preview/Acrobat at the right dimensions; art is sharp; bleed visibly extends past the trim line.
- A deck or listing whose PDF rendering fails does not allow checkout or publish respectively.
- You've **printed at least one test deck** with the chosen POD provider's sandbox (or paid for one sample). A 1–2mm bleed error is the difference between a clean deck and white slivers on every card edge — you only catch it on physical samples. Do not skip this.

---

## Phase 7 — Checkout, payment, fulfillment, and creator payouts

**Goal:** Take real money, ship real decks, and pay creators their share of marketplace sales automatically.

**Prerequisites:** Phase 6 complete. You also need: a Stripe account in test mode (with **Stripe Connect** enabled — this is separate from regular Stripe), a print-on-demand account (recommend Prodigi sandbox; sample physical quality from both Prodigi and QPMN before going live).

**Reference:** `docs/SideQuest_Checkout_Flow.md` §§4–6. The full Stripe webhook handler is written out; copy its structure. This phase extends that flow with marketplace split payments.

**The unified checkout principle:** every order goes through the same checkout regardless of source (build-flow / template-deck purchase / fixed-deck purchase). The differences are: which print PDF to fetch, and whether to split the payment to a creator.

**Do:**

### 7a. Stripe Connect Express for creators
1. Implement creator Stripe Connect onboarding. From `/studio`, an approved creator clicks "Set up payouts" → server creates a Stripe Connect Express account → user redirected to Stripe's hosted onboarding (Stripe collects ID, tax info, bank details — you never see them) → on completion, Stripe redirects back and the webhook captures `account.updated` to store `users.stripe_connect_account_id` and a `creator_payouts_enabled` boolean.
2. Block listing publish until `creator_payouts_enabled = true`. Phase 5 had this gate; verify it's enforced now that Stripe is real.

### 7b. Unified checkout
3. Implement `POST /api/checkout` per flow §C2, accepting either `{ deckId, ... }` (build-flow or template-personalized deck) or `{ purchaseId, ... }` (fixed-listing purchase that has no deck). Body also has shipping address and quantity.
4. **The server computes the price**:
   - **Base cost** = POD provider quote (via their Quote endpoint) for SKU + destination.
   - **Markup** = Side Quest's margin (configurable).
   - **Creator share** (marketplace orders only) = a configured percentage of (price − POD base cost), e.g. 50%. The exact percentage is a business decision — confirm with the user. The platform always covers POD cost first.
   - Total = base + markup; client never sends a price.
5. Create an `orders` row, `status='pending'`, with computed amounts AND a `creator_id` + `creator_payout_cents` if applicable (null for pure build-flow orders).
6. Create a **Stripe Checkout Session**:
   - For build-flow / non-marketplace orders: a regular Stripe Checkout session.
   - For marketplace orders: use Stripe's **destination charges** with `payment_intent_data.transfer_data.destination = creator.stripe_connect_account_id` and `transfer_data.amount = creator_payout_cents`. This atomically routes the creator's share to their Connect account on payment success — no separate payout step, no monthly reconciliation, no holding creator money on your books.
7. `client_reference_id = order.id`. Idempotency key from order id. Return `checkoutUrl`. Deck (or purchase) transitions to `order_pending`.

### 7c. The webhook is the source of truth
8. Implement `POST /api/webhooks/stripe` exactly as written in flow §C3 — and extend it for Connect events:
   - `checkout.session.completed` → order paid, deck `order_paid`, enqueue `submit_to_pod`. The destination charge automatically credited the creator.
   - `payment_intent.payment_failed` / `checkout.session.expired` → cancel order, release the deck/listing.
   - `charge.refunded` → handle refunds. For marketplace orders, a refund automatically reverses the creator transfer if it was a destination charge — but you must still update the order record. Notify the creator.
   - `account.updated` (Connect) → update creator's `creator_payouts_enabled`.
9. **The three non-negotiables** from the spec:
   - Verify signature against the **raw** body (not parsed JSON).
   - Guard idempotency on `order.status === 'pending'` so duplicate deliveries are no-ops.
   - Return 200 immediately; enqueue POD submission as a job rather than calling POD provider inline.
10. The browser return from Stripe is cosmetic — the success page polls `GET /api/orders/:id` and shows "Payment received" once the webhook has marked the order paid.

### 7d. Fulfillment
11. Implement the POD submission job per flow §D1. Idempotency-Key on the POD call. Submit print PDF as an asset URL (signed, 7+ day expiry) plus shipping address. On final failure after retries, flag for manual review and alert the user — never silently drop a paid order.
12. Implement order status tracking. POD webhook (preferred) or periodic poll. Advance `in_production → shipped → delivered`. Store `tracking_url`.

### 7e. Creator visibility
13. Extend `/studio` with a sales dashboard: per-listing sales count, gross revenue, creator's net (already paid out by Stripe), refunds. Pull from `orders` rows — Stripe's Connect dashboard is the authoritative payout view, yours is the analytics view.

### 7f. Front-end
14. Shipping-address form on the checkout step.
15. Buyer's "Orders" view with past orders, status, tracking, and (for marketplace orders) the creator's name.
16. Email notifications for paid / shipped / delivered.

**Definition of Done:**
- A test purchase of a build-flow deck flows: address → Stripe Checkout (4242...) → webhook fires → order paid → POD submission → Prodigi sandbox shows a real (test-money) order.
- A test purchase of a marketplace listing flows the same way, AND the test creator's Stripe Connect account shows a pending transfer for their share.
- A refund correctly reverses the creator's transfer (verify in Stripe Connect dashboard).
- Replaying the same webhook event manually (Stripe CLI: `stripe events resend`) does NOT duplicate the POD order, the payment, or the creator transfer.
- Killing the server during the webhook and replaying still results in exactly one fulfilled order and one creator transfer.
- A creator can complete Stripe Connect Express onboarding from `/studio` and the `creator_payouts_enabled` flag flips to true.
- A creator who hasn't onboarded cannot publish a listing.

**Heads-up — Stripe Connect has real legal weight.** You become a Marketplace under Stripe's terms when you implement Connect with destination charges, which means you must publish a Marketplace policy, have a clear dispute process, and meet Stripe's marketplace requirements. Do not skip Phase 8 before going live.

**Heads-up — Connect Express vs Standard.** Use **Express**. Standard puts the full Stripe dashboard in the creator's hands; Express is hosted by Stripe and minimal — much better for small creators. Confirm with the user if they want a different model.

---

## Phase 8 — Privacy, consent, content moderation, polish, observability

**Goal:** Make the platform launchable to real users without legal or operational risk. A marketplace amplifies every category of risk a single-user product has — content moderation, IP, payouts to people you've never met — so this phase is bigger than it would be for a pure D2C product.

**Prerequisites:** Phase 7 complete.

**Reference:** `docs/SideQuest_Backend_Spec.md` §9.

**Do:**

### 8a. Likeness consent (build-flow side)
1. **Consent at upload.** The uploader must affirm they have permission from each person whose photo they upload. Capture as a checkbox tied to the upload step; log to an immutable `consents` table (user, timestamp, IP, listing_id or deck_id). Single most important compliance item — the product makes AI likenesses of real people.

### 8b. Marketplace content moderation
2. **Creator agreement.** Before approval (Phase 5's manual approval), creators sign a creator agreement covering: original work only / they own or license what they upload, no real-person likenesses without consent (including in template `template_cards`), no copyrighted franchise IP, no hate speech / sexual content / harassment. Log acceptance immutably.
3. **Report flow.** Every listing detail page has a "Report" link. Reports route to admin queue. Threshold (e.g. 3 reports) auto-unlists pending review.
4. **Takedown and DMCA.** Document a takedown procedure for IP claims and put a contact address on the site footer. This is a legal requirement for a hosting platform under DMCA safe-harbor.
5. **Listing review on publish.** For Phase 8, every published listing goes through admin review before going public. Automate later when you have a strong pattern.

### 8c. Legal documents
6. **Privacy Policy, Terms of Service, and Creator Agreement.** Engage a lawyer; do not draft these yourself. Mention BIPA (Illinois), GDPR (EU users), CCPA. State: what's collected, why, retention period, deletion process, third parties (Anthropic, Google, Stripe, POD), marketplace mechanics, creator payment terms.
7. **Account & data deletion.** `DELETE /api/auth/me` that hard-deletes user account, all decks, all participant photos, all generated art (from object storage), order PII beyond legal retention. For creators: their listings are unlisted (not deleted — buyers retain ordered copies), Stripe Connect account disconnected via API. Confirmation flow with re-entered password.
8. **Minors policy.** Decide and document: adults only? Safest MVP stance is adults only, stated in ToS, consent checkbox affirming all subjects are 18+.

### 8d. Observability and operational readiness
9. Structured logging (pino or similar), error tracking (Sentry free tier is fine), basic metrics on critical paths: signups, deck generations, orders, webhook failures, marketplace purchases, creator payouts, listing reports.
10. **Tests.** Write tests for things that, if broken, lose money or leak data:
    - Stripe webhook handler (including Connect events and idempotency).
    - Deck and listing ownership checks.
    - Price computation including creator share.
    - POD submission idempotency.
    - Listing kind discriminator routing (fixed vs. template).
    Aim for confidence on critical paths rather than blanket coverage.
11. **Demo-only crutches gone.** Remove or feature-flag the "skip to a sample deck" link and the offline fallback deck.
12. **Deployment runbook.** Document deploying front end (Vercel or Cloudflare Pages — both work with Vite), API (Railway / Fly.io / Render), database (managed Postgres), object storage (R2 or S3), Redis. Production env vars. Stripe Connect production-readiness checklist.

**Definition of Done:**
- A user can sign up, build a deck, order it, and later delete their account, with all photos and generated art actually gone from object storage.
- A creator can apply, get approved, onboard with Stripe, publish a listing, get a sale, see the payout, get a report, have the listing reviewed, and (separately) delete their own account — and a buyer's purchased deck and order survive that creator deletion.
- Privacy policy, ToS, and Creator Agreement are linked from the landing, signup, and creator-onboarding screens.
- A staging deployment exists and the full flow works on real infrastructure with Stripe Connect in test mode.
- Critical-path tests pass in CI.
- You have a launch-day runbook.

---

## After Phase 8

You have a launchable two-sided platform. From here, work shifts to operate-and-grow: analytics, marketing surface, referral/sharing, B2B (wedding planners, event agencies, corporate offsites), creator tools (analytics, audience growth, paid promotion of listings), additional event types and themes, the mobile app. That's a different document.

---

## Appendix A — Decisions still open

Flagged in the specs but not yet resolved. Ask the user before Phase 2 starts:

- **Backend language/framework.** Recommended default: Node.js 20+ with TypeScript and Fastify. Alternative: Python with FastAPI.
- **Session strategy.** Recommended default: httpOnly cookies via a vetted auth library. Alternative: JWT with refresh tokens.
- **POD provider.** Recommended path: prototype on Prodigi sandbox (clean REST API), but order physical samples from both Prodigi and QPMN before committing — card stock and tuck box quality is the product.
- **Image-gen model version.** Verify `gemini-2.5-flash-image` is the current production identifier when Phase 4 begins. Google's model names drift.
- **Creator revenue share percentage.** Recommended default: creator gets 50% of (price − POD cost), platform keeps 50%. This is a real business decision — confirm with the user. Many comparable marketplaces use 70% to creator on digital goods and lower (30–50%) on physical because of fulfillment overhead; Side Quest is physical.
- **Whether fixed-deck listings can include AI-generated art created by the creator inside Side Quest.** Recommended default: yes, but the creator agreement makes clear that AI-art generated through Side Quest's tools for use in listings is licensed back to Side Quest in perpetuity for fulfillment purposes. This protects against a creator removing their account and breaking ongoing fulfillment of buyers' decks.

## Appendix B — Things to NOT do

- **Don't put any API key in the front end**, ever. Including in `.env` files the front end reads. `vite` will inline anything prefixed `VITE_*` into the built bundle.
- **Don't trust client-sent prices or creator-share splits.** Always recompute server-side.
- **Don't fulfill orders on the browser return from Stripe.** The webhook is the source of truth.
- **Don't render the print PDF on the client.** Authoritative print assets are server-only.
- **Don't use named franchise IP** ("Lord of the Rings", "Star Wars") in themes, prompts, or generated content. The "high-fantasy-ish" framing is deliberate; preserve it. Same rule applies to creator content — enforce in moderation.
- **Don't skip the consent flow.** 30-minute build and the only thing standing between you and a serious problem if someone's photo is used without permission.
- **Don't pay creators by hand each month.** Use Stripe Connect destination charges from day one. Hand-payouts create tax, reconciliation, and trust problems that compound quickly.
- **Don't auto-approve creators.** The first 50 set the marketplace's tone; manual approval is a feature.
- **Don't write tests in Phase 1.** Write them in Phase 8 against the stable shape.
- **Don't let a creator's account deletion break a buyer's order.** Buyer's purchased decks and orders persist past creator deletion; only the listing is unlisted.

## Appendix C — When to ask the user

Ask, don't guess, when:

- A spec **DECISION** marker has no obvious right answer.
- A phase's Definition of Done can't be met as written and you'd need to relax it.
- You hit a third-party API limit, refusal, or unexpected behavior that affects the design.
- You're about to do something irreversible: deleting data, taking real money, paying out creators, submitting a real print order, deploying to production, sending mass email.
- The work in front of you is taking substantially longer than the phase scope suggests (more than ~2× rough estimate) — usually the design needs to change rather than the work to push harder.
- A creator-facing decision could materially affect a creator's livelihood (changing payout percentages, suspension policies, listing removal criteria) — these always go through the user.

When asking, propose an answer with your reasoning rather than asking open-endedly. *"I'd default to X because Y — is that right, or do you want Z?"* beats *"What should I do?"*
