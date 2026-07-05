import React, { useState, useRef, useEffect } from "react";

/*
  ============================================================================
  SIDE QUEST — Turn any event into a playable quest.   (Investor demo build)
  ============================================================================
  LIVE:  cinematic landing • full flow • LIVE lore via Anthropic API (Claude)
         • THEME-ADAPTIVE card styles • card-flip reveal • instant-demo shortcut
  STUB:  image gen via "nano-banana" (Gemini 2.5 Flash Image). Artifacts can
         only reach the Anthropic API and a Google key must never ship client
         side, so generateCardArt() is one swappable seam producing themed
         procedural art. => search "NANO-BANANA INTEGRATION POINT".
  ============================================================================
*/

// ---------------------------------------------------------------------------
// CONTENT
// ---------------------------------------------------------------------------

const EVENT_TYPES = [
  { id: "bachelor", label: "Bachelor / Bachelorette", icon: "♛", hint: "Send the guest of honor on a legendary quest." },
  { id: "trip", label: "Group Trip", icon: "✈", hint: "A campaign across cities and days." },
  { id: "party", label: "House Party", icon: "✦", hint: "Roles, missions and mischief for every guest." },
  { id: "drinking", label: "Drinking Game", icon: "⚑", hint: "Draw a card, do the thing. Chaos as a service." },
  { id: "wedding", label: "Wedding", icon: "♡", hint: "Icebreakers and quests for the whole crowd." },
  { id: "corporate", label: "Team Offsite", icon: "◈", hint: "Forced fun, but actually good for once." },
];

// Each theme carries a FULL visual identity, not just colors. This is what
// makes the deck look different per world in the demo.
const THEMES = [
  {
    id: "starwars", label: "Galactic Saga", sub: "Star Wars-ish",
    style: "scifi", swatch: ["#0b0f1a", "#f7c948", "#3aa0ff"],
    bg: ["#05070f", "#0d1830"], accent: "#f7c948", ink: "#eaf2ff",
    displayFont: "'Orbitron', sans-serif", bodyFont: "'Rajdhani', sans-serif",
    corner: 6, ornament: "▰", texture: "grid",
  },
  {
    id: "lotr", label: "Realm of Rings", sub: "High-fantasy-ish",
    style: "fantasy", swatch: ["#1c2415", "#c9a227", "#6b8e3a"],
    bg: ["#13160c", "#241c0c"], accent: "#c9a227", ink: "#f3ead0",
    displayFont: "'Cinzel', serif", bodyFont: "'EB Garamond', serif",
    corner: 14, ornament: "❦", texture: "parchment",
  },
  {
    id: "potter", label: "School of Spells", sub: "Wizarding-ish",
    style: "arcane", swatch: ["#1a1224", "#b8860b", "#7b2d8e"],
    bg: ["#100a1c", "#241038"], accent: "#caa75a", ink: "#f0e6ff",
    displayFont: "'Cinzel Decorative', serif", bodyFont: "'EB Garamond', serif",
    corner: 12, ornament: "✦", texture: "stars",
  },
  {
    id: "onepiece", label: "Grand Voyage", sub: "Pirate-adventure-ish",
    style: "adventure", swatch: ["#0a1c2e", "#e63946", "#f4a261"],
    bg: ["#08243a", "#0d3a4f"], accent: "#f4a261", ink: "#fff6e8",
    displayFont: "'Pirata One', cursive", bodyFont: "'Outfit', sans-serif",
    corner: 10, ornament: "☠", texture: "waves",
  },
  {
    id: "cyber", label: "Neon Districts", sub: "Cyberpunk-ish",
    style: "cyber", swatch: ["#0d0221", "#ff2a6d", "#05d9e8"],
    bg: ["#07021a", "#1a0438"], accent: "#05d9e8", ink: "#eafcff",
    displayFont: "'Orbitron', sans-serif", bodyFont: "'Rajdhani', sans-serif",
    corner: 2, ornament: "◢", texture: "scan",
  },
  {
    id: "noir", label: "Smoke & Shadows", sub: "Detective-noir-ish",
    style: "noir", swatch: ["#15171a", "#c0a062", "#8a8d91"],
    bg: ["#0c0d0f", "#1a1c20"], accent: "#c0a062", ink: "#ece8df",
    displayFont: "'Cinzel', serif", bodyFont: "'EB Garamond', serif",
    corner: 4, ornament: "✜", texture: "smoke",
  },
];

const CARD_FRAMES = [
  { key: "gold", accent: "#f3cf5b" },
  { key: "azure", accent: "#56c4ef" },
  { key: "crimson", accent: "#ef5b6b" },
  { key: "verdant", accent: "#5bef82" },
  { key: "violet", accent: "#b15bef" },
];

const STEPS = ["Event", "World", "Quest", "Cast", "Reveal", "Order"];

// Pre-built example so a pitch can jump straight to the payoff.
const DEMO = {
  user: { name: "Marco", email: "marco@sidequest.gg" },
  eventType: "bachelor",
  theme: "lotr",
  questPrompt:
    "Dave's bachelor party in the mountains. The fellowship must complete dares to 'earn back' his freedom before the wedding. Dave fears seagulls, loves terrible karaoke, and once lost a shoe in a fountain. Make everyone a legendary hero with a ridiculous title.",
  participants: [
    { id: 1, name: "Dave", photo: null },
    { id: 2, name: "Marco", photo: null },
    { id: 3, name: "Liam", photo: null },
    { id: 4, name: "Sofia", photo: null },
    { id: 5, name: "Theo", photo: null },
  ],
};

// Safety net: if the live Claude call fails on stage (wifi, rate limit), we
// fall back to this baked-in deck so the demo NEVER dead-ends in front of an
// audience. It matches DEMO's participants + LOTR theme.
const FALLBACK_LORE = {
  questCard: {
    title: "The Last Free Night",
    typeLine: "Quest",
    ability:
      "The fellowship must complete every hero's dare before dawn to earn back Dave's freedom. If even one quest goes unfinished, the whole party drinks at the wedding toast.",
    flavor: "One does not simply walk into matrimony.",
  },
  cards: [
    { realName: "Dave", title: "Dave, the Soon-to-be-Bound", typeLine: "Legendary Creature — Groom Champion", cost: 7, power: 4, toughness: 6, ability: "At the start of each round, Dave must attempt a karaoke ballad; if he refuses, he loses one shoe.", flavor: "He feared no man. Only seagulls.", frame: "gold" },
    { realName: "Marco", title: "Marco, Keeper of the Itinerary", typeLine: "Legendary Creature — Planner Sage", cost: 5, power: 3, toughness: 5, ability: "Tap Marco to reveal the next dare; everyone groans but obeys.", flavor: "I had a spreadsheet for this exact emergency.", frame: "azure" },
    { realName: "Liam", title: "Liam the Unrelenting", typeLine: "Legendary Creature — Reveler Berserker", cost: 4, power: 6, toughness: 2, ability: "Whenever a round ends early, Liam declares 'one more' and the round does not end.", flavor: "Sleep is a side quest.", frame: "crimson" },
    { realName: "Sofia", title: "Sofia, Voice of Reason", typeLine: "Legendary Creature — Diplomat Cleric", cost: 4, power: 2, toughness: 7, ability: "Once per night, Sofia may cancel one terrible idea before it costs anyone a deposit.", flavor: "Someone has to remember the hotel name.", frame: "verdant" },
    { realName: "Theo", title: "Theo of the Hidden Flask", typeLine: "Legendary Creature — Trickster Rogue", cost: 3, power: 5, toughness: 3, ability: "Theo always has exactly what the quest requires, no questions asked.", flavor: "Don't ask where it came from.", frame: "violet" },
  ],
};

// Theme-adaptive safety net. The live Claude call cannot run from a plain
// browser build (an API key must never ship client-side — that needs the
// backend proxy in docs/SideQuest_Backend_Spec.md), so when it fails we build a
// deck whose tone MATCHES the chosen world instead of always serving fantasy.
// {n} is replaced with each participant's name. "fantasy" reuses FALLBACK_LORE
// so the sample/demo deck reproduces its hand-crafted cards exactly.
const FALLBACK_STYLES = {
  fantasy: { quest: FALLBACK_LORE.questCard, cards: FALLBACK_LORE.cards },

  scifi: {
    quest: { title: "The Last Jump", typeLine: "Quest", ability: "The squadron must clear every pilot's trial before the fleet reaches the jump gate. If a single trial is unfinished, the whole crew refuels the next round.", flavor: "Hold the line. Then hold one more." },
    cards: [
      { title: "{n}, Ace of the Vanguard", typeLine: "Legendary Pilot — Squadron Champion", cost: 7, power: 5, toughness: 5, ability: "At the start of each round, {n} calls the opening maneuver; the crew follows or forfeits a shield.", flavor: "Never tell {n} the odds." },
      { title: "{n}, Keeper of the Codes", typeLine: "Legendary Operator — Strategist", cost: 5, power: 3, toughness: 6, ability: "Tap {n} to decrypt the next objective; everyone groans, then complies.", flavor: "I ran the numbers. You won't like them." },
      { title: "{n} the Unrelenting", typeLine: "Legendary Trooper — Vanguard", cost: 4, power: 6, toughness: 2, ability: "Whenever a round tries to end early, {n} declares 'one more sortie' and it does not end.", flavor: "Sleep is for the docked." },
      { title: "{n}, Voice of the Council", typeLine: "Legendary Envoy — Peacekeeper", cost: 4, power: 2, toughness: 7, ability: "Once per night, {n} may veto one catastrophically bad plan before it costs a deposit.", flavor: "Someone has to remember where we parked the ship." },
      { title: "{n} of the Outer Rim", typeLine: "Legendary Smuggler — Rogue", cost: 3, power: 5, toughness: 3, ability: "{n} always has exactly the contraband the mission needs, no questions asked.", flavor: "Don't scan the cargo hold." },
    ],
  },

  arcane: {
    quest: { title: "The Unwritten Examination", typeLine: "Quest", ability: "The house must pass every trial set tonight before the final bell tolls. Leave one incantation unfinished and the whole table drinks a mystery potion.", flavor: "It does not do to dwell on sobriety and forget to live." },
    cards: [
      { title: "{n}, the Chosen One", typeLine: "Legendary Wizard — House Champion", cost: 7, power: 4, toughness: 6, ability: "At the start of each round, {n} attempts a spell of dubious control; if it fizzles, {n} loses a point of dignity.", flavor: "Books and cleverness — {n} had neither, and thrived." },
      { title: "{n}, Keeper of the Grimoire", typeLine: "Legendary Scholar — Sage", cost: 5, power: 3, toughness: 5, ability: "Tap {n} to reveal the next trial; the table sighs and obeys.", flavor: "I read ahead. We are not ready." },
      { title: "{n} the Reckless", typeLine: "Legendary Duelist — Berserker", cost: 4, power: 6, toughness: 2, ability: "Whenever a round would end early, {n} shouts 'again!' and it does not end.", flavor: "Rules are more like guidelines, really." },
      { title: "{n}, the Prefect", typeLine: "Legendary Cleric — Diplomat", cost: 4, power: 2, toughness: 7, ability: "Once per night, {n} may dispel one terrible idea before it earns detention.", flavor: "Someone has to count us back to the dormitory." },
      { title: "{n} of the Hidden Flask", typeLine: "Legendary Trickster — Rogue", cost: 3, power: 5, toughness: 3, ability: "{n} always conjures precisely what the quest requires, source unknown.", flavor: "Best not to ask which cupboard it came from." },
    ],
  },

  adventure: {
    quest: { title: "The Grand Voyage", typeLine: "Quest", ability: "The crew must complete every trial across the isles before the tide turns at dawn. Leave one undone and the whole ship shares the captain's tab.", flavor: "A pirate's life chooses you — usually around midnight." },
    cards: [
      { title: "{n}, Captain of the Tide", typeLine: "Legendary Pirate — Crew Champion", cost: 7, power: 5, toughness: 5, ability: "At the start of each round, {n} names the heading; the crew sails it or swabs a round.", flavor: "{n} feared no sea. Only last call." },
      { title: "{n}, Keeper of the Charts", typeLine: "Legendary Navigator — Sage", cost: 5, power: 3, toughness: 5, ability: "Tap {n} to chart the next trial; everyone grumbles and rows.", flavor: "X marks the spot. I marked three." },
      { title: "{n} the Unsinkable", typeLine: "Legendary Brawler — Reveler", cost: 4, power: 6, toughness: 2, ability: "Whenever a round tries to end early, {n} bellows 'one more port' and it does not end.", flavor: "Sleep is a landlubber's habit." },
      { title: "{n}, Voice of Calm Seas", typeLine: "Legendary Quartermaster — Diplomat", cost: 4, power: 2, toughness: 7, ability: "Once per night, {n} may scuttle one disastrous idea before it costs the deposit.", flavor: "Someone must recall the name of the inn." },
      { title: "{n} of the Hidden Hold", typeLine: "Legendary Rogue — Trickster", cost: 3, power: 5, toughness: 3, ability: "{n} always has exactly the supplies the quest demands, no questions asked.", flavor: "Don't ask what's under the tarp." },
    ],
  },

  cyber: {
    quest: { title: "One Last Run", typeLine: "Quest", ability: "The crew must clear every job on the board before the neon dims at sunrise. Miss one contract and the whole team pays the next tab in full.", flavor: "The city never sleeps, so neither do we." },
    cards: [
      { title: "{n}, the Runner", typeLine: "Legendary Netrunner — Crew Champion", cost: 7, power: 5, toughness: 5, ability: "At the start of each round, {n} jacks in first; the crew follows or drops a data-shard.", flavor: "{n} feared no ICE. Only the group chat." },
      { title: "{n}, Keeper of the Grid", typeLine: "Legendary Fixer — Strategist", cost: 5, power: 3, toughness: 6, ability: "Tap {n} to surface the next contract; the crew groans and uploads.", flavor: "I priced the job. You're all underpaid." },
      { title: "{n} the Overclocked", typeLine: "Legendary Solo — Berserker", cost: 4, power: 6, toughness: 2, ability: "Whenever a round would end early, {n} says 'one more run' and it does not end.", flavor: "Downtime is a corpo myth." },
      { title: "{n}, Voice of the Static", typeLine: "Legendary Medtech — Diplomat", cost: 4, power: 2, toughness: 7, ability: "Once per night, {n} may firewall one catastrophic idea before it drains the account.", flavor: "Someone has to log the safehouse address." },
      { title: "{n} of the Back Alley", typeLine: "Legendary Smuggler — Rogue", cost: 3, power: 5, toughness: 3, ability: "{n} always has exactly the gear the job needs, serial numbers filed off.", flavor: "Don't scan the duffel." },
    ],
  },

  noir: {
    quest: { title: "The Long Night", typeLine: "Quest", ability: "The outfit must close every case laid out tonight before the last streetlight dies. Leave one unsolved and the whole table buys the final round.", flavor: "Everybody's guilty of something. Tonight we find out what." },
    cards: [
      { title: "{n}, the Detective", typeLine: "Legendary Gumshoe — Outfit Lead", cost: 7, power: 4, toughness: 6, ability: "At the start of each round, {n} opens the case; the table plays along or forfeits a clue.", flavor: "{n} trusted no one. Especially the bartender." },
      { title: "{n}, Keeper of the Files", typeLine: "Legendary Archivist — Sage", cost: 5, power: 3, toughness: 5, ability: "Tap {n} to reveal the next lead; everyone sighs and follows the trail.", flavor: "I have a file on all of you." },
      { title: "{n} the Hard-Boiled", typeLine: "Legendary Enforcer — Berserker", cost: 4, power: 6, toughness: 2, ability: "Whenever a round tries to end early, {n} orders 'one for the road' and it does not end.", flavor: "Sleep? In this town?" },
      { title: "{n}, the Fixer's Conscience", typeLine: "Legendary Counsel — Diplomat", cost: 4, power: 2, toughness: 7, ability: "Once per night, {n} may bury one terrible idea before it makes the papers.", flavor: "Someone has to remember which bar we started in." },
      { title: "{n} of the Back Room", typeLine: "Legendary Grifter — Rogue", cost: 3, power: 5, toughness: 3, ability: "{n} always has exactly what the case requires, provenance unclear.", flavor: "Don't ask whose coat that was." },
    ],
  },
};

// Remap a themed template onto the real cast, in participant order.
function buildFallbackLore(src) {
  const th = THEMES.find((t) => t.id === src.theme) || THEMES[1];
  const tpl = FALLBACK_STYLES[th.style] || FALLBACK_STYLES.fantasy;
  const names = src.participants.map((p) => p.name || "Hero");
  const cards = names.map((nm, i) => {
    const base = tpl.cards[i % tpl.cards.length];
    const sub = (s) => (s || "").replace(/\{n\}/g, nm);
    return {
      ...base,
      title: sub(base.title), ability: sub(base.ability), flavor: sub(base.flavor),
      realName: nm, frame: CARD_FRAMES[i % CARD_FRAMES.length].key,
    };
  });
  return { questCard: { ...tpl.quest, typeLine: "Quest" }, cards };
}

// ---------------------------------------------------------------------------
// LORE (Anthropic, via our backend) — LIVE when VITE_API_BASE is configured
// ---------------------------------------------------------------------------
// The Anthropic key must never ship in the browser, so lore now goes through
// the server in server/index.mjs. Set VITE_API_BASE to that server's URL to
// enable it; with no backend, these throw and runGeneration falls back to the
// theme-adaptive baked deck.

const API_BASE = (import.meta.env && import.meta.env.VITE_API_BASE) || "";
const API_TOKEN = (import.meta.env && import.meta.env.VITE_API_TOKEN) || "";
const AI_ENABLED = !!API_BASE;

async function postJSON(pathname, body) {
  const headers = { "Content-Type": "application/json" };
  if (API_TOKEN) headers["Authorization"] = `Bearer ${API_TOKEN}`;
  const res = await fetch(`${API_BASE}${pathname}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `${pathname} ${res.status}`;
    try { const d = await res.json(); if (d.error) msg = d.error; } catch (e) { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

async function generateDeckLore({ eventType, theme, questPrompt, participants }) {
  if (!API_BASE) throw new Error("no backend configured"); // -> themed fallback deck
  const lore = await postJSON("/api/generate-lore", {
    eventType: EVENT_TYPES.find((e) => e.id === eventType)?.label || eventType,
    theme: THEMES.find((t) => t.id === theme)?.label || theme,
    questPrompt,
    participants: participants.map((p) => ({ name: p.name || "Unnamed" })),
  });
  if (!lore || !Array.isArray(lore.cards) || !lore.cards.length) throw new Error("empty lore");
  return lore;
}

async function regenerateOneCard({ eventType, theme, questPrompt, card }) {
  if (!API_BASE) throw new Error("no backend configured");
  return postJSON("/api/regenerate-lore", {
    eventType: EVENT_TYPES.find((e) => e.id === eventType)?.label || eventType,
    theme: THEMES.find((t) => t.id === theme)?.label || theme,
    questPrompt,
    card,
  });
}

// ---------------------------------------------------------------------------
// NANO-BANANA (image) — LIVE via backend when VITE_API_BASE is set, else stub
// ---------------------------------------------------------------------------
// With a backend configured AND a photo present, the server calls Gemini
// ("nano-banana") to turn the real face into a themed character portrait.
// Otherwise we return a procedural themed backdrop and the card layers the raw
// photo on top (see GameCard) — no Google key ever touches the browser.
async function generateCardArt({ photoBase64, frameAccent, themeStyle, seedStr, lore }) {
  if (API_BASE && photoBase64) {
    try {
      const d = await postJSON("/api/generate-art", {
        photoBase64,
        themeStyle,
        lore: { title: lore?.title, typeLine: lore?.typeLine },
      });
      if (d && d.image) return d.image;
      throw new Error("no image");
    } catch (e) {
      console.warn("Backend art failed, using procedural backdrop:", e.message);
    }
  }
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 400));
  const svg = makeThemedArt(seedStr, frameAccent, themeStyle, null);
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h >>> 0);
}

function makeThemedArt(seedStr, accent, style, photoBase64) {
  const r = (n) => (hashStr(seedStr + n) % 1000) / 1000;
  let bg = "#0a0a12", shapes = "";
  const blob = (i, op) => {
    const cx = 30 + r("x" + i) * 240, cy = 30 + r("y" + i) * 180, rad = 24 + r("r" + i) * 80;
    return `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${i % 2 ? accent : "#ffffff"}" opacity="${op}"/>`;
  };
  if (style === "cyber" || style === "scifi") {
    bg = "#06061a";
    for (let i = 0; i < 9; i++) {
      const y = 20 + i * 26;
      shapes += `<line x1="0" y1="${y}" x2="300" y2="${y}" stroke="${accent}" stroke-width="0.6" opacity="0.18"/>`;
    }
    for (let i = 0; i < 5; i++) shapes += blob(i, 0.22 + r("o" + i) * 0.25);
  } else if (style === "noir") {
    bg = "#101113";
    shapes += `<rect width="300" height="240" fill="url(#vg)"/>`;
    for (let i = 0; i < 4; i++) {
      const x = r("b" + i) * 300;
      shapes += `<rect x="${x}" y="0" width="${30 + r("w" + i) * 50}" height="240" fill="#000" opacity="0.25"/>`;
    }
  } else if (style === "arcane") {
    bg = "#120a22";
    for (let i = 0; i < 22; i++) {
      const x = r("sx" + i) * 300, y = r("sy" + i) * 240, s = 0.6 + r("ss" + i) * 1.8;
      shapes += `<circle cx="${x}" cy="${y}" r="${s}" fill="${accent}" opacity="${0.4 + r("so" + i) * 0.5}"/>`;
    }
    for (let i = 0; i < 4; i++) shapes += blob(i, 0.2);
  } else if (style === "adventure") {
    bg = "#08283a";
    for (let i = 0; i < 6; i++) {
      const y = 90 + i * 26;
      shapes += `<path d="M0 ${y} Q75 ${y - 16} 150 ${y} T300 ${y}" stroke="${accent}" stroke-width="2" fill="none" opacity="${0.3 - i * 0.03}"/>`;
    }
    for (let i = 0; i < 4; i++) shapes += blob(i, 0.25);
  } else {
    bg = "#161208";
    for (let i = 0; i < 7; i++) shapes += blob(i, 0.18 + r("o" + i) * 0.4);
  }
  const photoLayer = photoBase64
    ? `<image href="${photoBase64}" x="0" y="0" width="300" height="240" preserveAspectRatio="xMidYMid slice" opacity="0.5"/>`
    : `<g opacity="0.8"><ellipse cx="150" cy="115" rx="40" ry="46" fill="${accent}"/><path d="M75 240 Q150 150 225 240 Z" fill="${accent}"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="240" viewBox="0 0 300 240">
    <defs><radialGradient id="vg" cx="50%" cy="40%" r="70%"><stop offset="0%" stop-color="${accent}" stop-opacity="0.25"/><stop offset="100%" stop-color="#000" stop-opacity="0.7"/></radialGradient></defs>
    <rect width="300" height="240" fill="${bg}"/>${shapes}${photoLayer}
    <rect width="300" height="240" fill="url(#vg)" opacity="0.35"/></svg>`;
}

// ---------------------------------------------------------------------------
// FONTS / PRIMITIVES
// ---------------------------------------------------------------------------

const UI_FONT = "'Outfit', 'Segoe UI', sans-serif";
const DISPLAY_FONT = "'Cinzel', Georgia, serif";

function useGoogleFonts() {
  useEffect(() => {
    const id = "sidequest-fonts";
    if (document.getElementById(id)) return;
    const l = document.createElement("link");
    l.id = id; l.rel = "stylesheet";
    l.href =
      "https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Cinzel+Decorative:wght@700&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Outfit:wght@300;400;500;600;700&family=Orbitron:wght@500;700&family=Rajdhani:wght@500;600;700&family=Pirata+One&display=swap";
    document.head.appendChild(l);
  }, []);
}

function Stepper({ step }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
      {STEPS.map((s, i) => (
        <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            fontFamily: UI_FONT, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase",
            padding: "4px 10px", borderRadius: 999,
            border: `1px solid ${i <= step ? "#d8b24a" : "#3a3a44"}`,
            color: i <= step ? "#f3cf5b" : "#6c6c78",
            background: i === step ? "rgba(216,178,74,0.12)" : "transparent",
            transition: "all .3s", whiteSpace: "nowrap",
          }}>{s}</div>
          {i < STEPS.length - 1 && <div style={{ width: 14, height: 1, background: i < step ? "#d8b24a" : "#3a3a44" }} />}
        </div>
      ))}
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, style }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        fontFamily: UI_FONT, fontSize: 15, fontWeight: 600, letterSpacing: 0.3,
        padding: "13px 28px", borderRadius: 10, border: "1px solid #f3cf5b",
        cursor: disabled ? "not-allowed" : "pointer",
        color: disabled ? "#6c6c78" : "#1a1206",
        background: disabled ? "#2a2a32" : "linear-gradient(180deg,#f7d978,#d8b24a)",
        boxShadow: disabled ? "none" : "0 6px 20px rgba(216,178,74,0.25)",
        transition: "transform .12s", ...style,
      }}
      onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = "translateY(1px)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(0)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}>
      {children}
    </button>
  );
}

function GhostButton({ children, onClick, style }) {
  return (
    <button onClick={onClick}
      style={{
        fontFamily: UI_FONT, fontSize: 14, padding: "11px 20px", borderRadius: 10,
        border: "1px solid #4a4a56", cursor: "pointer", color: "#c8c8d4",
        background: "transparent", transition: "border-color .2s", ...style,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#8a8a9a")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#4a4a56")}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// THEME-ADAPTIVE FLIP CARD
// ---------------------------------------------------------------------------

function GameCard({ card, theme, art, photo, loadingArt, flipped, onFlip, onRegenLore, onRegenArt, busy, compact }) {
  const fr = CARD_FRAMES.find((f) => f.key === card.frame) || CARD_FRAMES[0];
  const t = theme;
  // Show the raw uploaded face only when the art is the procedural backdrop
  // (an SVG). A real AI portrait (raster png/jpeg) already contains the face.
  const showPhoto = photo && (!art || (typeof art === "string" && art.startsWith("data:image/svg")));
  const W = compact ? 232 : 300;
  const scale = W / 300;
  const corner = (t.corner || 10) * scale;

  return (
    <div style={{ width: W, perspective: 1200 }}>
      <div
        onClick={onFlip}
        role={onFlip ? "button" : undefined}
        tabIndex={onFlip ? 0 : undefined}
        aria-label={onFlip ? `Flip ${card.realName}'s card` : undefined}
        onKeyDown={onFlip ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onFlip(); } } : undefined}
        style={{
          position: "relative", width: "100%", height: (compact ? 340 : 440),
          transformStyle: "preserve-3d", transition: "transform .7s cubic-bezier(.2,.8,.2,1)",
          transform: flipped ? "rotateY(0deg)" : "rotateY(180deg)", cursor: onFlip ? "pointer" : "default",
        }}
      >
        {/* ---- CARD BACK ---- */}
        <div style={{
          position: "absolute", inset: 0, backfaceVisibility: "hidden",
          transform: "rotateY(180deg)", borderRadius: corner,
          background: `linear-gradient(160deg, ${t.bg[1]}, ${t.bg[0]})`,
          border: `2px solid ${t.accent}`, display: "flex", alignItems: "center",
          justifyContent: "center", flexDirection: "column", gap: 10,
          boxShadow: `0 18px 40px rgba(0,0,0,0.5)`,
        }}>
          <div style={{ fontSize: 40 * scale, color: t.accent, opacity: 0.9 }}>{t.ornament}</div>
          <div style={{ fontFamily: t.displayFont, color: t.accent, letterSpacing: 4, fontSize: 13 * scale, textTransform: "uppercase" }}>Side Quest</div>
          <div style={{ fontFamily: UI_FONT, color: t.ink, opacity: 0.5, fontSize: 10 * scale }}>tap to reveal</div>
        </div>

        {/* ---- CARD FRONT ---- */}
        <div style={{
          position: "absolute", inset: 0, backfaceVisibility: "hidden",
          borderRadius: corner, padding: 10 * scale,
          background: `linear-gradient(160deg, ${t.bg[1]}, ${t.bg[0]})`,
          border: `2px solid ${fr.accent}`, color: t.ink, fontFamily: t.bodyFont,
          boxShadow: `0 18px 40px rgba(0,0,0,0.5), inset 0 0 30px rgba(0,0,0,0.4)`,
          display: "flex", flexDirection: "column",
        }}>
          {/* title bar */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: `${6 * scale}px ${10 * scale}px`, borderRadius: 8 * scale,
            background: "rgba(0,0,0,0.35)", border: `1px solid ${fr.accent}55`, marginBottom: 8 * scale,
          }}>
            <div style={{ fontFamily: t.displayFont, fontWeight: 700, fontSize: 14 * scale, lineHeight: 1.05, paddingRight: 6 }}>{card.title}</div>
            <div style={{
              fontFamily: t.displayFont, fontWeight: 700, fontSize: 14 * scale,
              background: fr.accent, color: t.bg[0], borderRadius: 999,
              minWidth: 22 * scale, height: 22 * scale, display: "flex",
              alignItems: "center", justifyContent: "center", padding: `0 ${6 * scale}px`,
            }}>{card.cost}</div>
          </div>

          {/* art */}
          <div style={{ position: "relative", flex: 1, minHeight: 0, borderRadius: 8 * scale, overflow: "hidden", border: `1px solid ${fr.accent}88`, background: t.bg[0] }}>
            {loadingArt ? (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, color: fr.accent, fontFamily: UI_FONT, fontSize: 11 * scale }}>
                <div className="ql-spin" style={{ width: 24, height: 24, borderColor: `${fr.accent}55`, borderTopColor: fr.accent }} />
                conjuring art…
              </div>
            ) : (art || photo) ? (
              <>
                {/* AI portrait or themed backdrop */}
                {art && <img src={art} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
                {/* real face, layered over the procedural backdrop when there's no AI art */}
                {showPhoto && <img src={photo} alt={card.realName} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
                {/* theme tint so the portrait blends into the card frame */}
                {showPhoto && <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(120% 80% at 50% 18%, ${fr.accent}22, transparent 55%), linear-gradient(180deg, transparent 45%, ${t.bg[0]}dd 100%)` }} />}
              </>
            ) : (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: `${fr.accent}99`, fontFamily: UI_FONT, fontSize: 11 }}>no art</div>
            )}
          </div>

          {/* type line */}
          <div style={{ marginTop: 7 * scale, padding: `${3 * scale}px ${9 * scale}px`, borderRadius: 6 * scale, background: "rgba(0,0,0,0.3)", fontFamily: t.displayFont, fontSize: 10 * scale, letterSpacing: 0.3, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.typeLine}</span>
            <span style={{ opacity: 0.7, marginLeft: 6 }}>{t.ornament}</span>
          </div>

          {/* text box */}
          <div style={{ marginTop: 7 * scale, padding: 9 * scale, borderRadius: 8 * scale, background: "rgba(0,0,0,0.28)", border: `1px solid ${fr.accent}33` }}>
            <div style={{ fontSize: 12 * scale, lineHeight: 1.3 }}>{card.ability}</div>
            <div style={{ height: 1, background: `${fr.accent}33`, margin: `${6 * scale}px 0` }} />
            <div style={{ fontStyle: "italic", fontSize: 11 * scale, opacity: 0.82, lineHeight: 1.25 }}>“{card.flavor}”</div>
          </div>

          {/* P/T */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 * scale }}>
            <span style={{ fontFamily: UI_FONT, fontSize: 10 * scale, opacity: 0.6 }}>{card.realName}</span>
            <div style={{ fontFamily: t.displayFont, fontWeight: 700, fontSize: 14 * scale, padding: `${3 * scale}px ${11 * scale}px`, borderRadius: 8 * scale, background: fr.accent, color: t.bg[0] }}>
              {card.power}/{card.toughness}
            </div>
          </div>
        </div>
      </div>

      {/* refine controls (outside the flip) */}
      {(onRegenLore || onRegenArt) && flipped && (
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {onRegenArt && <button onClick={onRegenArt} disabled={busy} style={refineBtn(fr, busy)}>↻ Art</button>}
          {onRegenLore && <button onClick={onRegenLore} disabled={busy} style={refineBtn(fr, busy)}>↻ Lore</button>}
        </div>
      )}
    </div>
  );
}

function refineBtn(fr, busy) {
  return { flex: 1, fontFamily: UI_FONT, fontSize: 12, fontWeight: 500, padding: "7px 8px", borderRadius: 7, cursor: busy ? "wait" : "pointer", color: "#e8e8f0", background: "rgba(0,0,0,0.4)", border: `1px solid ${fr.accent}66`, opacity: busy ? 0.5 : 1 };
}

// ---------------------------------------------------------------------------
// MAIN APP
// ---------------------------------------------------------------------------

export default function SideQuest() {
  useGoogleFonts();
  const [landing, setLanding] = useState(true);
  const [step, setStep] = useState(0);

  const [user, setUser] = useState({ name: "", email: "" });
  const [eventType, setEventType] = useState(null);
  const [theme, setTheme] = useState(null);
  const [questPrompt, setQuestPrompt] = useState("");
  const [participants, setParticipants] = useState([]);

  const [questCard, setQuestCard] = useState(null);
  const [cards, setCards] = useState([]);
  const [arts, setArts] = useState({});
  const [loadingArt, setLoadingArt] = useState({});
  const [flipped, setFlipped] = useState({}); // realName -> bool
  const [genState, setGenState] = useState("idle");
  const [error, setError] = useState("");
  const [busyCard, setBusyCard] = useState(null);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [photoConsent, setPhotoConsent] = useState(false);

  // ---- persistence ----
  const [savedDecks, setSavedDecks] = useState([]); // [{id,name,theme,eventType,count,updatedAt}]
  const [currentDeckId, setCurrentDeckId] = useState(null);
  const [showDecks, setShowDecks] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle|saving|saved

  // Load the index of saved decks on first mount.
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("deckIndex");
        if (res && res.value) setSavedDecks(JSON.parse(res.value));
      } catch (e) { /* no index yet — fine */ }
    })();
  }, []);

  async function persistDeckIndex(next) {
    setSavedDecks(next);
    try { await window.storage.set("deckIndex", JSON.stringify(next)); } catch (e) { console.warn("index save failed", e); }
  }

  // Save the current deck (full payload under its own key + a light index entry).
  async function saveCurrentDeck() {
    if (!cards.length) return;
    setSaveState("saving");
    const id = currentDeckId || "deck_" + Date.now();
    const name = questPrompt.slice(0, 42) || (EVENT_TYPES.find((e) => e.id === eventType)?.label ?? "Untitled deck");
    const payload = { id, name, user, eventType, theme, questPrompt, participants, questCard, cards, arts, updatedAt: Date.now() };
    try {
      await window.storage.set("deck:" + id, JSON.stringify(payload));
      const entry = { id, name, theme, eventType, count: cards.length, updatedAt: payload.updatedAt };
      const next = [entry, ...savedDecks.filter((d) => d.id !== id)];
      await persistDeckIndex(next);
      setCurrentDeckId(id);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1800);
    } catch (e) {
      console.error("save failed", e); setError("Couldn't save this deck."); setSaveState("idle");
    }
  }

  async function openDeck(id) {
    try {
      const res = await window.storage.get("deck:" + id);
      if (!res || !res.value) throw new Error("Deck not found");
      const d = JSON.parse(res.value);
      setUser(d.user || { name: "", email: "" });
      setEventType(d.eventType); setTheme(d.theme); setQuestPrompt(d.questPrompt || "");
      setParticipants(d.participants || []); setQuestCard(d.questCard || null);
      // Backfill uid/pid for decks saved before this field existed.
      const loaded = (d.cards || []).map((c, i) => ({
        ...c, uid: c.uid ?? `${c.realName}-${i}`,
        pid: c.pid ?? (d.participants && d.participants[i] ? d.participants[i].id : null),
      }));
      setCards(loaded); setArts(d.arts || {});
      const fl = {}; loaded.forEach((c) => (fl[c.uid] = true)); setFlipped(fl);
      setCurrentDeckId(d.id); setGenState("done"); setShowDecks(false);
      setLanding(false); setStep(4);
    } catch (e) { setError("Couldn't open that deck."); }
  }

  async function deleteDeck(id) {
    try { await window.storage.delete("deck:" + id); } catch (e) { /* ignore */ }
    await persistDeckIndex(savedDecks.filter((d) => d.id !== id));
    if (currentDeckId === id) setCurrentDeckId(null);
  }

  function newDeck() {
    setCurrentDeckId(null); setUser({ name: "", email: "" }); setEventType(null);
    setTheme(null); setQuestPrompt(""); setParticipants([]); setQuestCard(null);
    setCards([]); setArts({}); setFlipped({}); setGenState("idle"); setOrderPlaced(false); setPhotoConsent(false);
    setShowDecks(false); setLanding(false); setStep(0);
  }

  const themeObj = THEMES.find((t) => t.id === theme) || THEMES[1];

  function addParticipant() {
    setParticipants((p) => [...p, { id: Date.now() + Math.random(), name: "", photo: null }]);
  }
  function updateParticipant(id, patch) { setParticipants((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x))); }
  function removeParticipant(id) { setParticipants((p) => p.filter((x) => x.id !== id)); }
  function onPhoto(id, file) { const rd = new FileReader(); rd.onload = () => updateParticipant(id, { photo: rd.result }); rd.readAsDataURL(file); }

  function loadDemo() {
    setUser(DEMO.user); setEventType(DEMO.eventType); setTheme(DEMO.theme);
    setQuestPrompt(DEMO.questPrompt); setParticipants(DEMO.participants.map((p) => ({ ...p })));
    setLanding(false);
    setTimeout(() => runGeneration(DEMO), 50);
  }

  async function runGeneration(override) {
    const src = override || { eventType, theme, questPrompt, participants };
    setError(""); setGenState("lore"); setStep(4); setFlipped({});
    try {
      // --- Lore: live Claude call, with a baked-in fallback for stage safety ---
      let lore;
      try {
        lore = await generateDeckLore(src);
        if (!lore || !Array.isArray(lore.cards) || lore.cards.length === 0) throw new Error("empty");
      } catch (loreErr) {
        console.warn("Live lore failed, using themed fallback deck:", loreErr);
        lore = buildFallbackLore(src);
      }
      setQuestCard(lore.questCard);
      // Attach a stable uid (the participant's id) so per-card art/flip state and
      // React keys never collide when two guests share the same name. Cards come
      // back in participant order; pid lets us look photos up without name matching.
      const ordered = (lore.cards || []).map((c, i) => {
        const p = src.participants[i];
        return { ...c, uid: p && p.id != null ? String(p.id) : `${c.realName}-${i}`, pid: p ? p.id : null };
      });
      setCards(ordered);
      setGenState("art");
      const th = THEMES.find((t) => t.id === src.theme) || THEMES[1];
      // Flips stay on a fixed, staggered timeline for drama...
      ordered.forEach((c, i) => setTimeout(() => setFlipped((s) => ({ ...s, [c.uid]: true })), 250 + i * 320));
      // ...but paint every card's art in parallel so a large cast isn't stuck in a slow queue.
      await Promise.all(ordered.map(async (c) => {
        const part = src.participants.find((p) => p.id === c.pid);
        setLoadingArt((s) => ({ ...s, [c.uid]: true }));
        try {
          const frAccent = (CARD_FRAMES.find((f) => f.key === c.frame) || CARD_FRAMES[0]).accent;
          // With a backend + photo -> real face->character art; otherwise a themed
          // backdrop the card layers the raw photo over.
          const art = await generateCardArt({ photoBase64: part?.photo || null, frameAccent: frAccent, themeStyle: th.style, seedStr: c.realName + c.title, lore: c });
          setArts((s) => ({ ...s, [c.uid]: art }));
        } finally {
          setLoadingArt((s) => ({ ...s, [c.uid]: false }));
        }
      }));
      setGenState("done");
      // Auto-save so the deck survives a refresh — captured locally to avoid stale state.
      setTimeout(() => autoSave(src, lore.questCard, ordered), 400);
    } catch (e) {
      console.error(e); setError(e.message || "Generation failed"); setGenState("error");
    }
  }

  // Collects the latest art from state at call time and writes the deck.
  function autoSave(src, qCard, ordered) {
    setArts((curArts) => {
      const id = currentDeckId || "deck_" + Date.now();
      const name = (src.questPrompt || "").slice(0, 42) || (EVENT_TYPES.find((e) => e.id === src.eventType)?.label ?? "Untitled deck");
      const payload = { id, name, user: src.user || user, eventType: src.eventType, theme: src.theme, questPrompt: src.questPrompt, participants: src.participants, questCard: qCard, cards: ordered, arts: curArts, updatedAt: Date.now() };
      (async () => {
        try {
          await window.storage.set("deck:" + id, JSON.stringify(payload));
          const entry = { id, name, theme: src.theme, eventType: src.eventType, count: ordered.length, updatedAt: payload.updatedAt };
          setSavedDecks((prev) => {
            const next = [entry, ...prev.filter((d) => d.id !== id)];
            window.storage.set("deckIndex", JSON.stringify(next)).catch(() => {});
            return next;
          });
          setCurrentDeckId(id);
        } catch (e) { console.warn("autosave failed", e); }
      })();
      return curArts; // no change to arts
    });
  }

  async function regenLore(uid) {
    setBusyCard(uid);
    try {
      const card = cards.find((c) => c.uid === uid);
      const fresh = await regenerateOneCard({ eventType, theme, questPrompt, card });
      // Preserve identity fields and the existing frame so the already-painted
      // art keeps matching the card's accent color.
      setCards((cs) => cs.map((c) => (c.uid === uid ? { ...c, ...fresh, frame: c.frame, realName: c.realName, uid: c.uid, pid: c.pid } : c)));
    } catch (e) { setError(e.message); } finally { setBusyCard(null); }
  }

  async function regenArt(uid) {
    setBusyCard(uid); setLoadingArt((s) => ({ ...s, [uid]: true }));
    try {
      const card = cards.find((c) => c.uid === uid);
      const part = participants.find((p) => p.id === card.pid);
      const frAccent = (CARD_FRAMES.find((f) => f.key === card.frame) || CARD_FRAMES[0]).accent;
      const art = await generateCardArt({ photoBase64: part?.photo || null, frameAccent: frAccent, themeStyle: themeObj.style, seedStr: card.realName + card.title + Math.random(), lore: card });
      setArts((s) => ({ ...s, [uid]: art }));
    } catch (e) { setError(e.message); } finally { setLoadingArt((s) => ({ ...s, [uid]: false })); setBusyCard(null); }
  }

  const canNext = {
    0: !!eventType,
    1: !!theme,
    2: questPrompt.trim().length > 8,
    3: participants.length > 0 && participants.every((p) => p.name.trim()) &&
       (!participants.some((p) => p.photo) || photoConsent),
  };

  // ===== LANDING =====
  if (landing) {
    return (
      <div style={{ minHeight: "100vh", background: "radial-gradient(1200px 700px at 50% -5%, #2a1d3f 0%, #15121d 45%, #08070d 100%)", color: "#e8e8f0", fontFamily: UI_FONT, position: "relative", overflow: "hidden" }}>
        <GlobalCSS />
        <FloatingCards />
        <div style={{ position: "relative", zIndex: 2, maxWidth: 820, margin: "0 auto", padding: "120px 24px 80px", textAlign: "center" }}>
          <div className="ql-fade" style={{ fontFamily: DISPLAY_FONT, fontSize: 13, letterSpacing: 8, textTransform: "uppercase", color: "#d8b24a", marginBottom: 18 }}>✦ Side Quest ✦</div>
          <h1 className="ql-fade" style={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: "clamp(36px, 7vw, 72px)", lineHeight: 1.05, margin: "0 0 22px", background: "linear-gradient(180deg,#fff,#cda955)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animationDelay: ".1s" }}>
            Every event<br />deserves a deck.
          </h1>
          <p className="ql-fade" style={{ color: "#b8b8c8", fontSize: "clamp(16px,2.4vw,20px)", maxWidth: 560, margin: "0 auto 38px", lineHeight: 1.6, animationDelay: ".2s" }}>
            Side Quest turns any bachelor party, trip, or night out into a playable card game — starring your actual crew. AI writes the lore, paints the portraits, and we ship the real, physical deck.
          </p>
          <div className="ql-fade" style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", animationDelay: ".3s" }}>
            <PrimaryButton onClick={() => setLanding(false)} style={{ fontSize: 18, padding: "18px 44px" }}>Build your deck →</PrimaryButton>
            <button onClick={loadDemo} style={{ background: "none", border: "none", cursor: "pointer", color: "#6c6c7c", fontFamily: UI_FONT, fontSize: 13, textDecoration: "underline", textUnderlineOffset: 3, opacity: 0.8 }}>
              or skip to a sample deck
            </button>
            {savedDecks.length > 0 && (
              <button onClick={() => { setShowDecks(true); setLanding(false); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#d8b24a", fontFamily: UI_FONT, fontSize: 14, marginTop: 4 }}>
                ◈ My decks ({savedDecks.length})
              </button>
            )}
          </div>
          <div className="ql-fade" style={{ marginTop: 56, display: "flex", gap: 30, justifyContent: "center", flexWrap: "wrap", color: "#7a7a88", fontSize: 13, animationDelay: ".4s" }}>
            {["Born at a real bachelor party", "Lore by Claude", "Art by nano-banana", "Shipped to your door"].map((x) => (
              <span key={x} style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ color: "#d8b24a" }}>◆</span>{x}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ===== APP =====
  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(1200px 600px at 50% -10%, ${themeObj.bg[1]} 0%, #14121c 50%, #0a090f 100%)`, color: "#e8e8f0", fontFamily: UI_FONT, padding: "0 0 80px", transition: "background .6s" }}>
      <GlobalCSS />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px 0", maxWidth: 1040, margin: "0 auto" }}>
        <div onClick={() => setLanding(true)} style={{ cursor: "pointer", fontFamily: DISPLAY_FONT, fontSize: 13, letterSpacing: 5, textTransform: "uppercase", color: "#d8b24a" }}>✦ Side Quest</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={newDeck} style={navBtn}>＋ New</button>
          <button onClick={() => setShowDecks(true)} style={navBtn}>◈ My decks{savedDecks.length ? ` (${savedDecks.length})` : ""}</button>
        </div>
      </div>
      <div style={{ textAlign: "center", padding: "16px 20px 10px" }}>
        <Stepper step={step} />
      </div>

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "26px 20px 0" }}>
        {error && (
          <div style={{ background: "rgba(239,91,107,0.12)", border: "1px solid #ef5b6b", color: "#ffc4cb", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: 14 }}>⚠ {error}</div>
        )}

        {/* STEP 0: EVENT */}
        {step === 0 && (
          <Panel title="What's the occasion?" sub="Pick the kind of event you're building for.">
            <div style={grid(240)}>
              {EVENT_TYPES.map((e) => (
                <SelectCard key={e.id} active={eventType === e.id} onClick={() => setEventType(e.id)} icon={e.icon} title={e.label} hint={e.hint} />
              ))}
            </div>
            <NavRow onNext={() => setStep(1)} nextOk={canNext[0]} />
          </Panel>
        )}

        {/* STEP 1: WORLD */}
        {step === 1 && (
          <Panel title="Choose a world" sub="The lore, the fonts, and the card style all adapt to this.">
            <div style={grid(200)}>
              {THEMES.map((t) => (
                <button key={t.id} onClick={() => setTheme(t.id)} className="ql-fade" style={{
                  textAlign: "left", cursor: "pointer", borderRadius: 14, padding: 16, overflow: "hidden",
                  border: `1.5px solid ${theme === t.id ? "#f3cf5b" : "#33333e"}`,
                  background: theme === t.id ? "rgba(243,207,91,0.08)" : "rgba(255,255,255,0.02)", transition: "all .2s",
                }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                    {t.swatch.map((c, i) => <div key={i} style={{ width: 26, height: 26, borderRadius: 6, background: c, border: "1px solid rgba(255,255,255,0.1)" }} />)}
                  </div>
                  <div style={{ fontFamily: t.displayFont, fontSize: 18, fontWeight: 700, color: t.accent }}>{t.label}</div>
                  <div style={{ color: "#9a9aa8", fontSize: 13, marginTop: 2 }}>{t.sub}</div>
                </button>
              ))}
            </div>
            <NavRow onBack={() => setStep(0)} onNext={() => setStep(2)} nextOk={canNext[1]} />
          </Panel>
        )}

        {/* STEP 2: QUEST */}
        {step === 2 && (
          <Panel title="Describe the quest" sub="The goal, the vibe, the inside jokes. Claude turns this into your deck's lore.">
            <textarea value={questPrompt} onChange={(e) => setQuestPrompt(e.target.value)} rows={6}
              placeholder="e.g. Dave's bachelor party in Lisbon. Complete dares across the city to 'earn back' his freedom before the wedding. He fears seagulls and loves bad karaoke."
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
            <div style={{ fontSize: 12, color: "#7a7a88", marginTop: 8 }}>Tip: name the guest of honor, the place, and a couple personal details for sharper cards.</div>
            <NavRow onBack={() => setStep(1)} onNext={() => setStep(3)} nextOk={canNext[2]} />
          </Panel>
        )}

        {/* STEP 3: CAST */}
        {step === 3 && (
          <Panel title="Add your cast" sub="Each guest becomes a character card. Add their name and a clear face photo — it becomes the card's portrait.">
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 16, borderRadius: 10, border: "1px solid #33333e", background: "rgba(243,207,91,0.05)", color: "#c8c8d4", fontSize: 13, lineHeight: 1.4 }}>
              <span style={{ fontSize: 18 }}>📸</span>
              <span>Upload a front-facing photo for each person — a visible face works best, and each one becomes that hero's portrait.</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {participants.map((p) => (
                <div key={p.id} className="ql-fade" style={{ display: "flex", gap: 12, alignItems: "center", padding: 12, borderRadius: 12, border: "1px solid #33333e", background: "rgba(255,255,255,0.02)" }}>
                  <label title="Upload a face photo" style={{ position: "relative", width: 64, height: 64, borderRadius: 12, flexShrink: 0, overflow: "hidden", cursor: "pointer", border: p.photo ? "1px solid #33333e" : "1px dashed #66667a", display: "flex", alignItems: "center", justifyContent: "center", background: p.photo ? "transparent" : "rgba(255,255,255,0.03)" }}>
                    {p.photo ? (
                      <>
                        <img src={p.photo} alt={p.name || "participant"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <span style={{ position: "absolute", bottom: 0, left: 0, right: 0, fontSize: 9, textAlign: "center", padding: "1px 0", background: "rgba(0,0,0,0.55)", color: "#f3cf5b" }}>change</span>
                      </>
                    ) : (
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: "#8a8a9a", fontSize: 10 }}>
                        <span style={{ fontSize: 20 }}>＋</span>photo
                      </span>
                    )}
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files[0] && onPhoto(p.id, e.target.files[0])} />
                  </label>
                  <input value={p.name} onChange={(e) => updateParticipant(p.id, { name: e.target.value })} placeholder="Name" style={{ ...inputStyle, flex: 1, margin: 0 }} />
                  <button onClick={() => removeParticipant(p.id)} title="Remove" style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 20 }}>✕</button>
                </div>
              ))}
            </div>
            <GhostButton onClick={addParticipant} style={{ marginTop: 14, width: "100%" }}>＋ Add participant</GhostButton>
            {participants.some((p) => p.photo) && (
              <label style={{ display: "flex", gap: 9, alignItems: "flex-start", marginTop: 16, fontSize: 13, color: "#c8c8d4", lineHeight: 1.4, cursor: "pointer" }}>
                <input type="checkbox" checked={photoConsent} onChange={(e) => setPhotoConsent(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
                <span>I confirm I have permission from everyone whose photo I uploaded to use their likeness to generate character art.</span>
              </label>
            )}
            <NavRow onBack={() => setStep(2)} onNext={() => runGeneration()} nextOk={canNext[3]} nextLabel="✦ Generate deck" />
          </Panel>
        )}

        {/* STEP 4: REVEAL */}
        {step === 4 && (
          <div>
            {genState === "lore" && <BigLoader label="Claude is writing your deck's lore…" />}
            {(genState === "art" || genState === "done") && (
              <>
                {questCard && (
                  <div className="ql-fade" style={{ marginBottom: 28 }}>
                    <SectionLabel>The Quest</SectionLabel>
                    <QuestBanner q={questCard} t={themeObj} />
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <SectionLabel>{genState === "art" ? "Dealing your deck…" : "Your deck — tap a card to flip, refine below"}</SectionLabel>
                  {genState === "done" && (
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <GhostButton onClick={() => setStep(3)}>← Edit cast</GhostButton>
                      <GhostButton onClick={saveCurrentDeck}>
                        {saveState === "saving" ? "Saving…" : saveState === "saved" ? "✓ Saved" : "⤓ Save deck"}
                      </GhostButton>
                      <PrimaryButton onClick={() => setStep(5)}>Order deck →</PrimaryButton>
                    </div>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(232px, 1fr))", gap: 26, justifyItems: "center", marginTop: 18 }}>
                  {cards.map((c) => (
                    <GameCard key={c.uid} card={c} theme={themeObj} art={arts[c.uid]} loadingArt={loadingArt[c.uid]}
                      photo={(participants.find((p) => p.id === c.pid) || {}).photo || null}
                      flipped={!!flipped[c.uid]} onFlip={() => setFlipped((s) => ({ ...s, [c.uid]: !s[c.uid] }))}
                      compact busy={busyCard === c.uid} onRegenLore={AI_ENABLED ? () => regenLore(c.uid) : undefined} onRegenArt={() => regenArt(c.uid)} />
                  ))}
                </div>
              </>
            )}
            {genState === "error" && (
              <div style={{ textAlign: "center", padding: 40 }}>
                <p style={{ color: "#ffc4cb", marginBottom: 16 }}>Something went wrong generating your deck.</p>
                <PrimaryButton onClick={() => runGeneration()}>Try again</PrimaryButton>
              </div>
            )}
          </div>
        )}

        {/* STEP 5: ORDER */}
        {step === 5 && (
          <Panel title="Ship the real thing" sub="Premium card stock, full-bleed art, custom tuck box.">
            <div style={{ display: "flex", gap: 30, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
              <div style={{ display: "flex" }}>
                {cards.slice(0, 3).map((c, i) => (
                  <div key={c.uid} style={{ transform: `rotate(${(i - 1) * 8}deg) translateX(${(i - 1) * -26}px)`, zIndex: i }}>
                    <GameCard card={c} theme={themeObj} art={arts[c.uid]} photo={(participants.find((p) => p.id === c.pid) || {}).photo || null} flipped compact />
                  </div>
                ))}
              </div>
              <div style={{ minWidth: 260 }}>
                <div style={{ fontFamily: DISPLAY_FONT, fontSize: 24, marginBottom: 6 }}>{cards.length}-card custom deck</div>
                <div style={{ color: "#a8a8b8", marginBottom: 16 }}>Linen finish, full bleed, tuck box. Designed for {user.name || "your"} event.</div>
                <div style={{ fontFamily: DISPLAY_FONT, fontSize: 32, color: "#f3cf5b", marginBottom: 16 }}>$39<span style={{ fontSize: 16, color: "#a8a8b8" }}> + shipping</span></div>
                {orderPlaced ? (
                  <div style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid #5bef82", background: "rgba(91,239,130,0.10)", color: "#c9f7d6", fontSize: 14, lineHeight: 1.45 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>✓ Order started</div>
                    Checkout — Stripe payment, address capture, and the print-on-demand handoff — plugs in right here.
                  </div>
                ) : (
                  <PrimaryButton onClick={() => setOrderPlaced(true)} style={{ width: "100%" }}>Order physical deck</PrimaryButton>
                )}
                <GhostButton onClick={() => { setOrderPlaced(false); setStep(4); }} style={{ width: "100%", marginTop: 10 }}>← Back to deck</GhostButton>
              </div>
            </div>
          </Panel>
        )}
      </div>

      <div style={{ textAlign: "center", marginTop: 50, color: "#55555f", fontSize: 12 }}>Lore by Claude · Art by nano-banana (stubbed in this demo) · Side Quest MVP</div>

      {showDecks && (
        <DecksModal decks={savedDecks} onClose={() => setShowDecks(false)} onOpen={openDeck} onDelete={deleteDeck} onNew={newDeck} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SAVED DECKS MODAL
// ---------------------------------------------------------------------------

function DecksModal({ decks, onClose, onOpen, onDelete, onNew }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(5,4,10,0.7)", backdropFilter: "blur(4px)", zIndex: 50, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "60px 20px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="ql-fade" style={{ width: "100%", maxWidth: 560, background: "#16141e", border: "1px solid #2c2c36", borderRadius: 18, padding: 26, boxShadow: "0 40px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 22, margin: 0 }}>My decks</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#888", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        {decks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 0", color: "#8a8a98" }}>
            <div style={{ fontSize: 30, marginBottom: 10, opacity: 0.5 }}>◈</div>
            No saved decks yet. Build one and it'll appear here.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {decks.map((d) => {
              const th = THEMES.find((t) => t.id === d.theme) || THEMES[1];
              const ev = EVENT_TYPES.find((e) => e.id === d.eventType);
              return (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, border: "1px solid #2c2c36", background: "rgba(255,255,255,0.02)" }}>
                  <div style={{ width: 40, height: 54, borderRadius: 6, flexShrink: 0, background: `linear-gradient(160deg, ${th.accent}44, ${th.bg[0]})`, border: `1px solid ${th.accent}`, display: "flex", alignItems: "center", justifyContent: "center", color: th.accent }}>{th.ornament}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: UI_FONT, fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</div>
                    <div style={{ fontSize: 12, color: "#8a8a98" }}>{ev?.label || d.eventType} · {th.label} · {d.count} cards</div>
                  </div>
                  <button onClick={() => onOpen(d.id)} style={{ ...navBtn, borderColor: "#d8b24a", color: "#f3cf5b" }}>Open</button>
                  <button onClick={() => onDelete(d.id)} style={{ background: "none", border: "none", color: "#777", cursor: "pointer", fontSize: 16 }}>🗑</button>
                </div>
              );
            })}
          </div>
        )}
        <button onClick={onNew} style={{ width: "100%", marginTop: 16, padding: "12px", borderRadius: 10, border: "1px dashed #4a4a56", background: "transparent", color: "#c8c8d4", cursor: "pointer", fontFamily: UI_FONT, fontSize: 14 }}>＋ Start a new deck</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SMALL COMPONENTS
// ---------------------------------------------------------------------------

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "13px 15px", borderRadius: 10, border: "1px solid #3a3a46", background: "rgba(255,255,255,0.03)", color: "#f0f0f6", fontFamily: UI_FONT, fontSize: 15, marginBottom: 4 };

const navBtn = { fontFamily: UI_FONT, fontSize: 13, padding: "8px 14px", borderRadius: 8, border: "1px solid #3a3a46", background: "rgba(255,255,255,0.03)", color: "#c8c8d4", cursor: "pointer" };

function GlobalCSS() {
  return <style>{`
    .ql-spin{border:3px solid; border-radius:50%; animation:qlspin .8s linear infinite;}
    @keyframes qlspin{to{transform:rotate(360deg)}}
    .ql-fade{animation:qlfade .6s ease both;}
    @keyframes qlfade{from{opacity:0; transform:translateY(12px)} to{opacity:1; transform:none}}
    input::placeholder, textarea::placeholder{color:#6c6c78;}
    @keyframes qlfloat{0%,100%{transform:translateY(0) rotate(var(--r))}50%{transform:translateY(-22px) rotate(var(--r))}}
  `}</style>;
}

function FloatingCards() {
  const items = [
    { l: "8%", t: "18%", r: "-12deg", d: "0s", c: "#c9a227" },
    { l: "82%", t: "22%", r: "10deg", d: ".6s", c: "#56c4ef" },
    { l: "14%", t: "62%", r: "8deg", d: "1.1s", c: "#ef5b6b" },
    { l: "78%", t: "64%", r: "-9deg", d: "1.6s", c: "#b15bef" },
  ];
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}>
      {items.map((x, i) => (
        <div key={i} style={{ position: "absolute", left: x.l, top: x.t, "--r": x.r, animation: `qlfloat 6s ease-in-out ${x.d} infinite`, width: 96, height: 134, borderRadius: 10, background: `linear-gradient(160deg, ${x.c}33, #0a0a14)`, border: `1.5px solid ${x.c}88`, boxShadow: "0 20px 40px rgba(0,0,0,0.5)", opacity: 0.7 }}>
          <div style={{ margin: 8, height: 64, borderRadius: 6, background: `${x.c}22`, border: `1px solid ${x.c}55` }} />
          <div style={{ margin: "0 8px", height: 6, borderRadius: 3, background: `${x.c}55` }} />
          <div style={{ margin: "6px 8px", height: 6, width: "60%", borderRadius: 3, background: `${x.c}33` }} />
        </div>
      ))}
    </div>
  );
}

function Panel({ title, sub, children }) {
  return (
    <div className="ql-fade" style={{ maxWidth: 660, margin: "0 auto", background: "rgba(255,255,255,0.025)", border: "1px solid #2c2c36", borderRadius: 20, padding: "30px 30px 26px", boxShadow: "0 30px 60px rgba(0,0,0,0.35)" }}>
      <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 26, margin: "0 0 4px" }}>{title}</h2>
      {sub && <p style={{ color: "#9a9aa8", fontSize: 14, margin: "0 0 22px" }}>{sub}</p>}
      {children}
    </div>
  );
}

// auto-fit + minmax so the wizard grids collapse to fewer columns on narrow
// screens instead of crushing fixed columns. `min` is the smallest a card may
// shrink to before the grid drops a column.
function grid(min) { return { display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 14 }; }

function SelectCard({ active, onClick, icon, title, hint }) {
  return (
    <button onClick={onClick} className="ql-fade" style={{ textAlign: "left", cursor: "pointer", borderRadius: 14, padding: 18, border: `1.5px solid ${active ? "#f3cf5b" : "#33333e"}`, background: active ? "rgba(243,207,91,0.08)" : "rgba(255,255,255,0.02)", transition: "all .2s" }}>
      <div style={{ fontSize: 26, color: active ? "#f3cf5b" : "#c8c8d4", marginBottom: 8 }}>{icon}</div>
      <div style={{ fontFamily: DISPLAY_FONT, fontSize: 17, fontWeight: 600 }}>{title}</div>
      <div style={{ color: "#9a9aa8", fontSize: 13, marginTop: 3 }}>{hint}</div>
    </button>
  );
}

function NavRow({ onBack, onNext, nextOk, nextLabel = "Continue →" }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 26, gap: 12 }}>
      {onBack ? <GhostButton onClick={onBack}>← Back</GhostButton> : <span />}
      <PrimaryButton onClick={onNext} disabled={!nextOk}>{nextLabel}</PrimaryButton>
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "#d8b24a", marginBottom: 4 }}>{children}</div>;
}

function QuestBanner({ q, t }) {
  return (
    <div style={{ borderRadius: 16, padding: "22px 26px", background: `linear-gradient(135deg, ${t.accent}22, rgba(177,91,239,0.08))`, border: `1px solid ${t.accent}55` }}>
      <div style={{ fontFamily: t.displayFont, fontSize: 22, fontWeight: 700, color: t.accent }}>{q.title}</div>
      <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#9a9aa8", margin: "2px 0 12px" }}>{q.typeLine}</div>
      <div style={{ fontSize: 15, lineHeight: 1.5, marginBottom: 10 }}>{q.ability}</div>
      <div style={{ fontStyle: "italic", color: "#c8c8d4", fontSize: 14 }}>“{q.flavor}”</div>
    </div>
  );
}

function BigLoader({ label }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px" }}>
      <div className="ql-spin" style={{ width: 48, height: 48, margin: "0 auto 20px", borderColor: "#d8b24a44", borderTopColor: "#f3cf5b" }} />
      <div style={{ fontFamily: DISPLAY_FONT, fontSize: 20, color: "#f3cf5b" }}>{label}</div>
      <div style={{ fontSize: 13, color: "#7a7a88", marginTop: 8 }}>A few seconds of magic.</div>
    </div>
  );
}
