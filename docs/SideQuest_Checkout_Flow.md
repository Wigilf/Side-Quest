# Side Quest — Clean Flow: Generation → Checkout → Fulfillment

**Companion to the Side Quest Backend Spec.** That document defined *what* the pieces are. This one makes the *path between them* airtight: the exact deck state at every moment, what blocks progress, what happens on partial failure, and the complete Stripe + print-on-demand sequence with no hand-waving. If the spec is the map, this is the turn-by-turn directions.

The guiding idea: **a deck moves through a strict state machine, and checkout is only reachable from one state.** No "order" button is ever live while art is still rendering or a card has failed. That single rule removes most of the ways a real order can go wrong.

---

## 1. The deck state machine

Every deck is always in exactly one `status`. Transitions are server-controlled; the client only *requests* transitions and reflects the result.

```
  draft ──generate-lore──▶ lore_ready ──generate-art──▶ rendering_art
                                                              │
                          ┌───────────────────────────────────┤
                          ▼                                     ▼
                    art_partial_fail                        art_ready
                          │  (user re-rolls failed cards)       │
                          └──────────────▶ art_ready ◀──────────┘
                                              │
                                          checkout
                                              ▼
                                       order_pending
                                              │ (Stripe webhook: paid)
                                              ▼
                                          order_paid ──▶ in_production ──▶ shipped ──▶ delivered
```

| status | meaning | what the UI shows | can checkout? |
|---|---|---|---|
| `draft` | created, no lore yet | the build wizard | no |
| `lore_ready` | all cards have lore, no art | cards with art placeholders | no |
| `rendering_art` | art jobs running | staggered reveal + progress | no |
| `art_partial_fail` | ≥1 card art failed | failed cards flagged, re-roll prompt | **no** |
| `art_ready` | every card has `art_status=ready` | finished deck, **Order enabled** | **yes** |
| `order_pending` | checkout session open, unpaid | "completing your order…" | locked |
| `order_paid` → … | paid, in fulfillment | order tracking view | locked |

**The hard gate:** checkout is reachable **only** from `art_ready`. The server enforces this — `POST /checkout` returns `409 deck_not_ready` from any other state, regardless of what the client thinks. This is the one rule that keeps a half-finished deck from ever being printed.

---

## 2. Stage A — Generation, cleanly

### A1. Create the draft
`POST /api/decks` with event type, theme, quest prompt, and participant names creates a `draft` deck and its `participants` rows. Photos upload separately (presigned URLs, per the spec's §5) and attach to participants. Nothing is generated yet.

### A2. Lore (fast, can be synchronous)
`POST /api/decks/:id/generate-lore` runs the Claude prompt server-side, writes one `cards` row per participant, and moves the deck `draft → lore_ready`. If Claude returns malformed JSON, retry once with a stricter instruction; if it still fails, stay in `draft` and return `502 lore_failed` so the client can offer "try again." **The deck never lands in a half-lore state** — either all cards get lore or none do (write them in a single transaction).

### A3. Art (slow, always asynchronous)
`POST /api/decks/:id/generate-art` moves the deck `lore_ready → rendering_art`, sets every card `art_status=pending`, and enqueues work. A worker processes cards with a concurrency cap (e.g. 3 at once), and for each:

1. set `art_status=generating`
2. call nano-banana (Gemini 2.5 Flash Image) with the participant photo + themed prompt
3. on success: store the image in object storage, set `art_key` + `art_status=ready`, bump job progress
4. on failure after retries: set `art_status=failed` (do **not** fail the whole deck)

When the last card settles, the server sets the deck status:
- all `ready` → `art_ready`
- any `failed` → `art_partial_fail`

The client polls `GET /api/jobs/:jobId` and reveals each card as its art flips to `ready` — the existing staggered-flip animation now keys off real progress.

### A4. Handling partial failure cleanly
`art_partial_fail` is a normal, expected state, not an error screen. The UI flags the failed card(s) and offers "re-roll" (`POST /.../cards/:cardId/regenerate-art`). Each successful re-roll re-evaluates the deck: once no card is `failed`, status auto-advances to `art_ready` and the Order button lights up. **The user is never stuck** — a permanently problematic photo can be swapped and re-generated.

> **Why this matters for "clean":** the most common real-world mess is "I paid and one card was blank." Gating checkout behind `art_ready` and treating partial failure as a first-class state makes that mess structurally impossible.

---

## 3. Stage B — Pre-checkout: the print-ready asset

This is the seam most specs skip. **Print-on-demand providers print from a URL they download — not from a file you POST inline.** (Prodigi, for example, downloads each asset from a public or signed URL at order-creation time and retains it ~30 days.) So the print asset must exist at a stable signed URL *before* you submit the order.

### B1. Render the print PDF
When a deck first reaches `art_ready`, enqueue a `render_print_pdf` job (or render lazily at checkout — but eager is cleaner because it surfaces rendering problems before the user is paying). The renderer, server-side and authoritative:

- composes each card at the **physical card spec**: poker size 2.5" × 3.5", **≥300 DPI**, with **bleed** (typically 2–3mm beyond the cut line) and a safe margin for text
- lays out front art + the card-back design per the provider's template
- outputs a single print-ready **PDF** (PDFs are printed at exact received size — no provider resizing — so dimensions must be correct)
- uploads it to object storage and records `deck.print_pdf_key`

Match the layout to your chosen provider's downloadable template exactly. A 1–2mm bleed error is the difference between a clean deck and white slivers on every card edge.

### B2. Validate before money changes hands
Before enabling checkout, confirm: every card `art_status=ready`, the print PDF rendered without error, and card count is within the provider's deck size. Only then is the deck truly `art_ready`. If PDF rendering fails, keep the deck in `rendering_art` with an internal flag and alert — never show a live Order button over a deck that can't actually be printed.

---

## 4. Stage C — Checkout (Stripe), step by step

The flow uses **Stripe Checkout** (hosted page — least PCI burden) and is driven to completion by the **webhook**, never by the browser returning from Stripe.

### C1. Price on the server, always
The client sends only the deck id, shipping address, and quantity. The server computes the price:

```
amount_cents = base_deck_price
             + (quantity - 1) * additional_deck_price
             + shipping_for(country, quantity)
```

**Get the shipping/product cost from the POD provider's Quote endpoint** (Prodigi exposes one that takes SKU + destination and returns a price breakdown without creating an order). This keeps your retail price honest against real fulfillment cost and avoids margin surprises. The client never sends a price.

### C2. Create the order + Stripe session
`POST /api/decks/:id/checkout`:

1. assert deck is `art_ready` (else `409 deck_not_ready`)
2. validate the shipping address (and `422 invalid_address` if malformed)
3. create an `orders` row, `status=pending`, with the computed `amount_cents` and `ship_to`
4. create a Stripe Checkout Session with that amount, `client_reference_id = order.id`, success/cancel URLs, and an idempotency key derived from the order id
5. move the deck `art_ready → order_pending`
6. return `{ checkoutUrl }`

The client redirects to `checkoutUrl`. The user pays on Stripe's page.

### C3. The webhook is the source of truth
Stripe calls `POST /api/webhooks/stripe`. This handler — not the browser — fulfills the order:

```javascript
// POST /api/webhooks/stripe  (raw body required for signature verification)
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function stripeWebhook(req, res) {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    // MUST use the raw, unparsed body here
    event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`signature verification failed: ${err.message}`);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const orderId = session.client_reference_id;

      // Idempotency: this event can arrive more than once.
      const order = await db.orders.findById(orderId);
      if (!order || order.status !== "pending") break;   // already handled → no-op

      await db.orders.update(orderId, {
        status: "paid",
        stripe_payment_intent: session.payment_intent,
      });
      await db.decks.update(order.deck_id, { status: "order_paid" });

      // Hand off to fulfillment — but do it via a queued job, NOT inline,
      // so a slow POD call can never make us return non-200 to Stripe.
      await jobs.enqueue("submit_to_pod", { orderId });
      break;
    }
    case "checkout.session.expired":
    case "payment_intent.payment_failed": {
      const session = event.data.object;
      const orderId = session.client_reference_id;
      const order = await db.orders.findById(orderId);
      if (order && order.status === "pending") {
        await db.orders.update(orderId, { status: "cancelled" });
        // Release the deck so the user can try again.
        await db.decks.update(order.deck_id, { status: "art_ready" });
      }
      break;
    }
    case "charge.refunded": {
      // mark order refunded; optionally notify fulfillment if not yet produced
      break;
    }
  }

  res.status(200).json({ received: true });   // always 200 once verified
}
```

Three non-negotiables in that handler, each closing a real failure mode:

1. **Verify the signature against the raw body.** Parsed JSON breaks verification; an unverified webhook lets anyone forge a "paid" event and get free decks.
2. **Idempotency via a status check.** Stripe retries deliveries. Guarding on `order.status === "pending"` makes double-delivery a harmless no-op — no double POD orders, no double charges.
3. **Return 200 fast; do slow work in a queued job.** If you call the POD provider inline and it's slow or down, Stripe sees a timeout, marks the webhook failed, and retries — re-triggering everything. Enqueue `submit_to_pod` and return 200 immediately.

### C4. The browser return is cosmetic
When Stripe redirects the user to your `success_url`, **do not fulfill there** — the user may close the tab, lose connection, or the redirect may race the webhook. The success page simply polls `GET /api/orders/:id` and shows "Payment received — your deck is being prepared" once the webhook has flipped the status. The browser confirms; the webhook decides.

---

## 5. Stage D — Fulfillment handoff

The `submit_to_pod` job (triggered by the webhook) submits the real print order.

### D1. Submit to the POD provider
With the print PDF already at a signed URL (Stage B) and a Quote already validated (C1), submission is one call. Prodigi shape:

```javascript
// jobs/submit_to_pod.js  — server-side worker
const order = await db.orders.findById(orderId);
const deck  = await db.decks.findById(order.deck_id);
const assetUrl = await storage.signedUrl(deck.print_pdf_key, { expiresIn: "7d" });

const resp = await fetch(`${PRODIGI_BASE}/v4.0/Orders`, {
  method: "POST",
  headers: { "X-API-Key": process.env.PRODIGI_API_KEY, "Content-Type": "application/json",
             "Idempotency-Key": `sidequest-order-${order.id}` },  // dedupe reprints
  body: JSON.stringify({
    shippingMethod: shippingMethodFor(order),         // e.g. "Standard"
    recipient: {
      name: order.ship_to.name,
      email: order.ship_to.email,
      address: {
        line1: order.ship_to.line1, line2: order.ship_to.line2 ?? "",
        townOrCity: order.ship_to.city, stateOrCounty: order.ship_to.region,
        postalOrZipCode: order.ship_to.postal, countryCode: order.ship_to.country,
      },
    },
    items: [{
      sku: PLAYING_CARDS_SKU,            // the provider's card-deck SKU
      copies: order.quantity,
      sizing: "fillPrintArea",
      assets: [{ printArea: "default", url: assetUrl }],
    }],
  }),
});

if (!resp.ok) {
  // do NOT mark fulfilled; leave ret_count++ and let the queue retry with backoff.
  // After N attempts, flag for manual review + alert ops. Never silently drop a paid order.
  throw new Error(`POD submit failed: ${resp.status}`);
}
const pod = await resp.json();
await db.orders.update(orderId, { status: "in_production", pod_order_id: pod.order.id });
```

Notes that keep this clean:
- **Idempotency key on the POD call too** — a job retry must not create a second physical order. (Prodigi dedupes on `Idempotency-Key`, not on your reference, precisely because reprints reuse references.)
- **A paid order is sacred.** If POD submission keeps failing, it goes to manual review with an alert — it is never dropped. The customer paid; the deck ships even if a human has to push it.

### D2. Track to delivery
Advance status from POD updates — via their webhook if offered, else a periodic poll of order status — storing `tracking_url` and moving `in_production → shipped → delivered`. The customer's order view (`GET /api/orders/:id`) reflects each step.

---

## 6. End-to-end happy path (one glance)

1. User builds deck → `POST /decks` → **draft**
2. Generate lore → **lore_ready**
3. Generate art (async, polled, staggered reveal) → **art_ready**
4. Server renders print PDF to signed URL (eager, on entering art_ready)
5. User clicks Order (only now enabled) → address form
6. `POST /checkout`: server prices via POD Quote, creates order + Stripe session → **order_pending**
7. User pays on Stripe → browser returns to a polling success page
8. Stripe webhook (verified, idempotent) → order **paid**, deck **order_paid**, enqueue `submit_to_pod`, return 200
9. `submit_to_pod` posts PDF URL + address to POD (idempotent) → **in_production**
10. POD ships → tracking stored → **shipped → delivered**

Every slow step is async; every money/fulfillment step is idempotent; checkout is gated on a fully-rendered deck. That's what "clean" means here.

---

## 7. Provider recommendation

For the card-printing specifically, two realistic paths:

- **Prodigi** — clean, well-documented REST print API (single-step `POST /v4.0/Orders`, a Quote endpoint for honest pricing, sandbox environment, white-label shipping, asset-by-URL with 30-day retention, idempotency keys). Strong default if their playing-card SKU and stock quality meet your bar. Good fit for the flow above with minimal glue.
- **QPMN (QP Market Network)** — a card/TCG *specialist* (poker decks, tuck boxes, 300–350gsm stock, foil/holo finishes, zero minimums, white-label, REST API). More tailored to premium card decks specifically; worth a direct quote and an API-doc review since their integration is often framed around storefront plugins.

**Recommendation:** prototype on **Prodigi sandbox** first because its API is the most self-serve and documented, so you can build and test the entire flow end-to-end without sales calls — then **order physical samples from both** and pick on card feel, tuck-box quality, and per-unit cost. Card *stock and finish* are the product here, so let the physical sample, not the API, make the final call.

> Verify current endpoints, SKUs, pricing, and field names against each provider's live docs at build time — APIs and catalogs change.

---

*Pairs with the Side Quest Backend Spec. This flow assumes lore is already live (it is, in the current client) and that the art engine, persistence, and payments are being built out per that spec.*
