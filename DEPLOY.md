# Deploying Side Quest

Two pieces deploy separately:

- **Frontend** — static files (`dist/`) → GitHub Pages (already live at
  https://wigilf.github.io/Side-Quest/).
- **Backend** — the Node server in `server/` → a host that runs a long-lived
  process (Render, Railway, Fly, Cloud Run). GitHub Pages can't run it.

The backend holds your API keys. You paste them into the host's dashboard —
they never go in the repo.

---

## 1. Deploy the backend (Render — simplest)

1. Make sure this repo is on GitHub (it is: `Wigilf/Side-Quest`).
2. Go to https://render.com → **New → Blueprint** → pick the `Side-Quest` repo.
   Render reads `render.yaml`.
3. When prompted, paste the two secrets: **ANTHROPIC_API_KEY** and
   **GOOGLE_API_KEY**. (Do this in Render's UI — not in the repo.)
4. Deploy. You'll get a URL like `https://sidequest-backend.onrender.com`.
5. Confirm it's up: open `https://<your-url>/api/health` — it should report
   `"anthropic":true,"google":true`.

`ALLOW_ORIGIN` is preset to the live site so only your frontend can call it.
`MAX_GENERATIONS_PER_DAY` caps worst-case spend; `RATE_MAX` throttles per-IP.

**Alternative hosts:** a `Dockerfile` is included for Fly.io / Railway / Cloud
Run. Set the same env vars there.

## 2. Point the frontend at the backend

The backend URL is baked into the frontend at build time.

```bash
# .env (or your CI env)
VITE_API_BASE=https://<your-backend-url>
# VITE_API_TOKEN=...   # only if you set SIDEQUEST_API_TOKEN on the backend
```

Then rebuild and redeploy the static site:

```bash
npm run build
# push dist/ to the gh-pages branch (see the deploy steps you've used before)
```

Once that's live, the public site uses real AI: Claude lore + Gemini
face→character art.

---

## 3. Enable checkout (Stripe)

Payment is real but needs a Stripe account. **Use test mode first.**

1. Create a Stripe account → https://dashboard.stripe.com. Toggle **Test mode**
   (top right).
2. **Secret key:** Developers → API keys → copy the **Secret key** (`sk_test_...`).
   Add it to the backend host as **`STRIPE_SECRET_KEY`**.
3. **Webhook:** Developers → Webhooks → **Add endpoint**:
   - URL: `https://<your-backend-url>/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `checkout.session.expired`,
     `payment_intent.payment_failed`
   - After creating it, copy the **Signing secret** (`whsec_...`) → add as
     **`STRIPE_WEBHOOK_SECRET`** on the backend.
4. Redeploy the backend. `GET /api/health` should now show `"stripe":true`.
5. Test with Stripe's test card **4242 4242 4242 4242**, any future expiry, any
   CVC. You'll land back on the site with a "Payment received" banner, and the
   Stripe dashboard will show the payment.

Pricing is computed **server-side** (`DECK_PRICE_CENTS`, `SHIPPING_CENTS`) — the
browser never sends a price. Stripe's hosted page collects the card and the
shipping address, so this app never touches payment or address data.

**Not yet built (needs the DB slice):** persisting the order and handing it to a
print-on-demand provider. Right now a completed payment is recorded in Stripe
and logged by the webhook; turning that into a shipped deck is the next step in
`docs/SideQuest_Checkout_Flow.md` §D.

---

## Security notes (important)

- A public single-page app **cannot hide a secret** — anything in the frontend
  build is readable. So the backend is protected by **CORS allowlist +
  per-IP rate limit + a daily generation cap**, not by a secret in the browser.
  `SIDEQUEST_API_TOKEN` only helps for private/internal builds.
- The real fix for "only my users can spend my credits" is **accounts** (sign
  in, then the backend authorizes per-user) — that's the next backend slice in
  `docs/SideQuest_Backend_Spec.md`.
- Rotate the API keys if they're ever exposed.
