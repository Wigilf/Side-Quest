# Side Quest

Turn any event into a playable card-game quest. Built with React + Vite.

This is the front-end MVP of a two-sided platform: end users build custom decks starring their actual crew (the "build flow"), and independent creators publish decks others can buy (the marketplace, planned). The current code is the build flow only — full click-through (event → world → quest → cast → AI-generated deck → order) with theme-adaptive cards, card-flip reveal, and local deck persistence. Lore generation is wired for Claude; card art is a procedural placeholder (the "nano-banana" seam) until the backend is built.

See [`BUILD.md`](./BUILD.md) for the full build roadmap.

---

## Run it on your laptop

You need **Node.js 18+** installed first. Check with `node -v`. If you don't have it, get it from https://nodejs.org (the LTS version).

Then, in this folder:

```bash
npm install      # one time — downloads dependencies
npm run dev      # starts the dev server, opens http://localhost:5173
```

Edit any file in `src/` and the browser updates instantly (hot reload). Stop the server with Ctrl+C.

To make a production build:

```bash
npm run build    # outputs static files to dist/
npm run preview  # serves the built version locally to check it
```

The `dist/` folder is what you deploy to any static host (Netlify, Vercel, Cloudflare Pages).

---

## Live AI backend (lore + face→character art)

By default the app runs in **offline demo mode**: theme-adaptive fallback decks and procedural art, no keys needed. To turn on **real AI** — Claude writes the lore, and Gemini ("nano-banana") turns each uploaded face into a themed character portrait — run the small backend in `server/`.

The backend holds the API keys so they never ship in the browser. It's dependency-free (Node 18+ built-in `http` + `fetch`).

```bash
cp .env.example .env      # then fill in ANTHROPIC_API_KEY and GOOGLE_API_KEY
npm run server            # starts the backend on http://localhost:8787
```

Point the frontend at it by setting `VITE_API_BASE=http://localhost:8787` in `.env`, then run `npm run dev` in a second terminal. Check the backend is healthy at http://localhost:8787/api/health.

- Endpoints: `POST /api/generate-lore`, `POST /api/regenerate-lore`, `POST /api/generate-art`, `GET /api/health`.
- With no `VITE_API_BASE` set (e.g. the static GitHub Pages build), the app stays in offline demo mode — nothing breaks.
- The backend is stateless (no DB/auth yet). Accounts, persistence, checkout, and fulfillment are the remaining slices in [`docs/SideQuest_Backend_Spec.md`](./docs/SideQuest_Backend_Spec.md).

---

## Keep building with Claude Code

This project is set up to continue in [Claude Code](https://docs.claude.com/en/docs/claude-code). From this folder:

```bash
claude
```

Good first things to ask Claude Code to do:

- "Read PROJECT_CONTEXT.md and the two spec docs, then summarize where this project stands and what's left to build."
- "Wire up the real backend for lore generation so the Anthropic key lives server-side, per SideQuest_Backend_Spec.md."
- "Replace the procedural card art in generateCardArt() with a call to a backend endpoint that runs nano-banana."
- "Build the print-PDF renderer described in SideQuest_Checkout_Flow.md."

Claude Code can read every file here, make edits across files, run the dev server, and test as it goes. `PROJECT_CONTEXT.md` is written specifically to bring it (or any new collaborator) up to speed fast.

---

## Project structure

```
sidequest/
├── index.html              # Vite HTML shell
├── package.json            # dependencies + scripts
├── vite.config.js          # Vite + React config
├── .env.example            # copy to .env for local secrets (never commit .env)
├── src/
│   ├── main.jsx            # entry point + localStorage persistence shim
│   └── SideQuest.jsx         # the entire app (one component file)
└── docs/
    ├── PROJECT_CONTEXT.md       # ← start here: full state of the project
    ├── SideQuest_Backend_Spec.md  # accounts, face-art, checkout — backend design
    ├── SideQuest_Checkout_Flow.md # gap-free generation→checkout→fulfillment flow
    └── standalone-index.html    # no-build single-file version (double-click to run)
```

---

## What's built vs. what's next

Done:

- **Lore** — `generateDeckLore()` / `regenerateOneCard()` call the backend (`/api/generate-lore`, `/api/regenerate-lore`), which talks to Claude with the key held server-side.
- **Face→character art** — `generateCardArt()` calls `/api/generate-art`, which runs Gemini ("nano-banana") on the uploaded photo. Without a backend, it returns a themed backdrop and the card layers the raw photo on top.
- **Order** — the checkout step is an in-app confirmation panel (no more `alert()`), ready to be wired to Stripe.

Next (see the specs in `docs/`):

- **Accounts + server-side persistence** — replace the `window.storage` localStorage shim with the decks API.
- **Checkout + fulfillment** — Stripe payment, print-ready PDF, print-on-demand handoff (`SideQuest_Checkout_Flow.md`).

---

## A note on the API keys

Never put an Anthropic or Google key into front-end code. The keys live only in the backend's `.env` (gitignored). The browser calls the backend; the backend calls the AI providers. `.env.example` documents every variable.
