/**
 * KnowledgeGatherer — table-driven woodcutting, mining, fishing, and crafting
 * from the VPS BotKnowledge pack. Picks the best method your level unlocks,
 * walks there, gathers, banks. Buys tools at Bob / Gerrant / Harry. Optional
 * Nurmof pickaxe upgrade via the Ice Mountain trapdoor. Port Sarim boats to
 * Musa Point (60gp round trip) for Karamja gold and cage/harpoon. Fishing 68
 * opens the Fishing Guild door for lobster, swordfish, and sharks.
 * Crafting 1-9 shears Lumbridge sheep and spins balls of wool (drop, no bank).
 * Crafting 10+ picks Gnome Stronghold flax and spins bowstrings at Grand Tree.
 * Skips the Mining Guild, coal trucks, and wilderness runite. Busy camps
 * roll a sister spot at the same level.
 * Completely vibe coded by @.benzyme on Discord via Cursor AI
 * Self-contained ESM for rs2b0t Load local script / Load URL.
 *
 * Load URL: https://benzymee.github.io/RS2B2TScripts/KnowledgeGatherer.js
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
    throw new Error('KnowledgeGatherer: globalThis.__rs2b0t missing — load inside rs2b0t bot.html');
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
    throw new Error(`KnowledgeGatherer: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`);
}

const {
    defineBot,
    Execution,
    Game,
    LoopingBot,
    Locs,
    Npcs,
    Players,
    Inventory,
    Equipment,
    Bank,
    Banking,
    Shop,
    Traversal,
    Tile,
    Skills,
    ChatDialog,
    AXES,
    bestAxe,
    canWieldTool
} = abi;

const SCRIPT_NAME = 'KnowledgeGatherer';
const SCRIPT_VERSION = '1.4.1';
const WELCOME_SCREEN_ID = 5993;

const SKILL_WC = 'woodcutting';
const SKILL_MINE = 'mining';
const SKILL_FISH = 'fishing';
const SKILL_CRAFT = 'crafting';
const SKILL_KEYS = [SKILL_WC, SKILL_MINE, SKILL_FISH, SKILL_CRAFT];
const CRAFT_FLAX_LEVEL = 10;
const CRAFT_SPIN_IDLE_TICKS = 16;
const SHEARS_NAME = 'Shears';
const SHEARS_COST = 1;
const BUSY_PLAYERS = 4;
const CONSUMABLE_STACK = 400;
const STEEL_AXE_COST = 200;
const ALKHARID_GATE_GP = 10;
const KARAMJA_FARE = 30;
const KARAMJA_ROUNDTRIP = KARAMJA_FARE * 2;
const GUILD_LEVEL = 68;


const TITLE_YELLOW = '#ffe44a';
const ROBOT_PNG = 'data:image/png;base64,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';
const robotIcon = typeof Image !== 'undefined' ? new Image() : null;
if (robotIcon) {
    robotIcon.src = ROBOT_PNG;
}

/** @type {object | null} */
let activeBot = null;

function t(x, z, level = 0) {
    return new Tile(x, z, level);
}

/* ── BotKnowledge pack (client-walkable slice) ── */

const AXE_NAMES = [
    'Bronze axe',
    'Iron axe',
    'Steel axe',
    'Black axe',
    'Mithril axe',
    'Adamant axe',
    'Rune axe'
];

const PICKAXES = [
    { name: 'Dragon pickaxe', aliases: ['Dragon pickaxe'], mining: 61, attack: 60, shop: null },
    { name: 'Rune pickaxe', aliases: ['Rune pickaxe', 'Runite pickaxe'], mining: 41, attack: 40, shop: 'nurmof', price: 32_000 },
    { name: 'Adamant pickaxe', aliases: ['Adamant pickaxe', 'Adamantite pickaxe'], mining: 31, attack: 30, shop: 'nurmof', price: 3_200 },
    { name: 'Mithril pickaxe', aliases: ['Mithril pickaxe'], mining: 21, attack: 20, shop: 'nurmof', price: 1_300 },
    { name: 'Black pickaxe', aliases: ['Black pickaxe'], mining: 11, attack: 10, shop: null },
    { name: 'Steel pickaxe', aliases: ['Steel pickaxe'], mining: 6, attack: 5, shop: 'nurmof', price: 500 },
    { name: 'Iron pickaxe', aliases: ['Iron pickaxe'], mining: 1, attack: 1, shop: 'nurmof', price: 140 },
    { name: 'Bronze pickaxe', aliases: ['Bronze pickaxe'], mining: 1, attack: 1, shop: 'bob', price: 1 }
];

const SHOPS = {
    bob: { keeper: 'Bob', stand: t(3231, 3203), label: "Bob's Axes" },
    gerrant: { keeper: 'Gerrant', stand: t(3014, 3224), label: "Gerrant's Fishing" },
    harry: { keeper: 'Harry', stand: t(2833, 3443), label: "Harry's Fishing" },
    lumbridge: { keeper: 'Shop keeper', stand: t(3212, 3247), label: 'Lumbridge General' }
};

const FALADOR_EAST_BANK = t(3013, 3355);
const FALADOR_NORTH = t(2963, 3382);
const ICE_MOUNTAIN_APPROACH = t(3005, 3435);
const TRAPDOOR_SURFACE = t(3019, 3450);
const TRAPDOOR_BESIDE = t(3019, 3449);
const TRAPDOOR_UNDER = t(3019, 9850);
const NURMOF_STAND = t(2998, 9844, 1);
const NURMOF_NAME = 'Nurmof';
const GENERAL_STORE_DWARF_ID = 582;
const SAFE_TO_NURMOF = [t(3019, 9844, 1), t(3019, 9826, 1), t(3001, 9812, 1), t(2999, 9824, 1), NURMOF_STAND];
const SAFE_TO_TRAPDOOR = [t(2999, 9824, 1), t(3001, 9812, 1), t(3019, 9826, 1), t(3019, 9844, 1), TRAPDOOR_UNDER];
const SURFACE_TO_TRAPDOOR = [FALADOR_NORTH, ICE_MOUNTAIN_APPROACH, TRAPDOOR_BESIDE];
const SURFACE_TO_FALADOR_BANK = [ICE_MOUNTAIN_APPROACH, FALADOR_NORTH, FALADOR_EAST_BANK];

const WEST_BEACH = t(2838, 3431);
const CATHERBY_ANCHOR = t(2845, 3431);
const EAST_PENINSULA_MIN_X = 2849;
const SPOT_MAX_X = 2860;

const PORT_SARIM_DOCK = t(3029, 3217);
const MUSA_DOCK = t(2956, 3146);
const SARIM_SAILORS = ['Captain Tobias', 'Seaman Lorris', 'Seaman Thresnor'];
const KARAMJA_SAILORS = ['Customs officer', 'Customs Officer', 'Captain Tobias', 'Seaman Lorris'];
const KARAMJA_DIALOG_PREFER = ['musa point', 'karamja', 'yes please', 'yes'];
const SARIM_RETURN_DIALOG = [
    'port sarim',
    'sarim',
    'search away',
    'nothing to hide',
    'yes please',
    'yes'
];
const DIALOG_AVOID = [
    'no, thank',
    'no thank',
    "i'm good",
    'nowhere',
    'rimmington',
    'pandemonium',
    'actually, i don',
    'pay you nothing',
    'not bother',
    'unusual customs',
    'personal use',
    "you're not putting",
    'why?'
];

const GUILD_GATE_OUT = t(2611, 3392);
const GUILD_GATE_IN = t(2611, 3396);
const GUILD_DOOR_TILE = t(2611, 3394);
const GUILD_ANCHOR = t(2605, 3420);

const SHEEP_PEN = t(3200, 3266);
const LUMBRIDGE_CASTLE = t(3215, 3218);
const LUMBRIDGE_STAIRS = t(3206, 3207);
const LUMBRIDGE_WHEEL = t(3209, 3213, 1);
const GT_LADDER = t(2466, 3496);
const GT_TREE_FRONT = t(2465, 3488);
const GT_LADDER_UP_ID = 1747;
const GT_LADDER_DOWN_ID = 1748;
const GT_BANK_BOOTH = t(2441, 3488, 1);
const GT_COOK_BANK = t(2442, 3488, 1);
const GNOME_FLAX_STAND = t(2423, 3400);
const GNOME_FLAX_LEASH = 16;
const GNOME_SPIN_HOUSE = t(2474, 3400);
const GNOME_SPIN_WHEEL = t(2474, 3400, 1);
const GNOME_ENTRANCE = t(2461, 3381);
const GNOME_SOUTH_OUTSIDE = t(2461, 3378);
const GNOME_WALK_MS = 180_000;

const STEP_WOOL = {
    skill: SKILL_CRAFT,
    minLevel: 1,
    maxLevel: 9,
    label: 'Lumbridge wool',
    stand: SHEEP_PEN,
    productNames: ['Ball of wool', 'Wool']
};
const STEP_FLAX = {
    skill: SKILL_CRAFT,
    minLevel: 10,
    maxLevel: 99,
    label: 'Gnome flax',
    stand: GNOME_FLAX_STAND,
    productNames: ['Bow string', 'Bowstring', 'Flax']
};

const STEPS = [
    /* Woodcutting — coords from BotKnowledge, camps proven in the fletcher scripts */
    wc(1, 14, 'Lumbridge trees', t(3194, 3226), 'Tree', 'Logs', 18),
    wc(1, 14, 'Falador trees', t(2953, 3407), 'Tree', 'Logs', 15),
    wc(15, 29, 'Varrock oaks', t(3166, 3416), 'Oak', 'Oak logs', 20),
    wc(30, 59, 'Draynor willows', t(3087, 3235), 'Willow', 'Willow logs', 20, { combatMin: 16 }),
    wc(30, 59, 'Barbarian willows', t(3048, 3422), 'Willow', 'Willow logs', 18, { via: t(3045, 3340) }),
    wc(30, 59, 'Seers willows', t(2710, 3504), 'Willow', 'Willow logs', 18),
    wc(45, 59, 'Seers maples', t(2726, 3500), 'Maple', 'Maple logs', 20),
    wc(60, 99, 'Falador yews', t(2987, 3340), 'Yew', 'Yew logs', 18),
    wc(60, 99, 'Edgeville yews', t(3087, 3476), 'Yew', 'Yew logs', 16),
    wc(60, 99, 'Seers yews', t(2713, 3481), 'Yew', 'Yew logs', 18),
    wc(60, 99, 'Catherby yews', t(2763, 3430), 'Yew', 'Yew logs', 20),
    wc(75, 99, 'Seers magics', t(2696, 3424), 'Magic tree', 'Magic logs', 18),

    /* Mining — open camps only. Barb coal banks at Edgeville, not Draynor. */
    mine(1, 14, 'Varrock west copper', t(3177, 3368), ['copper'], ['Copper ore'], 18, { genericRock: true }),
    mine(1, 14, 'Varrock west tin', t(3177, 3368), ['tin'], ['Tin ore'], 18, { genericRock: true }),
    mine(1, 14, 'Varrock east copper', t(3285, 3366), ['copper'], ['Copper ore'], 18, {
        genericRock: true,
        via: t(3302, 3342)
    }),
    mine(15, 29, 'Varrock west iron', t(3181, 3374), ['iron'], ['Iron ore'], 18),
    mine(15, 29, 'Varrock east iron', t(3285, 3366), ['iron'], ['Iron ore'], 18, { via: t(3302, 3342) }),
    mine(30, 54, 'Barbarian coal', t(3082, 3421), ['coal'], ['Coal'], 16, { via: t(3045, 3340) }),
    mine(40, 54, 'Karamja gold', t(2733, 3223), ['gold'], ['Gold ore'], 18, { karamja: true, priority: 1 }),
    mine(55, 69, 'Al Kharid mithril', t(3302, 3300), ['mithril'], ['Mithril ore'], 16, { gateGp: ALKHARID_GATE_GP }),
    mine(70, 99, 'Al Kharid adamant', t(3300, 3310), ['adamant', 'adamantite'], ['Adamantite ore'], 16, {
        gateGp: ALKHARID_GATE_GP
    }),

    /* Fishing: Draynor net, Barb fly, Catherby or Karamja cage/harpoon, then Fishing Guild at 68. */
    fish(1, 19, 'Draynor shrimp', t(3088, 3228), 'net-bait', 'Net', ['Small fishing net'], ['Raw shrimps', 'Raw shrimp', 'Raw anchovies'], {
        shop: 'gerrant'
    }),
    fish(20, 39, 'Barbarian fly', t(3105, 3432), 'lure-bait', 'Lure', ['Fly fishing rod'], ['Raw trout', 'Raw salmon'], {
        shop: 'gerrant',
        consumable: 'Feather',
        via: t(3045, 3340)
    }),
    fish(40, 49, 'Catherby lobster', CATHERBY_ANCHOR, 'cage-harpoon', 'Cage', ['Lobster pot'], ['Raw lobster'], {
        shop: 'harry',
        peninsula: true,
        leash: 35
    }),
    fish(40, 49, 'Karamja lobster', t(2924, 3173), 'cage-harpoon', 'Cage', ['Lobster pot'], ['Raw lobster'], {
        shop: 'gerrant',
        karamja: true
    }),
    fish(50, 99, 'Catherby swordfish', CATHERBY_ANCHOR, 'cage-harpoon', 'Harpoon', ['Harpoon'], ['Raw swordfish', 'Raw tuna'], {
        shop: 'harry',
        peninsula: true,
        leash: 35
    }),
    fish(50, 67, 'Karamja swordfish', t(2924, 3173), 'cage-harpoon', 'Harpoon', ['Harpoon'], ['Raw swordfish', 'Raw tuna'], {
        shop: 'gerrant',
        karamja: true
    }),
    fish(68, 75, 'Guild lobster', GUILD_ANCHOR, 'cage-harpoon', 'Cage', ['Lobster pot'], ['Raw lobster'], {
        shop: 'harry',
        guild: true,
        leash: 22
    }),
    fish(68, 99, 'Guild swordfish', GUILD_ANCHOR, 'cage-harpoon', 'Harpoon', ['Harpoon'], ['Raw swordfish', 'Raw tuna'], {
        shop: 'harry',
        guild: true,
        leash: 22,
        priority: 1
    }),
    fish(76, 99, 'Guild sharks', GUILD_ANCHOR, 'net-harpoon', 'Harpoon', ['Harpoon'], ['Raw shark', 'Raw sharks'], {
        shop: 'harry',
        guild: true,
        leash: 22,
        priority: 2
    })
];

function wc(minLevel, maxLevel, label, stand, locName, product, leash, extra = {}) {
    return {
        skill: SKILL_WC,
        minLevel,
        maxLevel,
        label,
        action: 'woodcut',
        stand,
        locNames: [locName],
        productNames: [product],
        leash: leash ?? 18,
        tools: 'axe',
        ...extra
    };
}

function mine(minLevel, maxLevel, label, stand, rockNames, productNames, leash, extra = {}) {
    return {
        skill: SKILL_MINE,
        minLevel,
        maxLevel,
        label,
        action: 'mine',
        stand,
        rockNames,
        productNames,
        leash: leash ?? 18,
        tools: 'pick',
        ...extra
    };
}

function fish(minLevel, maxLevel, label, stand, spotKind, fishOp, toolNames, productNames, extra = {}) {
    return {
        skill: SKILL_FISH,
        minLevel,
        maxLevel,
        label,
        action: 'fish',
        stand,
        spotKind,
        fishOp,
        toolNames,
        productNames,
        leash: extra.leash ?? 16,
        tools: 'fish',
        shop: extra.shop ?? 'gerrant',
        ...extra
    };
}

/* ── Host / welcome ── */

function welcomeHost() {
    return globalThis.rs2b0t ?? null;
}

function stopScript(reason) {
    if (reason) {
        try {
            activeBot?.log?.(reason);
        } catch {
            /* ignore */
        }
    }
    const host = welcomeHost();
    if (typeof host?.stopScript === 'function') {
        host.stopScript();
        return;
    }
    if (typeof host?.runner?.stop === 'function') {
        host.runner.stop();
    }
}

function isWelcomeModalOpen() {
    const host = welcomeHost();
    if (!host?.reader) {
        return false;
    }
    const { reader } = host;
    const main = typeof reader.modals === 'function' ? reader.modals().main : -1;
    if (main === -1) {
        return false;
    }
    if (main === WELCOME_SCREEN_ID) {
        return true;
    }
    if (typeof reader.mainModalTexts !== 'function') {
        return false;
    }
    const texts = reader.mainModalTexts();
    return texts.some(
        txt =>
            /welcome to runescape/i.test(txt) ||
            /unread messages?/i.test(txt) ||
            /jagex staff will never email/i.test(txt)
    );
}

async function dismissWelcomeScreen() {
    if (!isWelcomeModalOpen()) {
        return false;
    }
    const host = welcomeHost();
    if (!host?.reader || !host?.actions) {
        return false;
    }
    const { reader, actions } = host;
    for (let attempt = 0; attempt < 8 && isWelcomeModalOpen(); attempt++) {
        const main = reader.modals().main;
        if (main === -1) {
            break;
        }
        let clicked = typeof actions.closeModal === 'function' && actions.closeModal();
        if (!clicked && typeof reader.closeButtonComId === 'function' && typeof actions.ifButton === 'function') {
            const closeId = reader.closeButtonComId(main);
            if (closeId !== -1) {
                clicked = !!actions.ifButton(closeId);
            }
        }
        if (!clicked && typeof reader.buttonByText === 'function' && typeof actions.ifButton === 'function') {
            for (const label of ['Close Window', 'Close']) {
                const btn = reader.buttonByText(main, label);
                if (btn !== -1 && actions.ifButton(btn)) {
                    clicked = true;
                    break;
                }
            }
        }
        if (!clicked && typeof actions.closeMainModal === 'function') {
            actions.closeMainModal(main);
        }
        await Execution.delay(250);
    }
    return !isWelcomeModalOpen();
}

async function clickContinues() {
    for (let i = 0; i < 6 && ChatDialog.canContinue(); i++) {
        await ChatDialog.continue();
        await Execution.delayTicks(1);
    }
}

/* ── Prefs / paint ── */

/* ── Small helpers ── */

function normName(s) {
    return String(s ?? '')
        .toLowerCase()
        .replace(/-/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function nameEq(a, b) {
    return normName(a) === normName(b);
}

function nameIn(name, list) {
    const n = normName(name);
    return (list ?? []).some(x => n === normName(x) || n.includes(normName(x)));
}

function fmtXph(n) {
    if (n >= 100_000) {
        return `${(n / 1000).toFixed(0)}k`;
    }
    if (n >= 10_000) {
        return `${(n / 1000).toFixed(1)}k`;
    }
    return String(Math.round(n));
}

function fmtElapsed(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
}

function tileCheb(a, b) {
    if (!a || !b) {
        return 999;
    }
    const p = Tile.from(a);
    const q = Tile.from(b);
    return Math.max(Math.abs(p.x - q.x), Math.abs((p.z ?? 0) - (q.z ?? 0)));
}

function isUnderground(tile = Game.tile()) {
    if (!tile) {
        return false;
    }
    return Tile.from(tile).z >= 6400;
}

function combatLevel() {
    const a = Skills.level('attack');
    const str = Skills.level('strength');
    const d = Skills.level('defence');
    const h = Skills.level('hitpoints');
    const p = Skills.level('prayer');
    const r = Skills.level('ranged');
    const m = Skills.level('magic');
    const base = 0.25 * (d + h + Math.floor(p / 2));
    const melee = 0.325 * (a + str);
    const range = 0.325 * Math.floor(r * 1.5);
    const mage = 0.325 * Math.floor(m * 1.5);
    return Math.floor(base + Math.max(melee, range, mage));
}

function locActions(loc) {
    if (!loc) {
        return [];
    }
    try {
        const acts = typeof loc.actions === 'function' ? loc.actions() : loc.actions;
        return Array.isArray(acts) ? acts : [];
    } catch {
        return [];
    }
}

function npcActions(npc) {
    if (!npc) {
        return [];
    }
    try {
        const acts = typeof npc.actions === 'function' ? npc.actions() : npc.actions;
        return Array.isArray(acts) ? acts : [];
    } catch {
        return [];
    }
}

function locName(loc) {
    if (!loc) {
        return '';
    }
    try {
        return typeof loc.name === 'function' ? loc.name() ?? '' : loc.name ?? '';
    } catch {
        return '';
    }
}

function locTile(loc) {
    if (!loc) {
        return null;
    }
    try {
        const tile = typeof loc.tile === 'function' ? loc.tile() : loc.tile;
        return tile ? Tile.from(tile) : null;
    } catch {
        return null;
    }
}

function chopOp(actions) {
    return (actions ?? []).find(a => /chop/i.test(String(a))) ?? null;
}

function mineOp(actions) {
    return (actions ?? []).find(a => /^mine/i.test(String(a))) ?? null;
}

function findAction(actions, re) {
    return (actions ?? []).find(a => re.test(String(a))) ?? null;
}

function isShutDoor(loc) {
    const n = locName(loc).toLowerCase();
    if (!n.includes('door') && !n.includes('gate')) {
        return false;
    }
    return locActions(loc).some(a => /^open/i.test(String(a)));
}

function itemCount(pred) {
    return Inventory.items()
        .filter(i => pred(i.name))
        .reduce((n, i) => n + Math.max(1, i.count), 0);
}

function invHas(name) {
    return Inventory.items().some(i => nameEq(i.name, name)) || Equipment.contains?.(name);
}

function coinCount() {
    return Inventory.items()
        .filter(i => nameEq(i.name, 'Coins'))
        .reduce((n, i) => n + Math.max(0, i.count), 0);
}

function bankCoins() {
    if (!Bank.isOpen() || typeof Bank.count !== 'function') {
        return 0;
    }
    return Bank.count('Coins') || 0;
}

function productCount(step) {
    return itemCount(name => nameIn(name, step.productNames));
}

function isKeepName(name, step) {
    const n = normName(name);
    if (n === 'coins' || n === 'broken axe') {
        return true;
    }
    if (AXE_NAMES.some(a => n === normName(a))) {
        return true;
    }
    if (PICKAXES.some(p => p.aliases.some(a => n === normName(a)))) {
        return true;
    }
    if (step?.toolNames?.some(tn => n === normName(tn))) {
        return true;
    }
    if (step?.consumable && n === normName(step.consumable)) {
        return true;
    }
    if (n === 'small fishing net' || n === 'fishing rod' || n === 'fly fishing rod' || n === 'harpoon' || n === 'lobster pot') {
        return true;
    }
    if (n === 'fishing bait' || n === 'feather') {
        return true;
    }
    if (isShearsName(name)) {
        return true;
    }
    return false;
}

function playersNear(tile, radius) {
    if (!tile || typeof Players?.query !== 'function') {
        return 0;
    }
    const dest = Tile.from(tile);
    try {
        const q = Players.query().where(p => {
            const pt = p.tile?.() ?? null;
            return pt != null && Tile.from(pt).distanceTo(dest) <= radius;
        });
        if (typeof q.count === 'function') {
            return Math.max(0, q.count() - 1);
        }
        const list = typeof q.results === 'function' ? q.results() : [];
        return Math.max(0, list.length - 1);
    } catch {
        return 0;
    }
}

function axeRank(name) {
    const want = normName(name);
    if (Array.isArray(AXES)) {
        const i = AXES.findIndex(a => normName(a.name) === want);
        if (i >= 0) {
            return i;
        }
    }
    const i = AXE_NAMES.findIndex(a => normName(a) === want);
    return i < 0 ? 999 : i;
}

function axeCount(name) {
    return (Inventory.count?.(name) || 0) + (Equipment.contains?.(name) ? 1 : 0);
}

function bestHeldAxe() {
    if (typeof bestAxe === 'function' && Array.isArray(AXES)) {
        return bestAxe(Skills.level('woodcutting'), n => axeCount(n) > 0);
    }
    let best = null;
    let rank = 999;
    for (const name of AXE_NAMES) {
        if (axeCount(name) <= 0) {
            continue;
        }
        const r = axeRank(name);
        if (r < rank) {
            rank = r;
            best = name;
        }
    }
    return best;
}

function hasSteelAxeOrBetter() {
    const steel = axeRank('Steel axe');
    for (const name of AXE_NAMES) {
        if (axeRank(name) > steel) {
            continue;
        }
        if (axeCount(name) > 0) {
            return true;
        }
        if (Bank.isOpen() && (Bank.count(name) || 0) > 0) {
            return true;
        }
    }
    return false;
}

function pickCount(def) {
    return def.aliases.reduce((n, a) => n + axeCount(a), 0);
}

function bestHeldPick() {
    const mining = Skills.level('mining');
    for (const def of PICKAXES) {
        if (mining < def.mining) {
            continue;
        }
        if (pickCount(def) > 0) {
            return def;
        }
        if (Bank.isOpen() && def.aliases.some(a => (Bank.count(a) || 0) > 0)) {
            return def;
        }
    }
    return null;
}

function bestBuyablePick(gp) {
    const mining = Skills.level('mining');
    for (const def of PICKAXES) {
        if (!def.shop || mining < def.mining || gp < def.price) {
            continue;
        }
        return def;
    }
    return null;
}

function heldFishTool(step) {
    return (step.toolNames ?? []).find(n => invHas(n)) ?? null;
}

function inBox(tile, x0, z0, x1, z1) {
    if (!tile) {
        return false;
    }
    const p = Tile.from(tile);
    return (
        p.x >= Math.min(x0, x1) &&
        p.x <= Math.max(x0, x1) &&
        (p.z ?? 0) >= Math.min(z0, z1) &&
        (p.z ?? 0) <= Math.max(z0, z1)
    );
}

function onKaramja(tile = Game.tile()) {
    if (!tile) {
        return false;
    }
    if (inBox(tile, 2752, 3120, 2976, 3198)) {
        return true;
    }
    return inBox(tile, 2688, 3136, 2860, 3268);
}

function onMusaPoint(tile = Game.tile()) {
    return inBox(tile, 2888, 3135, 2972, 3205);
}

function insideGuild(tile = Game.tile()) {
    if (!tile || (tile.level ?? 0) !== 0) {
        return false;
    }
    return tile.x >= 2580 && tile.x <= 2616 && tile.z >= 3394 && tile.z <= 3428;
}

function playerFloor(tile = Game.tile()) {
    return tile ? (tile.level ?? 0) : 0;
}

function locIdOf(loc) {
    if (!loc) {
        return null;
    }
    try {
        const raw = typeof loc.id === 'function' ? loc.id() : loc.id;
        if (raw == null || raw === '') {
            return null;
        }
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
}

function npcName(npc) {
    if (!npc) {
        return '';
    }
    try {
        return typeof npc.name === 'function' ? npc.name() ?? '' : npc.name ?? '';
    } catch {
        return '';
    }
}

function inGnomeStronghold(tile = Game.tile()) {
    return inBox(tile, 2370, 3380, 2505, 3520);
}

function inGnomeStrongholdInterior(tile = Game.tile()) {
    if (!inGnomeStronghold(tile)) {
        return false;
    }
    return (tile.z ?? 0) >= 3386;
}

function inGrandTreeTrunk(tile = Game.tile()) {
    return inBox(tile, 2461, 3492, 2471, 3502);
}

function nearGrandTreeBank(tile = Game.tile()) {
    if (!tile || playerFloor(tile) < 1) {
        return false;
    }
    return tileCheb(tile, GT_COOK_BANK) <= 18;
}

function onGrandTreeCookFloor(tile = Game.tile()) {
    return nearGrandTreeBank(tile);
}

function needsGrandTreeExit(tile = Game.tile()) {
    if (!tile) {
        return false;
    }
    const f = playerFloor(tile);
    if (f >= 1 && (nearGrandTreeBank(tile) || inGrandTreeTrunk(tile))) {
        return true;
    }
    return f === 0 && inGrandTreeTrunk(tile);
}

function packFreeSlots() {
    if (typeof Inventory.free === 'function') {
        return Inventory.free();
    }
    if (typeof Inventory.used === 'function') {
        return Math.max(0, 28 - Inventory.used());
    }
    return 0;
}

function isFlaxName(name) {
    return normName(name) === 'flax';
}

function isBowstringName(name) {
    const n = normName(name);
    return n === 'bow string' || n === 'bowstring';
}

function isWoolName(name) {
    return normName(name) === 'wool';
}

function isBallWoolName(name) {
    return normName(name) === 'ball of wool';
}

function isShearsName(name) {
    return normName(name) === 'shears';
}

function invNamedCount(pred) {
    return Inventory.items()
        .filter(i => pred(i.name))
        .reduce((n, i) => n + Math.max(1, i.count ?? 1), 0);
}

function invFlaxCount() {
    return invNamedCount(isFlaxName);
}

function invBowstringCount() {
    return invNamedCount(isBowstringName);
}

function invWoolCount() {
    return invNamedCount(isWoolName);
}

function invBallWoolCount() {
    return invNamedCount(isBallWoolName);
}

function lastInvMatching(pred) {
    const items = Inventory.items();
    for (let i = items.length - 1; i >= 0; i--) {
        if (pred(items[i].name)) {
            return items[i];
        }
    }
    return null;
}

function pickOp(actions) {
    return (actions ?? []).find(a => /^pick/i.test(String(a))) ?? null;
}

function spinWheelOp(actions) {
    return (
        (actions ?? []).find(a => /^spin/i.test(String(a))) ??
        (actions ?? []).find(a => /^use/i.test(String(a))) ??
        null
    );
}

function matchSpinProduct(products, want) {
    if (!products || products.length === 0) {
        return null;
    }
    const target = String(want).trim().toLowerCase();
    const exact = products.find(p => String(p ?? '').trim().toLowerCase() === target);
    if (exact) {
        return exact;
    }
    const re = new RegExp(`\\b${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return products.find(p => re.test(String(p ?? ''))) ?? null;
}

function climbDirOp(loc, dir) {
    const acts = locActions(loc);
    if (dir === 'up') {
        return (
            findAction(acts, /^climb-up/i) ??
            findAction(acts, /^climb up/i) ??
            findAction(acts, /climb.*up/i) ??
            findAction(acts, /^climb$/i) ??
            null
        );
    }
    return (
        findAction(acts, /^climb-down/i) ??
        findAction(acts, /^climb down/i) ??
        findAction(acts, /climb.*down/i) ??
        findAction(acts, /^enter$/i) ??
        findAction(acts, /^climb$/i) ??
        null
    );
}

function findClimbLadder(dir, nearTile = null) {
    const focus = nearTile ? Tile.from(nearTile) : Game.tile();
    const wantId = dir === 'up' ? GT_LADDER_UP_ID : GT_LADDER_DOWN_ID;
    const nearEnough = loc => {
        if (!focus) {
            return true;
        }
        const tile = locTile(loc);
        return tile != null && tileCheb(tile, focus) <= 10;
    };
    try {
        const byId = Locs.query()
            .where(l => locIdOf(l) === wantId)
            .where(nearEnough)
            .nearest();
        if (byId && climbDirOp(byId, dir)) {
            return byId;
        }
    } catch {
        /* loc id query can throw */
    }
    try {
        return (
            Locs.query()
                .name('Ladder')
                .where(l => climbDirOp(l, dir) && nearEnough(l))
                .nearest() ??
            Locs.query()
                .where(l => {
                    const n = normName(locName(l));
                    return n === 'ladder' || n === 'staircase' || n === 'stairs';
                })
                .where(l => climbDirOp(l, dir) && nearEnough(l))
                .nearest() ??
            null
        );
    } catch {
        return null;
    }
}

function grandTree1FBankOp(loc) {
    const acts = locActions(loc);
    return (
        findAction(acts, /use-quickly/i) ??
        findAction(acts, /^bank$/i) ??
        findAction(acts, /bank/i) ??
        findAction(acts, /^use$/i) ??
        null
    );
}

function findGrandTree1FBankBooth() {
    try {
        const named = Locs.query().name('Bank booth').results?.() ?? [];
        const openFace = named.find(l => {
            const tile = locTile(l);
            return tile && tile.x === GT_BANK_BOOTH.x && tile.z === GT_BANK_BOOTH.z;
        });
        if (openFace) {
            return openFace;
        }
        const any = named.find(l => {
            const tile = locTile(l);
            return tile && (tile.level ?? 1) >= 1 && grandTree1FBankOp(l);
        });
        if (any) {
            return any;
        }
    } catch {
        /* named query can throw off-floor */
    }
    try {
        return Locs.query()
            .name('Bank booth')
            .where(l => {
                const tile = locTile(l);
                return tile && (tile.level ?? 0) >= 1;
            })
            .nearest();
    } catch {
        return null;
    }
}

function isUnshearedSheep(npc) {
    const n = normName(npcName(npc));
    if (!n.includes('sheep')) {
        return false;
    }
    if (n.includes('sheared') || n.includes('sheered')) {
        return false;
    }
    return true;
}

function woolKeepName(name) {
    const n = normName(name);
    if (n === 'coins' || isShearsName(name) || isWoolName(name)) {
        return true;
    }
    if (AXE_NAMES.some(a => n === normName(a))) {
        return true;
    }
    if (PICKAXES.some(p => p.aliases.some(a => n === normName(a)))) {
        return true;
    }
    if (
        n === 'small fishing net' ||
        n === 'fishing rod' ||
        n === 'fly fishing rod' ||
        n === 'harpoon' ||
        n === 'lobster pot' ||
        n === 'fishing bait' ||
        n === 'feather'
    ) {
        return true;
    }
    return false;
}

function dialogOpen() {
    if (typeof ChatDialog?.canContinue === 'function' && ChatDialog.canContinue()) {
        return true;
    }
    return (
        typeof ChatDialog?.isOpen === 'function' &&
        ChatDialog.isOpen() &&
        typeof ChatDialog.options === 'function' &&
        ChatDialog.options().length > 0
    );
}

function dialogAvoid(opt) {
    const low = (opt ?? '').toLowerCase();
    return DIALOG_AVOID.some(a => low.includes(a));
}

function pickBoatOption(options, prefer) {
    const prefs = Array.isArray(prefer) ? prefer : [prefer];
    const usable = options.filter(o => !dialogAvoid(o));
    const pool = usable.length > 0 ? usable : options;
    for (const p of prefs) {
        const hit = pool.find(o => (o ?? '').toLowerCase().includes(p.toLowerCase()));
        if (hit) {
            return hit;
        }
    }
    const yes = pool.find(o => /^yes/i.test(o ?? ''));
    if (yes) {
        return yes;
    }
    return pool.length > 0 ? pool[0] : null;
}

function talkOp(npc) {
    return findAction(npcActions(npc), /^talk/i) ?? 'Talk-to';
}

function matchingSteps(skill, level) {
    const combat = combatLevel();
    return STEPS.filter(s => {
        if (s.skill !== skill) {
            return false;
        }
        if (level < s.minLevel || level > s.maxLevel) {
            return false;
        }
        if (s.combatMin && combat < s.combatMin) {
            return false;
        }
        if (s.guild && Skills.level(SKILL_FISH) < GUILD_LEVEL) {
            return false;
        }
        return true;
    });
}

function pickStep(skill, level, here, avoidKey = null) {
    let pool = matchingSteps(skill, level);
    if (pool.length === 0) {
        pool = STEPS.filter(s => s.skill === skill && level >= s.minLevel);
        const top = Math.max(0, ...pool.map(s => s.minLevel));
        pool = pool.filter(s => s.minLevel === top);
    }
    if (pool.length === 0) {
        return null;
    }
    const bestMin = Math.max(...pool.map(s => s.minLevel));
    pool = pool.filter(s => s.minLevel === bestMin);
    if (avoidKey) {
        const rest = pool.filter(s => stepKey(s) !== avoidKey);
        if (rest.length > 0) {
            pool = rest;
        }
    }
    const quiet = pool.filter(s => playersNear(s.stand, s.leash) <= BUSY_PLAYERS);
    if (quiet.length > 0) {
        pool = quiet;
    }
    const hereTile = here ? Tile.from(here) : null;
    const onIsland = onKaramja(hereTile);
    const inGuild = insideGuild(hereTile);
    return pool.slice().sort((a, b) => {
        const pa = (a.priority ?? 0) - (b.priority ?? 0);
        if (pa !== 0) {
            return -pa;
        }
        const ia = (onIsland && a.karamja ? 1 : 0) - (onIsland && b.karamja ? 1 : 0);
        if (ia !== 0) {
            return -ia;
        }
        const ga = (inGuild && a.guild ? 1 : 0) - (inGuild && b.guild ? 1 : 0);
        if (ga !== 0) {
            return -ga;
        }
        const mainland = (!onIsland && !a.karamja ? 1 : 0) - (!onIsland && !b.karamja ? 1 : 0);
        if (mainland !== 0) {
            return -mainland;
        }
        if (!hereTile) {
            return 0;
        }
        return hereTile.distanceTo(a.stand) - hereTile.distanceTo(b.stand);
    })[0];
}

function stepKey(step) {
    return `${step.skill}:${step.label}`;
}

/* ── Walk / doors / bank / shop ── */

async function openNearbyDoor() {
    try {
        const door = Locs.query()
            .where(l => isShutDoor(l) && (typeof l.distance === 'function' ? l.distance() : 99) <= 2)
            .nearest();
        if (!door) {
            return false;
        }
        const op = locActions(door).find(a => /^open/i.test(String(a)));
        if (!op) {
            return false;
        }
        await door.interact(op);
        await Execution.delayTicks(1);
        return true;
    } catch {
        return false;
    }
}

async function walkTo(tile, radius = 3, timeoutMs = 90_000) {
    if (!tile) {
        return false;
    }
    const dest = Tile.from(tile);
    const here = Game.tile();
    if (here && Tile.from(here).distanceTo(dest) <= radius && (here.level ?? 0) === (dest.level ?? 0)) {
        return true;
    }
    const log = m => activeBot?.log?.(`  ${m}`);
    if (typeof Traversal.walkResilient === 'function') {
        await Traversal.walkResilient(dest, { radius, timeoutMs, log });
    } else if (typeof Traversal.walkTo === 'function') {
        await Traversal.walkTo(dest, { radius, timeoutMs });
    }
    await openNearbyDoor();
    const now = Game.tile();
    return !!now && Tile.from(now).distanceTo(dest) <= radius + 2;
}

async function walkVia(step) {
    if (step.via) {
        const here = Game.tile();
        const stand = Tile.from(step.stand);
        const via = Tile.from(step.via);
        const viaHelps = !here || via.distanceTo(stand) + 4 < Tile.from(here).distanceTo(stand);
        if (viaHelps) {
            await walkTo(step.via, 4);
        }
    }
    if (step.peninsula) {
        const here = Game.tile();
        if (here && here.x >= EAST_PENINSULA_MIN_X) {
            await walkTo(WEST_BEACH, 2);
        }
        return walkTo(step.stand, 6);
    }
    return walkTo(step.stand, 6);
}

async function waitBankLoaded() {
    if (typeof Bank.loaded === 'function') {
        await Execution.delayUntil(() => Bank.loaded() || (Bank.items()?.length ?? 0) > 0, 4000);
    }
    await Execution.delayTicks(1);
}

async function openClosestBank(log) {
    if (Bank.isOpen()) {
        return true;
    }
    if (Shop.isOpen()) {
        await Shop.close();
    }
    const ok = await Banking.open({ log: log ?? (() => {}) });
    if (ok) {
        await waitBankLoaded();
    }
    return Bank.isOpen();
}

async function depositKeepTools(step) {
    if (!Bank.isOpen()) {
        return false;
    }
    if (typeof Bank.depositAllMatching === 'function') {
        await Bank.depositAllMatching(name => !isKeepName(name, step));
    } else if (typeof Bank.depositInventory === 'function') {
        await Bank.depositInventory();
    }
    await Execution.delayTicks(1);
    return true;
}

async function withdrawNamed(name, amount = 1) {
    if (!Bank.isOpen() || (Bank.count(name) || 0) <= 0) {
        return false;
    }
    if (amount > 1 && typeof Bank.withdrawX === 'function') {
        return !!(await Bank.withdrawX(name, amount));
    }
    if (typeof Bank.withdraw === 'function') {
        return !!(await Bank.withdraw(name, 'Withdraw-1'));
    }
    return false;
}

async function withdrawFirst(names, amount = 1) {
    for (const name of names ?? []) {
        if (await withdrawNamed(name, amount)) {
            return name;
        }
    }
    return null;
}

async function openNamedShop(shopKey) {
    const shop = SHOPS[shopKey];
    if (!shop) {
        return false;
    }
    if (Shop.isOpen()) {
        return true;
    }
    await walkTo(shop.stand, 4);
    if (typeof Shop.open === 'function' && (await Shop.open(shop.keeper))) {
        return true;
    }
    const npc = Npcs.query().name(shop.keeper).nearest();
    if (npc) {
        const op = findAction(npcActions(npc), /^(trade|talk-to)$/i);
        if (op) {
            await npc.interact(op);
            await Execution.delayUntil(() => Shop.isOpen() || ChatDialog.canContinue(), 5000);
            await clickContinues();
        }
    }
    return Shop.isOpen();
}

async function buyNamed(name, amount = 1) {
    if (!Shop.isOpen()) {
        return 0;
    }
    const before = itemCount(n => nameEq(n, name));
    const got = await Shop.buy(name, amount);
    const after = itemCount(n => nameEq(n, name));
    return Math.max(got || 0, after - before);
}

function onEastPeninsula(tile = Game.tile()) {
    return !!(tile && (tile.level ?? 0) === 0 && tile.x >= EAST_PENINSULA_MIN_X);
}

function fishSpotReachable(tile, step) {
    if (!tile) {
        return false;
    }
    const dest = Tile.from(tile);
    if (Tile.from(dest).distanceTo(step.stand) > step.leash) {
        return false;
    }
    if (!step.peninsula) {
        return true;
    }
    if (dest.x > SPOT_MAX_X) {
        return false;
    }
    return dest.x <= SPOT_MAX_X;
}

function spotKindOk(actions, kind) {
    const net = findAction(actions, /^net$/i);
    const bait = findAction(actions, /^bait$/i);
    const lure = findAction(actions, /^lure$/i);
    const cage = findAction(actions, /^cage$/i);
    const harpoon = findAction(actions, /^harpoon$/i);
    if (kind === 'net-bait') {
        return net != null && bait != null;
    }
    if (kind === 'lure-bait') {
        return lure != null && bait != null;
    }
    if (kind === 'cage-harpoon') {
        return cage != null && harpoon != null;
    }
    if (kind === 'net-harpoon') {
        return harpoon != null && net != null && cage == null;
    }
    return false;
}

function fishOpOn(actions, opName) {
    const re = new RegExp(`^${opName}$`, 'i');
    return findAction(actions, re);
}

/* ── Bot ── */

class KnowledgeGatherer extends LoopingBot {
    status = 'starting';
    startedAt = 0;
    startBanked = false;
    task = null;
    taskStartedAt = 0;
    step = null;
    busyAvoid = null;
    bankTrips = 0;
    gathered = 0;
    wcXpAtStart = 0;
    mineXpAtStart = 0;
    fishXpAtStart = 0;
    craftXpAtStart = 0;
    craftFlaxReady = false;
    nurmofPhase = null;
    nurmofTriedMining = -1;
    restTile = null;
    restUntil = 0;
    buying = false;
    train(skill) {
        if (skill === SKILL_WC) {
            return this.settings?.bool('trainWoodcutting', true) ?? true;
        }
        if (skill === SKILL_MINE) {
            return this.settings?.bool('trainMining', true) ?? true;
        }
        if (skill === SKILL_CRAFT) {
            return this.settings?.bool('trainCrafting', true) ?? true;
        }
        return this.settings?.bool('trainFishing', true) ?? true;
    }

    target(skill) {
        const key =
            skill === SKILL_WC
                ? 'woodcuttingTarget'
                : skill === SKILL_MINE
                  ? 'miningTarget'
                  : skill === SKILL_FISH
                    ? 'fishingTarget'
                    : 'craftingTarget';
        const v = Math.floor(Number(this.settings?.str?.(key, '99') ?? 99));
        return Math.min(99, Math.max(1, Number.isFinite(v) ? v : 99));
    }

    swapMs() {
        const raw = String(this.settings?.str?.('skillSwapMinutes', '30 minutes') ?? '30 minutes');
        const v = Math.floor(Number(String(raw).replace(/[^0-9]/g, '')) || 30);
        const min = Math.min(200, Math.max(10, Number.isFinite(v) ? v : 30));
        return min * 60_000;
    }

    upgradePicks() {
        return this.settings?.bool('upgradePicks', true) ?? true;
    }

    skipStartBank() {
        return this.settings?.bool('skipStartBank', false) ?? false;
    }

    remainingSkills() {
        return SKILL_KEYS.filter(s => this.train(s) && Skills.level(s) < this.target(s));
    }

    nextTask(except = null) {
        const left = this.remainingSkills().filter(s => s !== except);
        if (left.length === 0) {
            return null;
        }
        left.sort((a, b) => {
            const la = Skills.level(a);
            const lb = Skills.level(b);
            if (la !== lb) {
                return la - lb;
            }
            return this.target(b) - lb - (this.target(a) - la);
        });
        return left[0];
    }

    rollTask(except = null) {
        const next = this.nextTask(except);
        this.task = next;
        this.taskStartedAt = Date.now();
        this.step = null;
        this.busyAvoid = null;
        if (!next) {
            this.status = 'done';
            return null;
        }
        this.status = next;
        const others = this.remainingSkills()
            .filter(s => s !== next)
            .map(s => `${s} ${Skills.level(s)}/${this.target(s)}`)
            .join(', ');
        this.log(
            `skill ${next}  ${Skills.level(next)}/${this.target(next)}` +
                (others ? `  (lowest remaining; also ${others})` : '')
        );
        return next;
    }

    xph(skill) {
        const elapsed = Date.now() - this.startedAt;
        const hrs = elapsed / 3_600_000;
        if (hrs < 0.008) {
            return 0;
        }
        const start =
            skill === SKILL_WC
                ? this.wcXpAtStart
                : skill === SKILL_MINE
                  ? this.mineXpAtStart
                  : skill === SKILL_FISH
                    ? this.fishXpAtStart
                    : this.craftXpAtStart;
        return (Skills.xp(skill) - start) / hrs;
    }

    async onStart() {
        await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 0);
        Traversal.preload?.();
        Banking.preload?.();
        activeBot = this;

        this.startedAt = Date.now();
        this.wcXpAtStart = Skills.xp(SKILL_WC);
        this.mineXpAtStart = Skills.xp(SKILL_MINE);
        this.fishXpAtStart = Skills.xp(SKILL_FISH);
        this.craftXpAtStart = Skills.xp(SKILL_CRAFT);
        this.craftFlaxReady = false;
        this.startBanked = this.skipStartBank();
        this.gathered = 0;
        this.bankTrips = 0;
        this.nurmofPhase = null;
        this.nurmofTriedMining = -1;

        if (typeof this.on === 'function') {
            this.on('skill.level', e => {
                if (!SKILL_KEYS.includes(e.name)) {
                    return;
                }
                this.log(`${e.name} ${e.previous} -> ${e.level}`);
                this.step = null;
            });
        }

        this.log(
            `${SCRIPT_NAME} ${SCRIPT_VERSION} — BotKnowledge gather (woodcutting / mining / fishing / crafting)`
        );
        this.status = 'ready';
        if (this.startBanked) {
            this.rollTask();
        }
    }

    onStop() {
        if (activeBot === this) {
            activeBot = null;
        }
        this.log(
            `stopped — ${this.task ?? 'idle'}  gathered ${this.gathered}  banks ${this.bankTrips}  ` +
                `WC ${Skills.level(SKILL_WC)}  Mine ${Skills.level(SKILL_MINE)}  Fish ${Skills.level(SKILL_FISH)}  Craft ${Skills.level(SKILL_CRAFT)}`
        );
    }

    async loop() {
        if (!Game.ingame()) {
            await Execution.delayTicks(5);
            return;
        }
        if (await dismissWelcomeScreen()) {
            this.status = 'close welcome';
            return;
        }
        if (ChatDialog.canContinue()) {
            this.status = 'continue';
            await clickContinues();
            return;
        }
        if (dialogOpen() && (onKaramja() || PORT_SARIM_DOCK.distanceTo(Game.tile()) < 14)) {
            this.status = 'karamja boat';
            await this.stepSailorDialog(onKaramja() ? SARIM_RETURN_DIALOG : KARAMJA_DIALOG_PREFER);
            return;
        }
        if (this.nurmofPhase) {
            await this.loopNurmof();
            return;
        }
        if (!this.startBanked) {
            await this.loopStartBank();
            return;
        }
        if (!this.task) {
            if (!this.rollTask()) {
                stopScript('all ticked skills are at their targets');
                await Execution.delayTicks(8);
            }
            return;
        }
        if (Skills.level(this.task) >= this.target(this.task)) {
            this.log(`${this.task} hit ${this.target(this.task)}`);
            this.rollTask(this.task);
            return;
        }
        if (Date.now() - this.taskStartedAt >= this.swapMs() && this.remainingSkills().length > 1) {
            this.log(`swap after ${Math.round(this.swapMs() / 60000)} min`);
            this.rollTask(this.task);
            return;
        }
        if (Shop.isOpen() && !this.buying) {
            await Shop.close();
            return;
        }
        if (
            this.task !== SKILL_CRAFT &&
            (needsGrandTreeExit() ||
                inGnomeStronghold() ||
                (playerFloor() >= 1 &&
                    !isUnderground() &&
                    Game.tile() &&
                    tileCheb(Game.tile(), LUMBRIDGE_STAIRS) <= 24))
        ) {
            await this.leaveGnomeCraftArea();
            return;
        }
        if (this.task === SKILL_CRAFT) {
            await this.loopCrafting();
            return;
        }
        await this.loopGather();
    }

    async loopStartBank() {
        if (Shop.isOpen()) {
            await Shop.close();
            return;
        }
        this.status = 'start bank';
        if (onKaramja()) {
            this.log('start: leaving Karamja before closest bank');
            if (!(await this.leaveKaramja())) {
                return;
            }
        }
        if (insideGuild()) {
            this.log('start: leaving Fishing Guild before closest bank');
            if (!(await this.leaveGuild())) {
                return;
            }
        }
        if (playerFloor() >= 1 && !isUnderground() && !inGnomeStronghold() && !needsGrandTreeExit()) {
            this.log('start: climbing down before closest bank');
            await this.climbLadder('down', Game.tile());
            return;
        }
        if (!Bank.isOpen()) {
            if (needsGrandTreeExit() || inGnomeStrongholdInterior() || inGrandTreeTrunk() || inGnomeStronghold()) {
                this.log('start: Grand Tree 1F bank (do not webwalk 1F from the ground)');
                if (!(await this.openGrandTreeCookBank())) {
                    return;
                }
            } else {
                this.log('start: closest bank, deposit pack, pick a skill');
                if (!(await openClosestBank(m => this.log(`  ${m}`)))) {
                    return;
                }
            }
        }
        await waitBankLoaded();
        if (typeof Bank.depositInventory === 'function') {
            await Bank.depositInventory();
        } else {
            await Bank.depositAllMatching(() => true);
        }
        await Execution.delayTicks(1);
        if (Bank.isOpen()) {
            await Bank.close();
        }
        this.bankTrips++;
        this.startBanked = true;
        this.rollTask();
    }

    currentStep() {
        if (this.task === SKILL_CRAFT) {
            const lv = Skills.level(SKILL_CRAFT);
            this.step = lv < CRAFT_FLAX_LEVEL ? STEP_WOOL : STEP_FLAX;
            return this.step;
        }
        if (this.step && this.step.skill === this.task) {
            const lv = Skills.level(this.task);
            if (lv >= this.step.minLevel && lv <= this.step.maxLevel) {
                return this.step;
            }
        }
        const next = pickStep(this.task, Skills.level(this.task), Game.tile(), this.busyAvoid);
        this.step = next;
        if (next) {
            this.log(`${next.label}  ${next.stand.x},${next.stand.z}`);
        }
        return next;
    }

    async loopGather() {
        const step = this.currentStep();
        if (!step) {
            this.log(`no ${this.task} step for level ${Skills.level(this.task)}`);
            this.rollTask(this.task);
            return;
        }

        if (this.upgradePicks() && step.tools === 'pick' && (await this.maybeStartNurmof())) {
            return;
        }

        if (Bank.isOpen()) {
            await this.finishBank(step);
            return;
        }

        if (!(await this.ensureTools(step))) {
            return;
        }

        if (Inventory.isFull()) {
            this.status = 'bank';
            this.log(`pack full — banking ${step.label} loot`);
            if (!(await this.goBank(step))) {
                return;
            }
            await this.finishBank(step);
            return;
        }

        const here = Game.tile();
        if (!here) {
            return;
        }
        if (this.needsTravel(step, here)) {
            this.status = `walk ${step.label}`;
            await this.travelToStep(step);
            return;
        }

        if (playersNear(step.stand, step.leash) > BUSY_PLAYERS) {
            const alt = pickStep(step.skill, Skills.level(step.skill), here, stepKey(step));
            if (alt && stepKey(alt) !== stepKey(step)) {
                this.log(`${step.label} busy (${playersNear(step.stand, step.leash)} players) — ${alt.label}`);
                this.busyAvoid = stepKey(step);
                this.step = alt;
                return;
            }
        }

        if (step.action === 'woodcut') {
            await this.doWoodcut(step);
            return;
        }
        if (step.action === 'mine') {
            await this.doMine(step);
            return;
        }
        await this.doFish(step);
    }

    async finishBank(step) {
        await waitBankLoaded();
        const before = productCount(step);
        await depositKeepTools(step);
        this.bankTrips++;
        if (before > 0) {
            this.log(`banked loot from ${step.label}`);
        }
        await this.withdrawTools(step);
        if (step.gateGp && coinCount() < step.gateGp && (bankCoins() >= step.gateGp || coinCount() + bankCoins() >= step.gateGp)) {
            await withdrawNamed('Coins', step.gateGp);
        }
        if (step.karamja && coinCount() < KARAMJA_ROUNDTRIP) {
            const need = KARAMJA_ROUNDTRIP - coinCount();
            if (bankCoins() >= need || coinCount() + bankCoins() >= KARAMJA_ROUNDTRIP) {
                await withdrawNamed('Coins', Math.max(need, KARAMJA_ROUNDTRIP));
            }
        }
        if (Bank.isOpen()) {
            await Bank.close();
        }
    }

    async withdrawTools(step) {
        if (step.tools === 'axe') {
            if (!bestHeldAxe()) {
                const names = Array.isArray(AXES) ? AXES.map(a => a.name) : AXE_NAMES;
                await withdrawFirst(names, 1);
            }
            return;
        }
        if (step.tools === 'pick') {
            if (!bestHeldPick()) {
                await withdrawFirst(PICKAXES.flatMap(p => p.aliases), 1);
            }
            return;
        }
        for (const name of step.toolNames ?? []) {
            if (!invHas(name)) {
                await withdrawNamed(name, 1);
            }
        }
        if (step.consumable && itemCount(n => nameEq(n, step.consumable)) < 20) {
            await withdrawNamed(step.consumable, CONSUMABLE_STACK);
        }
    }

    async ensureTools(step) {
        if (step.tools === 'axe') {
            if (!bestHeldAxe()) {
                await this.withdrawFromNearestBank(step);
            }
            const held = bestHeldAxe();
            if (!held) {
                if (!(await this.buyFromBob('Bronze axe'))) {
                    return false;
                }
            }
            const axe = bestHeldAxe();
            if (axe && !Equipment.contains?.(axe) && typeof canWieldTool === 'function' && canWieldTool(axe, Skills.level('attack'))) {
                await Equipment.equip(axe);
            }
            if (Skills.level(SKILL_WC) >= 6 && !hasSteelAxeOrBetter()) {
                return this.buySteelAxe();
            }
            return !!bestHeldAxe();
        }
        if (step.tools === 'pick') {
            if (!bestHeldPick()) {
                await this.withdrawFromNearestBank(step);
            }
            let held = bestHeldPick();
            if (!held) {
                if (!(await this.buyFromBob('Bronze pickaxe'))) {
                    return false;
                }
                held = bestHeldPick();
            }
            if (held) {
                const name = held.aliases[0];
                if (!Equipment.contains?.(name) && typeof canWieldTool === 'function' && canWieldTool(name, Skills.level('attack'))) {
                    await Equipment.equip(name);
                }
            }
            return !!bestHeldPick();
        }
        if (!heldFishTool(step) || (step.consumable && itemCount(n => nameEq(n, step.consumable)) <= 0)) {
            await this.withdrawFromNearestBank(step);
            if (heldFishTool(step) && (!step.consumable || itemCount(n => nameEq(n, step.consumable)) > 0)) {
                return true;
            }
            return this.buyFishGear(step);
        }
        return true;
    }

    async withdrawFromNearestBank(step) {
        this.status = 'withdraw tools';
        if (!(await this.goBank(step))) {
            return false;
        }
        await this.withdrawTools(step);
        const ready =
            (step.tools === 'axe' && !!bestHeldAxe()) ||
            (step.tools === 'pick' && !!bestHeldPick()) ||
            (step.tools === 'fish' &&
                !!heldFishTool(step) &&
                (!step.consumable || itemCount(n => nameEq(n, step.consumable)) > 0));
        if (Bank.isOpen()) {
            await Bank.close();
        }
        return ready;
    }

    async buyFromBob(item) {
        this.buying = true;
        this.status = `buy ${item}`;
        try {
            if (onKaramja() && !(await this.leaveKaramja())) {
                return false;
            }
            if (insideGuild() && !(await this.leaveGuild())) {
                return false;
            }
            if (!(await openNamedShop('bob'))) {
                this.log(`could not open Bob for ${item}`);
                return false;
            }
            const got = await buyNamed(item, 1);
            await Shop.close();
            if (got > 0) {
                this.log(`bought ${item} from Bob`);
                return true;
            }
            this.log(`Bob had no ${item}`);
            return false;
        } finally {
            this.buying = false;
        }
    }

    async buySteelAxe() {
        if (hasSteelAxeOrBetter() || Skills.level(SKILL_WC) < 6) {
            return true;
        }
        if (coinCount() < STEEL_AXE_COST) {
            if (await this.goBank({ tools: 'axe' })) {
                if (bankCoins() + coinCount() >= STEEL_AXE_COST) {
                    await withdrawNamed('Coins', STEEL_AXE_COST);
                }
                await Bank.close();
            }
        }
        if (coinCount() < STEEL_AXE_COST) {
            return true;
        }
        await this.buyFromBob('Steel axe');
        return true;
    }

    async buyFishGear(step) {
        this.buying = true;
        this.status = `buy ${step.shop}`;
        try {
            const shop = SHOPS[step.shop] ?? SHOPS.gerrant;
            if (onKaramja() && !(await this.leaveKaramja())) {
                return false;
            }
            if (insideGuild() && step.shop === 'harry' && !(await this.leaveGuild())) {
                return false;
            }
            if (coinCount() < 50) {
                if (await openClosestBank(m => this.log(`  ${m}`))) {
                    await withdrawNamed('Coins', Math.max(50, (step.consumable ? 80 : 50)));
                    await this.withdrawTools(step);
                    await Bank.close();
                }
            }
            if (heldFishTool(step) && (!step.consumable || itemCount(n => nameEq(n, step.consumable)) > 0)) {
                return true;
            }
            if (!(await openNamedShop(step.shop ?? 'gerrant'))) {
                this.log(`could not open ${shop.label}`);
                return false;
            }
            for (const name of step.toolNames ?? []) {
                if (!invHas(name)) {
                    await buyNamed(name, 1);
                }
            }
            if (step.consumable && itemCount(n => nameEq(n, step.consumable)) < 20) {
                await buyNamed(step.consumable, 50);
            }
            await Shop.close();
            return !!(heldFishTool(step) && (!step.consumable || itemCount(n => nameEq(n, step.consumable)) > 0));
        } finally {
            this.buying = false;
        }
    }

    findTree(step) {
        return Locs.query()
            .where(l => {
                if (!nameIn(locName(l), step.locNames)) {
                    return false;
                }
                if (!chopOp(locActions(l))) {
                    return false;
                }
                const tile = locTile(l);
                return tile && Tile.from(tile).distanceTo(step.stand) <= step.leash;
            })
            .nearest();
    }

    async doWoodcut(step) {
        const tree = this.findTree(step);
        if (!tree) {
            this.status = `no ${step.locNames[0]}`;
            this.log(`no ${step.locNames[0]} in scene at ${step.label}`);
            await Execution.delayTicks(3);
            return;
        }
        const op = chopOp(locActions(tree));
        const beforeXp = Skills.xp(SKILL_WC);
        const beforeProd = productCount(step);
        const st = locTile(tree);
        this.status = `chop ${step.locNames[0]}`;
        this.log(`chop ${locName(tree)} @ ${st?.x},${st?.z}`);
        await tree.interact(op);
        await Execution.delayUntil(
            () =>
                Skills.xp(SKILL_WC) > beforeXp ||
                productCount(step) > beforeProd ||
                Game.animating() ||
                ChatDialog.canContinue() ||
                Inventory.isFull(),
            8000
        );
        if (Game.animating()) {
            await Execution.delayUntil(
                () =>
                    Skills.xp(SKILL_WC) > beforeXp ||
                    productCount(step) > beforeProd ||
                    !Game.animating() ||
                    ChatDialog.canContinue() ||
                    Inventory.isFull(),
                20_000
            );
        }
        if (Skills.xp(SKILL_WC) > beforeXp || productCount(step) > beforeProd) {
            this.gathered++;
        }
    }

    findRock(step) {
        const skip = this.restTile && Date.now() < this.restUntil ? this.restTile : null;
        return Locs.query()
            .where(l => {
                if (!mineOp(locActions(l))) {
                    return false;
                }
                const tile = locTile(l);
                if (!tile || Tile.from(tile).distanceTo(step.stand) > step.leash) {
                    return false;
                }
                if (skip && tileCheb(tile, skip) === 0) {
                    return false;
                }
                const n = normName(locName(l));
                if (step.rockNames.some(r => n.includes(r))) {
                    return true;
                }
                if (step.genericRock && (n === 'rocks' || n === 'rock' || n === 'ore rocks')) {
                    return true;
                }
                return false;
            })
            .nearest();
    }

    async doMine(step) {
        const rock = this.findRock(step);
        if (!rock) {
            this.status = `no ${step.rockNames[0]} rock`;
            await Execution.delayTicks(3);
            return;
        }
        const op = mineOp(locActions(rock));
        const beforeXp = Skills.xp(SKILL_MINE);
        const beforeProd = productCount(step);
        const st = locTile(rock);
        this.status = `mine ${step.rockNames[0]}`;
        this.log(`mine ${locName(rock)} @ ${st?.x},${st?.z}`);
        await rock.interact(op);
        await Execution.delayUntil(
            () =>
                Skills.xp(SKILL_MINE) > beforeXp ||
                productCount(step) > beforeProd ||
                Game.animating() ||
                ChatDialog.canContinue() ||
                Inventory.isFull(),
            8000
        );
        if (Game.animating()) {
            await Execution.delayUntil(
                () =>
                    Skills.xp(SKILL_MINE) > beforeXp ||
                    productCount(step) > beforeProd ||
                    !Game.animating() ||
                    ChatDialog.canContinue() ||
                    Inventory.isFull(),
                16_000
            );
        }
        if (Skills.xp(SKILL_MINE) > beforeXp || productCount(step) > beforeProd) {
            this.gathered++;
            if (st) {
                this.restTile = st;
                this.restUntil = Date.now() + (step.minLevel >= 30 ? 8000 : 4500);
            }
        }
    }

    findFishSpot(step) {
        return Npcs.query()
            .name('Fishing spot')
            .where(n => {
                const acts = npcActions(n);
                if (!spotKindOk(acts, step.spotKind)) {
                    return false;
                }
                if (!fishOpOn(acts, step.fishOp)) {
                    return false;
                }
                const tile = n.tile?.() ?? n.tile;
                return fishSpotReachable(tile, step);
            })
            .nearest();
    }

    async doFish(step) {
        if (step.peninsula && onEastPeninsula() && !this.findFishSpot(step)) {
            await walkTo(WEST_BEACH, 2);
        }
        const spot = this.findFishSpot(step);
        if (!spot) {
            this.status = `no ${step.fishOp} spot`;
            await Execution.delayTicks(3);
            return;
        }
        const op = fishOpOn(npcActions(spot), step.fishOp);
        const beforeXp = Skills.xp(SKILL_FISH);
        const beforeProd = productCount(step);
        const st = spot.tile?.() ?? spot.tile;
        this.status = `${step.fishOp.toLowerCase()} fish`;
        this.log(`${step.fishOp} @ ${st?.x},${st?.z}`);
        await spot.interact(op);
        await Execution.delayUntil(
            () =>
                Skills.xp(SKILL_FISH) > beforeXp ||
                productCount(step) > beforeProd ||
                Game.animating() ||
                ChatDialog.canContinue() ||
                Inventory.isFull() ||
                (step.consumable && itemCount(n => nameEq(n, step.consumable)) <= 0),
            8000
        );
        if (Game.animating()) {
            await Execution.delayUntil(
                () =>
                    Skills.xp(SKILL_FISH) > beforeXp ||
                    productCount(step) > beforeProd ||
                    !Game.animating() ||
                    ChatDialog.canContinue() ||
                    Inventory.isFull(),
                24_000
            );
        }
        if (Skills.xp(SKILL_FISH) > beforeXp || productCount(step) > beforeProd) {
            this.gathered++;
        }
    }

    needsTravel(step, here = Game.tile()) {
        if (!here || !step) {
            return true;
        }
        if (step.karamja && !onKaramja(here)) {
            return true;
        }
        if (!step.karamja && onKaramja(here)) {
            return true;
        }
        if (step.guild && !insideGuild(here)) {
            return true;
        }
        if (!step.guild && insideGuild(here)) {
            return true;
        }
        return Tile.from(here).distanceTo(step.stand) > step.leash;
    }

    async travelToStep(step) {
        if (step.karamja) {
            if (!onKaramja() && !(await this.travelToKaramja())) {
                this.busyAvoid = stepKey(step);
                this.step = null;
                return false;
            }
        } else if (onKaramja() && !(await this.leaveKaramja())) {
            return false;
        }
        if (step.guild) {
            if (!(await this.enterGuild())) {
                return false;
            }
        } else if (insideGuild() && !(await this.leaveGuild())) {
            return false;
        }
        this.log(`walking to ${step.label} ${step.stand.x},${step.stand.z}`);
        return walkVia(step);
    }

    async goBank(step) {
        if (onKaramja() && !(await this.leaveKaramja())) {
            return false;
        }
        if (needsGrandTreeExit() || inGnomeStronghold()) {
            this.log('leaving Gnome Stronghold before closest bank (nav cannot path to Grand Tree 1F)');
            await this.leaveGnomeCraftArea();
            return false;
        }
        if (step?.guild) {
            if (!(await this.enterGuild())) {
                return false;
            }
        } else if (insideGuild() && !(await this.leaveGuild())) {
            return false;
        }
        return openClosestBank(m => this.log(`  ${m}`));
    }

    async ensureBoatFare() {
        if (coinCount() >= KARAMJA_ROUNDTRIP) {
            return true;
        }
        this.log(`need ${KARAMJA_ROUNDTRIP}gp for Karamja round trip (have ${coinCount()}gp)`);
        if (!(await openClosestBank(m => this.log(`  ${m}`)))) {
            return coinCount() >= KARAMJA_FARE;
        }
        const need = KARAMJA_ROUNDTRIP - coinCount();
        if (need > 0) {
            await withdrawNamed('Coins', Math.max(need, KARAMJA_ROUNDTRIP));
        }
        await Bank.close();
        if (coinCount() < KARAMJA_FARE) {
            this.log(`only ${coinCount()}gp — not boarding without fare`);
            return false;
        }
        return true;
    }

    findNamedNpc(names, extraWords = []) {
        for (const name of names) {
            const npc = Npcs.query().name(name).within(18).nearest();
            if (npc) {
                return npc;
            }
        }
        return (
            Npcs.query()
                .within(18)
                .where(n => {
                    const nm = locName(n).toLowerCase();
                    return extraWords.some(w => nm.includes(w));
                })
                .nearest() ?? null
        );
    }

    movedFar(from, tiles) {
        const now = Game.tile();
        if (!from || !now) {
            return false;
        }
        return Tile.from(from).distanceTo(now) >= tiles;
    }

    async stepSailorDialog(prefer) {
        if (typeof ChatDialog.canContinue === 'function' && ChatDialog.canContinue()) {
            this.status = 'boat dialog';
            await ChatDialog.continue();
            await Execution.delayTicks(1);
            return true;
        }
        if (
            typeof ChatDialog.isOpen === 'function' &&
            ChatDialog.isOpen() &&
            typeof ChatDialog.options === 'function' &&
            ChatDialog.options().length > 0 &&
            typeof ChatDialog.chooseOption === 'function'
        ) {
            const opts = ChatDialog.options();
            const pick = pickBoatOption(opts, prefer);
            this.status = `boat dialog: ${pick ?? '?'}`;
            this.log(`boat → ${pick}  [${opts.join(' | ')}]`);
            if (pick) {
                await ChatDialog.chooseOption(pick);
            } else {
                await ChatDialog.chooseOption();
            }
            await Execution.delayTicks(2);
            return true;
        }
        return false;
    }

    async crossGangplank() {
        const plank = Locs.query()
            .within(10)
            .where(l => /gangplank/i.test(locName(l)))
            .nearest();
        if (!plank) {
            return false;
        }
        const op = findAction(locActions(plank), /cross|walk|climb/i) ?? locActions(plank)[0] ?? null;
        if (!op) {
            return false;
        }
        const before = Game.tile();
        this.status = `cross ${locName(plank)}`;
        this.log(`crossing ${locName(plank)} (${op})`);
        await plank.interact(op);
        await Execution.delayUntil(() => this.movedFar(before, 3), 6000);
        return true;
    }

    async talkSailorAndRide(npc, prefer, arrivedFn) {
        const before = Game.tile();
        const op = talkOp(npc);
        this.status = `Talk-to ${npc.name ?? 'sailor'}`;
        this.log(`Talk-to ${npc.name} @ dock (${coinCount()}gp)`);
        if (!(await npc.interact(op))) {
            await Execution.delayTicks(2);
            return false;
        }
        if (!(await Execution.delayUntil(() => dialogOpen() || arrivedFn() || this.movedFar(before, 15), 8000))) {
            this.log('sailor dialog did not open — retrying');
            return false;
        }
        for (let i = 0; i < 40; i++) {
            if (arrivedFn()) {
                return true;
            }
            if (!dialogOpen()) {
                if (await Execution.delayUntil(() => arrivedFn() || this.movedFar(before, 15) || dialogOpen(), 6000)) {
                    if (arrivedFn()) {
                        return true;
                    }
                    if (dialogOpen()) {
                        continue;
                    }
                }
                break;
            }
            if (!(await this.stepSailorDialog(prefer))) {
                await Execution.delayTicks(1);
            }
        }
        if (arrivedFn()) {
            return true;
        }
        await this.crossGangplank();
        return arrivedFn();
    }

    async travelToKaramja() {
        if (onKaramja()) {
            return true;
        }
        if (insideGuild() && !(await this.leaveGuild())) {
            return false;
        }
        if (!(await this.ensureBoatFare())) {
            return false;
        }
        const here = Game.tile();
        if (!here || PORT_SARIM_DOCK.distanceTo(here) > 6) {
            this.status = 'walk Port Sarim';
            this.log(`walking to Port Sarim dock @ ${PORT_SARIM_DOCK.x},${PORT_SARIM_DOCK.z} (${KARAMJA_FARE}gp to Musa)`);
            await walkTo(PORT_SARIM_DOCK, 4);
        }
        if (onKaramja()) {
            return true;
        }
        if (dialogOpen()) {
            for (let i = 0; i < 40 && dialogOpen() && !onKaramja(); i++) {
                await this.stepSailorDialog(KARAMJA_DIALOG_PREFER);
            }
            if (onKaramja()) {
                this.log('boat landed on Karamja');
                return true;
            }
        }
        const sailor = this.findNamedNpc(SARIM_SAILORS, ['captain', 'seaman', 'sailor']);
        if (!sailor) {
            this.status = 'looking for sailor';
            await walkTo(PORT_SARIM_DOCK, 3, 10_000);
            return onKaramja();
        }
        await this.talkSailorAndRide(sailor, KARAMJA_DIALOG_PREFER, () => onKaramja());
        if (onKaramja()) {
            this.log('boat landed on Karamja');
            return true;
        }
        return false;
    }

    async leaveKaramja() {
        if (!onKaramja()) {
            return true;
        }
        if (!onMusaPoint()) {
            this.status = 'walk Musa dock';
            this.log(`on Karamja — walking to Musa Point Customs @ ${MUSA_DOCK.x},${MUSA_DOCK.z}`);
            await walkTo(MUSA_DOCK, 4);
        }
        if (coinCount() < KARAMJA_FARE) {
            this.log(`need ${KARAMJA_FARE}gp for Customs → Port Sarim (have ${coinCount()}gp)`);
            return false;
        }
        if (dialogOpen()) {
            for (let i = 0; i < 40 && dialogOpen() && onKaramja(); i++) {
                await this.stepSailorDialog(SARIM_RETURN_DIALOG);
            }
            if (!onKaramja()) {
                this.log('boat landed in Port Sarim');
                return true;
            }
        }
        const sailor = this.findNamedNpc(KARAMJA_SAILORS, ['customs', 'captain', 'seaman']);
        if (!sailor) {
            this.status = 'looking for Customs';
            await walkTo(MUSA_DOCK, 3, 10_000);
            return !onKaramja();
        }
        await this.talkSailorAndRide(sailor, SARIM_RETURN_DIALOG, () => !onKaramja());
        if (!onKaramja()) {
            this.log('boat landed in Port Sarim');
            return true;
        }
        return false;
    }

    findGuildDoor() {
        return (
            Locs.query()
                .where(l => {
                    const n = locName(l).toLowerCase();
                    if (!n.includes('door') && !n.includes('gate')) {
                        return false;
                    }
                    const tile = locTile(l);
                    return tile && Tile.from(tile).distanceTo(GUILD_DOOR_TILE) <= 3;
                })
                .nearest() ??
            Locs.query()
                .where(l => isShutDoor(l) && (typeof l.distance === 'function' ? l.distance() : 99) <= 4)
                .nearest()
        );
    }

    async clickGuildDoor() {
        const door = this.findGuildDoor();
        const op = door ? findAction(locActions(door), /^open/i) : null;
        if (door && op) {
            this.log(`opening ${locName(door) || 'guild door'}`);
            await door.interact(op);
            await Execution.delayTicks(2);
            return true;
        }
        return false;
    }

    async enterGuild() {
        if (insideGuild()) {
            return true;
        }
        if (Skills.level(SKILL_FISH) < GUILD_LEVEL) {
            this.status = 'need Fishing 68';
            this.log(`cannot enter Fishing Guild — need Fishing ${GUILD_LEVEL} (you have ${Skills.level(SKILL_FISH)})`);
            await Execution.delayTicks(8);
            return false;
        }
        if (onKaramja() && !(await this.leaveKaramja())) {
            return false;
        }
        this.status = 'entering guild';
        this.log(`outside guild — walking to doors @ ${GUILD_GATE_OUT.x},${GUILD_GATE_OUT.z}`);
        await walkTo(GUILD_GATE_OUT, 1);
        await this.clickGuildDoor();
        await walkTo(GUILD_GATE_IN, 2);
        if (!insideGuild()) {
            this.log('still outside Fishing Guild — retrying');
            await Execution.delayTicks(3);
            return false;
        }
        return true;
    }

    async leaveGuild() {
        if (!insideGuild()) {
            return true;
        }
        this.status = 'leaving guild';
        this.log(`leaving guild — walking to doors @ ${GUILD_GATE_IN.x},${GUILD_GATE_IN.z}`);
        await walkTo(GUILD_GATE_IN, 2);
        await this.clickGuildDoor();
        await walkTo(GUILD_GATE_OUT, 1);
        if (insideGuild()) {
            this.log('still inside Fishing Guild — retrying leave');
            await Execution.delayTicks(3);
            return false;
        }
        return true;
    }

    async maybeStartNurmof() {
        const mining = Skills.level(SKILL_MINE);
        if (mining === this.nurmofTriedMining) {
            return false;
        }
        const held = bestHeldPick();
        const want = PICKAXES.find(d => d.shop === 'nurmof' && mining >= d.mining);
        if (!want) {
            return false;
        }
        if (held && held.mining >= want.mining) {
            return false;
        }
        this.nurmofTriedMining = mining;
        this.nurmofPhase = 'bank';
        this.log(`Nurmof: want ${want.name} (mining ${mining})`);
        return true;
    }

    async loopNurmof() {
        const mining = Skills.level(SKILL_MINE);
        const want = bestBuyablePick(coinCount() + (Bank.isOpen() ? bankCoins() : 50_000));
        if (this.nurmofPhase === 'bank') {
            this.status = 'Nurmof bank';
            if (onKaramja() && !(await this.leaveKaramja())) {
                return;
            }
            if (insideGuild() && !(await this.leaveGuild())) {
                return;
            }
            if (!Bank.isOpen() && !(await openClosestBank(m => this.log(`  ${m}`)))) {
                return;
            }
            await waitBankLoaded();
            await depositKeepTools({ tools: 'pick' });
            const held = bestHeldPick();
            const target = want && want.shop === 'nurmof' ? want : null;
            if (!target || (held && held.mining >= target.mining)) {
                await Bank.close();
                this.nurmofPhase = null;
                return;
            }
            const need = target.price + 5;
            if (coinCount() < need) {
                await withdrawNamed('Coins', need);
            }
            await withdrawFirst(PICKAXES.flatMap(p => p.aliases), 1);
            await Bank.close();
            this.nurmofPhase = 'walk';
            return;
        }
        if (this.nurmofPhase === 'walk') {
            this.status = 'Ice Mountain';
            if (isUnderground()) {
                this.nurmofPhase = 'shop';
                return;
            }
            await this.walkPins(SURFACE_TO_TRAPDOOR, 1);
            if (await this.enterTrapdoor()) {
                this.nurmofPhase = 'shop';
            }
            return;
        }
        if (this.nurmofPhase === 'shop') {
            this.status = 'Nurmof';
            if (!isUnderground()) {
                this.nurmofPhase = 'walk';
                return;
            }
            await this.walkPins(SAFE_TO_NURMOF, 2);
            const npc = this.findNurmof();
            if (!npc) {
                this.log('Nurmof not in scene');
                await Execution.delayTicks(3);
                return;
            }
            if (typeof Shop.open === 'function') {
                await Shop.open(NURMOF_NAME);
            }
            if (!Shop.isOpen()) {
                const op = findAction(npcActions(npc), /^(trade|talk-to)$/i);
                if (op) {
                    await npc.interact(op);
                    await Execution.delayUntil(() => Shop.isOpen(), 5000);
                }
            }
            if (Shop.isOpen()) {
                const target = bestBuyablePick(coinCount());
                if (target && target.shop === 'nurmof') {
                    await buyNamed(target.name, 1);
                    this.log(`Nurmof sold ${target.name}`);
                }
                await Shop.close();
            }
            this.nurmofPhase = 'leave';
            return;
        }
        if (this.nurmofPhase === 'leave') {
            this.status = 'leave mines';
            if (isUnderground()) {
                await this.walkPins(SAFE_TO_TRAPDOOR, 1);
                await this.climbUp(TRAPDOOR_UNDER);
            }
            if (!isUnderground()) {
                await this.walkPins(SURFACE_TO_FALADOR_BANK, 3);
                this.nurmofPhase = null;
                this.log(`Nurmof done — mining ${mining}`);
            }
        }
    }

    findNurmof() {
        try {
            const q = Npcs.query()
                .name(NURMOF_NAME)
                .where(n => {
                    const id = typeof n.id === 'function' ? n.id() : n.id;
                    return Number(id) !== GENERAL_STORE_DWARF_ID;
                });
            return typeof q.nearest === 'function' ? q.nearest() : null;
        } catch {
            return null;
        }
    }

    findTrapdoor() {
        return Locs.query()
            .where(l => {
                const n = locName(l).toLowerCase();
                if (!n.includes('trapdoor')) {
                    return false;
                }
                const tile = locTile(l);
                return tile && tileCheb(tile, TRAPDOOR_SURFACE) <= 2;
            })
            .nearest();
    }

    async enterTrapdoor() {
        await walkTo(TRAPDOOR_BESIDE, 0, 8_000);
        const loc = this.findTrapdoor();
        if (!loc) {
            this.log('no Ice Mountain trapdoor');
            return isUnderground();
        }
        const op = findAction(locActions(loc), /^(enter|climb-down|climb down)$/i) ?? locActions(loc)[0];
        if (!op) {
            return false;
        }
        this.log(`${op} trapdoor`);
        await loc.interact(op);
        return Execution.delayUntil(() => isUnderground(), 8000);
    }

    async climbUp(near) {
        const loc = Locs.query()
            .where(l => {
                const tile = locTile(l);
                if (near && tile && tileCheb(tile, near) > 4) {
                    return false;
                }
                return locActions(l).some(a => /climb-up|climb up/i.test(String(a)));
            })
            .nearest();
        if (!loc) {
            return !isUnderground();
        }
        const op = findAction(locActions(loc), /climb-up|climb up/i);
        await loc.interact(op);
        return Execution.delayUntil(() => !isUnderground(), 8000);
    }

    async walkPins(pins, radius = 2) {
        for (let i = 0; i < pins.length; i++) {
            const pin = pins[i];
            const last = i === pins.length - 1;
            await walkTo(pin, last ? radius : Math.max(1, radius), last ? 30_000 : 12_000);
        }
    }

    async climbLadder(dir, nearTile = null) {
        const before = playerFloor();
        if (dir === 'up' && before >= 1) {
            return true;
        }
        if (dir === 'down' && before <= 0) {
            return true;
        }
        const loc = findClimbLadder(dir, nearTile);
        if (!loc) {
            const focus = nearTile ? Tile.from(nearTile) : Game.tile();
            this.log(`no ladder to climb ${dir} near ${focus?.x ?? '?'},${focus?.z ?? '?'}`);
            return false;
        }
        const op = climbDirOp(loc, dir);
        if (!op) {
            return false;
        }
        const tile = locTile(loc);
        this.status = `${op} ${locName(loc) || 'ladder'}`;
        this.log(`${op} ${locName(loc) || 'ladder'}` + (tile ? ` @ ${tile.x},${tile.z}` : ''));
        if (typeof loc.distance === 'function' && loc.distance() > 1 && tile) {
            if (playerFloor() === (tile.level ?? playerFloor())) {
                await Traversal.walkTo?.(tile, { radius: 1, timeoutMs: 8_000 });
            }
        }
        await loc.interact(op);
        await Execution.delayUntil(() => {
            const now = playerFloor();
            return dir === 'up' ? now > before : now < before;
        }, 8000);
        return dir === 'up' ? playerFloor() > before : playerFloor() < before;
    }

    async walkSameFloor(dest, radius = 2, timeoutMs = 20_000) {
        if (!dest) {
            return false;
        }
        const want = Tile.from(dest);
        const here = Game.tile();
        if (here && tileCheb(here, want) <= radius && playerFloor(here) === (want.level ?? 0)) {
            return true;
        }
        if (playerFloor(here) !== (want.level ?? 0)) {
            return false;
        }
        if (typeof Traversal.walkTo === 'function') {
            await Traversal.walkTo(want, { radius, timeoutMs });
        }
        const now = Game.tile();
        return !!(now && playerFloor(now) === (want.level ?? 0) && tileCheb(now, want) <= radius + 1);
    }

    async leaveGrandTree() {
        if (!needsGrandTreeExit()) {
            return true;
        }
        this.status = 'leaving Grand Tree';
        let guard = 0;
        while (playerFloor() >= 1 && guard++ < 4) {
            const floor = playerFloor();
            const pin = t(GT_LADDER.x, GT_LADDER.z, floor);
            this.log(`Grand Tree: climbing down from floor ${floor} @ ${pin.x},${pin.z}`);
            if (!Game.tile() || tileCheb(Game.tile(), pin) > 2) {
                await this.walkSameFloor(pin, 1, 20_000);
            }
            if (!(await this.climbLadder('down', pin))) {
                this.log('Grand Tree: climb-down failed');
                break;
            }
        }
        let outTries = 0;
        while (needsGrandTreeExit() && playerFloor() === 0 && outTries++ < 6) {
            this.log(
                `Grand Tree: walking out the south door ${GT_TREE_FRONT.x},${GT_TREE_FRONT.z}`
            );
            if (typeof Traversal.walkResilient === 'function') {
                await Traversal.walkResilient(GT_TREE_FRONT, { radius: 1, timeoutMs: 20_000 });
            } else {
                await Traversal.walkTo?.(GT_TREE_FRONT, { radius: 1, timeoutMs: 20_000 });
            }
            if (!needsGrandTreeExit()) {
                break;
            }
            const stuck = Game.tile();
            if (stuck && playerFloor(stuck) === 0) {
                const south = t(Math.min(2470, Math.max(2462, stuck.x)), 3488);
                await this.walkSameFloor(south, 1, 8_000);
            }
        }
        const done = !needsGrandTreeExit();
        this.log(done ? 'Grand Tree: outside the trunk' : 'Grand Tree: still inside after exit tries');
        return done;
    }

    async leaveGnomeStronghold() {
        if (needsGrandTreeExit()) {
            await this.leaveGrandTree();
            if (needsGrandTreeExit()) {
                return false;
            }
        }
        let here = Game.tile();
        if (playerFloor(here) >= 1 && inGnomeStronghold(here)) {
            this.log('climbing down from a gnome house before the south gate');
            await this.climbLadder('down', here);
            here = Game.tile();
        }
        if (!inGnomeStronghold(here) && playerFloor(here) === 0) {
            return true;
        }
        this.status = 'leaving Gnome Stronghold';
        this.log(
            `leaving Tree Gnome Stronghold via Femi south gate ${GNOME_ENTRANCE.x},${GNOME_ENTRANCE.z}`
        );
        let tries = 0;
        while (inGnomeStronghold() && tries++ < 4) {
            await walkTo(GNOME_ENTRANCE, 2, 120_000);
            await openNearbyDoor();
            await walkTo(GNOME_SOUTH_OUTSIDE, 2, 60_000);
            await openNearbyDoor();
        }
        const now = Game.tile();
        return !!(now && !inGnomeStronghold(now) && playerFloor(now) === 0);
    }

    async leaveGnomeCraftArea() {
        if (playerFloor() >= 1 && !needsGrandTreeExit() && inGnomeStronghold()) {
            await this.climbLadder('down', Game.tile());
        }
        if (needsGrandTreeExit()) {
            await this.leaveGrandTree();
        }
        if (inGnomeStronghold()) {
            return this.leaveGnomeStronghold();
        }
        if (playerFloor() >= 1 && !isUnderground()) {
            return this.climbLadder('down', Game.tile());
        }
        return true;
    }

    async enterGnomeSouthGate() {
        const here = Game.tile();
        if (inGnomeStrongholdInterior(here) || inGrandTreeTrunk(here)) {
            return true;
        }
        this.status = 'entering Gnome Stronghold';
        this.log(
            `walking to Tree Gnome Stronghold south gate ${GNOME_ENTRANCE.x},${GNOME_ENTRANCE.z}`
        );
        if (!here || tileCheb(here, GNOME_SOUTH_OUTSIDE) > 4) {
            await walkTo(GNOME_SOUTH_OUTSIDE, 2, GNOME_WALK_MS);
        }
        await openNearbyDoor();
        await walkTo(GNOME_ENTRANCE, 2, 60_000);
        await openNearbyDoor();
        const now = Game.tile();
        return inGnomeStrongholdInterior(now) || inGnomeStronghold(now);
    }

    async travelToGnomeStronghold() {
        const here0 = Game.tile();
        if (playerFloor(here0) >= 1 && inGnomeStronghold(here0)) {
            return true;
        }
        if (inGrandTreeTrunk(here0) || inGnomeStrongholdInterior(here0)) {
            return true;
        }
        if (onKaramja()) {
            this.status = 'leaving Karamja for Gnome Stronghold';
            if (!(await this.leaveKaramja())) {
                return false;
            }
        }
        if (insideGuild()) {
            if (!(await this.leaveGuild())) {
                return false;
            }
        }
        return this.enterGnomeSouthGate();
    }

    async walkToGrandTreeTrunkLadder() {
        const here = Game.tile();
        if (here && inGrandTreeTrunk(here) && tileCheb(here, GT_LADDER) <= 2) {
            return true;
        }
        if (here && !inGnomeStrongholdInterior(here) && !inGrandTreeTrunk(here) && !inGnomeStronghold(here)) {
            this.log('not inside Gnome Stronghold, will not walk the trunk ladder from here');
            return false;
        }
        this.status = 'walking to Grand Tree door';
        if (!here || (!inGrandTreeTrunk(here) && tileCheb(here, GT_TREE_FRONT) > 2)) {
            this.log(
                `walking to Grand Tree south door ${GT_TREE_FRONT.x},${GT_TREE_FRONT.z} then the trunk ladder`
            );
            if (typeof Traversal.walkResilient === 'function') {
                await Traversal.walkResilient(GT_TREE_FRONT, { radius: 1, timeoutMs: GNOME_WALK_MS });
            } else {
                await Traversal.walkTo?.(GT_TREE_FRONT, { radius: 1, timeoutMs: GNOME_WALK_MS });
            }
            await openNearbyDoor();
        }
        if (!inGrandTreeTrunk() && (!Game.tile() || tileCheb(Game.tile(), GT_LADDER) > 2)) {
            if (typeof Traversal.walkResilient === 'function') {
                await Traversal.walkResilient(GT_LADDER, { radius: 1, timeoutMs: 60_000 });
            } else {
                await Traversal.walkTo?.(GT_LADDER, { radius: 1, timeoutMs: 60_000 });
            }
        }
        return inGrandTreeTrunk() || (Game.tile() && tileCheb(Game.tile(), GT_LADDER) <= 3);
    }

    async ensureGrandTreeCookFloor() {
        const here = Game.tile();
        if (playerFloor(here) >= 1 && (onGrandTreeCookFloor(here) || inGrandTreeTrunk(here))) {
            return true;
        }
        if (playerFloor(here) >= 1) {
            this.log('upstairs in a gnome house, climbing down before Grand Tree 1F');
            await this.climbLadder('down', here);
        }
        if (!(await this.travelToGnomeStronghold())) {
            return false;
        }
        this.status = 'climbing to Grand Tree 1F';
        this.log(
            'Grand Tree bank is upstairs, through the south door, then the trunk ladder (nav cannot path to 1F)'
        );
        if (!(await this.walkToGrandTreeTrunkLadder())) {
            return false;
        }
        if (playerFloor() === 0 && !(await this.climbLadder('up', GT_LADDER))) {
            this.log('could not climb the Grand Tree ladder');
            return false;
        }
        return playerFloor() >= 1;
    }

    async openGrandTree1FBank() {
        if (Bank.isOpen()) {
            return true;
        }
        if (playerFloor() < 1) {
            return false;
        }
        this.status = 'opening Grand Tree 1F bank';
        if (!Game.tile() || tileCheb(Game.tile(), GT_COOK_BANK) > 1) {
            await this.walkSameFloor(GT_COOK_BANK, 1, 25_000);
        }
        const booth = findGrandTree1FBankBooth();
        if (booth) {
            const op = grandTree1FBankOp(booth) ?? locActions(booth)[0];
            if (op) {
                this.log(`${op} ${locName(booth) || 'Bank booth'} @ ${GT_BANK_BOOTH.x},${GT_BANK_BOOTH.z}`);
                await booth.interact(op);
                await Execution.delayUntil(() => Bank.isOpen(), 8_000);
                if (Bank.isOpen()) {
                    return true;
                }
            }
        }
        try {
            const banker = Npcs.query().name('Banker').nearest();
            if (banker) {
                const op = talkOp(banker);
                this.log(`${op} Banker (Grand Tree 1F)`);
                await banker.interact(op);
                await Execution.delayUntil(
                    () => Bank.isOpen() || ChatDialog.canContinue(),
                    8_000
                );
                if (ChatDialog.canContinue()) {
                    await clickContinues();
                }
                if (Bank.isOpen()) {
                    return true;
                }
            }
        } catch {
            /* banker query can throw off-floor */
        }
        this.log('could not open Grand Tree 1F bank, retrying');
        await Execution.delayTicks(3);
        return Bank.isOpen();
    }

    async openGrandTreeCookBank() {
        if (Bank.isOpen()) {
            return true;
        }
        if (!(await this.ensureGrandTreeCookFloor())) {
            return false;
        }
        return this.openGrandTree1FBank();
    }

    async loopCrafting() {
        this.currentStep();
        if (onKaramja()) {
            this.status = 'leaving Karamja for crafting';
            await this.leaveKaramja();
            return;
        }
        if (insideGuild()) {
            this.status = 'leaving Fishing Guild for crafting';
            await this.leaveGuild();
            return;
        }
        if (ChatDialog.isMakeMenu()) {
            if (invFlaxCount() > 0) {
                await this.chooseFlaxSpinProduct();
            } else {
                await this.chooseWoolSpinProduct();
            }
            return;
        }
        if (Skills.level(SKILL_CRAFT) < CRAFT_FLAX_LEVEL) {
            if (inGnomeStronghold() || needsGrandTreeExit()) {
                await this.leaveGnomeCraftArea();
                return;
            }
            await this.loopWool();
            return;
        }
        await this.loopGnomeFlax();
    }

    async loopWool() {
        if (invBallWoolCount() > 0) {
            await this.dropBallsOfWool();
            return;
        }
        if (!(await this.ensureShears())) {
            return;
        }
        if (invWoolCount() > 0 && (Inventory.isFull() || playerFloor() >= 1)) {
            await this.spinWoolLoad();
            return;
        }
        if (playerFloor() >= 1 && invWoolCount() === 0) {
            await this.climbLadder('down', Game.tile());
            return;
        }
        if (Inventory.isFull() && invWoolCount() === 0) {
            await this.dropWoolJunk();
            return;
        }
        await this.shearSheep();
    }

    async ensureShears() {
        if (invHas(SHEARS_NAME)) {
            return true;
        }
        this.status = 'need shears';
        if (Bank.isOpen() || (await openClosestBank(m => this.log(`  ${m}`)))) {
            await waitBankLoaded();
            if (await withdrawNamed(SHEARS_NAME, 1)) {
                this.log('withdrew Shears');
            } else if (coinCount() < SHEARS_COST) {
                await withdrawNamed('Coins', Math.max(SHEARS_COST, 20));
            }
            if (Bank.isOpen()) {
                await Bank.close();
            }
            if (invHas(SHEARS_NAME)) {
                return true;
            }
        }
        return this.buyShears();
    }

    async buyShears() {
        this.buying = true;
        this.status = 'buy Shears';
        try {
            if (coinCount() < SHEARS_COST) {
                this.log(`need ${SHEARS_COST}gp for Shears (have ${coinCount()}gp)`);
                return false;
            }
            if (!(await openNamedShop('lumbridge'))) {
                await walkTo(SHOPS.lumbridge.stand, 4);
                for (const name of ['Shop keeper', 'Shopkeeper', 'Shop Keeper']) {
                    const npc = Npcs.query().name(name).nearest();
                    if (!npc) {
                        continue;
                    }
                    const op = findAction(npcActions(npc), /^(trade|talk-to)$/i);
                    if (op) {
                        await npc.interact(op);
                        await Execution.delayUntil(() => Shop.isOpen() || ChatDialog.canContinue(), 5000);
                        await clickContinues();
                    }
                    if (Shop.isOpen()) {
                        break;
                    }
                }
            }
            if (!Shop.isOpen()) {
                this.log('could not open Lumbridge general for Shears');
                return false;
            }
            const got = await buyNamed(SHEARS_NAME, 1);
            await Shop.close();
            if (got > 0) {
                this.log('bought Shears from Lumbridge general');
                return true;
            }
            this.log('Lumbridge general had no Shears');
            return false;
        } finally {
            this.buying = false;
        }
    }

    findSheep() {
        try {
            return Npcs.query()
                .where(n => isUnshearedSheep(n))
                .nearest();
        } catch {
            return null;
        }
    }

    async walkToSheepPen() {
        if (playerFloor() >= 1) {
            await this.climbLadder('down', Game.tile());
            return false;
        }
        this.status = 'walking to sheep';
        await walkTo(SHEEP_PEN, 6);
        await openNearbyDoor();
        const here = Game.tile();
        return !!(here && tileCheb(here, SHEEP_PEN) <= 16 && playerFloor(here) === 0);
    }

    async shearSheep() {
        if (Inventory.isFull()) {
            return;
        }
        if (!(await this.walkToSheepPen())) {
            return;
        }
        const shears = lastInvMatching(isShearsName);
        for (let n = 0; n < 24 && !Inventory.isFull(); n++) {
            if (ChatDialog.isMakeMenu() || ChatDialog.canContinue()) {
                return;
            }
            const sheep = this.findSheep();
            if (!sheep) {
                this.status = 'looking for sheep';
                this.log('no unsheared sheep in scene, walking the pen');
                await walkTo(SHEEP_PEN, 4, 8_000);
                if (!this.findSheep()) {
                    return;
                }
            }
            const target = this.findSheep();
            if (!target) {
                return;
            }
            const before = invWoolCount();
            this.status = `shearing ${before} wool (free ${packFreeSlots()})`;
            let started = false;
            if (shears && typeof shears.useOn === 'function') {
                started = !!(await shears.useOn(target));
            }
            if (!started) {
                const op = findAction(npcActions(target), /^shear/i) ?? 'Shear';
                started = !!(await target.interact(op));
            }
            if (!started) {
                await Execution.delayTicks(1);
                continue;
            }
            await Execution.delayUntil(
                () =>
                    invWoolCount() > before ||
                    Inventory.isFull() ||
                    Game.animating() ||
                    ChatDialog.canContinue(),
                5000
            );
            if (Game.animating() && !Inventory.isFull()) {
                await Execution.delayUntil(
                    () =>
                        invWoolCount() > before ||
                        Inventory.isFull() ||
                        !Game.animating() ||
                        ChatDialog.canContinue(),
                    4000
                );
            }
            if (invWoolCount() === before && !Inventory.isFull()) {
                await Execution.delayTicks(1);
            }
        }
        if (Inventory.isFull() && invWoolCount() > 0) {
            this.log(`pack full, ${invWoolCount()} wool, spinning next`);
        }
    }

    findLumbridgeWheel() {
        try {
            return Locs.query()
                .name('Spinning wheel')
                .where(l => {
                    const tile = locTile(l);
                    if (!tile) {
                        return false;
                    }
                    return (tile.level ?? 0) >= 1 && tileCheb(tile, LUMBRIDGE_WHEEL) <= 8;
                })
                .nearest();
        } catch {
            return null;
        }
    }

    async walkToLumbridgeWheel() {
        let wheel = this.findLumbridgeWheel();
        if (wheel && playerFloor() >= 1) {
            const wt = locTile(wheel);
            if (wt && Game.tile() && tileCheb(Game.tile(), wt) > 2) {
                await this.walkSameFloor(wt, 2, 12_000);
            }
            return this.findLumbridgeWheel() ?? wheel;
        }
        this.status = 'to Lumbridge spinning wheel';
        this.log(
            `Lumbridge spinning wheel is upstairs, castle approach ${LUMBRIDGE_CASTLE.x},${LUMBRIDGE_CASTLE.z}`
        );
        if (playerFloor() >= 1 && !wheel) {
            await this.climbLadder('down', Game.tile());
        }
        if (playerFloor() === 0) {
            await walkTo(LUMBRIDGE_CASTLE, 3);
            if (!Game.tile() || tileCheb(Game.tile(), LUMBRIDGE_STAIRS) > 3) {
                await walkTo(LUMBRIDGE_STAIRS, 2);
            }
            this.log('climbing to the spinning-wheel floor');
            if (!(await this.climbLadder('up', LUMBRIDGE_STAIRS))) {
                this.log('could not climb Lumbridge castle stairs');
                return null;
            }
        }
        wheel = this.findLumbridgeWheel();
        if (!wheel) {
            await this.walkSameFloor(LUMBRIDGE_WHEEL, 2, 8_000);
            wheel = this.findLumbridgeWheel();
        }
        return wheel;
    }

    async chooseWoolSpinProduct() {
        const products = ChatDialog.makeProducts?.() ?? [];
        const hint = matchSpinProduct(products, 'Wool') ?? 'Wool';
        const batch = Math.max(1, Math.min(invWoolCount(), 28));
        this.status = 'spin make-menu';
        this.log(`spin menu: [${products.join(', ')}] pick=${hint} x${batch}`);
        let picked = false;
        if (typeof ChatDialog.makeX === 'function') {
            picked = await ChatDialog.makeX(hint, batch);
        }
        if (!picked && typeof ChatDialog.makeX === 'function' && hint !== 'Wool') {
            picked = await ChatDialog.makeX('Wool', batch);
        }
        if (!picked && typeof ChatDialog.make === 'function') {
            picked = await ChatDialog.make(hint);
        }
        if (!picked) {
            this.log('could not pick Wool on the spinning menu');
            return;
        }
        await Execution.delayUntil(() => !ChatDialog.isMakeMenu(), 4000);
        await this.waitWoolSpinning();
    }

    async waitWoolSpinning() {
        this.status = 'spinning wool';
        let woolMark = invWoolCount();
        const beforeBalls = invBallWoolCount();
        let idle = 0;
        for (let guard = 0; guard < 900 && invWoolCount() > 0; guard++) {
            if (ChatDialog.isMakeMenu()) {
                await this.chooseWoolSpinProduct();
                return;
            }
            await Execution.delayTicks(1);
            const nowWool = invWoolCount();
            if (nowWool < woolMark || Game.animating()) {
                woolMark = nowWool;
                idle = 0;
            } else if (!Game.animating() && ++idle >= CRAFT_SPIN_IDLE_TICKS) {
                this.log(`spin idle ${CRAFT_SPIN_IDLE_TICKS}t with ${nowWool} wool left, re-clicking wheel`);
                break;
            }
        }
        const balls = Math.max(0, invBallWoolCount() - beforeBalls);
        if (balls > 0) {
            this.gathered += balls;
        }
    }

    async spinWoolLoad() {
        if (invWoolCount() === 0) {
            return;
        }
        if (ChatDialog.isMakeMenu()) {
            await this.chooseWoolSpinProduct();
            return;
        }
        const wheel = await this.walkToLumbridgeWheel();
        if (!wheel) {
            this.log('could not reach the Lumbridge spinning wheel');
            await Execution.delayTicks(2);
            return;
        }
        const wool = lastInvMatching(isWoolName);
        if (!wool) {
            return;
        }
        const beforeWool = invWoolCount();
        const beforeXp = Skills.xp(SKILL_CRAFT);
        this.status = 'spinning wool';
        this.log(`spin ${beforeWool} Wool on ${locName(wheel) || 'Spinning wheel'}`);
        const op = spinWheelOp(locActions(wheel));
        let started = false;
        if (op) {
            started = !!(await wheel.interact(op));
        }
        if (!started && typeof wool.useOn === 'function') {
            started = !!(await wool.useOn(wheel));
        }
        if (!started) {
            await Execution.delayTicks(2);
            return;
        }
        await Execution.delayUntil(
            () =>
                ChatDialog.isMakeMenu() ||
                invWoolCount() < beforeWool ||
                Skills.xp(SKILL_CRAFT) > beforeXp ||
                ChatDialog.canContinue(),
            8000
        );
        if (ChatDialog.isMakeMenu()) {
            await this.chooseWoolSpinProduct();
            return;
        }
        if (invWoolCount() < beforeWool || Skills.xp(SKILL_CRAFT) > beforeXp) {
            await this.waitWoolSpinning();
        }
    }

    async dropBallsOfWool() {
        const balls = Inventory.items().filter(i => isBallWoolName(i.name));
        if (balls.length === 0) {
            return false;
        }
        this.status = 'dropping balls of wool';
        this.log(`dropping ${balls.length} Ball of wool (no Lumbridge bank in 2004)`);
        for (const item of balls) {
            if (typeof item.interact === 'function') {
                await item.interact('Drop');
                await Execution.delayTicks(1);
            }
        }
        return true;
    }

    async dropWoolJunk() {
        const junk = Inventory.items().find(i => !woolKeepName(i.name) && !isBallWoolName(i.name));
        if (!junk) {
            return false;
        }
        this.status = 'dropping junk for wool';
        this.log(`pack full with no wool, dropping ${junk.name}`);
        if (typeof junk.interact === 'function') {
            await junk.interact('Drop');
            await Execution.delayTicks(1);
        }
        return true;
    }

    findGnomeFlax() {
        const here = Game.tile();
        try {
            return Locs.query()
                .name('Flax')
                .where(l => {
                    if (!pickOp(locActions(l))) {
                        return false;
                    }
                    const tile = locTile(l);
                    if (!tile || !inGnomeStronghold(tile) || (tile.level ?? 0) !== 0) {
                        return false;
                    }
                    if (here && tileCheb(here, GNOME_FLAX_STAND) <= GNOME_FLAX_LEASH) {
                        return tileCheb(tile, GNOME_FLAX_STAND) <= GNOME_FLAX_LEASH;
                    }
                    return true;
                })
                .nearest();
        } catch {
            return null;
        }
    }

    findGnomeSpinningWheel() {
        try {
            return Locs.query()
                .name('Spinning wheel')
                .where(l => {
                    const tile = locTile(l);
                    if (!tile || !inGnomeStronghold(tile)) {
                        return false;
                    }
                    return (tile.level ?? 0) >= 1;
                })
                .nearest();
        } catch {
            return null;
        }
    }

    async loopGnomeFlax() {
        if (invWoolCount() > 0) {
            await this.spinWoolLoad();
            return;
        }
        if (invBallWoolCount() > 0) {
            await this.dropBallsOfWool();
            return;
        }
        if (ChatDialog.isMakeMenu()) {
            await this.chooseFlaxSpinProduct();
            return;
        }
        if (invFlaxCount() > 0 && Inventory.isFull()) {
            this.log(`pack full (${invFlaxCount()} flax), spinning upstairs`);
            await this.spinGnomeFlaxLoad();
            return;
        }
        if (invBowstringCount() > 0 || !this.craftFlaxReady) {
            await this.bankGnomeFlaxLoad();
            return;
        }
        if (Inventory.isFull()) {
            await this.bankGnomeFlaxLoad();
            return;
        }
        this.status = `picking flax ${invFlaxCount()} (free ${packFreeSlots()})`;
        await this.pickGnomeFlax();
    }

    async walkToGnomeFlax() {
        const here = Game.tile();
        if (inGrandTreeTrunk(here) || onGrandTreeCookFloor(here)) {
            await this.leaveGrandTree();
            return false;
        }
        if (playerFloor(here) >= 1) {
            this.log('climbing down from a gnome house before picking flax');
            await this.climbLadder('down', here);
            return false;
        }
        if (here && inGnomeStronghold(here) && tileCheb(here, GNOME_FLAX_STAND) <= 6) {
            return true;
        }
        this.status = 'walking to gnome flax';
        if (!here || !inGnomeStronghold(here)) {
            if (!(await this.travelToGnomeStronghold())) {
                return false;
            }
        }
        await walkTo(GNOME_FLAX_STAND, 4, GNOME_WALK_MS);
        await openNearbyDoor();
        const now = Game.tile();
        return !!(now && inGnomeStronghold(now) && playerFloor(now) === 0);
    }

    async pickGnomeFlax() {
        if (Inventory.isFull()) {
            return;
        }
        if (!(await this.walkToGnomeFlax())) {
            return;
        }
        for (let n = 0; n < 32 && !Inventory.isFull(); n++) {
            if (ChatDialog.isMakeMenu() || ChatDialog.canContinue()) {
                return;
            }
            let plant = this.findGnomeFlax();
            if (!plant) {
                this.status = 'looking for flax';
                this.log('no flax in scene, walking the field');
                await walkTo(GNOME_FLAX_STAND, 3, 8_000);
                plant = this.findGnomeFlax();
                if (!plant) {
                    return;
                }
            }
            const op = pickOp(locActions(plant));
            if (!op) {
                await Execution.delayTicks(1);
                continue;
            }
            const before = invFlaxCount();
            const st = locTile(plant);
            this.status = `picking flax ${before} (free ${packFreeSlots()})`;
            if (n === 0 || before % 7 === 0) {
                this.log(
                    `Pick Flax @ ${st?.x ?? '?'},${st?.z ?? '?'} , ${before} flax, ${packFreeSlots()} free`
                );
            }
            await plant.interact(op);
            await Execution.delayUntil(
                () =>
                    invFlaxCount() > before ||
                    Inventory.isFull() ||
                    Game.animating() ||
                    ChatDialog.canContinue(),
                5000
            );
            if (Game.animating() && !Inventory.isFull()) {
                await Execution.delayUntil(
                    () =>
                        invFlaxCount() > before ||
                        Inventory.isFull() ||
                        !Game.animating() ||
                        ChatDialog.canContinue(),
                    4000
                );
            }
            if (invFlaxCount() === before && !Inventory.isFull()) {
                await Execution.delayTicks(1);
            }
        }
        if (Inventory.isFull() && invFlaxCount() > 0) {
            this.log(`pack full, ${invFlaxCount()} flax, spinning next`);
        }
    }

    async walkToGnomeSpinningWheel() {
        let wheel = this.findGnomeSpinningWheel();
        if (wheel && playerFloor() >= 1 && (locTile(wheel)?.level ?? 0) >= 1) {
            const wt = locTile(wheel);
            if (wt && Game.tile() && tileCheb(Game.tile(), wt) > 2) {
                await this.walkSameFloor(wt, 2, 12_000);
            }
            return this.findGnomeSpinningWheel() ?? wheel;
        }
        if (playerFloor() >= 1 && (inGrandTreeTrunk() || onGrandTreeCookFloor())) {
            await this.leaveGrandTree();
        } else if (playerFloor() >= 1 && !wheel) {
            this.log('upstairs with no spinning wheel, climbing down');
            await this.climbLadder('down', Game.tile());
        }
        this.status = 'to spinning wheel (upstairs)';
        this.log(
            `gnome spinning wheels are upstairs, staircase ${GNOME_SPIN_HOUSE.x},${GNOME_SPIN_HOUSE.z}`
        );
        if (playerFloor() === 0 && (!Game.tile() || tileCheb(Game.tile(), GNOME_SPIN_HOUSE) > 2)) {
            await walkTo(GNOME_SPIN_HOUSE, 2, GNOME_WALK_MS);
            await openNearbyDoor();
        }
        if (playerFloor() === 0) {
            this.log('climbing to the spinning-wheel floor');
            if (!(await this.climbLadder('up', GNOME_SPIN_HOUSE))) {
                this.log('could not climb to a gnome spinning wheel');
                return null;
            }
        }
        wheel = this.findGnomeSpinningWheel();
        if (!wheel) {
            await this.walkSameFloor(GNOME_SPIN_WHEEL, 2, 8_000);
            wheel = this.findGnomeSpinningWheel();
        }
        if (!wheel) {
            this.log('no spinning wheel upstairs in the gnome house');
            return null;
        }
        const wt = locTile(wheel);
        if (wt && Game.tile() && tileCheb(Game.tile(), wt) > 2) {
            await this.walkSameFloor(wt, 1, 8_000);
        }
        return this.findGnomeSpinningWheel() ?? wheel;
    }

    async chooseFlaxSpinProduct() {
        const products = ChatDialog.makeProducts?.() ?? [];
        const hint = matchSpinProduct(products, 'Flax') ?? 'Flax';
        const batch = Math.max(1, Math.min(invFlaxCount(), 28));
        this.status = 'spin make-menu';
        this.log(
            `spin menu: [${products.join(', ')}] pick=${hint} x${batch} (Crafting ${Skills.level(SKILL_CRAFT)})`
        );
        let picked = false;
        if (typeof ChatDialog.makeX === 'function') {
            picked = await ChatDialog.makeX(hint, batch);
        }
        if (!picked && typeof ChatDialog.makeX === 'function' && hint !== 'Flax') {
            picked = await ChatDialog.makeX('Flax', batch);
        }
        if (!picked && typeof ChatDialog.make === 'function') {
            picked = await ChatDialog.make(hint);
        }
        if (!picked) {
            this.log('could not pick flax on the spinning menu');
            return;
        }
        await Execution.delayUntil(() => !ChatDialog.isMakeMenu(), 4000);
        await this.waitGnomeSpinning();
    }

    async waitGnomeSpinning() {
        this.status = 'spinning flax';
        let stringMark = invBowstringCount();
        let flaxMark = invFlaxCount();
        let idle = 0;
        for (let guard = 0; guard < 900 && invFlaxCount() > 0; guard++) {
            if (ChatDialog.isMakeMenu()) {
                await this.chooseFlaxSpinProduct();
                return;
            }
            await Execution.delayTicks(1);
            const gain = Math.max(0, invBowstringCount() - stringMark);
            if (gain > 0) {
                this.gathered += gain;
            }
            stringMark = invBowstringCount();
            const nowFlax = invFlaxCount();
            if (nowFlax < flaxMark || Game.animating()) {
                flaxMark = nowFlax;
                idle = 0;
            } else if (!Game.animating() && ++idle >= CRAFT_SPIN_IDLE_TICKS) {
                this.log(`spin idle ${CRAFT_SPIN_IDLE_TICKS}t with ${nowFlax} flax left, re-clicking wheel`);
                break;
            }
        }
        const leftover = Math.max(0, invBowstringCount() - stringMark);
        if (leftover > 0) {
            this.gathered += leftover;
        }
    }

    async spinGnomeFlaxLoad() {
        if (invFlaxCount() === 0) {
            return;
        }
        if (ChatDialog.isMakeMenu()) {
            await this.chooseFlaxSpinProduct();
            return;
        }
        const wheel = await this.walkToGnomeSpinningWheel();
        if (!wheel) {
            this.log('could not reach a gnome spinning wheel');
            await Execution.delayTicks(2);
            return;
        }
        const flax = lastInvMatching(isFlaxName);
        if (!flax) {
            return;
        }
        const beforeFlax = invFlaxCount();
        const beforeXp = Skills.xp(SKILL_CRAFT);
        this.status = 'spinning flax';
        this.log(
            `spin ${beforeFlax} Flax on ${locName(wheel) || 'Spinning wheel'} (Crafting ${Skills.level(SKILL_CRAFT)})`
        );
        const op = spinWheelOp(locActions(wheel));
        let started = false;
        if (op) {
            started = !!(await wheel.interact(op));
        }
        if (!started && typeof flax.useOn === 'function') {
            started = !!(await flax.useOn(wheel));
        }
        if (!started) {
            await openNearbyDoor();
            await Execution.delayTicks(2);
            return;
        }
        await Execution.delayUntil(
            () =>
                ChatDialog.isMakeMenu() ||
                invFlaxCount() < beforeFlax ||
                Skills.xp(SKILL_CRAFT) > beforeXp ||
                ChatDialog.canContinue(),
            8000
        );
        if (ChatDialog.isMakeMenu()) {
            await this.chooseFlaxSpinProduct();
            return;
        }
        if (invFlaxCount() < beforeFlax || Skills.xp(SKILL_CRAFT) > beforeXp) {
            await this.waitGnomeSpinning();
        }
    }

    async bankGnomeFlaxLoad() {
        this.status = 'banking gnome flax';
        if (!(await this.openGrandTreeCookBank())) {
            return;
        }
        await waitBankLoaded();
        this.log('gnome flax: depositing pack at Grand Tree 1F');
        if (typeof Bank.depositInventory === 'function') {
            await Bank.depositInventory();
        } else if (typeof Bank.depositAllMatching === 'function') {
            await Bank.depositAllMatching(() => true);
        }
        await Execution.delayTicks(1);
        this.craftFlaxReady = true;
        this.bankTrips++;
        if (Bank.isOpen()) {
            await Bank.close();
        }
    }

    onPaint(ctx) {
        const elapsed = Date.now() - this.startedAt;
        const step = this.step;
        const lines = [
            "Benzyme's BotKnowledge",
            `time ${fmtElapsed(elapsed)} · ${this.status}`,
            `Woodcutting ${Skills.level(SKILL_WC)}/${this.target(SKILL_WC)} · ${fmtXph(this.xph(SKILL_WC))}/hr`,
            `Mining ${Skills.level(SKILL_MINE)}/${this.target(SKILL_MINE)} · ${fmtXph(this.xph(SKILL_MINE))}/hr`,
            `Fishing ${Skills.level(SKILL_FISH)}/${this.target(SKILL_FISH)} · ${fmtXph(this.xph(SKILL_FISH))}/hr`,
            `Crafting ${Skills.level(SKILL_CRAFT)}/${this.target(SKILL_CRAFT)} · ${fmtXph(this.xph(SKILL_CRAFT))}/hr`,
            `${step ? step.label : this.task ?? 'idle'} · bank ${this.bankTrips} · loot ${this.gathered}`
        ];

        ctx.save();
        ctx.font = '13px sans-serif';
        ctx.textBaseline = 'top';
        ctx.lineJoin = 'round';
        const x = 8;
        const y0 = 8;
        const lineH = 16;
        const iconSize = 16;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000';
        lines.forEach((line, i) => {
            const y = y0 + i * lineH;
            ctx.strokeText(line, x, y);
            ctx.fillStyle = i === 0 ? TITLE_YELLOW : '#ffffff';
            ctx.fillText(line, x, y);
            if (i === 0 && robotIcon && robotIcon.complete && robotIcon.naturalWidth > 0) {
                const iconX = x + ctx.measureText(line).width + 4;
                const iconY = y + (lineH - iconSize) / 2;
                ctx.drawImage(robotIcon, iconX, iconY, iconSize, iconSize);
            }
        });
        ctx.restore();
    }
}

export default defineBot({
    name: SCRIPT_NAME,
    version: SCRIPT_VERSION,
    category: 'Skilling',
    tags: ['woodcutting', 'mining', 'fishing', 'crafting', 'aio', 'botknowledge', 'progressive', 'karamja', 'fishing-guild', 'gnome'],
    description:
        'Table-driven woodcutting, mining, fishing, and crafting from the VPS BotKnowledge pack. Picks the best camp your level unlocks, gathers, banks, and buys tools. Port Sarim boats to Karamja (60gp round trip). Fishing 68 opens the guild door. Crafting shears Lumbridge wool to 10, then Gnome flax to bowstrings. Optional Nurmof pickaxe upgrades. No Mining Guild or wilderness.',
    settingsSchema: {
        skipStartBank: {
            type: 'boolean',
            default: false,
            label: 'Skip banking at start',
            group: 'Start',
            help: 'On: read the pack and start that skill. Off: closest bank, deposit everything, then pick.'
        },
        skillSwapMinutes: {
            type: 'string',
            default: '30 minutes',
            options: [
                '10 minutes',
                '15 minutes',
                '20 minutes',
                '30 minutes',
                '45 minutes',
                '60 minutes',
                '90 minutes',
                '120 minutes',
                '180 minutes',
                '200 minutes'
            ],
            label: 'Time until skill swap',
            group: 'Start',
            help: 'How long to train the current skill before rolling a different ticked skill. Goal levels still swap immediately.'
        },
        trainWoodcutting: {
            type: 'boolean',
            default: true,
            label: 'Woodcutting',
            group: 'Woodcutting',
            help: 'Trees, oaks, willows, maples, yews, magics. Untick to skip.'
        },
        woodcuttingTarget: {
            type: 'string',
            default: '99',
            label: 'Train Woodcutting to',
            group: 'Woodcutting',
            help: 'Type the Woodcutting level to stop at (1-99).'
        },
        trainMining: {
            type: 'boolean',
            default: true,
            label: 'Mining',
            group: 'Mining',
            help: 'Varrock copper/tin/iron, Barbarian coal, Karamja gold (Port Sarim boat), Al Kharid mithril/adamant. Untick to skip.'
        },
        miningTarget: {
            type: 'string',
            default: '99',
            label: 'Train Mining to',
            group: 'Mining',
            help: 'Type the Mining level to stop at (1-99).'
        },
        upgradePicks: {
            type: 'boolean',
            default: true,
            label: 'Nurmof pickaxe upgrades',
            group: 'Mining',
            help: 'Ice Mountain trapdoor to Nurmof. Buys the best pick you can use and afford.'
        },
        trainFishing: {
            type: 'boolean',
            default: true,
            label: 'Fishing',
            group: 'Fishing',
            help: 'Draynor net, Barbarian fly, Catherby or Karamja cage/harpoon, then Fishing Guild door at 68. Untick to skip.'
        },
        fishingTarget: {
            type: 'string',
            default: '99',
            label: 'Train Fishing to',
            group: 'Fishing',
            help: 'Type the Fishing level to stop at (1-99).'
        },
        trainCrafting: {
            type: 'boolean',
            default: true,
            label: 'Crafting',
            group: 'Crafting',
            help: 'Lumbridge wool (drop balls) to 10, then Gnome Stronghold flax to bowstrings. Untick to skip.'
        },
        craftingTarget: {
            type: 'string',
            default: '99',
            label: 'Train Crafting to',
            group: 'Crafting',
            help: 'Type the Crafting level to stop at (1-99).'
        }
    },
    create: () => new KnowledgeGatherer()
});
