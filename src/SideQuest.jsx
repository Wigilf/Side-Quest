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

const STEPS = ["Quest", "Cast", "Build", "Reveal", "Order"];

// Deck Builder — non-character card categories. Each preset ships with a couple
// of static template cards (an instant starting ground); "Suggest from lore"
// swaps in AI-tailored ones. Users can also add fully custom categories.
const FRAME_KEYS = ["gold", "azure", "crimson", "verdant", "violet"];
const CATEGORY_TEMPLATES = {
  NPCs: [
    { title: "The Wandering Merchant", typeLine: "Legendary Creature — Merchant NPC", cost: 3, power: 2, toughness: 3, ability: "Once per quest, swap any item in your hand for one from the discard pile.", flavor: "“Everything's for sale. Especially secrets.”" },
    { title: "The Gatekeeper", typeLine: "Creature — Guardian NPC", cost: 4, power: 3, toughness: 5, ability: "Opponents must answer a riddle or skip their next challenge.", flavor: "“None shall pass — unless you know the password.”" },
  ],
  Artifacts: [
    { title: "Ancient Relic", typeLine: "Artifact — Relic", cost: 2, power: 0, toughness: 0, ability: "Tap to draw a card; if it's a spell, cast it for free.", flavor: "“Older than the quest itself.”" },
    { title: "Enchanted Compass", typeLine: "Artifact — Equipment", cost: 1, power: 0, toughness: 0, ability: "The equipped hero cannot be misled or lost during any challenge.", flavor: "“It points not north, but home.”" },
  ],
  Spells: [
    { title: "Arcane Bolt", typeLine: "Sorcery", cost: 2, power: 0, toughness: 0, ability: "Deal 3 damage to any target; draw a card if it resolved a challenge.", flavor: "“Aim first. Apologize later.”" },
    { title: "Rally the Party", typeLine: "Instant", cost: 3, power: 0, toughness: 0, ability: "All heroes gain +1/+1 until the end of the current challenge.", flavor: "“One more round. For glory.”" },
  ],
  Locations: [
    { title: "The Forgotten Tavern", typeLine: "Land — Location", cost: 0, power: 0, toughness: 0, ability: "Tap: a hero here recovers and readies for the next challenge.", flavor: "“Every quest begins and ends at the bar.”" },
  ],
  Creatures: [
    { title: "Loyal Companion", typeLine: "Creature — Beast", cost: 2, power: 2, toughness: 2, ability: "Whenever your hero takes on a challenge, this creature joins them.", flavor: "“Good boy. Terrifying, but good.”" },
  ],
};
const CATEGORY_PRESET_NAMES = ["NPCs", "Artifacts", "Spells", "Locations", "Creatures"];

let _specSeq = 0;
function makeSpecCard(tpl = {}, i = 0) {
  _specSeq += 1;
  const card = {
    id: "sc_" + Date.now().toString(36) + "_" + _specSeq,
    frame: FRAME_KEYS[i % FRAME_KEYS.length],
    title: "", typeLine: "", cost: 1, power: 0, toughness: 0, ability: "", flavor: "",
    ...tpl,
  };
  // GameCard renders flavor already wrapped in “quotes”, so strip any surrounding
  // quotes the template or AI suggestion included to avoid double-quoting.
  if (typeof card.flavor === "string") card.flavor = card.flavor.replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "");
  return card;
}

// ---------------------------------------------------------------------------
// LORE LIBRARY — guided starting prompts. Pick a Setting (the world) and an
// Occasion (the vibe); they compose into the quest textarea, then the user
// personalizes. Combining one from each is the intended flow.
// ---------------------------------------------------------------------------
const SETTING_LORES = [
  { id: "high-fantasy", icon: "🐉", name: "High Fantasy", text: "You are adventurers in the realm of Eldenmoor, a land of dragon-guarded taverns, scheming guilds, and cursed relics. Every quest is issued by the Guildmaster and rewards are paid in glory and mead. Quests should sound like medieval bounties: slaying \"beasts\" (mundane obstacles), retrieving \"artifacts\" (everyday objects), and charming \"nobles\" (strangers). Tone: epic, tongue-in-cheek, full of \"thee\" and \"thou.\"" },
  { id: "cyberpunk", icon: "🌆", name: "Cyberpunk Future", text: "The year is 2189 in Neon City, where megacorps own the skyline and street runners trade favors in credits. Players are mercenary hackers taking contracts from a mysterious fixer known only as Ghost. Quests should read like black-market jobs: \"extract intel\" (get information from people), \"infiltrate a node\" (enter a venue), \"jack in\" (use tech in creative ways). Tone: gritty, neon-soaked, slang-heavy." },
  { id: "ancient-greece", icon: "🏛️", name: "Ancient Greece", text: "Mount Olympus is bored, and the gods have descended to toy with mortals. Players are heroes competing for divine favor — each quest is a \"labor\" handed down by a different god (Dionysus assigns revelry, Hermes assigns trickery, Aphrodite assigns charm). Completing labors earns laurels; failing angers the Fates. Tone: mythic and grandiose, with dramatic epithets for every player." },
  { id: "pirate", icon: "🏴‍☠️", name: "Pirate High Seas", text: "Ye be the crew of the Salty Siren, sailing cursed waters in search of the Lost Booty of Captain Marrow. Every quest is a heading on the treasure map: plundering \"ports\" (bars, shops), recruiting \"crew\" (strangers), and surviving \"krakens\" (challenges). Rum references encouraged. Tone: rowdy, superstitious, and full of pirate-speak." },
  { id: "wild-west", icon: "🤠", name: "Wild West", text: "Welcome to Dustgulch, a lawless frontier town where fortunes are won at the card table and lost at high noon. Players are outlaws collecting bounties posted by the enigmatic Sheriff. Quests read like wanted posters: \"wrangle\" (convince someone of something), \"duel\" (challenge a friend), \"rob the stagecoach\" (acquire an item). Tone: drawling, dusty, and dramatic." },
  { id: "noir", icon: "🕵️", name: "Noir Detective", text: "The city never sleeps, and neither do you. It's 1947, the rain won't quit, and every player is a private eye chasing leads in a case that goes all the way to the top. Quests are \"leads\" delivered in cryptic notes: tail a suspect, extract a confession, find the dame with the red scarf. Tone: hardboiled monologue, moody, cigarette-smoke metaphors." },
  { id: "space-opera", icon: "🚀", name: "Space Opera", text: "Aboard the starship Vagrant Dawn, players are a misfit crew charting the outer rim. Mission Control (the deck) transmits directives: make first contact with \"alien species\" (strangers), harvest \"resources\" (drinks, snacks, objects), and repair \"hull breaches\" (fix awkward situations). Tone: dramatic captain's-log narration with beeping-console energy." },
  { id: "post-apocalyptic", icon: "☢️", name: "Post-Apocalyptic", text: "The bombs fell decades ago. Players are wasteland scavengers surviving in the ruins, trading bottle caps and rumors. Quests come from a crackling radio voice called The Broadcaster: scavenge supplies, form alliances with rival factions (other groups of people), and defend the settlement. Tone: bleak but darkly funny, Mad Max meets Fallout." },
  { id: "norse", icon: "⚔️", name: "Norse Saga", text: "Odin watches, and Valhalla only takes the worthy. Players are Viking warriors proving themselves through feats of strength, cunning, and feasting. Each quest is a \"saga verse\" to be earned: raid the \"mead hall\" (bar), best a rival in \"holmgang\" (any contest), earn a kenning (nickname) from a stranger. Tone: booming, boastful, skald-poetry flavored." },
  { id: "egypt", icon: "🐫", name: "Ancient Egypt", text: "The Pharaoh has died without an heir, and the gods will crown whoever completes the Trials of the Nile. Players are priests, thieves, and nobles vying for the throne. Quests are trials inscribed on \"scrolls\": appease Anubis, decode omens, collect tribute. Completing trials earns scarabs. Tone: mysterious, ceremonial, curse-laden." },
  { id: "feudal-japan", icon: "🏯", name: "Feudal Japan", text: "Players are wandering ronin and shadow-walking shinobi in a land of warring clans. The mysterious Daimyo issues missions via secret scrolls: gather intelligence in the \"tea house\" (any venue), master a discipline (a mini-challenge), move unseen (stealth-flavored social tasks). Honor is gained and lost with every quest. Tone: poetic, disciplined, with haiku-adjacent flourishes." },
  { id: "victorian-gothic", icon: "🕯️", name: "Victorian Gothic", text: "Fog rolls over the cobblestones of Ravenshollow, where every mansion hides a secret and every guest may be a ghost. Players are paranormal investigators for the Society of the Veil. Quests are \"hauntings\" to resolve: commune with spirits (talk to strangers), collect cursed objects, survive the witching hour. Tone: ominous, candlelit, deliciously melodramatic." },
  { id: "superhero", icon: "🦸", name: "Superhero City", text: "By day you're ordinary citizens; by night, Metro City's last line of defense. The Commissioner's hotline (the deck) dispatches emergencies: rescue civilians (help strangers), foil the villain (playful sabotage of friends), maintain your secret identity (covert tasks nobody can notice). Tone: comic-book bombast, POW-BAM energy, every player gets a hero name." },
  { id: "secret-agent", icon: "🕴️", name: "Secret Agent", text: "Good evening, Agent. Your handler at the Agency has activated your cell for Operation Nightfall. Quests are classified missions: plant \"bugs\" (hide objects), make dead drops, extract information from \"assets\" (strangers) without blowing cover. Every quest self-destructs after reading. Tone: sleek, deadpan, martini-dry." },
  { id: "lost-expedition", icon: "🧭", name: "Lost Expedition", text: "Players are members of the 1932 Royal Expedition into uncharted jungle, searching for the Golden Idol. The expedition journal (the deck) records objectives: catalog \"specimens\" (photos of odd things), trade with \"locals\" (strangers), avoid ancient traps (physical challenges). Tone: pith-helmet adventure serial, breathless and pulpy." },
  { id: "fairy-tale", icon: "🧚", name: "Enchanted Fairy Tale", text: "Once upon a time, players wandered into the Whispering Woods, where a mischievous fairy cursed them: only by completing her whimsical tasks may they leave. Quests are riddles and mischief: earn a \"true smile\" from a stranger, gather magic ingredients, break tiny curses on friends. Tone: storybook-sweet with a wicked twinkle." },
  { id: "mob-1930s", icon: "🎩", name: "1930s Mob", text: "The Family runs this town, and tonight you're all made members proving your loyalty to the Don. Quests are \"jobs\" whispered through the grapevine: collect debts (retrieve items), run numbers (counting/estimation challenges), earn respect at the speakeasy. Snitches get stitches. Tone: wise-guy slang, loyalty, cannoli." },
  { id: "time-travelers", icon: "⏳", name: "Time Travelers", text: "The Timeline is fracturing, and players are agents of the Chrono Bureau sent to repair anachronisms. Each quest jumps eras: act like a caveman, toast like a Roman, dance like it's 1977, speak like the year 3000. Fix enough fractures and history survives. Tone: chaotic, era-hopping, gloriously confused." },
];

const EVENT_LORES = [
  { id: "bachelor", icon: "🍻", name: "Bachelor Party", text: "Tonight, one man leaves bachelorhood forever — but not before his crew drags him through one final legendary campaign. The Groom is the Chosen One; everyone else is his party of guardians. Quests revolve around embarrassing (lovingly), celebrating, and testing the Groom: collect stories about him from strangers, complete challenges he must approve, and build the Legend of His Last Night. Tone: rowdy, brotherly, ceremonial." },
  { id: "bachelorette", icon: "👑", name: "Bachelorette Party", text: "The Bride ascends the throne tomorrow — tonight, her court of honor completes the Rites of the Crown. Quests mix glam and chaos: gather \"blessings\" from strangers, complete dares the Bride assigns, protect the Bride's drink at all costs, and document everything for the sacred archive (group chat). Tone: glittery, dramatic, empowering, slightly unhinged." },
  { id: "trip", icon: "✈️", name: "Trip with Friends", text: "You are a fellowship on a journey through foreign lands, and the trip itself is the campaign. Quests turn travel moments into objectives: befriend a local, eat something you can't pronounce, find the best viewpoint, haggle for a souvenir, navigate without GPS for an hour. Side quests unlock at airports, trains, and wrong turns. Tone: wanderlust-y, spontaneous, \"when in Rome.\"" },
  { id: "drinking-game", icon: "🍺", name: "Drinking Game Night", text: "The Tavern Keeper (the deck) rules the table tonight, and every card is a decree. Quests are drinking challenges, toasts, and social gambits: invent a toast for the person to your left, defend your worst opinion or drink, speak in accents until your next turn. Refusal has a price (a sip, a dare, a forfeit). Always drink responsibly — water is a legal potion. Tone: mischievous, escalating, tavern-rules." },
  { id: "house-party", icon: "🎉", name: "House Party", text: "The house is the dungeon, the rooms are its chambers, and the party is the raid. Quests send players across the map: charm the kitchen crowd, start a dance floor from nothing, discover a secret about the host, forge an alliance with someone you've never met. The night ends when the final boss (cleanup) is defeated or evaded. Tone: social, mischievous, room-by-room." },
  { id: "birthday", icon: "🎂", name: "Birthday Party", text: "One hero levels up today, and the whole party plays in their honor. Quests orbit the Birthday Legend: collect birthday wishes in weird formats, complete challenges the Legend assigns from their throne, sing in unexpected places, find gifts that cost nothing. The Legend has veto power over everything. Tone: celebratory, worshipful, cake-obsessed." },
  { id: "pub-crawl", icon: "🍸", name: "Pub Crawl", text: "Tonight you walk the Path of Five Taverns (or however many you survive). Each venue is a new level with its own quests: learn the bartender's name, earn a stranger's toast, adopt a new team member for one bar only, leave a positive review in rhyme. Bosses appear at closing time. Pace yourselves, hydrate between levels. Tone: episodic, escalating, map-based." },
  { id: "music-festival", icon: "🎪", name: "Music Festival", text: "Players are pilgrims at the great gathering of sound. Quests use the festival as an open world: high-five your way to the front row, trade something with a stranger, learn a lyric from someone at a stage you'd never visit, find the weirdest outfit and compliment it sincerely, reunite the party when someone gets lost (they will). Tone: euphoric, sunburnt, communal." },
  { id: "office-party", icon: "💼", name: "Office Party", text: "HR has no idea what's about to happen. Players are colleagues on a covert mission to make the work event actually fun. Quests are workplace-safe mischief: get a department you never talk to laughing, decode a coworker's hidden talent, use three pieces of corporate jargon in one sincere sentence, start a legend about the office. Tone: playful, inclusive, PG-13, promotion-safe." },
  { id: "game-night", icon: "🎲", name: "Game Night", text: "The Council of the Table has convened. Between (or during) board games, the deck issues meta-quests: form a secret alliance, throw a round so subtly nobody notices, deliver a villain monologue when you win, defend the rules like a lawyer. Losing gracefully is a quest; winning obnoxiously is a war crime. Tone: competitive, theatrical, table-talk heavy." },
  { id: "beach-day", icon: "🏖️", name: "Beach Day", text: "The Tide Council demands tribute. Players are castaways making the most of the shore: build something ambitious out of sand, initiate a game with a neighboring towel-tribe, retrieve \"treasure\" from the water, achieve perfect nap conditions, protect the snacks from seagull raiders. Tone: sun-drunk, lazy, salt-crusted." },
  { id: "camping", icon: "⛺", name: "Camping Trip", text: "The wilderness has accepted your party — barely. Quests are trials of the wild: build the fire with style points, tell a story that genuinely spooks someone, identify one real constellation, cook something edible over flame, survive the night without checking your phone for an hour. The forest is always listening. Tone: cozy-spooky, s'mores-fueled, off-grid." },
  { id: "nye", icon: "🎆", name: "New Year's Eve", text: "The old year is dying; the new one must be summoned properly. Quests count down the ritual: confess a resolution to a stranger, perform a eulogy for the old year, secure your midnight toast partner, learn how \"Happy New Year\" is said in three languages, be mid-quest when the clock strikes. Tone: reflective, sparkly, countdown-driven." },
  { id: "wedding-reception", icon: "💍", name: "Wedding Reception", text: "Two houses unite tonight, and the guests are sworn to make it legendary. Quests are reception-safe missions: get a story about the couple from the oldest guest, dance with someone from \"the other side,\" deliver a one-sentence toast to a stranger, make a moment the photographer must capture. The couple is sacred; embarrassment must be aimed elsewhere. Tone: heartfelt, festive, aunt-friendly." },
  { id: "ski-trip", icon: "🎿", name: "Ski Trip", text: "The Mountain judges all. Players are lodge-dwellers and slope warriors earning their après-ski honors: survive a run one level above your comfort zone (safely), learn a stranger's home mountain, achieve maximum hot-drink coziness, dramatize your best wipeout as an epic tale. Tone: crisp, boastful, fireplace-warm." },
  { id: "halloween", icon: "🎃", name: "Halloween Party", text: "The Veil is thin tonight, and the deck speaks with the voice of Something Old. Quests are seasonal mischief: stay in character for a full conversation, get a stranger to explain their costume's lore, perform a dramatic reading of a spooky text, form a coven (alliance) with two other costumes. Tone: campy-creepy, theatrical, candy-powered." },
  { id: "murder-mystery", icon: "🔪", name: "Murder Mystery Dinner", text: "Someone at this table is not who they claim to be — and by dessert, the truth will out. Players are guests at Blackwood Manor, each hiding a secret, and the deck plays the role of the omniscient Butler slipping notes under the door. Quests fuel suspicion and drama: plant a \"clue\" (object) near another guest, drop your assigned secret word into conversation without being caught, publicly accuse someone with a fully improvised motive, form a whispered alliance that lasts exactly one course, deliver an alibi nobody asked for. Courses act as acts of the play — tension must rise with each one, and the final course ends in a dramatic group verdict. Tone: candlelit, suspicious, deliciously overacted; everyone is guilty of something." },
  { id: "road-trip", icon: "🚗", name: "Road Trip", text: "The Highway Spirit grants safe passage only to those who complete its trials. Quests unlock at gas stations, diners, and weird roadside attractions: rate a gas station snack like a sommelier, get the whole car singing one song, photograph the strangest sign, befriend a diner regular, navigate one stretch by vibes alone (passengers only — driver stays sacred). Tone: open-road, quirky, mile-marker episodic." },
  { id: "family-reunion", icon: "👨‍👩‍👧‍👦", name: "Family Reunion", text: "The Elders have gathered, the Cousins have assembled, and the deck is the family's secret game master. Quests bridge generations: extract an embarrassing story about a parent from a grandparent, learn a family recipe step, get three generations in one photo doing the same pose, settle (or reignite) a legendary family debate. Tone: warm, nostalgic, gently chaotic." },
];

// Pre-seed the lore library from the Event/World the user already picked so the
// Quest step arrives with a coherent suggestion rather than a blank slate.
const THEME_TO_SETTING = { starwars: "space-opera", lotr: "high-fantasy", onepiece: "pirate", cyber: "cyberpunk", noir: "noir" };
const EVENT_TO_OCCASION = { bachelor: "bachelor", trip: "trip", party: "house-party", drinking: "drinking-game", wedding: "wedding-reception", corporate: "office-party" };
// Each Setting maps to the closest visual theme so choosing a world also styles
// the cards (fonts/colors/art). A starting point — the World step can override.
const SETTING_TO_THEME = {
  "high-fantasy": "lotr", "cyberpunk": "cyber", "ancient-greece": "lotr", "pirate": "onepiece",
  "wild-west": "onepiece", "noir": "noir", "space-opera": "starwars", "post-apocalyptic": "noir",
  "norse": "lotr", "egypt": "potter", "feudal-japan": "lotr", "victorian-gothic": "potter",
  "superhero": "cyber", "secret-agent": "noir", "lost-expedition": "onepiece", "fairy-tale": "potter",
  "mob-1930s": "noir", "time-travelers": "starwars",
};

// Guided lore builder — structured guardrails the user fills in and we merge
// into one prompt. `chips` are optional quick-fill suggestions.
const GUARDRAIL_TYPES = [
  { id: "setting", label: "Setting", hint: "Indoors, outdoors, or a mix? Where does it happen?", chips: ["Indoors", "Outdoors", "A mix of both"] },
  { id: "location", label: "Location", hint: "The city, venue, or specific place" },
  { id: "duration", label: "Duration", hint: "How long should the quest run?", chips: ["An hour", "One evening", "All day", "A whole weekend"] },
  { id: "objectives", label: "Objectives", hint: "What must the group accomplish to win?" },
  { id: "enemies", label: "Enemies / obstacles", hint: "Who or what stands in their way?" },
  { id: "tone", label: "Tone", hint: "The overall vibe", chips: ["Funny", "Epic", "Wholesome", "Chaotic", "Romantic", "Spooky"] },
  { id: "rules", label: "Rules / constraints", hint: "Any special rules or limits to respect" },
  { id: "reward", label: "Reward / win", hint: "What do they get for finishing?" },
  { id: "custom", label: "Anything else", hint: "Any other detail Side Quest should weave in" },
];
const guardrailLabel = (id) => (GUARDRAIL_TYPES.find((g) => g.id === id) || { label: "Detail" }).label;

// Merge the free-text quest + any guardrails into one prompt for lore generation.
function mergeQuest(freeText, guardrails) {
  const parts = [];
  if ((freeText || "").trim()) parts.push(freeText.trim());
  (guardrails || []).forEach((g) => {
    const d = (g.details || "").trim();
    if (d) parts.push(`${guardrailLabel(g.type)}: ${d}`);
  });
  return parts.join("\n");
}

function composeLore(settingId, occasionId) {
  const s = SETTING_LORES.find((x) => x.id === settingId);
  const o = EVENT_LORES.find((x) => x.id === occasionId);
  const parts = [];
  if (s) parts.push(s.text);
  if (o) parts.push(o.text);
  return parts.length ? parts.join("\n\n") + "\n\n— Make it yours: name the guest(s) of honor, the place, and a couple of inside jokes." : "";
}

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

async function api(method, pathname, body) {
  const headers = { "Content-Type": "application/json" };
  if (API_TOKEN) headers["Authorization"] = `Bearer ${API_TOKEN}`;
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${pathname}`, opts);
  if (!res.ok) {
    let msg = `${pathname} ${res.status}`;
    try { const d = await res.json(); if (d.error) msg = d.error; } catch (e) { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}
const postJSON = (pathname, body) => api("POST", pathname, body);

// Anonymous per-device owner token — identifies "my decks" without a login.
// Small string in localStorage (no quota issue); an account can claim it later.
function getOwnerToken() {
  try {
    let t = localStorage.getItem("sq_owner");
    if (!t) { t = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "own_" + Math.random().toString(36).slice(2) + Date.now(); localStorage.setItem("sq_owner", t); }
    return t;
  } catch { return "own_ephemeral"; }
}
const newId = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "d_" + Math.random().toString(36).slice(2) + Date.now();

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
async function generateCardArt({ photoBase64, frameAccent, themeStyle, seedStr, lore, refineNote, objectMode, category }) {
  // Portrait mode needs a face photo; object mode (artifacts/spells/NPCs/…) is
  // text-to-image and needs no photo. Either way, call the backend when live.
  if (API_BASE && (photoBase64 || objectMode)) {
    try {
      const d = await postJSON("/api/generate-art", {
        photoBase64: photoBase64 || undefined,
        category: category || undefined,
        themeStyle,
        lore: { title: lore?.title, typeLine: lore?.typeLine },
        refineNote: refineNote || "",
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

function GameCard({ card, theme, art, photo, loadingArt, flipped, onFlip, onExpand, onRegenLore, onRegenArt, busy, compact, w, cardBack }) {
  const fr = CARD_FRAMES.find((f) => f.key === card.frame) || CARD_FRAMES[0];
  const t = theme;
  // Show the raw uploaded face only when the art is the procedural backdrop
  // (an SVG). A real AI portrait (raster png/jpeg) already contains the face.
  const showPhoto = photo && (!art || (typeof art === "string" && art.startsWith("data:image/svg")));
  const W = w || (compact ? 232 : 300);
  const scale = W / 300;
  const H = Math.round(440 * scale);
  const corner = (t.corner || 10) * scale;
  // Portraits are head-and-shoulders; the art window is wider than tall, so a
  // centered crop lops off the top of the head. Bias the crop upward so the
  // face stays fully visible.
  const artPos = "center 22%";

  return (
    <div style={{ width: W, perspective: 1200 }} onDoubleClick={onExpand}>
      <div
        onClick={onFlip}
        role={onFlip ? "button" : undefined}
        tabIndex={onFlip ? 0 : undefined}
        aria-label={onFlip ? `Flip ${card.realName}'s card` : undefined}
        onKeyDown={onFlip ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onFlip(); } } : undefined}
        style={{
          position: "relative", width: "100%", height: H,
          transformStyle: "preserve-3d", transition: "transform .7s cubic-bezier(.2,.8,.2,1)",
          transform: flipped ? "rotateY(0deg)" : "rotateY(180deg)", cursor: onFlip ? "pointer" : "default",
        }}
      >
        {/* ---- CARD BACK ---- */}
        <div style={{
          position: "absolute", inset: 0, backfaceVisibility: "hidden",
          transform: "rotateY(180deg)", borderRadius: corner, overflow: "hidden",
          background: `linear-gradient(160deg, ${t.bg[1]}, ${t.bg[0]})`,
          border: `2px solid ${t.accent}`, display: "flex", alignItems: "center",
          justifyContent: "center", flexDirection: "column", gap: 10,
          boxShadow: `0 18px 40px rgba(0,0,0,0.5)`,
        }}>
          {cardBack && cardBack.type === "image" && cardBack.image ? (
            <>
              <img src={cardBack.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.65) 100%)" }} />
              <div style={{ position: "absolute", bottom: 10 * scale, fontFamily: t.displayFont, color: "#fff", letterSpacing: 3, fontSize: 11 * scale, textTransform: "uppercase", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>Side Quest</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 40 * scale, color: t.accent, opacity: 0.9 }}>{t.ornament}</div>
              <div style={{ fontFamily: t.displayFont, color: t.accent, letterSpacing: 4, fontSize: 13 * scale, textTransform: "uppercase" }}>Side Quest</div>
              <div style={{ fontFamily: UI_FONT, color: t.ink, opacity: 0.5, fontSize: 10 * scale }}>tap to reveal</div>
            </>
          )}
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
                {art && <img src={art} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: artPos }} />}
                {/* real face, layered over the procedural backdrop when there's no AI art */}
                {showPhoto && <img src={photo} alt={card.realName} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: artPos }} />}
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
        AI_ENABLED && onRegenArt ? (
          <CardRefiner fr={fr} busy={busy} onRegenArt={onRegenArt} onRegenLore={onRegenLore} />
        ) : (
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            {onRegenArt && <button onClick={() => onRegenArt()} disabled={busy} style={refineBtn(fr, busy)}>↻ Art</button>}
            {onRegenLore && <button onClick={onRegenLore} disabled={busy} style={refineBtn(fr, busy)}>↻ Lore</button>}
          </div>
        )
      )}
    </div>
  );
}

function refineBtn(fr, busy) {
  return { flex: 1, fontFamily: UI_FONT, fontSize: 12, fontWeight: 500, padding: "7px 8px", borderRadius: 7, cursor: busy ? "wait" : "pointer", color: "#e8e8f0", background: "rgba(0,0,0,0.4)", border: `1px solid ${fr.accent}66`, opacity: busy ? 0.5 : 1 };
}

// Per-card art editor: type a prompt to restyle THIS card's portrait.
function CardRefiner({ fr, busy, onRegenArt, onRegenLore }) {
  const [note, setNote] = useState("");
  const go = () => { if (!busy) onRegenArt(note.trim()); };
  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") go(); }}
        disabled={busy}
        placeholder="Restyle this card — e.g. 'give her golden dragon armor'"
        style={{ width: "100%", boxSizing: "border-box", fontFamily: UI_FONT, fontSize: 12, padding: "8px 10px", borderRadius: 7, color: "#f0f0f6", background: "rgba(0,0,0,0.4)", border: `1px solid ${fr.accent}55` }}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={go} disabled={busy} style={refineBtn(fr, busy)}>{busy ? "Painting…" : (note.trim() ? "✦ Apply" : "↻ New art")}</button>
        {onRegenLore && <button onClick={onRegenLore} disabled={busy} style={refineBtn(fr, busy)}>↻ Lore</button>}
      </div>
    </div>
  );
}

// Enlarged view: a big card + editable fields. Opens on double-click of a card.
function CardEditorModal({ card, theme, art, photo, loadingArt, busy, onClose, onChange, onRegenArt, onRegenLore }) {
  const fr = CARD_FRAMES.find((f) => f.key === card.frame) || CARD_FRAMES[0];
  const [note, setNote] = useState("");
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const lbl = { display: "block", fontFamily: UI_FONT, fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: "#9a9aa8", marginBottom: 4 };
  const inp = { width: "100%", boxSizing: "border-box", fontFamily: UI_FONT, fontSize: 13, padding: "8px 10px", borderRadius: 8, color: "#f0f0f6", background: "rgba(0,0,0,0.4)", border: `1px solid ${fr.accent}55`, outline: "none" };
  const setText = (k) => (e) => onChange({ [k]: e.target.value });
  const setNum = (k) => (e) => onChange({ [k]: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) });
  const applyArt = () => { if (!busy && onRegenArt) onRegenArt(note.trim()); };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(5,4,10,0.78)", backdropFilter: "blur(6px)", zIndex: 60, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "center", alignItems: "flex-start", maxWidth: 820 }}>
        <GameCard card={card} theme={theme} art={art} photo={photo} loadingArt={loadingArt} flipped w={360} />
        <div style={{ width: 380, maxWidth: "100%", background: "rgba(18,16,26,0.97)", border: `1px solid ${fr.accent}44`, borderRadius: 16, padding: 22, boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontFamily: theme.displayFont, fontWeight: 700, fontSize: 18, color: "#f4f4fa" }}>Edit card</div>
            <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: "#c8c8d4", fontSize: 24, cursor: "pointer", lineHeight: 1, padding: 0 }}>×</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div><label style={lbl}>Title</label><input style={inp} value={card.title || ""} onChange={setText("title")} /></div>
            <div><label style={lbl}>Type line</label><input style={inp} value={card.typeLine || ""} onChange={setText("typeLine")} /></div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}><label style={lbl}>Cost</label><input style={inp} inputMode="numeric" value={card.cost ?? ""} onChange={setNum("cost")} /></div>
              <div style={{ flex: 1 }}><label style={lbl}>Power</label><input style={inp} inputMode="numeric" value={card.power ?? ""} onChange={setNum("power")} /></div>
              <div style={{ flex: 1 }}><label style={lbl}>Tough</label><input style={inp} inputMode="numeric" value={card.toughness ?? ""} onChange={setNum("toughness")} /></div>
            </div>
            <div><label style={lbl}>Ability</label><textarea style={{ ...inp, minHeight: 72, resize: "vertical", lineHeight: 1.35 }} value={card.ability || ""} onChange={setText("ability")} /></div>
            <div><label style={lbl}>Flavor</label><textarea style={{ ...inp, minHeight: 52, resize: "vertical", lineHeight: 1.35, fontStyle: "italic" }} value={card.flavor || ""} onChange={setText("flavor")} /></div>
            {(onRegenArt || onRegenLore) && (
              <div style={{ borderTop: `1px solid ${fr.accent}22`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={lbl}>AI restyle</label>
                {onRegenArt && (
                  <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyArt(); }} disabled={busy} placeholder="Restyle the art — e.g. 'add golden dragon armor'" style={inp} />
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  {onRegenArt && <button onClick={applyArt} disabled={busy} style={refineBtn(fr, busy)}>{busy ? "Painting…" : (note.trim() ? "✦ Apply art" : "↻ New art")}</button>}
                  {onRegenLore && <button onClick={onRegenLore} disabled={busy} style={refineBtn(fr, busy)}>↻ New lore</button>}
                </div>
              </div>
            )}
            <button onClick={onClose} style={{ marginTop: 6, padding: "11px", borderRadius: 10, border: "none", background: fr.accent, color: theme.bg[0], fontFamily: UI_FONT, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DECK BUILDER — user-defined categories of non-character cards
// ---------------------------------------------------------------------------
function builderBtn(active) {
  return { fontFamily: UI_FONT, fontSize: 13, fontWeight: 500, padding: "8px 12px", borderRadius: 8, cursor: active ? "wait" : "pointer", color: "#e8e8f0", background: "rgba(255,255,255,0.05)", border: "1px solid #3a3a45", opacity: active ? 0.6 : 1 };
}
function presetChip(used) {
  return { fontFamily: UI_FONT, fontSize: 13, padding: "7px 12px", borderRadius: 999, cursor: used ? "default" : "pointer", color: used ? "#5a5a66" : "#e8e8f0", background: used ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.05)", border: `1px solid ${used ? "#2a2a32" : "#3a3a45"}`, opacity: used ? 0.6 : 1 };
}

// One editable spec card (no art yet — lore fields only).
function SpecCardEditor({ card, onChange, onRemove }) {
  const fr = CARD_FRAMES.find((f) => f.key === card.frame) || CARD_FRAMES[0];
  const set = (k) => (e) => onChange({ [k]: e.target.value });
  const setNum = (k) => (e) => onChange({ [k]: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) });
  const inp = { width: "100%", boxSizing: "border-box", fontFamily: UI_FONT, fontSize: 12, padding: "6px 8px", borderRadius: 6, color: "#f0f0f6", background: "rgba(0,0,0,0.35)", border: `1px solid ${fr.accent}44`, outline: "none" };
  return (
    <div style={{ border: `1px solid ${fr.accent}66`, borderRadius: 10, padding: 10, background: "rgba(0,0,0,0.25)", display: "flex", flexDirection: "column", gap: 6, position: "relative" }}>
      <button onClick={onRemove} title="Remove card" style={{ position: "absolute", top: 6, right: 6, background: "transparent", border: "none", color: "#8a8a98", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>✕</button>
      <input value={card.title || ""} onChange={set("title")} placeholder="Card title" style={{ ...inp, fontWeight: 700, paddingRight: 22 }} />
      <input value={card.typeLine || ""} onChange={set("typeLine")} placeholder="Type line" style={inp} />
      <div style={{ display: "flex", gap: 6 }}>
        <input value={card.cost ?? ""} onChange={setNum("cost")} inputMode="numeric" placeholder="Cost" title="Cost" style={inp} />
        <input value={card.power ?? ""} onChange={setNum("power")} inputMode="numeric" placeholder="Pow" title="Power" style={inp} />
        <input value={card.toughness ?? ""} onChange={setNum("toughness")} inputMode="numeric" placeholder="Tuf" title="Toughness" style={inp} />
      </div>
      <textarea value={card.ability || ""} onChange={set("ability")} placeholder="Ability" style={{ ...inp, minHeight: 46, resize: "vertical", lineHeight: 1.3 }} />
      <textarea value={card.flavor || ""} onChange={set("flavor")} placeholder="Flavor quote" style={{ ...inp, minHeight: 34, resize: "vertical", lineHeight: 1.3, fontStyle: "italic" }} />
    </div>
  );
}

function DeckBuilder({ theme, categories, suggestingCat, aiEnabled, onAddCategory, onRemoveCategory, onRenameCategory, onAddCard, onUpdateCard, onRemoveCard, onSuggest }) {
  const [custom, setCustom] = useState("");
  const usedNames = new Set(categories.map((c) => (c.name || "").toLowerCase()));
  const addCustom = () => { const v = custom.trim(); if (v) { onAddCategory(v); setCustom(""); } };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {categories.length === 0 && (
        <div style={{ textAlign: "center", color: "#8a8a98", fontSize: 14, padding: "6px 0 2px" }}>
          Your heroes are already covered by the Cast. Add a category below to bring in NPCs, artifacts, spells, and more.
        </div>
      )}
      {categories.map((cat) => {
        const busy = suggestingCat === cat.id;
        return (
          <div key={cat.id} style={{ border: "1px solid #33333e", borderRadius: 14, background: "rgba(255,255,255,0.02)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid #26262e", background: "rgba(0,0,0,0.2)" }}>
              <input value={cat.name} onChange={(e) => onRenameCategory(cat.id, e.target.value)} aria-label="Category name" style={{ fontFamily: theme.displayFont, fontWeight: 700, fontSize: 16, color: "#f4f4fa", background: "transparent", border: "none", outline: "none", flex: 1, minWidth: 0 }} />
              <span style={{ fontFamily: UI_FONT, fontSize: 12, color: "#8a8a98" }}>{cat.cards.length} card{cat.cards.length === 1 ? "" : "s"}</span>
              <button onClick={() => onRemoveCategory(cat.id)} title="Remove category" style={{ background: "transparent", border: "none", color: "#8a8a98", cursor: "pointer", fontSize: 15, lineHeight: 1 }}>✕</button>
            </div>
            {cat.cards.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12, padding: 14 }}>
                {cat.cards.map((sc) => (
                  <SpecCardEditor key={sc.id} card={sc} onChange={(patch) => onUpdateCard(cat.id, sc.id, patch)} onRemove={() => onRemoveCard(cat.id, sc.id)} />
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, padding: cat.cards.length ? "0 14px 14px" : "14px", flexWrap: "wrap" }}>
              <button onClick={() => onAddCard(cat.id)} style={builderBtn(false)}>＋ Add card</button>
              {aiEnabled && (
                <button onClick={() => onSuggest(cat.id, cat.name)} disabled={busy} style={builderBtn(busy)}>
                  {busy ? "Conjuring…" : "✦ Suggest from lore"}
                </button>
              )}
            </div>
          </div>
        );
      })}
      <div style={{ border: "1px dashed #44444f", borderRadius: 14, padding: 16 }}>
        <div style={{ fontFamily: UI_FONT, fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase", color: "#8a8a98", marginBottom: 10 }}>Add a category</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {CATEGORY_PRESET_NAMES.map((n) => {
            const used = usedNames.has(n.toLowerCase());
            return <button key={n} onClick={() => !used && onAddCategory(n)} disabled={used} style={presetChip(used)}>+ {n}</button>;
          })}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }} placeholder="Custom category name…" style={{ flex: 1, boxSizing: "border-box", fontFamily: UI_FONT, fontSize: 13, padding: "9px 11px", borderRadius: 8, color: "#f0f0f6", background: "rgba(0,0,0,0.35)", border: "1px solid #3a3a45", outline: "none" }} />
          <button onClick={addCustom} style={builderBtn(false)}>Add</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LORE LIBRARY — Setting + Occasion pickers that compose the quest prompt
// ---------------------------------------------------------------------------
function loreChip(active) {
  return {
    fontFamily: UI_FONT, fontSize: 13, padding: "7px 12px", borderRadius: 999,
    cursor: "pointer", whiteSpace: "nowrap",
    color: active ? "#0b0b12" : "#dcdce4",
    background: active ? "#f3cf5b" : "rgba(255,255,255,0.05)",
    border: `1px solid ${active ? "#f3cf5b" : "#3a3a45"}`,
    fontWeight: active ? 700 : 500, transition: "all .15s",
  };
}
// Hoisted out of LoreLibrary so it isn't a fresh component type each render
// (which would remount the chip lists and reset their scroll on every keystroke).
function LoreGroup({ label, items, activeId, onPick }) {
  return (
    <div>
      <div style={{ fontFamily: UI_FONT, fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase", color: "#8a8a98", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "1px 2px 4px" }}>
        {items.map((it) => (
          <button key={it.id} onClick={() => onPick(it.id)} style={loreChip(it.id === activeId)}>{it.icon} {it.name}</button>
        ))}
      </div>
    </div>
  );
}
function LoreLibrary({ settingId, occasionId, onPickSetting, onPickOccasion }) {
  const Group = LoreGroup;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 18, padding: 16, borderRadius: 12, border: "1px solid #2a2a33", background: "rgba(255,255,255,0.02)" }}>
      <div style={{ fontSize: 13, color: "#c8c8d4", lineHeight: 1.4 }}>✨ <strong>Start from a template:</strong> pick a <strong>setting</strong> (also styles the cards) and an <strong>occasion</strong> to auto-write a starting prompt. Tap again to deselect — or skip these and just write your own below.</div>
      <Group label="Setting — the world" items={SETTING_LORES} activeId={settingId} onPick={onPickSetting} />
      <Group label="Occasion — the vibe" items={EVENT_LORES} activeId={occasionId} onPick={onPickOccasion} />
    </div>
  );
}

// Compact visual-theme picker. A chosen Setting sets this automatically; writing
// your own quest? Pick the card look here.
function CardStylePicker({ themeId, onPick }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: UI_FONT, fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase", color: "#8a8a98", marginBottom: 8 }}>Card style <span style={{ textTransform: "none", letterSpacing: 0, color: "#6c6c78" }}>— how the cards look (a setting sets this for you)</span></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {THEMES.map((t) => {
          const active = t.id === themeId;
          return (
            <button key={t.id} onClick={() => onPick(t.id)} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, cursor: "pointer",
              border: `1px solid ${active ? t.accent : "#3a3a45"}`, background: active ? `${t.accent}18` : "rgba(255,255,255,0.04)", transition: "all .15s",
            }}>
              <span style={{ display: "flex", gap: 3 }}>
                {t.swatch.map((c, i) => <span key={i} style={{ width: 10, height: 10, borderRadius: 3, background: c, border: "1px solid rgba(255,255,255,0.12)" }} />)}
              </span>
              <span style={{ fontFamily: UI_FONT, fontSize: 13, color: active ? t.accent : "#dcdce4", fontWeight: active ? 700 : 500, whiteSpace: "nowrap" }}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GUIDED LORE BUILDER (guardrails) + CARD BACK
// ---------------------------------------------------------------------------
function GuardrailBuilder({ guardrails, onAdd, onUpdate, onRemove }) {
  const inp = { width: "100%", boxSizing: "border-box", fontFamily: UI_FONT, fontSize: 13, padding: "8px 10px", borderRadius: 8, color: "#f0f0f6", background: "rgba(0,0,0,0.4)", border: "1px solid #3a3a45", outline: "none" };
  return (
    <div style={{ marginTop: 18, padding: 16, borderRadius: 12, border: "1px dashed #44444f" }}>
      <div style={{ fontFamily: UI_FONT, fontSize: 13, color: "#c8c8d4", marginBottom: 4 }}>🎯 <strong>Guided details</strong> <span style={{ color: "#8a8a98" }}>(optional)</span></div>
      <div style={{ fontSize: 12, color: "#8a8a98", marginBottom: 14 }}>Pin down specifics — setting, duration, objectives, enemies… Add as many as you like; they're all folded into the lore.</div>
      {guardrails.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
          {guardrails.map((g) => {
            const def = GUARDRAIL_TYPES.find((x) => x.id === g.type) || GUARDRAIL_TYPES[0];
            return (
              <div key={g.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <select value={g.type} onChange={(e) => onUpdate(g.id, { type: e.target.value })} style={{ ...inp, width: 170, flexShrink: 0, cursor: "pointer" }}>
                  {GUARDRAIL_TYPES.map((t) => <option key={t.id} value={t.id} style={{ background: "#15121d" }}>{t.label}</option>)}
                </select>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <textarea value={g.details} onChange={(e) => onUpdate(g.id, { details: e.target.value })} placeholder={def.hint} rows={2} style={{ ...inp, resize: "vertical", lineHeight: 1.35 }} />
                  {def.chips && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      {def.chips.map((c) => (
                        <button key={c} onClick={() => onUpdate(g.id, { details: g.details ? g.details + (/[.,;]\s*$/.test(g.details) ? " " : ", ") + c : c })} style={{ fontFamily: UI_FONT, fontSize: 12, padding: "4px 10px", borderRadius: 999, cursor: "pointer", color: "#cfcfda", background: "rgba(255,255,255,0.05)", border: "1px solid #3a3a45" }}>+ {c}</button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => onRemove(g.id)} title="Remove" style={{ background: "none", border: "none", color: "#8a8a98", cursor: "pointer", fontSize: 16, lineHeight: 1, marginTop: 8 }}>✕</button>
              </div>
            );
          })}
        </div>
      )}
      <button onClick={() => onAdd("setting")} style={{ fontFamily: UI_FONT, fontSize: 13, fontWeight: 500, padding: "8px 14px", borderRadius: 8, cursor: "pointer", color: "#e8e8f0", background: "rgba(255,255,255,0.05)", border: "1px solid #3a3a45" }}>＋ Add a detail</button>
    </div>
  );
}

function CardBackPanel({ cardBack, onSetTheme, onImage, onClose, t }) {
  const isImg = cardBack && cardBack.type === "image" && cardBack.image;
  const opt = (active) => ({ flex: 1, textAlign: "center", padding: "14px 10px", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${active ? t.accent : "#3a3a45"}`, background: active ? `${t.accent}18` : "rgba(255,255,255,0.03)", fontFamily: UI_FONT, fontSize: 13, color: active ? t.accent : "#dcdce4" });
  return (
    <div style={{ marginTop: 16, padding: 18, borderRadius: 14, border: `1px solid ${t.accent}44`, background: "rgba(255,255,255,0.03)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontFamily: t.displayFont, fontWeight: 700, fontSize: 16, color: "#f4f4fa" }}>Card back</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#c8c8d4", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
        <div onClick={onSetTheme} style={opt(!isImg)}>
          <div style={{ fontSize: 26, color: t.accent, marginBottom: 4 }}>{t.ornament}</div>
          Themed design
        </div>
        <label style={{ ...opt(isImg), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, position: "relative", overflow: "hidden" }}>
          {isImg ? <img src={cardBack.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.85 }} /> : <div style={{ fontSize: 22 }}>🖼️</div>}
          <span style={{ position: "relative", zIndex: 1, textShadow: isImg ? "0 1px 3px rgba(0,0,0,0.8)" : "none", color: isImg ? "#fff" : undefined }}>{isImg ? "Change image" : "Upload image"}</span>
          <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && onImage(e.target.files[0])} style={{ display: "none" }} />
        </label>
      </div>
      <div style={{ fontSize: 12, color: "#7a7a88", marginTop: 10 }}>This design prints on the back of every card in the deck.</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SHARE + COLLABORATION UI
// ---------------------------------------------------------------------------
function SharePanel({ shareLink, collabLink, onEnableCollab, onCopy, onClose, t }) {
  const [copied, setCopied] = useState("");
  const [enabling, setEnabling] = useState(false);
  const copy = (link, which) => { onCopy(link); setCopied(which); setTimeout(() => setCopied(""), 1500); };
  const enable = async () => { setEnabling(true); await onEnableCollab(); setEnabling(false); };
  const row = (label, link, which, hint) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: UI_FONT, fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase", color: "#9a9aa8", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input readOnly value={link} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 0, fontFamily: UI_FONT, fontSize: 12, padding: "9px 11px", borderRadius: 8, color: "#dcdce4", background: "rgba(0,0,0,0.4)", border: "1px solid #3a3a45", outline: "none" }} />
        <button onClick={() => copy(link, which)} style={{ fontFamily: UI_FONT, fontSize: 13, fontWeight: 600, padding: "0 14px", borderRadius: 8, cursor: "pointer", color: t.bg[0], background: t.accent, border: "none", whiteSpace: "nowrap" }}>{copied === which ? "Copied!" : "Copy"}</button>
      </div>
      {hint && <div style={{ fontSize: 12, color: "#7a7a88", marginTop: 6 }}>{hint}</div>}
    </div>
  );
  return (
    <div style={{ marginTop: 16, padding: 18, borderRadius: 14, border: `1px solid ${t.accent}44`, background: "rgba(255,255,255,0.03)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontFamily: t.displayFont, fontWeight: 700, fontSize: 16, color: "#f4f4fa" }}>Share this deck</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#c8c8d4", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
      </div>
      {shareLink ? row("View / copy link", shareLink, "share", "Anyone with this link can view your deck and make their own copy.") : <div style={{ fontSize: 13, color: "#9a9aa8" }}>Save the deck first to get a link.</div>}
      {collabLink ? (
        row("Collaborate link", collabLink, "collab", "Send this to friends — they can add and edit cards from their own phones, no sign-up.")
      ) : (
        <div>
          <div style={{ fontFamily: UI_FONT, fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase", color: "#9a9aa8", marginBottom: 6 }}>Collaborate</div>
          <button onClick={enable} disabled={enabling || !shareLink} style={{ fontFamily: UI_FONT, fontSize: 14, fontWeight: 600, padding: "9px 14px", borderRadius: 8, cursor: enabling ? "wait" : "pointer", color: "#e8e8f0", background: "rgba(255,255,255,0.05)", border: `1px solid ${t.accent}66`, opacity: (!shareLink || enabling) ? 0.6 : 1 }}>{enabling ? "Enabling…" : "👥 Let friends add cards"}</button>
        </div>
      )}
    </div>
  );
}

function CollabBanner({ name, setName, onAdd, newCount, onRefresh, t }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 18, padding: "12px 16px", borderRadius: 12, border: `1px solid ${t.accent}55`, background: `${t.accent}12` }}>
      <span style={{ fontSize: 18 }}>👥</span>
      <span style={{ fontFamily: UI_FONT, fontSize: 13, color: "#e8e8f0" }}>You're collaborating — add your own card to the shared deck.</span>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={{ fontFamily: UI_FONT, fontSize: 13, padding: "7px 11px", borderRadius: 8, color: "#f0f0f6", background: "rgba(0,0,0,0.4)", border: "1px solid #3a3a45", width: 140, outline: "none" }} />
      {newCount > 0 && <button onClick={onRefresh} style={{ fontFamily: UI_FONT, fontSize: 13, padding: "8px 12px", borderRadius: 8, cursor: "pointer", color: "#e8e8f0", background: "rgba(255,255,255,0.06)", border: "1px solid #3a3a45" }}>🔄 {newCount} new — refresh</button>}
    </div>
  );
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
  const [guardrails, setGuardrails] = useState([]);        // [{ id, type, details }] — guided lore
  const [cardBack, setCardBack] = useState({ type: "theme" }); // { type:"theme" } | { type:"image", image }
  const [cardBackOpen, setCardBackOpen] = useState(false);
  const [loreSetting, setLoreSetting] = useState(null);   // selected Setting lore id
  const [loreOccasion, setLoreOccasion] = useState(null); // selected Occasion lore id
  const [categories, setCategories] = useState([]); // [{ id, name, cards: [specCard] }]
  const [suggestingCat, setSuggestingCat] = useState(null); // category id currently fetching AI suggestions
  const [cards, setCards] = useState([]);
  const [arts, setArts] = useState({});
  const [loadingArt, setLoadingArt] = useState({});
  const [flipped, setFlipped] = useState({}); // realName -> bool
  const [editingUid, setEditingUid] = useState(null); // uid of card open in the enlarge/edit modal
  const [genState, setGenState] = useState("idle");
  const [error, setError] = useState("");
  const [busyCard, setBusyCard] = useState(null);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutReturn, setCheckoutReturn] = useState(null); // "success" | "cancel"

  // ---- persistence ----
  const [savedDecks, setSavedDecks] = useState([]); // [{id,name,theme,eventType,count,updatedAt,collabToken,collabEnabled}]
  const [currentDeckId, setCurrentDeckId] = useState(null);
  const [collabToken, setCollabToken] = useState(null);   // this deck's collab link token
  const [collabMode, setCollabMode] = useState(false);    // opened via a collab link (I'm a contributor)
  const [collabName, setCollabName] = useState("");       // contributor display name
  const [shareOpen, setShareOpen] = useState(false);      // share panel open on the reveal
  const [collabNew, setCollabNew] = useState(0);          // count of new cards from others (poll)
  const [showDecks, setShowDecks] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle|saving|saved

  // Load my decks from the server on first mount.
  async function refreshDecks() {
    if (!API_BASE) return;
    try {
      const d = await api("GET", `/api/sq/list?ownerToken=${encodeURIComponent(getOwnerToken())}`);
      setSavedDecks(d.decks || []);
    } catch (e) { /* offline / no decks yet — fine */ }
  }
  useEffect(() => { refreshDecks(); }, []);

  // Detect a return from Stripe Checkout (?checkout=success|cancel) and clean the URL.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("checkout");
    if (p === "success" || p === "cancel") {
      setCheckoutReturn(p);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function startCheckout() {
    setCheckoutError(""); setCheckingOut(true);
    try {
      const d = await postJSON("/api/checkout", {
        deckName: (questPrompt || "").slice(0, 60) || "Side Quest custom deck",
        cardCount: cards.length,
        quantity: 1,
      });
      if (d && d.checkoutUrl) { window.location.href = d.checkoutUrl; return; }
      throw new Error("no checkout URL returned");
    } catch (e) {
      setCheckoutError(e.message || "Checkout failed"); setCheckingOut(false);
    }
  }

  // Save the current deck to the server (fixes the localStorage-quota bug).
  async function saveCurrentDeck() {
    if (!cards.length) return;
    if (!API_BASE) { setError("Saving needs the server — not configured."); return; }
    setSaveState("saving");
    const id = currentDeckId || newId();
    const name = questPrompt.slice(0, 42) || eventType || "Untitled deck";
    const deck = { id, name, user, eventType, theme, questPrompt, guardrails, cardBack, participants, categories, questCard, cards, arts, updatedAt: Date.now() };
    try {
      const r = await api("POST", "/api/sq/save", { ownerToken: getOwnerToken(), deck });
      setCurrentDeckId(r.id);
      if (r.collabToken) setCollabToken(r.collabToken);
      setSaveState("saved");
      refreshDecks();
      setTimeout(() => setSaveState("idle"), 1800);
      return r;
    } catch (e) {
      console.error("save failed", e); setError("Couldn't save this deck: " + e.message); setSaveState("idle");
      return null;
    }
  }

  // --- Share + async collaboration -----------------------------------------
  const shareUrl = (id) => `${location.origin}${location.pathname}?deck=${id}`;
  const collabUrl = (tok) => `${location.origin}${location.pathname}?collab=${tok}`;
  function copyText(t) { try { navigator.clipboard.writeText(t); } catch (e) { /* ignore */ } }

  async function ensureSaved() {
    if (currentDeckId) return { id: currentDeckId, collabToken };
    const r = await saveCurrentDeck();
    return r ? { id: r.id, collabToken: r.collabToken } : null;
  }

  async function enableCollab() {
    const s = await ensureSaved();
    if (!s) return null;
    try {
      const r = await api("POST", `/api/sq/deck/${encodeURIComponent(s.id)}/collab`, { ownerToken: getOwnerToken() });
      setCollabToken(r.collabToken);
      return r.collabToken;
    } catch (e) { setError("Couldn't enable collaboration: " + e.message); return null; }
  }

  // Contributor (or owner) pushes a single card to the shared deck.
  async function collabSyncCard(uid) {
    if (!collabToken) return;
    const card = cards.find((c) => c.uid === uid);
    if (!card) return;
    try {
      await api("POST", `/api/sq/collab/${encodeURIComponent(collabToken)}/card`, { card, byName: collabName || "Guest", art: arts[uid] || null });
    } catch (e) { setError("Couldn't sync that card: " + e.message); }
  }

  // Contributor adds a blank card and opens the editor to fill it in.
  function collabAddCard() {
    if (collabMode) { try { localStorage.setItem("sq_name", collabName || ""); } catch (e) { /* ignore */ } }
    const uid = "g_" + newId();
    const who = collabName || "Guest";
    const card = { uid, pid: null, category: "Guest Cards", realName: who, addedBy: who, title: "", typeLine: "Legendary Guest", cost: 3, power: 3, toughness: 3, ability: "", flavor: "", frame: "azure" };
    setCards((cs) => [...cs, card]);
    setFlipped((s) => ({ ...s, [uid]: true }));
    setEditingUid(uid);
  }

  // Re-fetch the shared deck's cards (pull in others' contributions).
  async function refreshCollab() {
    if (!collabToken) return;
    try {
      const d = await api("GET", `/api/sq/collab/${encodeURIComponent(collabToken)}`);
      const dk = d.deck || {};
      setCards(dk.cards || []);
      setArts(dk.arts || {});
      setFlipped((prev) => { const fl = { ...prev }; (dk.cards || []).forEach((c) => { if (fl[c.uid] === undefined) fl[c.uid] = true; }); return fl; });
      setCollabNew(0);
    } catch (e) { /* ignore */ }
  }

  // Poll for others' changes while viewing a collab-enabled deck.
  useEffect(() => {
    if (!API_BASE || !collabToken || genState !== "done") return;
    const iv = setInterval(async () => {
      try {
        const r = await api("GET", `/api/sq/collab/${encodeURIComponent(collabToken)}/poll?since=0`);
        if (r && typeof r.count === "number") setCollabNew(Math.max(0, r.count - cards.length));
      } catch (e) { /* not collab-enabled yet, or offline */ }
    }, 5000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collabToken, genState, cards.length]);

  // Load a deck payload into state (shared helper for open / share / collab).
  function loadDeckPayload(d, { collab = false } = {}) {
    setUser(d.user || { name: "", email: "" });
    setEventType(d.eventType); setTheme(d.theme); setQuestPrompt(d.questPrompt || "");
    setParticipants(d.participants || []); setQuestCard(d.questCard || null);
    setCategories(d.categories || []); setLoreSetting(null); setLoreOccasion(null);
    setGuardrails(d.guardrails || []); setCardBack(d.cardBack || { type: "theme" });
    const loaded = (d.cards || []).map((c, i) => {
      if (c.uid) return c;
      return { ...c, uid: `${c.realName}-${i}`, pid: c.pid ?? (d.participants && d.participants[i] ? d.participants[i].id : null) };
    });
    setCards(loaded); setArts(d.arts || {});
    const fl = {}; loaded.forEach((c) => (fl[c.uid] = true)); setFlipped(fl);
    setGenState("done"); setShowDecks(false); setLanding(false); setStep(3);
  }

  async function openDeck(id) {
    try {
      const d = await api("GET", `/api/sq/deck/${encodeURIComponent(id)}`);
      loadDeckPayload(d.deck || {});
      setCurrentDeckId(d.id);
      // fetch this deck's collab token from my list (if I own it)
      const mine = (savedDecks || []).find((x) => x.id === id);
      setCollabToken(mine?.collabToken || null);
      setCollabMode(false);
    } catch (e) { setError("Couldn't open that deck."); }
  }

  async function deleteDeck(id) {
    try { await api("DELETE", `/api/sq/deck/${encodeURIComponent(id)}?ownerToken=${encodeURIComponent(getOwnerToken())}`); } catch (e) { /* ignore */ }
    setSavedDecks((prev) => prev.filter((d) => d.id !== id));
    if (currentDeckId === id) setCurrentDeckId(null);
  }

  function newDeck() {
    setCurrentDeckId(null); setUser({ name: "", email: "" }); setEventType(null);
    setTheme(null); setQuestPrompt(""); setParticipants([]); setQuestCard(null); setCategories([]);
    setLoreSetting(null); setLoreOccasion(null); setGuardrails([]); setCardBack({ type: "theme" }); setCardBackOpen(false);
    setCards([]); setArts({}); setFlipped({}); setGenState("idle"); setOrderPlaced(false); setPhotoConsent(false);
    setCollabToken(null); setCollabMode(false); setShareOpen(false); setCollabNew(0);
    setShowDecks(false); setLanding(false); setStep(0);
  }

  // Open a deck from a ?deck=<id> (share) or ?collab=<token> (collaborate) link.
  useEffect(() => {
    if (!API_BASE) return;
    const params = new URLSearchParams(window.location.search);
    const deckId = params.get("deck");
    const collab = params.get("collab");
    if (!deckId && !collab) return;
    (async () => {
      try {
        if (collab) {
          const d = await api("GET", `/api/sq/collab/${encodeURIComponent(collab)}`);
          loadDeckPayload(d.deck || {});
          setCurrentDeckId(d.id); setCollabToken(collab); setCollabMode(true);
          const saved = (() => { try { return localStorage.getItem("sq_name") || ""; } catch { return ""; } })();
          setCollabName(saved);
        } else {
          const d = await api("GET", `/api/sq/deck/${encodeURIComponent(deckId)}`);
          loadDeckPayload(d.deck || {});
          setCurrentDeckId(null); // a shared view — "Save a copy" makes it yours
          setCollabMode(false);
        }
      } catch (e) { setError("That link's deck couldn't be loaded (it may have been deleted)."); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const themeObj = THEMES.find((t) => t.id === theme) || THEMES[1];

  // Picking a Setting/Occasion (re)composes the quest textarea from the two lores.
  // Setting also drives the visual theme; Occasion also sets the event context.
  function pickSetting(id) {
    const next = id === loreSetting ? null : id;
    setLoreSetting(next);
    setQuestPrompt(composeLore(next, loreOccasion));
    if (next && SETTING_TO_THEME[next]) setTheme(SETTING_TO_THEME[next]);
  }
  function pickOccasion(id) {
    const next = id === loreOccasion ? null : id;
    setLoreOccasion(next);
    setQuestPrompt(composeLore(loreSetting, next));
    const occ = EVENT_LORES.find((o) => o.id === next);
    setEventType(occ ? occ.name : null);
  }

  // Guided lore builder
  function addGuardrail(type = "setting") {
    setGuardrails((g) => [...g, { id: "gr_" + Math.random().toString(36).slice(2, 8), type, details: "" }]);
  }
  function updateGuardrail(id, patch) { setGuardrails((g) => g.map((x) => (x.id === id ? { ...x, ...patch } : x))); }
  function removeGuardrail(id) { setGuardrails((g) => g.filter((x) => x.id !== id)); }
  const fullQuest = () => mergeQuest(questPrompt, guardrails);

  function addParticipant() {
    setParticipants((p) => [...p, { id: Date.now() + Math.random(), name: "", photo: null }]);
  }
  function updateParticipant(id, patch) { setParticipants((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x))); }
  function removeParticipant(id) { setParticipants((p) => p.filter((x) => x.id !== id)); }
  function onPhoto(id, file) { const rd = new FileReader(); rd.onload = () => updateParticipant(id, { photo: rd.result }); rd.readAsDataURL(file); }
  function onCardBackImage(file) { const rd = new FileReader(); rd.onload = () => setCardBack({ type: "image", image: rd.result }); rd.readAsDataURL(file); }

  function loadDemo() {
    setUser(DEMO.user); setEventType(DEMO.eventType); setTheme(DEMO.theme);
    setQuestPrompt(DEMO.questPrompt); setParticipants(DEMO.participants.map((p) => ({ ...p })));
    setLanding(false);
    setTimeout(() => runGeneration(DEMO), 50);
  }

  async function runGeneration(override) {
    const src = override || { eventType: eventType || "an event", theme, questPrompt: fullQuest(), participants, categories };
    setError(""); setGenState("lore"); setStep(3); setFlipped({});
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
      // Fold in the user-built category cards (NPCs, artifacts, spells…). Their
      // lore is already authored (from templates or AI suggestions, then edited),
      // so they only need art. No face photo → themed backdrop.
      const specCards = (src.categories || []).flatMap((cat) =>
        (cat.cards || []).map((sc) => ({ ...sc, realName: cat.name, category: cat.name, uid: "spec_" + sc.id, pid: null }))
      );
      const deck = [...ordered, ...specCards];
      setCards(deck);
      setGenState("art");
      const th = THEMES.find((t) => t.id === src.theme) || THEMES[1];
      // Flips stay on a fixed, staggered timeline for drama...
      deck.forEach((c, i) => setTimeout(() => setFlipped((s) => ({ ...s, [c.uid]: true })), 250 + i * 220));
      // ...but paint every card's art in parallel so a large deck isn't stuck in a slow queue.
      await Promise.all(deck.map(async (c) => {
        const part = src.participants.find((p) => p.id === c.pid);
        setLoadingArt((s) => ({ ...s, [c.uid]: true }));
        try {
          const frAccent = (CARD_FRAMES.find((f) => f.key === c.frame) || CARD_FRAMES[0]).accent;
          // With a backend + photo -> real face->character art; otherwise a themed
          // backdrop the card layers the raw photo over.
          const art = await generateCardArt({ photoBase64: part?.photo || null, frameAccent: frAccent, themeStyle: th.style, seedStr: c.realName + c.title, lore: c, objectMode: !c.pid && !!c.category, category: c.category });
          setArts((s) => ({ ...s, [c.uid]: art }));
        } finally {
          setLoadingArt((s) => ({ ...s, [c.uid]: false }));
        }
      }));
      setGenState("done");
      // Auto-save so the deck survives a refresh — captured locally to avoid stale state.
      setTimeout(() => autoSave(src, lore.questCard, deck), 400);
    } catch (e) {
      console.error(e); setError(e.message || "Generation failed"); setGenState("error");
    }
  }

  // Collects the latest art from state at call time and saves the deck to the server.
  function autoSave(src, qCard, ordered) {
    if (!API_BASE) return;
    setArts((curArts) => {
      const id = currentDeckId || newId();
      const name = (src.questPrompt || "").slice(0, 42) || src.eventType || "Untitled deck";
      const deck = { id, name, user: src.user || user, eventType: src.eventType, theme: src.theme, questPrompt, guardrails, cardBack, participants: src.participants, categories: src.categories || [], questCard: qCard, cards: ordered, arts: curArts, updatedAt: Date.now() };
      (async () => {
        try {
          const r = await api("POST", "/api/sq/save", { ownerToken: getOwnerToken(), deck });
          setCurrentDeckId(r.id);
          if (r.collabToken) setCollabToken(r.collabToken);
          refreshDecks();
        } catch (e) { console.warn("autosave failed", e.message); }
      })();
      return curArts; // no change to arts
    });
  }

  // Merge manual field edits (from the enlarge/edit modal) into a card.
  function updateCard(uid, patch) {
    setCards((cs) => cs.map((c) => (c.uid === uid ? { ...c, ...patch } : c)));
  }

  // ---- Deck Builder: category + spec-card management ----------------------
  function addCategory(name) {
    const clean = (name || "").trim();
    if (!clean) return;
    const tpls = CATEGORY_TEMPLATES[clean] || [];
    setCategories((cs) => [...cs, {
      id: "cat_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
      name: clean,
      cards: tpls.map((t, i) => makeSpecCard(t, i)),
    }]);
  }
  function removeCategory(catId) { setCategories((cs) => cs.filter((c) => c.id !== catId)); }
  function renameCategory(catId, name) { setCategories((cs) => cs.map((c) => (c.id === catId ? { ...c, name } : c))); }
  function addSpecCard(catId) {
    setCategories((cs) => cs.map((c) => {
      if (c.id !== catId) return c;
      const pool = CATEGORY_TEMPLATES[c.name] || [];
      const seed = pool.length ? pool[c.cards.length % pool.length] : {};
      return { ...c, cards: [...c.cards, makeSpecCard(seed, c.cards.length)] };
    }));
  }
  function updateSpecCard(catId, cardId, patch) {
    setCategories((cs) => cs.map((c) => (c.id !== catId ? c : { ...c, cards: c.cards.map((x) => (x.id === cardId ? { ...x, ...patch } : x)) })));
  }
  function removeSpecCard(catId, cardId) {
    setCategories((cs) => cs.map((c) => (c.id !== catId ? c : { ...c, cards: c.cards.filter((x) => x.id !== cardId) })));
  }
  async function suggestForCategory(catId, name) {
    if (!AI_ENABLED) return;
    setSuggestingCat(catId);
    try {
      const d = await postJSON("/api/suggest-cards", { eventType, theme, questPrompt, category: name, count: 3 });
      const fresh = (d.cards || []).map((c, i) => makeSpecCard(c, i));
      if (fresh.length) setCategories((cs) => cs.map((c) => (c.id === catId ? { ...c, cards: [...c.cards, ...fresh] } : c)));
    } catch (e) {
      console.warn("suggest-cards failed:", e.message);
      setError("Couldn't fetch AI suggestions — the templates are still here to edit.");
      setTimeout(() => setError(""), 4000);
    } finally {
      setSuggestingCat(null);
    }
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

  async function regenArt(uid, refineNote) {
    setBusyCard(uid); setLoadingArt((s) => ({ ...s, [uid]: true }));
    try {
      const card = cards.find((c) => c.uid === uid);
      const part = participants.find((p) => p.id === card.pid);
      const frAccent = (CARD_FRAMES.find((f) => f.key === card.frame) || CARD_FRAMES[0]).accent;
      const art = await generateCardArt({ photoBase64: part?.photo || null, frameAccent: frAccent, themeStyle: themeObj.style, seedStr: card.realName + card.title + Math.random(), lore: card, refineNote, objectMode: !card.pid && !!card.category, category: card.category });
      setArts((s) => ({ ...s, [uid]: art }));
    } catch (e) { setError(e.message); } finally { setLoadingArt((s) => ({ ...s, [uid]: false })); setBusyCard(null); }
  }

  const canNext = {
    0: fullQuest().trim().length > 8,
    1: participants.length > 0 && participants.every((p) => p.name.trim()) &&
       (!participants.some((p) => p.photo) || photoConsent),
  };

  // ===== LANDING =====
  if (landing) {
    return (
      <div style={{ minHeight: "100vh", background: "radial-gradient(1200px 700px at 50% -5%, #2a1d3f 0%, #15121d 45%, #08070d 100%)", color: "#e8e8f0", fontFamily: UI_FONT, position: "relative", overflow: "hidden" }}>
        <GlobalCSS />
        {checkoutReturn && <CheckoutBanner status={checkoutReturn} onClose={() => setCheckoutReturn(null)} />}
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
            {["Born at a real bachelor party", "AI-written lore", "AI-painted portraits", "Shipped to your door"].map((x) => (
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
      {checkoutReturn && <CheckoutBanner status={checkoutReturn} onClose={() => setCheckoutReturn(null)} />}
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

        {/* STEP 0: QUEST (world + occasion + description) */}
        {step === 0 && (
          <Panel title="Set the scene" sub="Start from a template below, or just write your own quest — either way Side Quest turns it into your deck's lore.">
            <LoreLibrary settingId={loreSetting} occasionId={loreOccasion} onPickSetting={pickSetting} onPickOccasion={pickOccasion} />
            <CardStylePicker themeId={theme || "lotr"} onPick={setTheme} />
            <div style={{ fontFamily: UI_FONT, fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase", color: "#8a8a98", marginBottom: 8 }}>Your quest</div>
            <textarea value={questPrompt} onChange={(e) => setQuestPrompt(e.target.value)} rows={8}
              placeholder="Write your own, or edit a template. e.g. Dave's bachelor party in Lisbon — complete dares across the city to 'earn back' his freedom before the wedding. He fears seagulls and loves bad karaoke."
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
            <div style={{ fontSize: 12, color: "#7a7a88", marginTop: 8 }}>Tip: name the guest of honor, the place, and a couple personal details for sharper cards.</div>
            <GuardrailBuilder guardrails={guardrails} onAdd={addGuardrail} onUpdate={updateGuardrail} onRemove={removeGuardrail} />
            <NavRow onNext={() => setStep(1)} nextOk={canNext[0]} />
          </Panel>
        )}

        {/* STEP 1: CAST */}
        {step === 1 && (
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
            <NavRow onBack={() => setStep(0)} onNext={() => setStep(2)} nextOk={canNext[1]} nextLabel="Next: build deck →" />
          </Panel>
        )}

        {/* STEP 2: DECK BUILDER */}
        {step === 2 && (
          <Panel title="Build your deck" sub="Beyond the heroes, add categories of cards — NPCs, artifacts, spells, whatever fits. Each starts from templates; hit ‘Suggest from lore’ to tailor them to your quest. All cards stay fully editable.">
            <DeckBuilder
              theme={themeObj}
              categories={categories}
              suggestingCat={suggestingCat}
              aiEnabled={AI_ENABLED}
              onAddCategory={addCategory}
              onRemoveCategory={removeCategory}
              onRenameCategory={renameCategory}
              onAddCard={addSpecCard}
              onUpdateCard={updateSpecCard}
              onRemoveCard={removeSpecCard}
              onSuggest={suggestForCategory}
            />
            <NavRow onBack={() => setStep(1)} onNext={() => runGeneration()} nextOk nextLabel="✦ Generate deck" />
          </Panel>
        )}

        {/* STEP 3: REVEAL */}
        {step === 3 && (
          <div>
            {genState === "lore" && <BigLoader label="Side Quest is writing your deck's lore…" />}
            {(genState === "art" || genState === "done") && (
              <>
                {questCard && (
                  <div className="ql-fade" style={{ marginBottom: 28 }}>
                    <SectionLabel>The Quest</SectionLabel>
                    <QuestBanner q={questCard} t={themeObj} />
                  </div>
                )}
                {collabMode && genState === "done" && (
                  <CollabBanner name={collabName} setName={setCollabName} onAdd={collabAddCard} newCount={collabNew} onRefresh={refreshCollab} t={themeObj} />
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <SectionLabel>{genState === "art" ? "Dealing your deck…" : (collabMode ? "Shared deck — add or edit cards, everyone sees them" : "Your deck — tap to flip · double-click to enlarge & edit")}</SectionLabel>
                  {genState === "done" && (
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      {!collabMode && collabNew > 0 && (
                        <GhostButton onClick={refreshCollab}>🔄 {collabNew} new</GhostButton>
                      )}
                      {collabMode ? (
                        <>
                          {collabNew > 0 && <GhostButton onClick={refreshCollab}>🔄 {collabNew} new</GhostButton>}
                          <PrimaryButton onClick={collabAddCard}>＋ Add my card</PrimaryButton>
                        </>
                      ) : (
                        <>
                          <GhostButton onClick={() => setStep(1)}>← Edit cast</GhostButton>
                          <GhostButton onClick={() => setStep(2)}>⚑ Edit deck</GhostButton>
                          <GhostButton onClick={saveCurrentDeck}>
                            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "✓ Saved" : "⤓ Save deck"}
                          </GhostButton>
                          <GhostButton onClick={() => setCardBackOpen((v) => !v)}>🂠 Card back</GhostButton>
                          <GhostButton onClick={async () => { await ensureSaved(); setShareOpen((v) => !v); }}>⤴ Share</GhostButton>
                          <PrimaryButton onClick={() => setStep(4)}>Order deck →</PrimaryButton>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {!collabMode && cardBackOpen && genState === "done" && (
                  <CardBackPanel cardBack={cardBack} onSetTheme={() => setCardBack({ type: "theme" })} onImage={onCardBackImage} onClose={() => setCardBackOpen(false)} t={themeObj} />
                )}
                {!collabMode && shareOpen && genState === "done" && (
                  <SharePanel
                    shareLink={currentDeckId ? shareUrl(currentDeckId) : ""}
                    collabToken={collabToken}
                    collabLink={collabToken ? collabUrl(collabToken) : ""}
                    onEnableCollab={enableCollab}
                    onCopy={copyText}
                    onClose={() => setShareOpen(false)}
                    t={themeObj}
                  />
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(232px, 1fr))", gap: 26, justifyItems: "center", marginTop: 18 }}>
                  {cards.map((c) => (
                    <GameCard key={c.uid} card={c} theme={themeObj} art={arts[c.uid]} loadingArt={loadingArt[c.uid]}
                      photo={(participants.find((p) => p.id === c.pid) || {}).photo || null} cardBack={cardBack}
                      flipped={!!flipped[c.uid]} onFlip={() => setFlipped((s) => ({ ...s, [c.uid]: !s[c.uid] }))}
                      onExpand={() => setEditingUid(c.uid)}
                      compact busy={busyCard === c.uid} onRegenLore={AI_ENABLED && !c.category ? () => regenLore(c.uid) : undefined} onRegenArt={(note) => regenArt(c.uid, note)} />
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

        {/* STEP 4: ORDER */}
        {step === 4 && (
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
                {AI_ENABLED ? (
                  <>
                    <PrimaryButton onClick={startCheckout} disabled={checkingOut} style={{ width: "100%" }}>
                      {checkingOut ? "Redirecting to secure checkout…" : "Order physical deck →"}
                    </PrimaryButton>
                    {checkoutError && (
                      <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, border: "1px solid #ef5b6b", background: "rgba(239,91,107,0.10)", color: "#ffc4cb", fontSize: 13 }}>
                        Couldn't start checkout: {checkoutError}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "#7a7a88", marginTop: 8, textAlign: "center" }}>Secure payment via Stripe. Shipping details collected at checkout.</div>
                  </>
                ) : orderPlaced ? (
                  <div style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid #5bef82", background: "rgba(91,239,130,0.10)", color: "#c9f7d6", fontSize: 14, lineHeight: 1.45 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>✓ Demo mode</div>
                    Connect the backend (with a Stripe key) to take real orders.
                  </div>
                ) : (
                  <PrimaryButton onClick={() => setOrderPlaced(true)} style={{ width: "100%" }}>Order physical deck</PrimaryButton>
                )}
                <GhostButton onClick={() => { setOrderPlaced(false); setStep(3); }} style={{ width: "100%", marginTop: 10 }}>← Back to deck</GhostButton>
              </div>
            </div>
          </Panel>
        )}
      </div>

      <div style={{ textAlign: "center", marginTop: 50, color: "#55555f", fontSize: 12 }}>✦ Lore &amp; art by Side Quest ✦</div>

      {showDecks && (
        <DecksModal decks={savedDecks} onClose={() => setShowDecks(false)} onOpen={openDeck} onDelete={deleteDeck} onNew={newDeck} />
      )}

      {editingUid && cards.find((c) => c.uid === editingUid) && (
        <CardEditorModal
          card={cards.find((c) => c.uid === editingUid)}
          theme={themeObj}
          art={arts[editingUid]}
          photo={(participants.find((p) => p.id === (cards.find((c) => c.uid === editingUid) || {}).pid) || {}).photo || null}
          loadingArt={loadingArt[editingUid]}
          busy={busyCard === editingUid}
          onClose={() => { const uid = editingUid; setEditingUid(null); if (collabMode) collabSyncCard(uid); }}
          onChange={(patch) => updateCard(editingUid, patch)}
          onRegenArt={(note) => regenArt(editingUid, note)}
          onRegenLore={AI_ENABLED && !(cards.find((c) => c.uid === editingUid) || {}).category ? () => regenLore(editingUid) : undefined}
        />
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

function CheckoutBanner({ status, onClose }) {
  const ok = status === "success";
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
      padding: "12px 20px", fontFamily: UI_FONT, fontSize: 14,
      color: ok ? "#c9f7d6" : "#ffc4cb",
      background: ok ? "rgba(20,60,35,0.97)" : "rgba(60,20,26,0.97)",
      borderBottom: `1px solid ${ok ? "#5bef82" : "#ef5b6b"}`,
    }}>
      <span>
        {ok
          ? "✓ Payment received — your custom deck is being prepared. (You'll get shipping updates by email.)"
          : "Checkout canceled — you have not been charged."}
      </span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
    </div>
  );
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
