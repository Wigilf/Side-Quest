# Side Quest — Project Context

Read this first. It captures what Side Quest is, what's built, what's stubbed, and what to build next — the things that aren't obvious from the code alone.

## The idea

Side Quest turns any real event (bachelor party, group trip, house party, drinking game, wedding, team offsite) into a playable card game in the style of Magic: The Gathering. The finished deck is printed and shipped as a physical product.

It's a **two-sided platform**:

- **The build flow (B2C):** end users create custom decks starring their actual crew — each participant becomes a character card with AI-written lore and an AI-generated portrait, themed to a world they choose.
- **The marketplace (creator-driven):** independent creators publish decks and experiences other users can buy. Two listing kinds: **fixed** (finished deck the buyer prints as-is) and **template** (creator designs structure/theme/lore voice; buyer personalizes with their own crew). Both kinds share the same physical-fulfillment pipeline.

The concept came from a real bachelor party where the founder's group hand-made an MTG-inspired deck for the groom — cards for meeting new people, assigned objects/costumes, etc. The mission: "turn any event into a playable event."

## Current state (front-end MVP)

One React component, `src/SideQuest.jsx`, contains the whole app. The flow is fully clickable:

1. **Landing** — cinematic hero with floating cards; "Build your deck" or "skip to a sample deck."
2. **Event** — choose event type.
3. **World** — choose a theme; the card visual style (fonts, frame, ornament, art texture) adapts per theme.
4. **Quest** — free-text prompt describing the goal/vibe/inside jokes.
5. **Cast** — add participants (name + photo upload).
6. **Reveal** — cards generate, deal in, and flip one-by-one (staggered 3D animation). Each card can be re-rolled (lore or art).
7. **Order** — placeholder screen; the order button is an `alert()`.

Deck persistence works locally: decks auto-save and appear under "My decks," surviving refreshes. (In the artifact this used `window.storage`; on a laptop, `src/main.jsx` provides a localStorage shim so it still works.)

## What's real vs. stubbed

- **Lore generation — REAL.** `generateDeckLore()` calls Claude (Anthropic Messages API) with a structured prompt and parses JSON into cards. NOTE: it currently calls the API directly from the browser, which is a demo-only shortcut. The key must move to a backend (see below).
- **Card art — STUBBED.** `generateCardArt()` returns a procedural themed SVG placeholder that blends in the uploaded photo. The real version calls Google Gemini 2.5 Flash Image ("nano-banana"). Marked `NANO-BANANA INTEGRATION POINT`.
- **Accounts — NONE.** No real auth; persistence is local-only.
- **Checkout/fulfillment — NONE.** Order button is a placeholder.
- **Fallback deck** — if the live lore call fails, a baked-in deck remapped onto the user's real names keeps the demo from dead-ending. This is a demo crutch; gate behind a dev flag or remove for production.
- **Marketplace — NONE.** The marketplace direction is decided (see BUILD.md) but no creator system, listings, or browse experience exists yet. The current MVP is the build flow only.

## What to build next

The full execution plan is in `BUILD.md` — read that as the authoritative roadmap. It's organized as eight phases with explicit Definitions of Done, weaving the marketplace through where it belongs (creator data model in Phase 3, template-deck personalization in Phase 4, marketplace UI in Phase 5, Stripe Connect split payments in Phase 7).

The supporting spec docs (`docs/SideQuest_Backend_Spec.md` and `docs/SideQuest_Checkout_Flow.md`) cover the build-flow side in depth and are referenced by name from BUILD.md. BUILD.md extends them with marketplace specifics.

## Important design decisions already made

- **Two-sided platform from day one.** The data model accommodates creators and listings starting in Phase 3, not bolted on later. A user can be both a buyer and a creator on the same account.
- **Creators sell two kinds of listings.** Fixed (prints as-is, no AI generation on purchase) and template (creator designs the structure; buyer personalizes with their crew, AI generates the rest). Both share the same fulfillment pipeline.
- **Creator payouts via Stripe Connect Express + destination charges.** Splits happen atomically at payment time; the platform never holds creator money. No monthly reconciliation, no manual payouts.
- **Manual creator approval for the first wave.** The quality bar in the first ~50 listings sets the marketplace's long-term reputation.
- **Themes are styled as *vibes*, not named franchises** ("high-fantasy-ish," not "Lord of the Rings"). Keep generated art and copy clear of trademarked names/characters — IP-safety choice for a commercial product. Applies to creator content too — enforced via moderation.
- **Checkout is gated behind a single deck state (`art_ready`).** A deck with still-rendering or failed art can never reach payment.
- **All money/fulfillment steps are idempotent and webhook-driven**, never driven by the browser returning from Stripe.

## Files

- `BUILD.md` — **the authoritative build roadmap. Read this first when starting work.** Eight phases from current MVP to launchable two-sided platform, each with explicit Definition of Done.
- `src/SideQuest.jsx` — the entire app (current MVP).
- `src/main.jsx` — entry point + localStorage persistence shim.
- `docs/SideQuest_Backend_Spec.md` — accounts, face-art, checkout backend design (endpoints, data model, the nano-banana call). Covers the build-flow side; BUILD.md extends it for marketplace.
- `docs/SideQuest_Checkout_Flow.md` — the gap-free generation→checkout→fulfillment flow, deck state machine, and Stripe webhook handler.
- `docs/standalone-index.html` — a no-build single-file version of the app (double-click to run); handy for quick demos.

## How to run

`npm install` then `npm run dev` → http://localhost:5173. See README.md.
