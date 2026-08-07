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

// Each Setting maps to the closest visual theme so choosing a world also styles
// the cards (fonts/colors/art). Overridable via the Card style picker.
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

// Session token from /api/auth/*. Persisted so a refresh stays signed in, and
// it takes precedence over API_TOKEN — that one is a deployment-wide shared
// secret for gating paid endpoints, not a user identity, and both would
// otherwise compete for the same Authorization header.
const SESSION_KEY = "sq_session";
function getSessionToken() { try { return localStorage.getItem(SESSION_KEY) || ""; } catch { return ""; } }
function setSessionToken(t) {
  try { t ? localStorage.setItem(SESSION_KEY, t) : localStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
}

async function api(method, pathname, body) {
  const headers = { "Content-Type": "application/json" };
  const bearer = getSessionToken() || API_TOKEN;
  if (bearer) headers["Authorization"] = `Bearer ${bearer}`;
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
// onFallback(message) fires when the backend art call failed and we're returning
// a procedural backdrop instead — without it a broken key or an exhausted quota
// looks identical to "the art just renders like that", which hid a real outage.
async function generateCardArt({ photoBase64, frameAccent, themeStyle, seedStr, lore, refineNote, objectMode, category, onFallback }) {
  // Two ways to paint a card: from a face photo (portrait mode) or from the
  // card's own lore (text-to-image). A hero card with no photo used to qualify
  // for neither and silently got the flat procedural gradient — which reads as
  // "the art is broken" even though nothing failed and nothing was reported.
  //
  // So: ask the backend whenever there is anything to paint from. Without a
  // photo the server takes its text-to-image path, which is explicitly prompted
  // to invent an original character rather than depict a real person.
  const haveSubject = !!(photoBase64 || objectMode || lore?.title || category);
  if (API_BASE && haveSubject) {
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
      if (onFallback) onFallback(e.message);
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

function GhostButton({ children, onClick, style, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        fontFamily: UI_FONT, fontSize: 14, padding: "11px 20px", borderRadius: 10,
        border: `1px solid ${disabled ? "#33333e" : "#4a4a56"}`,
        cursor: disabled ? "not-allowed" : "pointer",
        color: disabled ? "#5a5a66" : "#c8c8d4",
        background: "transparent", transition: "border-color .2s", ...style,
      }}
      onMouseEnter={(e) => !disabled && (e.currentTarget.style.borderColor = "#8a8a9a")}
      onMouseLeave={(e) => !disabled && (e.currentTarget.style.borderColor = "#4a4a56")}>
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
function LoreLibrary({ settingId, occasionId, onPickSetting, onPickOccasion, t }) {
  const Group = LoreGroup;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16, borderRadius: 12, border: "1px solid #2a2a33", background: "rgba(255,255,255,0.02)" }}>
      <div>
        <div style={{ fontFamily: (t && t.displayFont) || UI_FONT, fontWeight: 700, fontSize: 16, color: "#f4f4fa", marginBottom: 4 }}>✨ Ready-made lores</div>
        <div style={{ fontSize: 13, color: "#8a8a98", lineHeight: 1.4 }}>Pick a <strong>setting</strong> and an <strong>occasion</strong> — we auto-write the quest and match the card style. Tap again to deselect.</div>
      </div>
      <Group label="Setting — the world" items={SETTING_LORES} activeId={settingId} onPick={onPickSetting} />
      <Group label="Occasion — the vibe" items={EVENT_LORES} activeId={occasionId} onPick={onPickOccasion} />
    </div>
  );
}

// Compact visual-theme picker. A chosen Setting sets this automatically; writing
// your own quest? Pick the card look here.
function CardStylePicker({ themeId, onPick }) {
  return (
    <div style={{ margin: "20px 0 4px" }}>
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
      {shareLink ? row("View / copy link", shareLink, "share", "Anyone with this link can view your deck — including any uploaded photos — and make their own copy.") : <div style={{ fontSize: 13, color: "#9a9aa8" }}>Save the deck first to get a link.</div>}
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
  const [account, setAccount] = useState(null);   // {id,email,displayName} once signed in
  const [authOpen, setAuthOpen] = useState(false);
  // "" | "market" | "studio" | "listing". Seeded synchronously from the URL so a
  // ?listing= link opens straight onto the listing instead of flashing the
  // landing page first.
  const [openListingId, setOpenListingId] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("listing") || ""; } catch { return ""; }
  });
  const [view, setView] = useState(() => (openListingId ? "listing" : ""));
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
  const [collabEnabled, setCollabEnabled] = useState(false); // owner turned collaboration on
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

  // ---- Accounts -----------------------------------------------------------
  // Restore the session on load. A stored token that no longer resolves is
  // expired or revoked, so drop it rather than retrying every request with it.
  useEffect(() => {
    if (!API_BASE || !getSessionToken()) return;
    (async () => {
      try {
        const r = await api("GET", "/api/auth/me");
        setAccount(r.user);
        refreshDecks();
      } catch (e) { setSessionToken(""); setAccount(null); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doAuth(mode, { email, password, displayName }) {
    const r = await api("POST", mode === "signup" ? "/api/auth/signup" : "/api/auth/login",
      mode === "signup" ? { email, password, displayName } : { email, password });
    setSessionToken(r.token);
    setAccount(r.user);
    // Claim whatever this browser built before signing up, so that work isn't
    // stranded behind an anonymous token the account can't see.
    try { await api("POST", "/api/sq/adopt", { ownerToken: getOwnerToken() }); } catch (e) { /* non-fatal */ }
    await refreshDecks();
    return r.user;
  }

  async function signOut() {
    try { await api("POST", "/api/auth/logout"); } catch (e) { /* token may already be dead */ }
    setSessionToken("");
    setAccount(null);
    refreshDecks();
  }

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

  // When collaboration is on, pull any cards contributors added that we don't
  // have locally, so a full-deck save doesn't clobber them. Returns merged
  // {cards, arts}; also reflects the additions in the UI.
  async function mergeCollabCards(localCards, localArts) {
    if (!collabEnabled || !currentDeckId) return { cards: localCards, arts: localArts };
    try {
      const d = await api("GET", `/api/sq/deck/${encodeURIComponent(currentDeckId)}`);
      const serverCards = (d.deck && d.deck.cards) || [];
      const serverArts = (d.deck && d.deck.arts) || {};
      const have = new Set(localCards.map((c) => c.uid));
      const extras = serverCards.filter((c) => !have.has(c.uid));
      if (!extras.length) return { cards: localCards, arts: localArts };
      const cardsOut = [...localCards, ...extras];
      const artsOut = { ...localArts };
      extras.forEach((c) => { if (serverArts[c.uid]) artsOut[c.uid] = serverArts[c.uid]; });
      setCards(cardsOut); setArts(artsOut); setCollabNew(0);
      setFlipped((prev) => { const fl = { ...prev }; extras.forEach((c) => (fl[c.uid] = true)); return fl; });
      return { cards: cardsOut, arts: artsOut };
    } catch (e) { return { cards: localCards, arts: localArts }; }
  }

  // Save the current deck to the server (fixes the localStorage-quota bug).
  async function saveCurrentDeck() {
    if (!cards.length) return;
    if (!API_BASE) { setError("Saving needs the server — not configured."); return; }
    setSaveState("saving");
    const id = currentDeckId || newId();
    const name = questPrompt.slice(0, 42) || eventType || "Untitled deck";
    // Merge in any contributor cards before overwriting the shared deck.
    const merged = await mergeCollabCards(cards, arts);
    // Note: `user` is intentionally NOT saved — shared/collab links return the
    // whole payload, so we keep owner PII out of it.
    const deck = { id, name, eventType, theme, questPrompt, guardrails, cardBack, participants, categories, questCard, cards: merged.cards, arts: merged.arts, updatedAt: Date.now() };
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
      setCollabToken(r.collabToken); setCollabEnabled(true);
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
    if (!API_BASE || !collabToken || genState !== "done" || (!collabMode && !collabEnabled)) return;
    const iv = setInterval(async () => {
      try {
        const r = await api("GET", `/api/sq/collab/${encodeURIComponent(collabToken)}/poll?since=0`);
        if (r && typeof r.count === "number") setCollabNew(Math.max(0, r.count - cards.length));
      } catch (e) { /* not collab-enabled yet, or offline */ }
    }, 5000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collabToken, genState, cards.length, collabMode, collabEnabled]);

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
      setCollabEnabled(!!mine?.collabEnabled);
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
    setCollabToken(null); setCollabEnabled(false); setCollabMode(false); setShareOpen(false); setCollabNew(0);
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
          setCurrentDeckId(d.id); setCollabToken(collab); setCollabEnabled(true); setCollabMode(true);
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
        // The fallback deck exists so a live demo never dies on stage, but
        // swapping in canned lore silently is indistinguishable from the AI
        // simply writing something generic — which hid a real outage (an
        // exhausted API balance) behind decks that looked merely disappointing.
        console.warn("Live lore failed, using themed fallback deck:", loreErr);
        setError(`Wrote a generic deck — personalised lore is unavailable right now: ${loreErr.message}`);
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
          const art = await generateCardArt({ photoBase64: part?.photo || null, frameAccent: frAccent, themeStyle: th.style, seedStr: c.realName + c.title, lore: c, objectMode: !c.pid && !!c.category, category: c.category, onFallback: (m) => setError(`Card art fell back to a placeholder: ${m}`) });
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
      const deck = { id, name, eventType: src.eventType, theme: src.theme, questPrompt, guardrails, cardBack, participants: src.participants, categories: src.categories || [], questCard: qCard, cards: ordered, arts: curArts, updatedAt: Date.now() };
      (async () => {
        try {
          const r = await api("POST", "/api/sq/save", { ownerToken: getOwnerToken(), deck });
          setCurrentDeckId(r.id);
          if (r.collabToken) setCollabToken(r.collabToken);
          refreshDecks();
        } catch (e) {
          // Autosave is the only save most users ever trigger, so swallowing
          // this lost their deck silently — an oversized payload looked
          // identical to a successful save.
          console.warn("autosave failed", e.message);
          setError(`Deck not saved: ${e.message}`);
        }
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
      const art = await generateCardArt({ photoBase64: part?.photo || null, frameAccent: frAccent, themeStyle: themeObj.style, seedStr: card.realName + card.title + Math.random(), lore: card, refineNote, objectMode: !card.pid && !!card.category, category: card.category, onFallback: (m) => setError(`Card art fell back to a placeholder: ${m}`) });
      setArts((s) => ({ ...s, [uid]: art }));
    } catch (e) { setError(e.message); } finally { setLoadingArt((s) => ({ ...s, [uid]: false })); setBusyCard(null); }
  }

  const canNext = {
    0: fullQuest().trim().length > 8,
    1: participants.length > 0 && participants.every((p) => p.name.trim()) &&
       (!participants.some((p) => p.photo) || photoConsent),
  };

  // ===== MARKETPLACE / CREATOR STUDIO =====
  // Full-screen views rather than modals: both are destinations you browse,
  // and the builder's state stays untouched underneath.
  if (view === "listing" && openListingId) {
    return (
      <>
        <ListingDetail
          id={openListingId}
          account={account}
          onSignIn={() => setAuthOpen(true)}
          onOrdered={() => {
            try { window.history.replaceState({}, "", window.location.pathname); } catch (e) { /* ignore */ }
            setOpenListingId(""); setView("orders"); window.scrollTo(0, 0);
          }}
          onClose={() => {
            // Drop ?listing= so a refresh doesn't bounce back to the detail page.
            try { window.history.replaceState({}, "", window.location.pathname); } catch (e) { /* ignore */ }
            setOpenListingId(""); setView("market"); window.scrollTo(0, 0);
          }}
        />
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSubmit={doAuth} />}
      </>
    );
  }
  if (view === "orders") {
    return (
      <>
        <OrdersView account={account} onSignIn={() => setAuthOpen(true)}
          onClose={() => { setView("market"); window.scrollTo(0, 0); }} />
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSubmit={doAuth} />}
      </>
    );
  }
  if (view === "work") {
    return (
      <>
        <WorkView account={account} onSignIn={() => setAuthOpen(true)}
          onClose={() => { setView("studio"); window.scrollTo(0, 0); }} />
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSubmit={doAuth} />}
      </>
    );
  }
  if (view === "market") {
    return (
      <>
        <Marketplace
          account={account}
          onClose={() => { setView(""); window.scrollTo(0, 0); }}
          onSignIn={() => setAuthOpen(true)}
          onBecomeCreator={() => { setView("studio"); window.scrollTo(0, 0); }}
          onOrders={() => { setView("orders"); window.scrollTo(0, 0); }}
        />
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSubmit={doAuth} />}
      </>
    );
  }
  if (view === "studio") {
    return (
      <>
        <CreatorStudio
          account={account}
          onClose={() => { setView("market"); window.scrollTo(0, 0); }}
          onSignIn={() => setAuthOpen(true)}
          onWork={() => { setView("work"); window.scrollTo(0, 0); }}
        />
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSubmit={doAuth} />}
      </>
    );
  }

  // ===== LANDING =====
  if (landing) {
    return (
      <>
        <Landing
          // The landing scrolls, the app does not reset it — without this you
          // enter the builder already halfway down the page.
          onOpen={() => { setLanding(false); window.scrollTo(0, 0); }}
          onDemo={() => { loadDemo(); window.scrollTo(0, 0); }}
          savedCount={savedDecks.length}
          onDecks={() => { setShowDecks(true); setLanding(false); window.scrollTo(0, 0); }}
          banner={checkoutReturn && <CheckoutBanner status={checkoutReturn} onClose={() => setCheckoutReturn(null)} />}
          account={account}
          onSignIn={() => setAuthOpen(true)}
          onSignOut={signOut}
          onMarket={() => { setView("market"); window.scrollTo(0, 0); }}
        />
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSubmit={doAuth} />}
      </>
    );
  }

  // ===== APP =====
  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(1200px 600px at 50% -10%, ${themeObj.bg[1]} 0%, #14121c 50%, #0a090f 100%)`, color: "#e8e8f0", fontFamily: UI_FONT, padding: "0 0 80px", transition: "background .6s" }}>
      <GlobalCSS />
      {checkoutReturn && <CheckoutBanner status={checkoutReturn} onClose={() => setCheckoutReturn(null)} />}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSubmit={doAuth} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px 0", maxWidth: 1040, margin: "0 auto" }}>
        <div onClick={() => setLanding(true)} style={{ cursor: "pointer", fontFamily: DISPLAY_FONT, fontSize: 13, letterSpacing: 5, textTransform: "uppercase", color: "#d8b24a" }}>✦ Side Quest</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button onClick={newDeck} style={navBtn}>＋ New</button>
          <button onClick={() => setShowDecks(true)} style={navBtn}>◈ My decks{savedDecks.length ? ` (${savedDecks.length})` : ""}</button>
          <button onClick={() => { setView("market"); window.scrollTo(0, 0); }} style={navBtn}>✦ Marketplace</button>
          <AccountButton account={account} onSignIn={() => setAuthOpen(true)} onSignOut={signOut} />
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
          <Panel title="Set the scene" sub="Grab a ready-made world, or forge your own lore from scratch — either way we spin it into your deck.">
            {/* ── Preset AI lores ── */}
            <LoreLibrary settingId={loreSetting} occasionId={loreOccasion} onPickSetting={pickSetting} onPickOccasion={pickOccasion} t={themeObj} />

            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
              <div style={{ flex: 1, height: 1, background: "#2c2c36" }} />
              <span style={{ fontFamily: UI_FONT, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "#8a8a98" }}>or</span>
              <div style={{ flex: 1, height: 1, background: "#2c2c36" }} />
            </div>

            {/* ── User-made lore ── */}
            <div style={{ padding: 16, borderRadius: 12, border: `1px solid ${themeObj.accent}33`, background: "rgba(255,255,255,0.02)" }}>
              <div style={{ fontFamily: themeObj.displayFont, fontWeight: 700, fontSize: 16, color: "#f4f4fa", marginBottom: 4 }}>🪶 Forge your own lore</div>
              <div style={{ fontSize: 13, color: "#8a8a98", marginBottom: 14 }}>Write your quest from scratch (or tweak a template above), then pin down the specifics.</div>
              <div style={{ fontFamily: UI_FONT, fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase", color: "#8a8a98", marginBottom: 8 }}>Your quest</div>
              <textarea value={questPrompt} onChange={(e) => setQuestPrompt(e.target.value)} rows={7}
                placeholder="e.g. Dave's bachelor party in Lisbon — complete dares across the city to 'earn back' his freedom before the wedding. He fears seagulls and loves bad karaoke."
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
              <div style={{ fontSize: 12, color: "#7a7a88", marginTop: 8 }}>Tip: name the guest of honor, the place, and a couple personal details for sharper cards.</div>
              <GuardrailBuilder guardrails={guardrails} onAdd={addGuardrail} onUpdate={updateGuardrail} onRemove={removeGuardrail} />
            </div>

            <CardStylePicker themeId={theme || "lotr"} onPick={setTheme} />
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
// ACCOUNTS
// ---------------------------------------------------------------------------

// Signing in is optional for building a deck and mandatory for the
// marketplace, so this is a dismissible modal rather than a gate.
function AuthModal({ onClose, onSubmit }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const signup = mode === "signup";
  // Mirrors the server's rule (authSignup: valid email, 8+ chars) so the user
  // finds out before a round trip, not after.
  const ok = email.includes("@") && password.length >= 8;

  async function submit(e) {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true); setErr("");
    try {
      await onSubmit(mode, { email: email.trim(), password, displayName: displayName.trim() });
      onClose();
    } catch (e2) { setErr(e2.message || "Something went wrong"); setBusy(false); }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="ql-fade"
        style={{ width: "100%", maxWidth: 400, background: "#16141e", border: "1px solid #2c2c36", borderRadius: 18, padding: 26, boxShadow: "0 40px 80px rgba(0,0,0,0.5)" }}>
        <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 24, margin: "0 0 6px" }}>{signup ? "Create an account" : "Sign in"}</h2>
        <p style={{ color: "#9a9aa8", fontSize: 13, margin: "0 0 20px", lineHeight: 1.5 }}>
          {signup
            ? "Keeps your decks when you switch device or clear your browser."
            : "Welcome back."}
        </p>

        {signup && (
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name (optional)" style={{ ...inputStyle, marginBottom: 10 }} />
        )}
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email"
          placeholder="you@example.com" style={{ ...inputStyle, marginBottom: 10 }} />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password"
          autoComplete={signup ? "new-password" : "current-password"}
          placeholder={signup ? "Password (8+ characters)" : "Password"} style={{ ...inputStyle, marginBottom: 6 }} />

        {err && <div style={{ color: "#ffc4cb", background: "rgba(239,91,107,0.12)", border: "1px solid #ef5b6b", borderRadius: 8, padding: "9px 12px", fontSize: 13, margin: "10px 0" }}>⚠ {err}</div>}

        <PrimaryButton onClick={submit} disabled={!ok || busy} style={{ width: "100%", marginTop: 14 }}>
          {busy ? "…" : signup ? "Create account" : "Sign in"}
        </PrimaryButton>

        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button type="button" onClick={() => { setMode(signup ? "login" : "signup"); setErr(""); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#d8b24a", fontFamily: UI_FONT, fontSize: 13 }}>
            {signup ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
        </div>
      </form>
    </div>
  );
}

// Header control: signed out shows a sign-in button, signed in shows who you
// are and a way out.
function AccountButton({ account, onSignIn, onSignOut }) {
  if (!account) return <button onClick={onSignIn} style={navBtn}>Sign in</button>;
  const label = account.displayName || account.email;
  return (
    <button onClick={onSignOut} title={`Signed in as ${account.email} — click to sign out`}
      style={{ ...navBtn, borderColor: "#d8b24a55", color: "#d8b24a", maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      ◆ {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// MARKETPLACE: ORDERS, DELIVERY & CHAT
// ---------------------------------------------------------------------------

const ITEM_STATUS_LABEL = {
  pending: "Awaiting creator",
  accepted_by_creator: "Accepted — not started",
  in_progress: "In progress",
  delivered: "Delivered — your review",
  revision_requested: "Revision requested",
  accepted: "Complete",
  declined: "Declined",
  cancelled: "Cancelled",
  disputed: "Disputed — with support",
};
const ITEM_STATUS_COLOR = {
  delivered: "#f3cf5b", accepted: "#4ade80", disputed: "#ef5b6b",
  declined: "#ef5b6b", cancelled: "#6c6c78",
};

function StatusPill({ status }) {
  const c = ITEM_STATUS_COLOR[status] || "#8a8a98";
  return (
    <span style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", padding: "4px 10px",
      borderRadius: 999, border: `1px solid ${c}55`, color: c, whiteSpace: "nowrap" }}>
      {ITEM_STATUS_LABEL[status] || status}
    </span>
  );
}

// Upload straight to object storage: ask the server to presign, PUT the bytes
// to storage directly, then hand the resulting URL back. The file never passes
// through our server, which is the whole point of presigning.
async function uploadAttachment(itemId, file) {
  const pre = await api("POST", `/api/mk/items/${itemId}/attachments`, {
    contentType: file.type, sizeBytes: file.size,
  });
  const put = await fetch(pre.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": pre.contentType }, // must match what was signed
    body: file,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  return { url: pre.publicUrl, name: file.name, contentType: pre.contentType };
}

function ChatThread({ itemId, account }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const endRef = useRef(null);

  async function load() {
    try { const d = await api("GET", `/api/mk/items/${itemId}/messages`); setMessages(d.messages || []); }
    catch (e) { /* transient */ }
  }
  // Poll rather than socket — same cadence as the collab poll already in the app.
  useEffect(() => {
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);

  async function send(attachments) {
    const body = text.trim();
    if (!body && !attachments) return;
    setBusy(true); setErr("");
    try {
      await api("POST", `/api/mk/items/${itemId}/messages`, { body, attachments: attachments || [] });
      setText(""); await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function onPickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true); setErr("");
    try { await send([await uploadAttachment(itemId, file)]); }
    catch (e2) { setErr(e2.message); setBusy(false); }
  }

  return (
    <div style={{ border: "1px solid #2c2c36", borderRadius: 14, background: "rgba(255,255,255,0.02)" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #24242e", fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "#8a8a98" }}>
        Messages
      </div>
      <div style={{ maxHeight: 300, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.length === 0 && <div style={{ color: "#6c6c78", fontSize: 13 }}>No messages yet — say hello.</div>}
        {messages.map((m) => {
          const mine = m.senderId === account?.id;
          return (
            <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%" }}>
              <div style={{ fontSize: 11, color: "#6c6c78", marginBottom: 3, textAlign: mine ? "right" : "left" }}>
                {mine ? "You" : (m.senderName || "Them")}
              </div>
              <div style={{ background: mine ? "rgba(216,178,74,0.12)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${mine ? "#d8b24a44" : "#33333e"}`, borderRadius: 12, padding: "9px 12px",
                fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                {m.body}
                {(m.attachments || []).map((a, i) => (
                  <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 8 }}>
                    <img src={a.url} alt={a.name} style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, border: "1px solid #33333e", display: "block" }} />
                  </a>
                ))}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {err && <div style={{ color: "#ffc4cb", fontSize: 13, padding: "0 14px 8px" }}>⚠ {err}</div>}
      <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #24242e" }}>
        <input value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Write a message…" style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onPickFile} style={{ display: "none" }} />
        <GhostButton onClick={() => fileRef.current?.click()} disabled={busy} style={{ padding: "11px 14px" }}>📎</GhostButton>
        <PrimaryButton onClick={() => send()} disabled={busy || !text.trim()}>Send</PrimaryButton>
      </div>
    </div>
  );
}

// One order item, with the actions appropriate to whoever is looking at it.
// The server enforces all of this too — the UI only avoids offering moves that
// would be refused.
function ItemPanel({ item, role, account, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [delivering, setDelivering] = useState(false);
  const [files, setFiles] = useState([]);
  const fileRef = useRef(null);

  async function act(action, payload) {
    setBusy(true); setErr("");
    try { await api("POST", `/api/mk/items/${item.id}/${action}`, payload || {}); setNote(""); await onChanged(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function addDeliveryFile(e) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    setBusy(true); setErr("");
    // Upload first, then update state — the updater callback isn't async.
    try {
      const uploaded = await uploadAttachment(item.id, f);
      setFiles((s) => [...s, uploaded]);
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  }

  async function submitDelivery() {
    setBusy(true); setErr("");
    try {
      await api("POST", `/api/mk/items/${item.id}/deliverables`, { kind: "files", files, note });
      setFiles([]); setNote(""); setDelivering(false); await onChanged();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  const isCreator = role === "creator";
  const revisionsLeft = item.revisionsIncluded - item.revisionsUsed;

  return (
    <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid #2c2c36", borderRadius: 16, padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <div>
          <div style={{ fontFamily: DISPLAY_FONT, fontSize: 19 }}>{item.title}</div>
          <div style={{ color: "#8a8a98", fontSize: 13, marginTop: 3 }}>
            {item.discipline === "artist" ? "Illustration" : "Adventure lore"} · {money(item.priceCents)}
            {isCreator && ` · you earn ${money(item.creatorEarningsCents)}`}
            {item.creator && !isCreator && ` · ${item.creator.displayName}`}
          </div>
        </div>
        <StatusPill status={item.status} />
      </div>

      {item.brief && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(0,0,0,0.25)", border: "1px solid #24242e" }}>
          <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#8a8a98", marginBottom: 5 }}>Brief</div>
          <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{item.brief}</div>
        </div>
      )}

      {err && <div style={{ background: "rgba(239,91,107,0.12)", border: "1px solid #ef5b6b", color: "#ffc4cb", padding: "9px 12px", borderRadius: 8, fontSize: 13, marginTop: 12 }}>⚠ {err}</div>}

      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 16 }}>
        {isCreator && item.status === "pending" && (<>
          <PrimaryButton onClick={() => act("accept")} disabled={busy}>Accept this job</PrimaryButton>
          <GhostButton onClick={() => act("decline")} disabled={busy}>Decline</GhostButton>
        </>)}
        {isCreator && ["accepted_by_creator", "in_progress", "revision_requested"].includes(item.status) && !delivering && (
          <PrimaryButton onClick={() => setDelivering(true)} disabled={busy}>Deliver work</PrimaryButton>
        )}
        {!isCreator && item.status === "delivered" && (<>
          <PrimaryButton onClick={() => act("accept_delivery")} disabled={busy}>Accept delivery</PrimaryButton>
          <GhostButton onClick={() => act("request_revision", { note })} disabled={busy || revisionsLeft <= 0}>
            Request revision{revisionsLeft > 0 ? ` (${revisionsLeft} left)` : " — none left"}
          </GhostButton>
          <GhostButton onClick={() => act("dispute", { reason: note })} disabled={busy}>Raise a problem</GhostButton>
        </>)}
        {!isCreator && ["pending", "accepted_by_creator"].includes(item.status) && (
          <GhostButton onClick={() => act("cancel")} disabled={busy}>Cancel</GhostButton>
        )}
      </div>

      {delivering && (
        <div style={{ marginTop: 14, padding: 14, borderRadius: 12, border: "1px dashed #3a3a46" }}>
          <div style={{ fontFamily: DISPLAY_FONT, fontSize: 16, marginBottom: 8 }}>Deliver your work</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {files.map((f, i) => (
              <span key={i} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 999, border: "1px solid #33333e", color: "#cfcfda" }}>{f.name}</span>
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={addDeliveryFile} style={{ display: "none" }} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the buyer (optional)" style={{ ...inputStyle, marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            <GhostButton onClick={() => fileRef.current?.click()} disabled={busy}>+ Add file</GhostButton>
            <PrimaryButton onClick={submitDelivery} disabled={busy || files.length === 0}>Send delivery</PrimaryButton>
            <GhostButton onClick={() => { setDelivering(false); setFiles([]); }} disabled={busy}>Cancel</GhostButton>
          </div>
          {files.length === 0 && <div style={{ color: "#8a8a98", fontSize: 12, marginTop: 8 }}>Attach at least one file to deliver.</div>}
        </div>
      )}

      {!isCreator && item.status === "delivered" && (
        <input value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="What needs changing? (used for a revision or a problem report)"
          style={{ ...inputStyle, marginTop: 12 }} />
      )}

      <div style={{ marginTop: 16 }}>
        <ChatThread itemId={item.id} account={account} />
      </div>
    </div>
  );
}

// Buyer's orders. Each order may span two creators, so items are listed
// individually with their own state and their own conversation.
function OrdersView({ onClose, account, onSignIn }) {
  const [orders, setOrders] = useState(null);
  const [open, setOpen] = useState(null);   // full order detail
  const [err, setErr] = useState("");

  async function load() {
    try { const d = await api("GET", "/api/mk/orders"); setOrders(d.orders || []); }
    catch (e) { setErr(e.message); setOrders([]); }
  }
  async function openOrder(id) {
    try { const d = await api("GET", `/api/mk/orders/${id}`); setOpen(d.order); }
    catch (e) { setErr(e.message); }
  }
  useEffect(() => { if (account) load(); else setOrders([]); /* eslint-disable-next-line */ }, [account]);

  return (
    <MarketShell title="Your orders" onClose={onClose} account={account} onSignIn={onSignIn}>
      {err && <div style={{ background: "rgba(239,91,107,0.12)", border: "1px solid #ef5b6b", color: "#ffc4cb", padding: "12px 16px", borderRadius: 10, marginBottom: 18, fontSize: 14 }}>⚠ {err}</div>}
      {!account ? (
        <EmptyState title="Sign in to see your orders" body="Orders are tied to your account so you can follow them across devices." action={<PrimaryButton onClick={onSignIn}>Sign in</PrimaryButton>} />
      ) : open ? (
        <>
          <GhostButton onClick={() => { setOpen(null); load(); }} style={{ marginBottom: 18 }}>← All orders</GhostButton>
          <div style={{ color: "#8a8a98", fontSize: 13, marginBottom: 14 }}>
            Order {open.id.slice(0, 8)} · {money(open.totalCents)} · {open.status}
          </div>
          {open.items.map((it) => (
            <ItemPanel key={it.id} item={it} role="buyer" account={account} onChanged={() => openOrder(open.id)} />
          ))}
        </>
      ) : orders === null ? (
        <div style={{ color: "#6c6c78" }}>Loading…</div>
      ) : orders.length === 0 ? (
        <EmptyState title="No orders yet" body="Commission a writer or an artist from the marketplace and it'll show up here." />
      ) : (
        orders.map((o) => (
          <button key={o.id} onClick={() => openOrder(o.id)} style={{
            display: "block", width: "100%", textAlign: "left", font: "inherit", cursor: "pointer",
            background: "rgba(255,255,255,0.025)", border: "1px solid #2c2c36", borderRadius: 14,
            padding: 18, marginBottom: 12, color: "#e8e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontFamily: DISPLAY_FONT, fontSize: 17 }}>Order {o.id.slice(0, 8)}</div>
              <div style={{ color: "#f3cf5b", fontFamily: DISPLAY_FONT, fontSize: 18 }}>{money(o.totalCents)}</div>
            </div>
            <div style={{ color: "#8a8a98", fontSize: 13, marginTop: 4 }}>{o.status}</div>
          </button>
        ))
      )}
    </MarketShell>
  );
}

// Creator's inbox: every item assigned to them, newest first.
function WorkView({ onClose, account, onSignIn }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState("");
  async function load() {
    try { const d = await api("GET", "/api/mk/work"); setItems(d.items || []); }
    catch (e) { setErr(e.message); setItems([]); }
  }
  useEffect(() => { if (account) load(); else setItems([]); /* eslint-disable-next-line */ }, [account]);

  return (
    <MarketShell title="Your work" onClose={onClose} account={account} onSignIn={onSignIn}>
      {err && <div style={{ background: "rgba(239,91,107,0.12)", border: "1px solid #ef5b6b", color: "#ffc4cb", padding: "12px 16px", borderRadius: 10, marginBottom: 18, fontSize: 14 }}>⚠ {err}</div>}
      {!account ? (
        <EmptyState title="Sign in to see your commissions" body="Work assigned to you appears here." action={<PrimaryButton onClick={onSignIn}>Sign in</PrimaryButton>} />
      ) : items === null ? (
        <div style={{ color: "#6c6c78" }}>Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState title="No commissions yet" body="When a buyer commissions one of your listings, it lands here." />
      ) : (
        items.map((it) => <ItemPanel key={it.id} item={it} role="creator" account={account} onChanged={load} />)
      )}
    </MarketShell>
  );
}

// Shared chrome so the marketplace pages don't each re-declare a header.
function MarketShell({ title, children, onClose, account, onSignIn }) {
  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(1200px 700px at 50% -5%, #2a1d3f 0%, #15121d 45%, #08070d 100%)", color: "#e8e8f0", fontFamily: UI_FONT, paddingBottom: 80 }}>
      <GlobalCSS />
      <header style={{ position: "sticky", top: 0, zIndex: 10, backdropFilter: "blur(10px)", background: "rgba(8,7,13,0.72)", borderBottom: "1px solid rgba(216,178,74,0.14)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontFamily: DISPLAY_FONT, fontSize: "clamp(11px,3vw,14px)", letterSpacing: "clamp(2px,1vw,5px)", textTransform: "uppercase", color: "#d8b24a" }}>✦ {title}</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {!account && <button onClick={onSignIn} style={navBtn}>Sign in</button>}
            <GhostButton onClick={onClose} style={{ padding: "8px 16px", fontSize: 13 }}>← Back</GhostButton>
          </div>
        </div>
      </header>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 0" }}>{children}</div>
    </div>
  );
}

function EmptyState({ title, body, action }) {
  return (
    <div style={{ border: "1px dashed #33333e", borderRadius: 16, padding: "48px 24px", textAlign: "center" }}>
      <div style={{ fontFamily: DISPLAY_FONT, fontSize: 21, marginBottom: 9 }}>{title}</div>
      <p style={{ color: "#9a9aa8", fontSize: 14, lineHeight: 1.6, maxWidth: 440, margin: "0 auto 18px" }}>{body}</p>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MARKETPLACE
// ---------------------------------------------------------------------------
// Browse is curation-led rather than search-led: approved creators only, and
// no rank-by-volume. Two disciplines sell here — artists deliver illustration,
// writers deliver adventure lore — and each sells ready-made catalog items or
// bespoke commissions.

const DISCIPLINE_LABEL = { artist: "Artists", writer: "Lore writers" };
const KIND_LABEL = { catalog: "Ready-made", commission: "Commission" };

function money(cents, currency = "usd") {
  const sym = currency === "usd" ? "$" : "";
  return `${sym}${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}

function Stars({ avg, count }) {
  if (!count) return <span style={{ color: "#6c6c78", fontSize: 12 }}>No reviews yet</span>;
  return (
    <span style={{ color: "#d8b24a", fontSize: 12 }}>
      ★ {Number(avg).toFixed(1)} <span style={{ color: "#6c6c78" }}>({count})</span>
    </span>
  );
}

// Deep link for a listing. Same query-param convention as ?deck= and ?collab=,
// which means these URLs are shareable and open standalone — a creator can send
// a buyer straight to the thing they're selling.
const listingUrl = (id) => `${location.origin}${location.pathname}?listing=${encodeURIComponent(id)}`;

// An anchor, not a button: opening in a new window is what makes middle-click,
// cmd-click and "copy link address" all behave the way people expect.
function ListingCard({ listing }) {
  const l = listing;
  return (
    <a href={listingUrl(l.id)} target="_blank" rel="noopener noreferrer" style={{
      textDecoration: "none", font: "inherit",
      background: "rgba(255,255,255,0.025)", border: "1px solid #2c2c36", borderRadius: 16,
      padding: 20, color: "#e8e8f0", display: "flex", flexDirection: "column", gap: 8,
      transition: "border-color .15s, transform .15s",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#d8b24a66"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2c2c36"; e.currentTarget.style.transform = "none"; }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#d8b24a", border: "1px solid #d8b24a44", borderRadius: 999, padding: "3px 9px" }}>
          {KIND_LABEL[l.kind] || l.kind}
        </span>
        <span style={{ fontSize: 11, color: "#8a8a98" }}>{l.discipline === "artist" ? "Art" : "Lore"}</span>
      </div>
      <div style={{ fontFamily: DISPLAY_FONT, fontSize: 19, lineHeight: 1.25 }}>{l.title}</div>
      {l.summary && <div style={{ color: "#9a9aa8", fontSize: 14, lineHeight: 1.55 }}>{l.summary}</div>}
      <div style={{ marginTop: "auto", paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10 }}>
        <div>
          <div style={{ color: "#cfcfda", fontSize: 13 }}>{l.creator?.displayName}</div>
          <Stars avg={l.creator?.ratingAvg} count={l.creator?.ratingCount || 0} />
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: DISPLAY_FONT, fontSize: 22, color: "#f3cf5b" }}>{money(l.priceCents, l.currency)}</div>
          {l.kind === "commission" && l.deliveryDays && (
            <div style={{ color: "#6c6c78", fontSize: 12 }}>~{l.deliveryDays} days</div>
          )}
        </div>
      </div>
    </a>
  );
}

// Standalone listing page, reached by ?listing=<id>. Shows the work, who made
// it, and what else they sell — the three things a buyer needs before deciding.
function ListingDetail({ id, onClose, account, onSignIn, onOrdered }) {
  const [data, setData] = useState(null);   // {listing, creator, others}
  const [err, setErr] = useState("");
  const [ordering, setOrdering] = useState(false);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);

  async function placeOrder() {
    setBusy(true); setErr("");
    try {
      await api("POST", "/api/mk/orders", { items: [{ listingId: id, brief: brief.trim() }] });
      setOrdering(false); setBrief("");
      onOrdered && onOrdered();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { listing } = await api("GET", `/api/mk/listings/${encodeURIComponent(id)}`);
        // The creator's public page carries their bio and their other listings.
        let creator = null, others = [];
        try {
          const c = await api("GET", `/api/mk/creators/${encodeURIComponent(listing.creatorId)}`);
          creator = c.creator; others = (c.listings || []).filter((l) => l.id !== listing.id);
        } catch (e) { /* listing still viewable without the profile */ }
        if (!cancelled) setData({ listing, creator, others });
      } catch (e) { if (!cancelled) setErr(e.message); }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const l = data?.listing;
  const c = data?.creator;

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(1200px 700px at 50% -5%, #2a1d3f 0%, #15121d 45%, #08070d 100%)", color: "#e8e8f0", fontFamily: UI_FONT, paddingBottom: 80 }}>
      <GlobalCSS />
      <header style={{ position: "sticky", top: 0, zIndex: 10, backdropFilter: "blur(10px)", background: "rgba(8,7,13,0.72)", borderBottom: "1px solid rgba(216,178,74,0.14)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div onClick={onClose} style={{ cursor: "pointer", fontFamily: DISPLAY_FONT, fontSize: "clamp(11px,3vw,14px)", letterSpacing: "clamp(2px,1vw,5px)", textTransform: "uppercase", color: "#d8b24a" }}>✦ Side Quest</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {!account && <button onClick={onSignIn} style={navBtn}>Sign in</button>}
            <GhostButton onClick={onClose} style={{ padding: "8px 16px", fontSize: 13 }}>Browse all</GhostButton>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "44px 24px 0" }}>
        {err && <div style={{ background: "rgba(239,91,107,0.12)", border: "1px solid #ef5b6b", color: "#ffc4cb", padding: "12px 16px", borderRadius: 10, fontSize: 14 }}>⚠ {err}</div>}
        {!data && !err && <div style={{ color: "#6c6c78" }}>Loading…</div>}

        {l && (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
              <span style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#d8b24a", border: "1px solid #d8b24a44", borderRadius: 999, padding: "3px 9px" }}>{KIND_LABEL[l.kind] || l.kind}</span>
              <span style={{ fontSize: 12, color: "#8a8a98" }}>{l.discipline === "artist" ? "Illustration" : "Adventure lore"}</span>
            </div>
            <h1 style={{ fontFamily: DISPLAY_FONT, fontSize: "clamp(26px,4.5vw,40px)", margin: "0 0 14px", lineHeight: 1.15 }}>{l.title}</h1>
            {l.summary && <p style={{ color: "#b8b8c8", fontSize: 17, lineHeight: 1.6, margin: "0 0 22px", maxWidth: 620 }}>{l.summary}</p>}

            <div style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "center", padding: "20px 0", borderTop: "1px solid #24242e", borderBottom: "1px solid #24242e", marginBottom: 26 }}>
              <div>
                <div style={{ fontFamily: DISPLAY_FONT, fontSize: 34, color: "#f3cf5b", lineHeight: 1 }}>{money(l.priceCents, l.currency)}</div>
                <div style={{ color: "#6c6c78", fontSize: 12, marginTop: 4 }}>
                  {l.kind === "commission" ? `delivered in ~${l.deliveryDays} days · ${l.revisionsIncluded} revisions included` : "instant download, personalise with your crew"}
                </div>
              </div>
              <div style={{ marginLeft: "auto" }}>
                <PrimaryButton onClick={() => (account ? setOrdering(true) : onSignIn())}>
                  {l.kind === "commission" ? "Request this commission" : "Buy this"}
                </PrimaryButton>
                <div style={{ color: "#6c6c78", fontSize: 12, marginTop: 8, textAlign: "right" }}>
                  {account ? "No charge yet — payments are still being set up" : "Sign in to order"}
                </div>
              </div>
            </div>

            {ordering && (
              <div style={{ border: "1px solid #d8b24a55", background: "rgba(216,178,74,0.06)", borderRadius: 14, padding: 20, marginBottom: 28 }}>
                <div style={{ fontFamily: DISPLAY_FONT, fontSize: 19, marginBottom: 6 }}>
                  {l.kind === "commission" ? "Tell them what you need" : "Confirm your order"}
                </div>
                <p style={{ color: "#9a9aa8", fontSize: 14, lineHeight: 1.6, margin: "0 0 14px" }}>
                  {l.kind === "commission"
                    ? "The occasion, the people, the tone — the more specific you are, the closer the first draft lands."
                    : "You'll be able to personalise this with your own crew after ordering."}
                </p>
                {l.kind === "commission" && (
                  <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={5}
                    placeholder="e.g. Dave's stag do in Lisbon, 8 of us, noir detective tone. He's terrified of seagulls."
                    style={{ ...inputStyle, marginBottom: 12, resize: "vertical" }} />
                )}
                <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
                  <PrimaryButton onClick={placeOrder} disabled={busy || (l.kind === "commission" && brief.trim().length < 10)}>
                    {busy ? "…" : `Place order — ${money(l.priceCents)}`}
                  </PrimaryButton>
                  <GhostButton onClick={() => setOrdering(false)} disabled={busy}>Cancel</GhostButton>
                  {l.kind === "commission" && brief.trim().length < 10 && (
                    <span style={{ color: "#8a8a98", fontSize: 13 }}>A brief is required</span>
                  )}
                </div>
              </div>
            )}

            {l.description && (
              <div style={{ color: "#c8c8d4", fontSize: 15, lineHeight: 1.7, whiteSpace: "pre-wrap", marginBottom: 34 }}>{l.description}</div>
            )}

            {c && (
              <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid #2c2c36", borderRadius: 18, padding: 24 }}>
                <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "#d8b24a", marginBottom: 10 }}>About the creator</div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                  <div style={{ fontFamily: DISPLAY_FONT, fontSize: 22 }}>{c.displayName}</div>
                  <Stars avg={c.ratingAvg} count={c.ratingCount} />
                </div>
                {c.headline && <div style={{ color: "#9a9aa8", fontSize: 14, marginTop: 4 }}>{c.headline}</div>}
                {c.bio && <p style={{ color: "#c8c8d4", fontSize: 14, lineHeight: 1.7, marginTop: 14 }}>{c.bio}</p>}

                {data.others.length > 0 && (
                  <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #24242e" }}>
                    <div style={{ fontFamily: DISPLAY_FONT, fontSize: 17, marginBottom: 12 }}>More from {c.displayName}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 14 }}>
                      {data.others.map((o) => <ListingCard key={o.id} listing={{ ...o, creator: { displayName: c.displayName, ratingAvg: c.ratingAvg, ratingCount: c.ratingCount } }} />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Marketplace({ onClose, account, onSignIn, onBecomeCreator, onOrders }) {
  const [discipline, setDiscipline] = useState("");
  const [kind, setKind] = useState("");
  const [listings, setListings] = useState(null);   // null = loading
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    setListings(null); setErr("");
    (async () => {
      try {
        const qs = new URLSearchParams();
        if (discipline) qs.set("discipline", discipline);
        if (kind) qs.set("kind", kind);
        const d = await api("GET", `/api/mk/listings${qs.toString() ? "?" + qs : ""}`);
        if (!cancelled) setListings(d.listings || []);
      } catch (e) { if (!cancelled) { setErr(e.message); setListings([]); } }
    })();
    return () => { cancelled = true; };
  }, [discipline, kind]);

  const Filter = ({ value, current, set, children }) => (
    <button onClick={() => set(current === value ? "" : value)} style={{
      ...navBtn, cursor: "pointer",
      borderColor: current === value ? "#d8b24a" : "#3a3a46",
      color: current === value ? "#f3cf5b" : "#c8c8d4",
    }}>{children}</button>
  );

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(1200px 700px at 50% -5%, #2a1d3f 0%, #15121d 45%, #08070d 100%)", color: "#e8e8f0", fontFamily: UI_FONT, paddingBottom: 80 }}>
      <GlobalCSS />
      <header style={{ position: "sticky", top: 0, zIndex: 10, backdropFilter: "blur(10px)", background: "rgba(8,7,13,0.72)", borderBottom: "1px solid rgba(216,178,74,0.14)" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div onClick={onClose} style={{ cursor: "pointer", fontFamily: DISPLAY_FONT, fontSize: "clamp(11px,3vw,14px)", letterSpacing: "clamp(2px,1vw,5px)", textTransform: "uppercase", color: "#d8b24a", whiteSpace: "nowrap" }}>✦ Side Quest</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {account && <button onClick={onOrders} style={navBtn}>◷ Orders</button>}
            <button onClick={onBecomeCreator} style={navBtn}>Sell your work</button>
            {!account && <button onClick={onSignIn} style={navBtn}>Sign in</button>}
            <GhostButton onClick={onClose} style={{ padding: "8px 16px", fontSize: 13 }}>← Back to builder</GhostButton>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "48px 24px 0" }}>
        <div style={{ fontFamily: UI_FONT, fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: "#d8b24a", marginBottom: 12 }}>Marketplace</div>
        <h1 style={{ fontFamily: DISPLAY_FONT, fontSize: "clamp(28px,5vw,46px)", margin: "0 0 12px" }}>Hire a human</h1>
        <p style={{ color: "#9a9aa8", fontSize: 16, lineHeight: 1.6, maxWidth: 620, margin: "0 0 32px" }}>
          Commission original illustration or a bespoke adventure from invited creators — or buy something
          ready-made and personalise it with your own crew. Every creator here is hand-picked.
        </p>

        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 30 }}>
          <Filter value="artist" current={discipline} set={setDiscipline}>Art</Filter>
          <Filter value="writer" current={discipline} set={setDiscipline}>Lore</Filter>
          <span style={{ width: 1, background: "#2c2c36", margin: "0 5px" }} />
          <Filter value="catalog" current={kind} set={setKind}>Ready-made</Filter>
          <Filter value="commission" current={kind} set={setKind}>Commission</Filter>
        </div>

        {err && <div style={{ background: "rgba(239,91,107,0.12)", border: "1px solid #ef5b6b", color: "#ffc4cb", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: 14 }}>⚠ {err}</div>}

        {listings === null ? (
          <div style={{ color: "#6c6c78", padding: "40px 0" }}>Loading…</div>
        ) : listings.length === 0 ? (
          <div style={{ border: "1px dashed #33333e", borderRadius: 16, padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontFamily: DISPLAY_FONT, fontSize: 20, marginBottom: 8 }}>No listings yet</div>
            <div style={{ color: "#9a9aa8", fontSize: 14, lineHeight: 1.6, maxWidth: 460, margin: "0 auto" }}>
              The roster is invite-only and still being assembled. If you illustrate or write,
              apply and we'll take a look.
            </div>
            <GhostButton onClick={onBecomeCreator} style={{ marginTop: 20 }}>Apply as a creator</GhostButton>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 18 }}>
            {listings.map((l) => <ListingCard key={l.id} listing={l} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// Creator-side: apply, then manage listings. Deliberately plain — this is a
// working surface for a small invited roster, not a storefront builder.
function CreatorStudio({ onClose, account, onSignIn, onWork }) {
  const [creators, setCreators] = useState(null);
  const [listings, setListings] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ discipline: "artist", displayName: "", headline: "" });
  // Delivery days defaults rather than starting empty: it is required for a
  // commission, and Number("") is 0, which the server rightly rejects — so an
  // empty field turned a missing default into a validation error.
  const BLANK_LISTING = { kind: "commission", title: "", summary: "", priceCents: "", deliveryDays: "14" };
  const [lf, setLf] = useState(BLANK_LISTING);

  // Say what's missing before submitting, rather than round-tripping to find out.
  const priceNum = Number(lf.priceCents);
  const daysNum = Number(lf.deliveryDays);
  const listingProblem =
    !lf.title.trim() ? "Give the listing a title"
    : !Number.isFinite(priceNum) || priceNum < 15 ? "Price must be at least $15"
    : lf.kind === "commission" && !(Number.isFinite(daysNum) && daysNum >= 1 && daysNum <= 365)
      ? "Commissions need a delivery time, in days (1–365)"
      : "";

  async function load() {
    try {
      const [c, l] = await Promise.all([
        api("GET", "/api/mk/creators/me"),
        api("GET", "/api/mk/listings/mine"),
      ]);
      setCreators(c.creators || []); setListings(l.listings || []);
    } catch (e) { setErr(e.message); setCreators([]); }
  }
  useEffect(() => { if (account) load(); else setCreators([]); /* eslint-disable-next-line */ }, [account]);

  async function apply(e) {
    e.preventDefault(); setBusy(true); setErr("");
    try { await api("POST", "/api/mk/creators", form); await load(); }
    catch (e2) { setErr(e2.message); }
    setBusy(false);
  }

  async function createListing(e, creator) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      await api("POST", "/api/mk/listings", {
        creatorId: creator.id, kind: lf.kind, title: lf.title, summary: lf.summary,
        priceCents: Math.round(Number(lf.priceCents) * 100),
        ...(lf.kind === "commission" ? { deliveryDays: Number(lf.deliveryDays) } : {}),
      });
      setLf(BLANK_LISTING);
      await load();
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  }

  async function setStatus(listing, status) {
    setErr("");
    try { await api("PATCH", `/api/mk/listings/${listing.id}`, { status }); await load(); }
    catch (e) { setErr(e.message); }
  }

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(1200px 700px at 50% -5%, #2a1d3f 0%, #15121d 45%, #08070d 100%)", color: "#e8e8f0", fontFamily: UI_FONT, paddingBottom: 80 }}>
      <GlobalCSS />
      <header style={{ position: "sticky", top: 0, zIndex: 10, backdropFilter: "blur(10px)", background: "rgba(8,7,13,0.72)", borderBottom: "1px solid rgba(216,178,74,0.14)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontFamily: DISPLAY_FONT, fontSize: "clamp(11px,3vw,14px)", letterSpacing: "clamp(2px,1vw,5px)", textTransform: "uppercase", color: "#d8b24a" }}>✦ Creator studio</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {account && <button onClick={onWork} style={navBtn}>◷ Incoming work</button>}
            <GhostButton onClick={onClose} style={{ padding: "8px 16px", fontSize: 13 }}>← Back</GhostButton>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "44px 24px 0" }}>
        {err && <div style={{ background: "rgba(239,91,107,0.12)", border: "1px solid #ef5b6b", color: "#ffc4cb", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: 14 }}>⚠ {err}</div>}

        {!account ? (
          <div style={{ border: "1px dashed #33333e", borderRadius: 16, padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontFamily: DISPLAY_FONT, fontSize: 22, marginBottom: 10 }}>Sign in to apply</div>
            <p style={{ color: "#9a9aa8", fontSize: 14, maxWidth: 420, margin: "0 auto 20px", lineHeight: 1.6 }}>
              Selling needs an account so we can attribute work and pay you.
            </p>
            <PrimaryButton onClick={onSignIn}>Sign in</PrimaryButton>
          </div>
        ) : creators === null ? (
          <div style={{ color: "#6c6c78" }}>Loading…</div>
        ) : (
          <>
            {creators.length === 0 && (
              <form onSubmit={apply} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid #2c2c36", borderRadius: 18, padding: 26, marginBottom: 26 }}>
                <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 24, margin: "0 0 6px" }}>Apply to sell</h2>
                <p style={{ color: "#9a9aa8", fontSize: 14, margin: "0 0 20px", lineHeight: 1.6 }}>
                  The roster is invite-only — applications are reviewed by hand. You can sell art, lore, or both.
                </p>
                <div style={{ display: "flex", gap: 9, marginBottom: 14, flexWrap: "wrap" }}>
                  {["artist", "writer"].map((d) => (
                    <button key={d} type="button" onClick={() => setForm({ ...form, discipline: d })} style={{
                      ...navBtn, borderColor: form.discipline === d ? "#d8b24a" : "#3a3a46",
                      color: form.discipline === d ? "#f3cf5b" : "#c8c8d4",
                    }}>{d === "artist" ? "I illustrate" : "I write adventures"}</button>
                  ))}
                </div>
                <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  placeholder="Name buyers will see" style={{ ...inputStyle, marginBottom: 10 }} />
                <input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })}
                  placeholder="One line about your work" style={{ ...inputStyle, marginBottom: 16 }} />
                <PrimaryButton onClick={apply} disabled={busy || !form.displayName.trim()}>Apply</PrimaryButton>
              </form>
            )}

            {creators.map((c) => (
              <div key={c.id} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid #2c2c36", borderRadius: 18, padding: 26, marginBottom: 22 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
                  <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 22, margin: 0 }}>{c.displayName}</h2>
                  <span style={{
                    fontSize: 11, letterSpacing: 1, textTransform: "uppercase", padding: "4px 10px", borderRadius: 999,
                    border: `1px solid ${c.status === "approved" ? "#4ade8055" : "#d8b24a55"}`,
                    color: c.status === "approved" ? "#4ade80" : "#d8b24a",
                  }}>{c.status}</span>
                </div>
                <div style={{ color: "#9a9aa8", fontSize: 14, marginBottom: 4 }}>{DISCIPLINE_LABEL[c.discipline]} · {c.headline || "—"}</div>
                {c.status !== "approved" && (
                  <div style={{ color: "#8a8a98", fontSize: 13, lineHeight: 1.6, marginTop: 10, paddingTop: 12, borderTop: "1px solid #24242e" }}>
                    You can draft listings now. Publishing unlocks once your application is approved.
                  </div>
                )}

                <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid #24242e" }}>
                  <div style={{ fontFamily: DISPLAY_FONT, fontSize: 17, marginBottom: 12 }}>Your listings</div>
                  {listings.filter((l) => l.creatorId === c.id).map((l) => (
                    <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 0", borderBottom: "1px solid #1e1e28" }}>
                      <div>
                        <div style={{ fontSize: 15 }}>{l.title}</div>
                        <div style={{ color: "#6c6c78", fontSize: 12 }}>
                          {KIND_LABEL[l.kind]} · {money(l.priceCents)} · {l.status}
                          {l.kind === "commission" && l.deliveryDays ? ` · ${l.deliveryDays}d` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {l.status !== "published" && <button onClick={() => setStatus(l, "published")} style={navBtn}>Publish</button>}
                        {l.status === "published" && <button onClick={() => setStatus(l, "paused")} style={navBtn}>Pause</button>}
                      </div>
                    </div>
                  ))}

                  <form onSubmit={(e) => createListing(e, c)} style={{ marginTop: 18 }}>
                    <div style={{ display: "flex", gap: 9, marginBottom: 10, flexWrap: "wrap" }}>
                      {["commission", "catalog"].map((k) => (
                        <button key={k} type="button" onClick={() => setLf({ ...lf, kind: k })} style={{
                          ...navBtn, borderColor: lf.kind === k ? "#d8b24a" : "#3a3a46",
                          color: lf.kind === k ? "#f3cf5b" : "#c8c8d4",
                        }}>{KIND_LABEL[k]}</button>
                      ))}
                    </div>
                    <input value={lf.title} onChange={(e) => setLf({ ...lf, title: e.target.value })} placeholder="Listing title" style={{ ...inputStyle, marginBottom: 8 }} />
                    <input value={lf.summary} onChange={(e) => setLf({ ...lf, summary: e.target.value })} placeholder="One line describing it" style={{ ...inputStyle, marginBottom: 8 }} />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <input value={lf.priceCents} onChange={(e) => setLf({ ...lf, priceCents: e.target.value })} inputMode="decimal" placeholder="Price in $ (min 15)" style={{ ...inputStyle, flex: "1 1 150px" }} />
                      {lf.kind === "commission" && (
                        <input value={lf.deliveryDays} onChange={(e) => setLf({ ...lf, deliveryDays: e.target.value })} inputMode="numeric" placeholder="Delivery days (required)" style={{ ...inputStyle, flex: "1 1 130px" }} />
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                      <GhostButton onClick={(e) => createListing(e, c)} disabled={!!listingProblem || busy}>Add listing</GhostButton>
                      {listingProblem && <span style={{ color: "#8a8a98", fontSize: 13 }}>{listingProblem}</span>}
                    </div>
                  </form>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LANDING PAGE
// ---------------------------------------------------------------------------
// Explains the product to someone who has never seen it. The builder itself is
// one click away at all times via the header button, which stays pinned while
// the page scrolls — nobody should have to hunt for the way in.

const HOW_IT_WORKS = [
  { n: "01", t: "Set the scene", d: "Pick the occasion and the world it happens in — 19 occasion presets, 18 worlds from High Fantasy to Noir Detective — or write your own lore from scratch." },
  { n: "02", t: "Cast your crew", d: "Add everyone coming. Names, a photo, and the inside jokes that only your group would get. That detail is what the writing hangs on." },
  { n: "03", t: "Build the deck", d: "Beyond the heroes, add NPCs, artifacts, spells, locations and creatures. Every card starts from a template and stays fully editable." },
  { n: "04", t: "Watch it come alive", d: "The lore gets written for your actual people, and each card is painted as an original illustration. Don't like one? Regenerate just that card." },
  { n: "05", t: "Get the real thing", d: "Order the physical deck, printed and shipped to your door — or keep it digital and share the link." },
];

const FEATURES = [
  { i: "✎", t: "Written for your crew", d: "Not filler text with names swapped in. The quests reference your occasion, your destination, and the jokes you fed it." },
  { i: "◈", t: "Your friends, in character", d: "Upload a face and it comes back reimagined in-world — in costume, in the style of the deck, still recognizably them." },
  { i: "❖", t: "Six card styles", d: "Galactic Saga, Realm of Rings, School of Spells, Grand Voyage, Neon Districts, Smoke & Shadows. Frames, fonts and palette all follow." },
  { i: "⟳", t: "Nothing is locked", d: "Rewrite any card, repaint any portrait, nudge the art direction with a note. Change the card back while you're at it." },
  { i: "↗", t: "Share a link", d: "Send the finished deck to anyone. No account needed to look at it." },
  { i: "⚇", t: "Build it together", d: "Turn on collaboration and your friends add their own cards from their own devices. Their additions merge in without clobbering yours." },
];

function LandingSection({ eyebrow, title, sub, children, style }) {
  return (
    <section style={{ maxWidth: 1040, margin: "0 auto", padding: "0 24px 96px", ...style }}>
      {eyebrow && <div style={{ fontFamily: UI_FONT, fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: "#d8b24a", marginBottom: 12 }}>{eyebrow}</div>}
      <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: "clamp(26px,4vw,40px)", margin: "0 0 12px", color: "#f0f0f6" }}>{title}</h2>
      {sub && <p style={{ color: "#9a9aa8", fontSize: 16, lineHeight: 1.6, margin: "0 0 40px", maxWidth: 620 }}>{sub}</p>}
      {children}
    </section>
  );
}

function Landing({ onOpen, onDemo, savedCount, onDecks, banner, account, onSignIn, onSignOut, onMarket }) {
  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(1200px 700px at 50% -5%, #2a1d3f 0%, #15121d 45%, #08070d 100%)", color: "#e8e8f0", fontFamily: UI_FONT }}>
      <GlobalCSS />
      {banner}

      {/* Pinned header — the way into the app, always reachable. */}
      <header style={{ position: "sticky", top: 0, zIndex: 10, backdropFilter: "blur(10px)", background: "rgba(8,7,13,0.72)", borderBottom: "1px solid rgba(216,178,74,0.14)" }}>
        {/* flexWrap + shrinking wordmark: on a narrow phone the wordmark and
            both buttons don't fit on one line, and the page must never scroll
            sideways — so the buttons drop to a second row instead. */}
        <div style={{ maxWidth: 1040, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontFamily: DISPLAY_FONT, fontSize: "clamp(11px,3vw,14px)", letterSpacing: "clamp(2px,1vw,5px)", textTransform: "uppercase", color: "#d8b24a", whiteSpace: "nowrap", minWidth: 0 }}>✦ Side Quest</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
            {savedCount > 0 && (
              <button onClick={onDecks} style={{ ...navBtn, whiteSpace: "nowrap" }}>◈ My decks ({savedCount})</button>
            )}
            <button onClick={onMarket} style={{ ...navBtn, whiteSpace: "nowrap" }}>✦ Marketplace</button>
            <AccountButton account={account} onSignIn={onSignIn} onSignOut={onSignOut} />
            <PrimaryButton onClick={onOpen} style={{ whiteSpace: "nowrap" }}>Open the app →</PrimaryButton>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div style={{ position: "relative", overflow: "hidden" }}>
        <FloatingCards />
        <div style={{ position: "relative", zIndex: 2, maxWidth: 820, margin: "0 auto", padding: "104px 24px 96px", textAlign: "center" }}>
          <div className="ql-fade" style={{ fontFamily: DISPLAY_FONT, fontSize: 13, letterSpacing: 8, textTransform: "uppercase", color: "#d8b24a", marginBottom: 18 }}>✦ Side Quest ✦</div>
          <h1 className="ql-fade" style={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: "clamp(36px, 7vw, 72px)", lineHeight: 1.05, margin: "0 0 22px", background: "linear-gradient(180deg,#fff,#cda955)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animationDelay: ".1s" }}>
            Every event<br />deserves a deck.
          </h1>
          <p className="ql-fade" style={{ color: "#b8b8c8", fontSize: "clamp(16px,2.4vw,20px)", maxWidth: 580, margin: "0 auto 34px", lineHeight: 1.6, animationDelay: ".2s" }}>
            Side Quest turns any bachelor party, trip, or night out into a playable card game — starring your actual crew. It writes the lore, paints the portraits, and ships you the real, physical deck.
          </p>
          <div className="ql-fade" style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", animationDelay: ".3s" }}>
            <PrimaryButton onClick={onOpen} style={{ fontSize: 17, padding: "16px 38px" }}>Build your deck →</PrimaryButton>
            <GhostButton onClick={onDemo} style={{ padding: "16px 26px" }}>See a sample deck</GhostButton>
          </div>
          <div className="ql-fade" style={{ marginTop: 52, display: "flex", gap: 30, justifyContent: "center", flexWrap: "wrap", color: "#7a7a88", fontSize: 13, animationDelay: ".4s" }}>
            {["Born at a real bachelor party", "Written for your group", "Original card art", "Shipped to your door"].map((x) => (
              <span key={x} style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ color: "#d8b24a" }}>◆</span>{x}</span>
            ))}
          </div>
        </div>
      </div>

      {/* What it actually is */}
      <LandingSection eyebrow="The idea" title="A card game where the heroes are your friends"
        sub="You know the group. Side Quest knows how to turn them into a deck. Describe the occasion, add the people, and you get a full set of cards — each one a character, artifact, or quest written specifically for the trip you're actually taking.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 18 }}>
          {FEATURES.map((f) => (
            <div key={f.t} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid #2c2c36", borderRadius: 16, padding: "22px 22px 20px" }}>
              <div style={{ color: "#d8b24a", fontSize: 20, marginBottom: 10 }}>{f.i}</div>
              <div style={{ fontFamily: DISPLAY_FONT, fontSize: 18, marginBottom: 8, color: "#f0f0f6" }}>{f.t}</div>
              <div style={{ color: "#9a9aa8", fontSize: 14, lineHeight: 1.6 }}>{f.d}</div>
            </div>
          ))}
        </div>
      </LandingSection>

      {/* How it works */}
      <LandingSection eyebrow="How it works" title="Five steps, about ten minutes"
        sub="No rules to learn and nothing to install. You answer a few questions and the deck assembles itself — then you edit anything you want changed.">
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {HOW_IT_WORKS.map((s) => (
            <div key={s.n} style={{ display: "flex", gap: 22, alignItems: "flex-start", padding: "22px 0", borderTop: "1px solid #24242e" }}>
              <div style={{ fontFamily: DISPLAY_FONT, fontSize: 22, color: "#d8b24a", minWidth: 44, opacity: 0.85 }}>{s.n}</div>
              <div>
                <div style={{ fontFamily: DISPLAY_FONT, fontSize: 20, marginBottom: 6, color: "#f0f0f6" }}>{s.t}</div>
                <div style={{ color: "#9a9aa8", fontSize: 15, lineHeight: 1.65, maxWidth: 620 }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>
      </LandingSection>

      {/* Worlds */}
      <LandingSection eyebrow="Pick a world" title="Eighteen settings, or invent your own"
        sub="Each one comes with its own tone, vocabulary and quest logic — so a pirate deck reads nothing like a noir deck. Or ignore all of them and write the lore yourself.">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
          {SETTING_LORES.map((s) => (
            <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 999, border: "1px solid #33333e", background: "rgba(255,255,255,0.03)", color: "#cfcfda", fontSize: 14 }}>
              <span>{s.icon}</span>{s.name}
            </span>
          ))}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 999, border: "1px dashed #d8b24a66", color: "#d8b24a", fontSize: 14 }}>✎ Forge your own lore</span>
        </div>
      </LandingSection>

      {/* Price + close */}
      <LandingSection title="Take it to the table" style={{ paddingBottom: 40 }}
        sub="Building and sharing a deck is free. When you want it in your hands, we print it and ship it.">
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "stretch" }}>
          <div style={{ flex: "1 1 260px", background: "rgba(255,255,255,0.025)", border: "1px solid #2c2c36", borderRadius: 16, padding: 26 }}>
            <div style={{ fontFamily: DISPLAY_FONT, fontSize: 20, marginBottom: 8 }}>Build it</div>
            <div style={{ fontFamily: DISPLAY_FONT, fontSize: 32, color: "#f3cf5b", marginBottom: 12 }}>Free</div>
            <div style={{ color: "#9a9aa8", fontSize: 14, lineHeight: 1.6 }}>Make the deck, share the link, collaborate with the group. Keep it entirely digital if you like.</div>
          </div>
          <div style={{ flex: "1 1 260px", background: "rgba(216,178,74,0.06)", border: "1px solid #d8b24a55", borderRadius: 16, padding: 26 }}>
            <div style={{ fontFamily: DISPLAY_FONT, fontSize: 20, marginBottom: 8 }}>Print it</div>
            <div style={{ fontFamily: DISPLAY_FONT, fontSize: 32, color: "#f3cf5b", marginBottom: 12 }}>$39<span style={{ fontSize: 15, color: "#a8a8b8" }}> + shipping</span></div>
            <div style={{ color: "#9a9aa8", fontSize: 14, lineHeight: 1.6 }}>A real, physical deck of your cards, printed and delivered.</div>
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: 56 }}>
          <PrimaryButton onClick={onOpen} style={{ fontSize: 17, padding: "16px 40px" }}>Open the app →</PrimaryButton>
          <div style={{ marginTop: 14 }}>
            <button onClick={onDemo} style={{ background: "none", border: "none", cursor: "pointer", color: "#6c6c7c", fontFamily: UI_FONT, fontSize: 13, textDecoration: "underline", textUnderlineOffset: 3 }}>
              or look at a sample deck first
            </button>
          </div>
        </div>
      </LandingSection>

      <footer style={{ borderTop: "1px solid #1e1e28", padding: "26px 24px 40px", textAlign: "center", color: "#5a5a68", fontSize: 13 }}>
        <span style={{ fontFamily: DISPLAY_FONT, letterSpacing: 4, textTransform: "uppercase", color: "#8a7a45" }}>✦ Side Quest</span>
        <div style={{ marginTop: 8 }}>Every event deserves a deck.</div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SMALL COMPONENTS
// ---------------------------------------------------------------------------

const inputStyle ={ width: "100%", boxSizing: "border-box", padding: "13px 15px", borderRadius: 10, border: "1px solid #3a3a46", background: "rgba(255,255,255,0.03)", color: "#f0f0f6", fontFamily: UI_FONT, fontSize: 15, marginBottom: 4 };

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
