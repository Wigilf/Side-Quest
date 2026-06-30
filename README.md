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

## The two integration seams

Search `SideQuest.jsx` for these comments — they mark where the demo becomes the real product:

- **`NANO-BANANA INTEGRATION POINT`** in `generateCardArt()` — swap the placeholder SVG for a call to your backend that runs Google Gemini 2.5 Flash Image.
- **`callClaude` / `generateDeckLore`** — currently calls Anthropic directly. Move this behind your own backend so the API key never ships in browser code. See the backend spec.

The "Order deck" button is a placeholder `alert()`; wiring it to Stripe + print-on-demand is detailed in the checkout flow doc.

---

## A note on the API key

Do **not** put an Anthropic or Google key into the front-end code. The current direct-to-Anthropic call is a demo convenience only. For anything real, the key belongs on a backend server, which the front end calls. `.env.example` shows the shape; `.env` is gitignored so you don't commit secrets.
